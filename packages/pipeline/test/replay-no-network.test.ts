import { test } from "node:test";
import assert from "node:assert/strict";
import { NETWORK_DISABLED_MESSAGE, runPipeline } from "../src/runner.ts";
import { defineStageSpec } from "../src/stages/index.ts";
import { IngestInput, IngestOutput } from "../src/stages/types.ts";
import { baseRunOptions } from "./helpers.ts";

test("replay mode: a stage that touches ctx.fetch fails with NETWORK_DISABLED", async () => {
  const curious = defineStageSpec({
    stage: {
      name: "ingest",
      input: IngestInput,
      output: IngestOutput,
      idempotencyKey: () => "net",
      run: async (_input, ctx) => {
        await ctx.fetch("https://example.com/feed.xml");
        return { rawItems: [], stats: { configured: 0, ok: 0, failed: 0, invalid_items: 0, errors: [] } };
      },
    },
    select: (state) => ({ sources: state.sources }),
    merge: (state) => state,
    counts: () => ({}),
  });
  const result = await runPipeline(baseRunOptions({ replay: true, stages: [curious] }));
  assert.equal(result.stages[0]?.status, "error");
  assert.ok(result.stages[0]?.error?.includes(NETWORK_DISABLED_MESSAGE));
});

test("replay dry-run over the full default stage list performs zero fetch calls", async () => {
  let calls = 0;
  const counting: typeof globalThis.fetch = async () => {
    calls += 1;
    throw new Error("network must not be used");
  };
  const original = globalThis.fetch;
  globalThis.fetch = counting;
  try {
    const result = await runPipeline(baseRunOptions({ replay: true, fetch: counting }));
    assert.equal(result.status, "done");
    assert.equal(result.funnel.items_fetched, 30);
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(calls, 0);
});

test("outside replay mode the injected fetch is passed through to stages", async () => {
  let seen = "";
  const passthrough: typeof globalThis.fetch = async (input) => {
    seen = String(input);
    return new Response("ok");
  };
  const probe = defineStageSpec({
    stage: {
      name: "ingest",
      input: IngestInput,
      output: IngestOutput,
      idempotencyKey: () => "probe",
      run: async (_input, ctx) => {
        await ctx.fetch("https://example.test/probe");
        return { rawItems: [], stats: { configured: 0, ok: 0, failed: 0, invalid_items: 0, errors: [] } };
      },
    },
    select: (state) => ({ sources: state.sources }),
    merge: (state) => state,
    counts: () => ({}),
  });
  const result = await runPipeline(baseRunOptions({ replay: false, fetch: passthrough, stages: [probe] }));
  assert.equal(result.stages[0]?.status, "done");
  assert.equal(seen, "https://example.test/probe");
});
