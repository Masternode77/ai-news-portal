import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePipelineConfig, silentLogger } from "@cc/shared";
import type { LlmRequest, StageContext } from "@cc/shared";
import { ANTHROPIC_VERSION, LlmError, STRUCTURED_OUTPUT_TOOL, costOf, createAnthropicLlmAdapter, estimateCostUsd, parseMessagesResponse } from "../src/adapters/index.ts";
import { createBudget } from "../src/budget.ts";
import { MemoryLedger } from "../src/ledger/index.ts";
import { TEST_PIPELINE_YAML, fixtureAdapters, testScoring } from "./helpers.ts";

const LLM_YAML = TEST_PIPELINE_YAML.replace("  provider: fixture\n", `  provider: anthropic
  pricing:
    claude-opus-5-5: { input_per_mtok: 4, output_per_mtok: 20, cache_read_per_mtok: 0.4 }
  timeout_ms: 200
  max_retries: 2
`);

function ctxWith(fetchImpl: typeof globalThis.fetch): StageContext {
  const cfg = parsePipelineConfig(LLM_YAML, { env: {} }).config;
  return { runId: "11111111-1111-4111-8111-111111111111", now: new Date("2026-10-20T00:45:00Z"), config: cfg, scoring: testScoring(), logger: silentLogger(), ledger: new MemoryLedger(), budget: createBudget(cfg.budget), dryRun: true, replay: false, fixtureName: undefined, fetch: fetchImpl, adapters: fixtureAdapters() };
}

const REQUEST: LlmRequest = { task: "news_brief", model: "claude-opus-5-5", system: "sys", messages: [{ role: "user", content: "hello" }], outputSchema: { type: "object", properties: { title_ko: { type: "string" } } }, maxOutputTokens: 500, promptVersion: "2026-10-23.1" };

function ok(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const MESSAGE = { id: "msg_1", model: "claude-opus-5-5", stop_reason: "tool_use", content: [{ type: "text", text: "Here you go." }, { type: "tool_use", id: "t1", name: STRUCTURED_OUTPUT_TOOL, input: { title_ko: "제목" } }], usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 200 } };

test("the Anthropic adapter posts a Messages request with the schema as a forced tool, parses the tool input, prices the usage and records the budget", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const ctx = ctxWith(async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return ok(MESSAGE);
  });
  const adapter = createAnthropicLlmAdapter({ apiKey: "test-key-name-only", llm: ctx.config.llm, backoffMs: 1 });
  const response = await adapter.complete(REQUEST, ctx);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "https://api.anthropic.com/v1/messages");
  const headers = calls[0]!.init.headers as Record<string, string>;
  assert.equal(headers["anthropic-version"], ANTHROPIC_VERSION);
  assert.equal(headers["x-api-key"], "test-key-name-only");
  const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
  assert.equal(body["model"], "claude-opus-5-5");
  assert.equal(body["max_tokens"], 500);
  assert.equal(body["system"], "sys");
  assert.deepEqual(body["tool_choice"], { type: "tool", name: STRUCTURED_OUTPUT_TOOL });
  assert.deepEqual((body["tools"] as { input_schema: unknown }[])[0]!.input_schema, REQUEST.outputSchema);
  assert.deepEqual(response.json, { title_ko: "제목" });
  assert.equal(response.text, "Here you go.");
  assert.deepEqual(response.usage, { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 200 });
  assert.equal(response.costUsd, costOf(response.usage, ctx.config.llm.pricing["claude-opus-5-5"]!));
  assert.equal(response.costUsd, 0.01408, "1000×4 + 500×20 + 200×0.4 per million");
  assert.equal(response.stopReason, "tool_use");
  assert.equal(ctx.budget.spentUsd, 0.01408);
  assert.equal(ctx.budget.calls, 1);
});

test("429 and 5xx retry with backoff, then surface as LLM_UNAVAILABLE; a 4xx is rejected at once; a model without pricing is refused before any call", async () => {
  let attempts = 0;
  const flaky = ctxWith(async () => {
    attempts += 1;
    return attempts < 3 ? ok({ error: "busy" }, 529) : ok(MESSAGE);
  });
  const adapter = createAnthropicLlmAdapter({ apiKey: "k", llm: flaky.config.llm, backoffMs: 1 });
  const response = await adapter.complete(REQUEST, flaky);
  assert.equal(attempts, 3, "two retries, then success");
  assert.equal(response.model, "claude-opus-5-5");

  let always = 0;
  const down = ctxWith(async () => {
    always += 1;
    return ok({ error: "rate" }, 429);
  });
  await assert.rejects(createAnthropicLlmAdapter({ apiKey: "k", llm: down.config.llm, backoffMs: 1 }).complete(REQUEST, down), (error: unknown) => error instanceof LlmError && error.code === "LLM_UNAVAILABLE" && error.status === 429);
  assert.equal(always, 3, "max_retries 2 → 3 attempts");
  assert.equal(down.budget.calls, 0, "nothing recorded for failed calls");

  let rejected = 0;
  const bad = ctxWith(async () => {
    rejected += 1;
    return ok({ error: { type: "invalid_request_error", message: "bad" } }, 400);
  });
  await assert.rejects(createAnthropicLlmAdapter({ apiKey: "k", llm: bad.config.llm, backoffMs: 1 }).complete(REQUEST, bad), (error: unknown) => error instanceof LlmError && error.code === "LLM_REQUEST_REJECTED" && !/k"/.test(error.message));
  assert.equal(rejected, 1, "no retry on a rejection");

  let called = 0;
  const unpriced = ctxWith(async () => {
    called += 1;
    return ok(MESSAGE);
  });
  await assert.rejects(createAnthropicLlmAdapter({ apiKey: "k", llm: unpriced.config.llm, backoffMs: 1 }).complete({ ...REQUEST, model: "claude-sonnet-5-5" }, unpriced), (error: unknown) => error instanceof LlmError && error.code === "LLM_PRICING_MISSING");
  assert.equal(called, 0);
});

test("a hung request times out and retries; network errors retry; the replay fetch is honoured", async () => {
  let attempts = 0;
  const slow = ctxWith((_url, init) => {
    attempts += 1;
    if (attempts === 1) return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    return Promise.resolve(ok(MESSAGE));
  });
  const response = await createAnthropicLlmAdapter({ apiKey: "k", llm: slow.config.llm, backoffMs: 1 }).complete(REQUEST, slow);
  assert.equal(attempts, 2);
  assert.equal(response.stopReason, "tool_use");

  const offline = ctxWith(() => Promise.reject(new TypeError("fetch failed")));
  await assert.rejects(createAnthropicLlmAdapter({ apiKey: "k", llm: offline.config.llm, backoffMs: 1 }).complete(REQUEST, offline), (error: unknown) => error instanceof LlmError && error.code === "LLM_UNAVAILABLE" && /fetch failed/.test(error.message));
});

test("a body that stalls or drops after the headers arrived is retried like a failed request", async () => {
  let attempts = 0;
  const ctx = ctxWith(async () => {
    attempts += 1;
    if (attempts === 1) {
      const abort = new Error("The operation was aborted");
      abort.name = "AbortError";
      return new Response(new ReadableStream({ pull(controller) { controller.error(abort); } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (attempts === 2) {
      return new Response(new ReadableStream({ pull(controller) { controller.error(new TypeError("terminated")); } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return ok(MESSAGE);
  });
  const adapter = createAnthropicLlmAdapter({ apiKey: "k", llm: ctx.config.llm, backoffMs: 1 });
  const response = await adapter.complete(REQUEST, ctx);
  assert.equal(attempts, 3, "two body failures (timeout, network) were retried");
  assert.deepEqual(response.json, { title_ko: "제목" });

  let exhausted = 0;
  const failing = ctxWith(async () => {
    exhausted += 1;
    const abort = new Error("aborted");
    abort.name = "AbortError";
    return new Response(new ReadableStream({ pull(controller) { controller.error(abort); } }), { status: 200 });
  });
  await assert.rejects(createAnthropicLlmAdapter({ apiKey: "k", llm: failing.config.llm, backoffMs: 1 }).complete(REQUEST, failing), (error: unknown) => error instanceof LlmError && error.code === "LLM_TIMEOUT");
  assert.equal(exhausted, 3, "max_retries 2 → three attempts, then the body timeout surfaces");
});

test("response parsing tolerates text-only replies and missing usage; the cost estimate scales with input size", () => {
  const parsed = parseMessagesResponse({ content: [{ type: "text", text: "{\"a\":1}" }], stop_reason: "end_turn" }, "fallback-model");
  assert.equal(parsed.json, undefined);
  assert.equal(parsed.text, "{\"a\":1}");
  assert.deepEqual(parsed.usage, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 });
  assert.equal(parsed.model, "fallback-model");
  assert.equal(parseMessagesResponse(null, "m").stopReason, "unknown");
  const pricing = { input_per_mtok: 4, output_per_mtok: 20, cache_read_per_mtok: 0.4 };
  assert.equal(estimateCostUsd(0, 0, pricing), 0);
  assert.equal(estimateCostUsd(3000, 1000, pricing), Number(((1000 * 4 + 1000 * 20) / 1e6).toFixed(6)));
  assert.equal(estimateCostUsd(3000, 1000, undefined), 0, "no pricing row → no estimate (fixture provider)");
});
