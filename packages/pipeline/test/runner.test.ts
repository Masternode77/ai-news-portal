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
  assert.equal(result.funnel.items_fetched, 30, "30 items from fixtures/rss/sample.xml");
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
  assert.equal(dump.stageEvents.find((e) => e.stage === "ingest")?.counts["items_fetched"], 30);
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
  assert.equal(result.funnel.top_error, "Error");
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
  assert.equal(result.stages.find((s) => s.stage === "publish")?.status, "done");
  assert.equal((await ledger.dump()).runs[0]?.status, "budget_stop");
});

test("--stage runs only the named stage and marks the rest skipped", async () => {
  const result = await runPipeline(baseRunOptions({ only: "image" }));
  assert.deepEqual(
    result.stages.map((s) => [s.stage, s.status]),
    STAGE_NAMES.map((name) => [name, name === "image" ? "done" : "skipped"]),
  );
  assert.equal(result.funnel.items_fetched, 0);
  await assert.rejects(runPipeline(baseRunOptions({ only: "render" as never })), /unknown stage/);
});
