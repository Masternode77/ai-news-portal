/**
 * Anthropic Messages API behind the LlmAdapter contract (ADR-002, Phase 3d).
 *
 * - Reaches the network only through `ctx.fetch`, so `--replay` blocks it like
 *   every other adapter (R7) and tests inject a fake.
 * - Structured output: when the request carries an `outputSchema`, it is sent as
 *   `output_config.format` (`json_schema`) and the reply text is the JSON. The
 *   first live run (2026-10-30, run 41026056302) showed that the earlier forced
 *   tool call (`tool_choice: {type: "tool"}`) is a 400 on Claude Opus 5.5 /
 *   Fable 5.1 / Sonnet 5.5 ("tool_choice: type \"tool\" and \"any\" are not
 *   supported for this model"), so structured outputs replace it. The API accepts
 *   only a subset of JSON Schema (`additionalProperties: false` on every object,
 *   no string / number / array constraints), so `toStructuredOutputSchema` strips
 *   those keywords for the request; the zod schema still enforces them when the
 *   stage parses the reply.
 * - Thinking is left at the model default (adaptive on Claude 5 models), and
 *   `max_tokens` caps thinking plus the reply, so prompts size `max_output_tokens`
 *   with that headroom.
 * - Cost: tokens × `llm.pricing[model]` (USD per million). A model without a
 *   pricing row is refused up front so the budget guard is never blind.
 * - 429 / 5xx / network errors / timeouts retry with exponential backoff up to
 *   `llm.max_retries`; any other 4xx is a rejection.
 * - The API key is sent as a header and never logged or echoed in errors.
 */
import { LlmResponse } from "@cc/shared";
import type { LlmAdapter, LlmConfig, LlmPricing, LlmRequest, LlmUsage, StageContext } from "@cc/shared";

export const ANTHROPIC_VERSION = "2023-06-01";

/** JSON Schema keywords structured outputs reject; the zod schema keeps enforcing them client-side. */
const UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "pattern",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minContains",
  "maxContains",
  "minProperties",
  "maxProperties",
  "default",
]);

/** Keys whose values are maps of schemas keyed by user-chosen names (never filtered as keywords). */
const SCHEMA_MAP_KEYS = new Set(["properties", "$defs", "definitions", "patternProperties"]);

export class LlmError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(code: string, message: string, options: { status?: number; retryable?: boolean } = {}) {
    super(`${code}: ${message}`);
    this.name = "LlmError";
    this.code = code;
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
  }
}

export interface AnthropicOptions {
  apiKey: string;
  llm: LlmConfig;
  /** Base delay of the retry backoff (doubles per attempt); tests pass 1. */
  backoffMs?: number;
}

/** USD for a usage record at a pricing row. */
export function costOf(usage: LlmUsage, pricing: LlmPricing): number {
  const usd = (usage.inputTokens * pricing.input_per_mtok + usage.outputTokens * pricing.output_per_mtok + usage.cacheReadTokens * pricing.cache_read_per_mtok) / 1_000_000;
  return Number(usd.toFixed(6));
}

/** Rough pre-call estimate for the budget guard: ~3 characters per token for mixed Korean/English, plus the full output allowance. */
export function estimateCostUsd(inputChars: number, maxOutputTokens: number, pricing: LlmPricing | undefined): number {
  if (!pricing) return 0;
  return costOf({ inputTokens: Math.ceil(inputChars / 3), outputTokens: maxOutputTokens, cacheReadTokens: 0 }, pricing);
}

/**
 * The schema the API gets for `output_config.format`: a deep copy of the zod-derived
 * JSON schema without the constraint keywords structured outputs reject, and with
 * `additionalProperties: false` on every object (required by the API). Property
 * names are never treated as keywords, so a field called `pattern` survives.
 */
export function toStructuredOutputSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (UNSUPPORTED_SCHEMA_KEYWORDS.has(key)) continue;
      if (SCHEMA_MAP_KEYS.has(key) && value && typeof value === "object" && !Array.isArray(value)) {
        out[key] = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([name, sub]) => [name, walk(sub)]));
      } else {
        out[key] = walk(value);
      }
    }
    if (out["type"] === "object" && out["additionalProperties"] === undefined) out["additionalProperties"] = false;
    return out;
  };
  return walk(schema) as Record<string, unknown>;
}

interface MessagesResponse {
  model?: unknown;
  stop_reason?: unknown;
  content?: unknown;
  usage?: unknown;
}

/**
 * Pulls text, usage and the stop reason out of a Messages API body. With
 * `expectJson` (a structured-output request) the text blocks are parsed as JSON
 * into `json`; a reply that is not JSON (truncated at `max_tokens`, a refusal)
 * leaves `json` undefined and the stage reports it.
 */
export function parseMessagesResponse(body: unknown, fallbackModel: string, options: { expectJson?: boolean } = {}): { text: string; json: unknown; usage: LlmUsage; stopReason: string; model: string } {
  const message = (body ?? {}) as MessagesResponse;
  const blocks = Array.isArray(message.content) ? (message.content as Record<string, unknown>[]) : [];
  const texts: string[] = [];
  for (const block of blocks) {
    if (block["type"] === "text" && typeof block["text"] === "string") texts.push(block["text"]);
  }
  const text = texts.join("\n");
  let json: unknown;
  if (options.expectJson && text.trim()) {
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
  }
  const usageRaw = (message.usage ?? {}) as Record<string, unknown>;
  const int = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
  const usage: LlmUsage = { inputTokens: int(usageRaw["input_tokens"]), outputTokens: int(usageRaw["output_tokens"]), cacheReadTokens: int(usageRaw["cache_read_input_tokens"]) };
  return {
    text,
    json,
    usage,
    stopReason: typeof message.stop_reason === "string" && message.stop_reason ? message.stop_reason : "unknown",
    model: typeof message.model === "string" && message.model ? message.model : fallbackModel,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createAnthropicLlmAdapter(options: AnthropicOptions): LlmAdapter {
  const backoff = options.backoffMs ?? 1000;
  return {
    provider: "anthropic",
    async complete(request: LlmRequest, ctx: StageContext) {
      const pricing = options.llm.pricing[request.model];
      if (!pricing) throw new LlmError("LLM_PRICING_MISSING", `no llm.pricing row for model ${request.model}; the budget guard needs one`);
      const body: Record<string, unknown> = {
        model: request.model,
        max_tokens: request.maxOutputTokens,
        system: request.system,
        messages: request.messages.map((message) => ({ role: message.role, content: message.content })),
      };
      if (request.outputSchema) {
        body["output_config"] = { format: { type: "json_schema", schema: toStructuredOutputSchema(request.outputSchema) } };
      }
      const url = `${options.llm.base_url.replace(/\/$/, "")}/v1/messages`;
      let lastError: LlmError | null = null;
      for (let attempt = 0; attempt <= options.llm.max_retries; attempt += 1) {
        if (attempt > 0) await sleep(backoff * 2 ** (attempt - 1));
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), options.llm.timeout_ms);
        try {
          let response: Response;
          try {
            response = await ctx.fetch(url, {
              method: "POST",
              headers: { "content-type": "application/json", "x-api-key": options.apiKey, "anthropic-version": ANTHROPIC_VERSION },
              body: JSON.stringify(body),
              signal: controller.signal,
            });
          } catch (error) {
            const aborted = error instanceof Error && error.name === "AbortError";
            lastError = new LlmError(aborted ? "LLM_TIMEOUT" : "LLM_UNAVAILABLE", aborted ? `no response within ${options.llm.timeout_ms} ms` : (error instanceof Error ? error.message : String(error)), { retryable: true });
            ctx.logger.warn("llm: request failed, will retry", { attempt, code: lastError.code, task: request.task });
            continue;
          }
          let text: string;
          try {
            text = await response.text();
          } catch (error) {
            // Headers arrived but the body stalled or the connection dropped: the same retry as a failed request.
            const aborted = error instanceof Error && error.name === "AbortError";
            lastError = new LlmError(aborted ? "LLM_TIMEOUT" : "LLM_UNAVAILABLE", aborted ? `response body not received within ${options.llm.timeout_ms} ms` : `response body failed: ${error instanceof Error ? error.message : String(error)}`, { status: response.status, retryable: true });
            ctx.logger.warn("llm: response body failed, will retry", { attempt, code: lastError.code, status: response.status, task: request.task });
            continue;
          }
          if (response.status === 429 || response.status >= 500) {
            lastError = new LlmError("LLM_UNAVAILABLE", `http ${response.status}`, { status: response.status, retryable: true });
            ctx.logger.warn("llm: upstream unavailable, will retry", { attempt, status: response.status, task: request.task });
            continue;
          }
          if (!response.ok) throw new LlmError("LLM_REQUEST_REJECTED", `http ${response.status}: ${text.slice(0, 300)}`, { status: response.status });
          let parsedBody: unknown;
          try {
            parsedBody = JSON.parse(text);
          } catch {
            throw new LlmError("LLM_RESPONSE_INVALID", `non-JSON response body (${text.length} chars)`);
          }
          const parsed = parseMessagesResponse(parsedBody, request.model, { expectJson: request.outputSchema !== undefined });
          const costUsd = costOf(parsed.usage, pricing);
          ctx.budget.record(costUsd);
          ctx.logger.info("llm: completion", { task: request.task, model: parsed.model, input_tokens: parsed.usage.inputTokens, output_tokens: parsed.usage.outputTokens, cost_usd: costUsd, stop_reason: parsed.stopReason, structured: parsed.json !== undefined, attempt });
          return LlmResponse.parse({ text: parsed.text, ...(parsed.json !== undefined ? { json: parsed.json } : {}), usage: parsed.usage, costUsd, model: parsed.model, stopReason: parsed.stopReason });
        } finally {
          clearTimeout(timer);
        }
      }
      throw lastError ?? new LlmError("LLM_UNAVAILABLE", "no attempts made");
    },
  };
}
