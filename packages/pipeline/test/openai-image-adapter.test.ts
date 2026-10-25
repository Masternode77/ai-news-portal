import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePipelineConfig, silentLogger } from "@cc/shared";
import type { ImageRequest, ImageStore, StageContext } from "@cc/shared";
import { ImageError, MemoryImageStore, createOpenAiImageAdapter, extractOpenAiImage, imageCostEstimate } from "../src/adapters/index.ts";
import { createBudget } from "../src/budget.ts";
import { MemoryLedger } from "../src/ledger/index.ts";
import { fixtureAdapters, TEST_PIPELINE_YAML, testBannedPhrases, testScoring } from "./helpers.ts";

const IMAGE_YAML = TEST_PIPELINE_YAML.replace("image: { provider: placeholder, fallback_chain: [placeholder] }", `image:
  provider: openai
  fallback_chain: [placeholder]
  openai: { model: gpt-image-2, size: 1536x1024, quality: medium, output_format: webp }
  pricing:
    gpt-image-2: { usd_per_image: 0.07 }
  timeout_ms: 200
  max_retries: 1
`);

function ctxWith(fetchImpl: typeof globalThis.fetch, yaml = IMAGE_YAML): { ctx: StageContext; store: MemoryImageStore } {
  const cfg = parsePipelineConfig(yaml, { env: {} }).config;
  const store = new MemoryImageStore();
  const ctx: StageContext = { runId: "11111111-1111-4111-8111-111111111111", now: new Date("2026-10-24T00:45:00Z"), config: cfg, scoring: testScoring(), bannedPhrases: testBannedPhrases(), logger: silentLogger(), ledger: new MemoryLedger(), budget: createBudget(cfg.budget), dryRun: true, replay: false, fixtureName: undefined, fetch: fetchImpl, adapters: { ...fixtureAdapters(), imageStore: store } };
  return { ctx, store };
}

const REQUEST: ImageRequest = { prompt: "Use case: test", alt: "alt text", slug: "news/0123456789abcdef", title: "제목", tags: ["grid"] };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function ok(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("posts to /v1/images/generations with the configured model, stores the b64 bytes, prices the image and records the budget", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const { ctx, store } = ctxWith(async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return ok({ created: 1, data: [{ b64_json: PNG.toString("base64") }] });
  });
  const adapter = createOpenAiImageAdapter({ apiKey: "key-name-only", image: ctx.config.image, backoffMs: 1 });
  const result = await adapter.generate(REQUEST, ctx);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "https://api.openai.com/v1/images/generations");
  const headers = calls[0]!.init.headers as Record<string, string>;
  assert.equal(headers["authorization"], "Bearer key-name-only");
  const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
  assert.equal(body["model"], "gpt-image-2");
  assert.equal(body["size"], "1536x1024");
  assert.equal(body["quality"], "medium");
  assert.equal(body["output_format"], "webp");
  assert.equal(body["n"], 1);
  assert.equal(body["prompt"], REQUEST.prompt);
  assert.equal(result.path, "/images/generated/news/0123456789abcdef/hero.webp");
  assert.equal(result.placeholder, false);
  assert.equal(result.costUsd, 0.07);
  assert.deepEqual(result.provenance, { provider: "openai", model: "gpt-image-2", prompt: REQUEST.prompt, generatedAt: "2026-10-24T00:45:00.000Z" });
  assert.deepEqual(Array.from(store.files.get(result.path)!.bytes), Array.from(PNG));
  assert.equal(ctx.budget.spentUsd, 0.07);
  assert.equal(imageCostEstimate(ctx.config.image), 0.07);
});

test("a url-form reply is fetched for its bytes; 429 retries then succeeds; 4xx is rejected at once; a model without pricing is refused before any call", async () => {
  let attempts = 0;
  const { ctx } = ctxWith(async (url) => {
    attempts += 1;
    if (String(url).endsWith("/v1/images/generations")) {
      if (attempts === 1) return new Response("slow down", { status: 429 });
      return ok({ data: [{ url: "https://files.example.test/out.png" }] });
    }
    return new Response(PNG, { status: 200, headers: { "content-type": "image/png" } });
  });
  const adapter = createOpenAiImageAdapter({ apiKey: "k", image: ctx.config.image, backoffMs: 1 });
  const result = await adapter.generate(REQUEST, ctx);
  assert.equal(attempts, 3, "429 → retry → url reply → bytes fetch");
  assert.equal(result.path, "/images/generated/news/0123456789abcdef/hero.png", "the fetched content-type wins over output_format");

  const rejected = ctxWith(async () => new Response('{"error":{"message":"bad prompt"}}', { status: 400 }));
  await assert.rejects(createOpenAiImageAdapter({ apiKey: "k", image: rejected.ctx.config.image, backoffMs: 1 }).generate(REQUEST, rejected.ctx), (error: unknown) => error instanceof ImageError && error.code === "IMAGE_REQUEST_REJECTED" && error.status === 400);

  let unpricedCalls = 0;
  const unpriced = ctxWith(async () => { unpricedCalls += 1; return ok({}); }, IMAGE_YAML.replace("gpt-image-2: { usd_per_image: 0.07 }", "other-model: { usd_per_image: 0.07 }"));
  await assert.rejects(createOpenAiImageAdapter({ apiKey: "k", image: unpriced.ctx.config.image }).generate(REQUEST, unpriced.ctx), (error: unknown) => error instanceof ImageError && error.code === "IMAGE_PRICING_MISSING");
  assert.equal(unpricedCalls, 0);
});

test("timeouts and dropped connections retry up to max_retries and then surface; a reply without bytes is invalid", async () => {
  let hung = 0;
  const { ctx } = ctxWith((_url, init) => new Promise((_resolve, reject) => { hung += 1; init?.signal?.addEventListener("abort", () => { const e = new Error("aborted"); e.name = "AbortError"; reject(e); }); }));
  await assert.rejects(createOpenAiImageAdapter({ apiKey: "k", image: ctx.config.image, backoffMs: 1 }).generate(REQUEST, ctx), (error: unknown) => error instanceof ImageError && error.code === "IMAGE_TIMEOUT");
  assert.equal(hung, 2, "max_retries 1 → two attempts");

  const empty = ctxWith(async () => ok({ data: [{}] }));
  await assert.rejects(createOpenAiImageAdapter({ apiKey: "k", image: empty.ctx.config.image, backoffMs: 1 }).generate(REQUEST, empty.ctx), (error: unknown) => error instanceof ImageError && error.code === "IMAGE_RESPONSE_INVALID");
  assert.deepEqual(extractOpenAiImage({ data: [{ b64_json: "AA==" }] }), { base64: "AA==", url: null });
  assert.deepEqual(extractOpenAiImage({}), { base64: null, url: null });
});

test("a 2xx generation is charged before the bytes are fetched or stored: a failing store still records the cost and the call, so the cap cannot be passed by falling back", async () => {
  const brokenStore: ImageStore = { kind: "broken", async put() { throw new Error("store down"); } };
  const { ctx } = ctxWith(async () => ok({ data: [{ b64_json: PNG.toString("base64") }] }), IMAGE_YAML.replace("budget: { run_usd: 2.0, soft_warn_usd: 1.5, max_calls: 60 }", "budget: { run_usd: 0.1, soft_warn_usd: 0.05, max_calls: 60 }"));
  ctx.adapters.imageStore = brokenStore;
  const adapter = createOpenAiImageAdapter({ apiKey: "k", image: ctx.config.image, backoffMs: 1 });
  await assert.rejects(adapter.generate(REQUEST, ctx), /store down/);
  assert.equal(ctx.budget.spentUsd, 0.07, "the generation was billed even though nothing was stored");
  assert.equal(ctx.budget.calls, 1);
  assert.equal(ctx.budget.canSpend(0.07), false, "a cap meant for one image does not admit a second one");

  let fetches = 0;
  const brokenDownload = ctxWith(async (url) => { fetches += 1; return String(url).endsWith("/v1/images/generations") ? ok({ data: [{ url: "https://files.example.test/out.png" }] }) : new Response("gone", { status: 404 }); });
  await assert.rejects(createOpenAiImageAdapter({ apiKey: "k", image: brokenDownload.ctx.config.image, backoffMs: 1 }).generate(REQUEST, brokenDownload.ctx), (error: unknown) => error instanceof ImageError && error.code === "IMAGE_UNAVAILABLE");
  assert.equal(brokenDownload.ctx.budget.spentUsd, 0.07, "a failed download after a 2xx is still a paid generation");
  assert.ok(fetches >= 2);
});
