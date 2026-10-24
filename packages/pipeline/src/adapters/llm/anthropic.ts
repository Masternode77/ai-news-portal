/**
 * Anthropic Messages API behind the LlmAdapter contract (ADR-002, Phase 3d).
 *
 * - Reaches the network only through `ctx.fetch`, so `--replay` blocks it like
 *   every other adapter (R7) and tests inject a fake.
 * - Structured output: when the request carries an `outputSchema`, the schema is
 *   offered as the single tool `emit_result` and the model is forced to call it;
 *   the tool input is the parsed JSON.
 * - Cost: tokens × `llm.pricing[model]` (USD per million). A model without a
 *   pricing row is refused up front so the budget guard is never blind.
 * - 429 / 5xx / network errors / timeouts retry with exponential backoff up to
 *   `llm.max_retries`; any other 4xx is a rejection.
 * - The API key is sent as a header and never logged or echoed in errors.
 */
import { LlmResponse } from "@cc/shared";
import type { LlmAdapter, LlmConfig, LlmPricing, LlmRequest, LlmUsage, StageContext } from "@cc/shared";

export const ANTHROPIC_VERSION = "2023-06-01";
export const STRUCTURED_OUTPUT_TOOL = "emit_result";

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

interface MessagesResponse {
  model?: unknown;
  stop_reason?: unknown;
  content?: unknown;
  usage?: unknown;
}

/** Pulls text, the structured tool input, usage and the stop reason out of a Messages API body. */
export function parseMessagesResponse(body: unknown, fallbackModel: string): { text: string; json: unknown; usage: LlmUsage; stopReason: string; model: string } {
  const message = (body ?? {}) as MessagesResponse;
  const blocks = Array.isArray(message.content) ? (message.content as Record<string, unknown>[]) : [];
  const texts: string[] = [];
  let json: unknown;
  for (const block of blocks) {
    if (block["type"] === "text" && typeof block["text"] === "string") texts.push(block["text"]);
    else if (block["type"] === "tool_use" && block["name"] === STRUCTURED_OUTPUT_TOOL && json === undefined) json = block["input"];
  }
  const usageRaw = (message.usage ?? {}) as Record<string, unknown>;
  const int = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
  const usage: LlmUsage = { inputTokens: int(usageRaw["input_tokens"]), outputTokens: int(usageRaw["output_tokens"]), cacheReadTokens: int(usageRaw["cache_read_input_tokens"]) };
  return {
    text: texts.join("\n") || (json !== undefined ? JSON.stringify(json) : ""),
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
        body["tools"] = [{ name: STRUCTURED_OUTPUT_TOOL, description: "Return the result as structured data matching the schema.", input_schema: request.outputSchema }];
        body["tool_choice"] = { type: "tool", name: STRUCTURED_OUTPUT_TOOL };
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
          const parsed = parseMessagesResponse(parsedBody, request.model);
          const costUsd = costOf(parsed.usage, pricing);
          ctx.budget.record(costUsd);
          ctx.logger.info("llm: completion", { task: request.task, model: parsed.model, input_tokens: parsed.usage.inputTokens, output_tokens: parsed.usage.outputTokens, cost_usd: costUsd, stop_reason: parsed.stopReason, attempt });
          return LlmResponse.parse({ text: parsed.text, ...(parsed.json !== undefined ? { json: parsed.json } : {}), usage: parsed.usage, costUsd, model: parsed.model, stopReason: parsed.stopReason });
        } finally {
          clearTimeout(timer);
        }
      }
      throw lastError ?? new LlmError("LLM_UNAVAILABLE", "no attempts made");
    },
  };
}
