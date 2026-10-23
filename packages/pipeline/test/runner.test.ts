import { test } from "node:test";
import assert from "node:assert/strict";
import { FUNNEL_COLUMNS, STAGE_NAMES } from "@cc/shared";
import { MemoryLedger } from "../src/ledger/index.ts";
import { runPipeline } from "../src/runner.ts";
import { defineStageSpec } from "../src/stages/index.ts";
import { QaInput, QaOutput } from "../src/stages/types.ts";
import { BudgetExceededError } from "../src/budget.ts";
import { baseRunOptions } from "./helpers.ts";

test("dry-run with the sample fixture passes every stage as no-op and records the ledger", async () => {
  const ledger = new MemoryLedger();
  const result = await runPipeline(baseRunOptions({ ledger }));

  assert.equal(result.status, "done");
  assert.deepEqual(
    result.stages.map((s) => [s.stage, s.status]),
    STAGE_NAMES.map((name) => [name, "done"]),
  );
  assert.equal(result.funnel.sources_configured, 1, "disabled sources are not counted");
  assert.equal(result.funnel.sources_ok, 1);
  assert.equal(result.funnel.items_fetched, 6, "the 30-item fixture is capped to caps.items_per_source (default 6)");
  assert.equal(result.state.sourceStats.sources[0]?.skipped["capped"], 24);
  assert.equal(result.funnel.published, 0);
  assert.equal(result.funnel.top_error, null);
  assert.deepEqual(Object.keys(result.funnel), FUNNEL_COLUMNS);
  assert.equal(result.costTotalUsd, 0);

  const dump = await ledger.dump();
  assert.equal(dump.runs.length, 1);
  const run = dump.runs[0]!;
  assert.equal(run.status, "done");
  assert.equal(run.started_at, "2026-10-18T00:45:00.000Z");
  assert.ok(run.ended_at);
  assert.deepEqual(run.funnel, result.funnel);
  assert.equal((run.flags as { dry_run?: boolean })?.dry_run, true);
  assert.equal(dump.stageEvents.length, STAGE_NAMES.length);
  assert.ok(dump.stageEvents.every((e) => e.status === "done" && e.ended_at !== null));
  assert.equal(dump.stageEvents.find((e) => e.stage === "ingest")?.counts["items_fetched"], 6);
  assert.equal(dump.deadLetters.length, 0);
});

test("the run row is written before any stage runs (abort tolerance)", async () => {
  const ledger = new MemoryLedger();
  const exploding = defineStageSpec({
    stage: {
      name: "qa",
      input: QaInput,
      output: QaOutput,
      idempotencyKey: () => "boom",
      run: async () => {
        throw new TypeError("simulated crash");
      },
    },
    select: (state) => ({ drafts: state.drafts }),
    merge: (state) => state,
    counts: () => ({}),
  });
  const result = await runPipeline(baseRunOptions({ ledger, stages: [exploding] }));
  assert.equal(result.status, "partial");
  assert.equal(result.stages[0]?.status, "error");
  assert.match(result.stages[0]?.error ?? "", /TypeError: simulated crash/);
  assert.equal(result.funnel.top_error, "TypeError");
  const dump = await ledger.dump();
  assert.equal(dump.runs[0]?.status, "partial");
  assert.equal(dump.runs[0]?.error, "TypeError: simulated crash");
  assert.equal(dump.stageEvents[0]?.status, "error");
});

test("a failing source becomes a dead letter and the run is partial, not failed", async () => {
  const ledger = new MemoryLedger();
  const options = baseRunOptions({ ledger });
  options.adapters.sources["rss"] = {
    type: "rss",
    fetch: async (source) => {
      if (source.id === "eia-today-in-energy") throw new Error("SOURCE_UNREACHABLE: 503");
      return [];
    },
  };
  const result = await runPipeline(options);
  assert.equal(result.status, "partial");
  assert.equal(result.funnel.sources_failed, 1);
  assert.equal(result.funnel.items_fetched, 0);
  assert.equal(result.funnel.top_error, "SOURCE_UNREACHABLE", "top_error carries the taxonomy code, not the error class");
  const dump = await ledger.dump();
  assert.equal(dump.deadLetters.length, 1);
  assert.equal(dump.deadLetters[0]?.ref_id, "eia-today-in-energy");
  assert.equal(dump.stageEvents.find((e) => e.stage === "ingest")?.status, "done", "ingest itself completes");
});

test("a budget stop marks the run budget_stop and later stages still run", async () => {
  const ledger = new MemoryLedger();
  const over = defineStageSpec({
    stage: {
      name: "generate",
      input: QaInput,
      output: QaOutput,
      idempotencyKey: () => "x",
      run: async (_input, ctx) => {
        ctx.budget.record(ctx.budget.limitUsd + 0.01);
        throw new BudgetExceededError(ctx.budget.spentUsd, ctx.budget.limitUsd);
      },
    },
    select: (state) => ({ drafts: state.drafts }),
    merge: (state) => state,
    counts: () => ({}),
  });
  const { DEFAULT_STAGE_SPECS } = await import("../src/stages/index.ts");
  const stages = DEFAULT_STAGE_SPECS.map((spec) => (spec.name === "generate" ? over : spec));
  const result = await runPipeline(baseRunOptions({ ledger, stages }));
  assert.equal(result.status, "budget_stop");
  assert.ok(result.costTotalUsd > 2);
  assert.equal(result.funnel.top_error, "BUDGET_EXCEEDED");
  assert.equal(result.stages.find((s) => s.stage === "publish")?.status, "done");
  assert.equal((await ledger.dump()).runs[0]?.status, "budget_stop");
});

test("a stage that stops on the budget after producing output still ends the run as budget_stop, keeps its output and lets later stages run", async () => {
  const ledger = new MemoryLedger();
  const stopping = defineStageSpec({
    stage: {
      name: "generate",
      input: QaInput,
      output: QaOutput,
      idempotencyKey: () => "x",
      run: async (_input, ctx) => {
        ctx.budget.record(0.5);
        ctx.budget.stop("generate stopped before candidate 2/2: next call estimated at USD 1.9000, spent 0.5000 of cap 2.00 after 1 calls");
        return { passed: [], verdicts: [] };
      },
    },
    select: (state) => ({ drafts: state.drafts }),
    merge: (state) => state,
    counts: () => ({ drafted: 1, budget_stopped: 1 }),
  });
  const { DEFAULT_STAGE_SPECS } = await import("../src/stages/index.ts");
  const stages = DEFAULT_STAGE_SPECS.map((spec) => (spec.name === "generate" ? stopping : spec));
  const result = await runPipeline(baseRunOptions({ ledger, stages }));
  assert.equal(result.status, "budget_stop");
  assert.equal(result.stages.find((s) => s.stage === "generate")?.status, "done", "the stage itself completed with what it had");
  assert.deepEqual(result.stages.find((s) => s.stage === "generate")?.counts, { drafted: 1, budget_stopped: 1 });
  assert.equal(result.stages.find((s) => s.stage === "publish")?.status, "done");
  assert.equal(result.funnel.top_error, "BUDGET_EXCEEDED");
  assert.equal((await ledger.dump()).runs[0]?.status, "budget_stop");
});

test("a malformed item is dead-lettered on its own and the rest of the source survives", async () => {
  const ledger = new MemoryLedger();
  const options = baseRunOptions({ ledger });
  options.adapters.sources["rss"] = {
    type: "rss",
    fetch: async (source, ctx) => [
      { source_id: source.id, canonical_url: "https://ok.test/1", title: "fine", fetched_at: ctx.now.toISOString() },
      { source_id: source.id, canonical_url: "/relative/link", title: "bad url", fetched_at: ctx.now.toISOString() },
      { source_id: source.id, canonical_url: "javascript:alert(1)", title: "bad scheme", fetched_at: ctx.now.toISOString() },
    ],
  };
  const result = await runPipeline(options);
  assert.equal(result.stages.find((s) => s.stage === "ingest")?.status, "done");
  assert.equal(result.funnel.items_fetched, 1);
  assert.equal(result.funnel.sources_ok, 1);
  assert.equal(result.funnel.sources_failed, 0);
  assert.equal(result.funnel.top_error, "ITEM_INVALID");
  assert.equal(result.status, "partial");
  const dump = await ledger.dump();
  assert.equal(dump.deadLetters.length, 2);
  assert.deepEqual(
    dump.deadLetters.map((d) => d.ref_id),
    ["/relative/link", "javascript:alert(1)"],
  );
  assert.equal(dump.stageEvents.find((e) => e.stage === "ingest")?.counts["items_invalid"], 2);
});

test("errorCode reduces messages to taxonomy codes", async () => {
  const { errorCode } = await import("../src/runner.ts");
  assert.equal(errorCode("Error: SOURCE_UNREACHABLE: 503"), "SOURCE_UNREACHABLE");
  assert.equal(errorCode("BudgetExceededError: BUDGET_EXCEEDED: spent USD 2.0100 of cap 2.00"), "BUDGET_EXCEEDED");
  assert.equal(errorCode("NO_ADAPTER: no source adapter registered"), "NO_ADAPTER");
  assert.equal(errorCode("TypeError: simulated crash"), "TypeError");
  assert.equal(errorCode("something odd happened"), "something odd happened");
});

test("--stage runs only the named stages and marks the rest skipped", async () => {
  const result = await runPipeline(baseRunOptions({ only: ["image"] }));
  assert.deepEqual(
    result.stages.map((s) => [s.stage, s.status]),
    STAGE_NAMES.map((name) => [name, name === "image" ? "done" : "skipped"]),
  );
  assert.equal(result.stages[0]?.reason, "not_selected");
  assert.equal(result.funnel.items_fetched, 0);
  const two = await runPipeline(baseRunOptions({ only: ["ingest", "normalize"] }));
  assert.deepEqual(two.stages.filter((s) => s.status === "done").map((s) => s.stage), ["ingest", "normalize"], "a comma list runs several stages");
  assert.equal(two.funnel.items_fetched, 6);
  await assert.rejects(runPipeline(baseRunOptions({ only: ["render" as never] })), /unknown stage/);
});

test("items_scored counts candidates only when the score stage completed", async () => {
  const { buildFunnel } = await import("../src/runner.ts");
  const { initialState } = await import("../src/state.ts");
  const state = { ...initialState([]), candidates: [{} as never, {} as never] };
  const at = new Date("2026-10-18T00:45:00Z");
  const runId = "11111111-1111-4111-8111-111111111111";
  assert.equal(buildFunnel(runId, at, state, [], new Set()).items_scored, 0, "score flagged off or failed: nothing was scored");
  assert.equal(buildFunnel(runId, at, state, [], new Set(["normalize"])).items_scored, 0);
  assert.equal(buildFunnel(runId, at, state, [], new Set(["score"])).items_scored, 2);
});
