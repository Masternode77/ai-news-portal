import { test } from "node:test";
import assert from "node:assert/strict";
import type { Funnel, PipelineRunRow } from "@cc/shared";
import { assessOperations, formatOpsReport } from "../src/ops/check.ts";

const NOW = new Date("2026-10-26T12:00:00Z");
const hoursAgo = (h: number): string => new Date(NOW.getTime() - h * 3_600_000).toISOString();
let seq = 0;
function funnel(published: number, runId: string): Funnel {
  return { run_id: runId, started_at: hoursAgo(1), sources_configured: 5, sources_ok: 5, sources_failed: 0, items_fetched: 13, items_new: 13, items_scored: 13, passed_gate: 6, drafts: 2, qa_passed: 1, published, top_error: null };
}
function run(over: Partial<PipelineRunRow> & { started_at: string }): PipelineRunRow {
  const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
  const status = over.status ?? "done";
  return {
    id,
    ended_at: status === "started" ? null : (over.ended_at ?? over.started_at),
    status,
    trigger: "schedule",
    funnel: status === "started" ? null : funnel(1, id),
    cost_total_usd: 0.4,
    error: null,
    git_sha: null,
    flags: null,
    ...over,
  };
}

test("a completed run inside the slot window is ok; the 24 h window and the 7 d cost are summed", () => {
  const rows = [run({ started_at: hoursAgo(3), ended_at: hoursAgo(2.5) }), run({ started_at: hoursAgo(11), status: "partial", cost_total_usd: 0.6 }), run({ started_at: hoursAgo(30), cost_total_usd: 1 })];
  const report = assessOperations(rows, { now: NOW, slotHours: 8 });
  assert.equal(report.status, "ok");
  assert.equal(report.stale_after_hours, 12);
  assert.equal(report.hours_since_success, 2.5);
  assert.equal(report.last_success?.run_id, rows[0]!.id);
  assert.deepEqual(report.window_24h, { runs: 2, done: 1, partial: 1, budget_stop: 0, failed: 0, published: 2, cost_usd: 1 });
  assert.equal(report.cost_7d_usd, 2);
  assert.deepEqual(report.reasons, []);
  assert.match(formatOpsReport(report), /^\[CC ops\] 2026-10-26T12:00:00\.000Z · OK\nlast completed run: 00000000 done at .* \(2\.5 h ago, published 1\)\n24 h: runs 2 \(done 1, partial 1, budget_stop 0, failed 0\) · published 2 · USD 1\.00 · 7 d USD 2\.00$/);
});

test("stale after slot_hours × 1.5 without a completed run; failed runs in between do not count as the heartbeat", () => {
  const rows = [run({ started_at: hoursAgo(2), status: "failed", error: "ConfigError: boom", funnel: null }), run({ started_at: hoursAgo(20) })];
  const report = assessOperations(rows, { now: NOW, slotHours: 8 });
  assert.equal(report.status, "stale");
  assert.equal(report.hours_since_success, 20);
  assert.match(report.reasons[0]!, /^last completed run 20 h ago \(stale after 12 h = slot 8 h × 1\.5\)$/);
  assert.equal(report.last_run?.status, "failed");
  assert.match(formatOpsReport(report), /· STALE\n.*\nlast run: 00000000 failed — ConfigError: boom\n/);
});

test("never: an empty ledger or one with only failed runs", () => {
  assert.equal(assessOperations([], { now: NOW, slotHours: 8 }).status, "never");
  const report = assessOperations([run({ started_at: hoursAgo(1), status: "budget_stop", funnel: null }), run({ started_at: hoursAgo(9), status: "failed", funnel: null })], { now: NOW, slotHours: 8 });
  assert.equal(report.status, "never");
  assert.equal(report.consecutive_failures, 2);
  assert.ok(report.reasons.some((r) => r.includes("2 finished runs, all failed/budget_stop")));
});

test("failing: two consecutive failed/budget_stop runs after a recent success; one failure alone stays ok", () => {
  const two = [run({ started_at: hoursAgo(1), status: "failed", funnel: null, error: "TypeError: x" }), run({ started_at: hoursAgo(2), status: "budget_stop" }), run({ started_at: hoursAgo(5) })];
  const report = assessOperations(two, { now: NOW, slotHours: 8 });
  assert.equal(report.status, "failing");
  assert.equal(report.consecutive_failures, 2);
  assert.match(report.reasons[0]!, /^2 consecutive failed\/budget_stop runs \(latest: TypeError: x\)$/);
  const one = assessOperations([run({ started_at: hoursAgo(1), status: "failed", funnel: null }), run({ started_at: hoursAgo(5) })], { now: NOW, slotHours: 8 });
  assert.equal(one.status, "ok");
  assert.equal(one.consecutive_failures, 1);
});

test("a started row that never finished counts as crashed after 2 h, as running before", () => {
  const rows = [run({ started_at: hoursAgo(0.2), status: "started" }), run({ started_at: hoursAgo(3), status: "started" }), run({ started_at: hoursAgo(4) })];
  const report = assessOperations(rows, { now: NOW, slotHours: 8 });
  assert.equal(report.status, "ok");
  assert.deepEqual([report.running, report.crashed], [1, 1]);
  assert.ok(report.reasons.some((r) => r.startsWith("1 run(s) started and never finished")));
  assert.equal(report.window_24h.runs, 1, "unfinished rows are not counted as runs of the window");
  assert.match(formatOpsReport(report), /\nin flight: 1\n• 1 run\(s\) started and never finished/);
});
