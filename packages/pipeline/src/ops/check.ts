/**
 * Operations check (Phase 3i, ADR-007): replaces the legacy heartbeat file
 * monitor with a read of `pipeline_runs`. A run that completed (done or
 * partial) is the heartbeat; a `started` row that never finished is a crash;
 * the cost columns give the spend. Pure over the rows so the memory and the
 * Supabase ledgers assess the same way.
 */
import type { PipelineRunRow } from "@cc/shared";

export type OpsStatus = "ok" | "stale" | "never" | "failing";

export interface OpsOptions {
  now: Date;
  /** `schedule.slot_hours`: the expected interval between runs. */
  slotHours: number;
  /** Stale after `slotHours × staleFactor` hours without a completed run. */
  staleFactor?: number;
  /** A `started` row older than this with no end is counted as crashed (never finished). */
  crashAfterHours?: number;
  /** Consecutive failed / budget_stop runs (newest first) that flip the status to `failing`. */
  failingAfter?: number;
}

export interface OpsRunRef {
  run_id: string;
  status: PipelineRunRow["status"];
  started_at: string;
  ended_at: string | null;
  published: number | null;
  cost_usd: number;
  error: string | null;
}

export interface OpsReport {
  status: OpsStatus;
  checked_at: string;
  stale_after_hours: number;
  last_success: OpsRunRef | null;
  hours_since_success: number | null;
  last_run: OpsRunRef | null;
  consecutive_failures: number;
  /** `started` rows older than crashAfterHours without an end. */
  crashed: number;
  /** `started` rows younger than that (a run may be in flight). */
  running: number;
  window_24h: { runs: number; done: number; partial: number; budget_stop: number; failed: number; published: number; cost_usd: number };
  cost_7d_usd: number;
  reasons: string[];
}

const HOUR = 3_600_000;

function ref(row: PipelineRunRow): OpsRunRef {
  return { run_id: row.id, status: row.status, started_at: row.started_at, ended_at: row.ended_at, published: row.funnel?.published ?? null, cost_usd: row.cost_total_usd, error: row.error };
}

function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function assessOperations(rows: readonly PipelineRunRow[], options: OpsOptions): OpsReport {
  const now = options.now.getTime();
  const staleAfterHours = options.slotHours * (options.staleFactor ?? 1.5);
  const crashAfterMs = (options.crashAfterHours ?? 2) * HOUR;
  const failingAfter = options.failingAfter ?? 2;
  const sorted = [...rows].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
  const finished = sorted.filter((r) => r.status !== "started");
  const lastSuccess = finished.find((r) => r.status === "done" || r.status === "partial") ?? null;
  const lastRun = sorted[0] ?? null;

  let consecutiveFailures = 0;
  for (const r of finished) {
    if (r.status === "failed" || r.status === "budget_stop") consecutiveFailures += 1;
    else break;
  }
  let crashed = 0;
  let running = 0;
  for (const r of sorted) {
    if (r.status !== "started") continue;
    if (now - Date.parse(r.started_at) > crashAfterMs) crashed += 1;
    else running += 1;
  }
  const window = { runs: 0, done: 0, partial: 0, budget_stop: 0, failed: 0, published: 0, cost_usd: 0 };
  let cost7d = 0;
  for (const r of sorted) {
    const age = now - Date.parse(r.started_at);
    if (age <= 7 * 24 * HOUR) cost7d += r.cost_total_usd;
    if (age > 24 * HOUR || r.status === "started") continue;
    window.runs += 1;
    window[r.status] += 1;
    window.published += r.funnel?.published ?? 0;
    window.cost_usd += r.cost_total_usd;
  }
  window.cost_usd = round(window.cost_usd, 4);

  const hoursSinceSuccess = lastSuccess ? round((now - Date.parse(lastSuccess.ended_at ?? lastSuccess.started_at)) / HOUR) : null;
  const reasons: string[] = [];
  let status: OpsStatus = "ok";
  if (!lastSuccess) {
    status = "never";
    reasons.push(finished.length === 0 ? "no finished run in the ledger" : `no done/partial run in the ledger (${finished.length} finished runs, all failed/budget_stop)`);
  } else if (hoursSinceSuccess !== null && hoursSinceSuccess > staleAfterHours) {
    status = "stale";
    reasons.push(`last completed run ${hoursSinceSuccess} h ago (stale after ${staleAfterHours} h = slot ${options.slotHours} h × ${options.staleFactor ?? 1.5})`);
  }
  if (consecutiveFailures >= failingAfter) {
    if (status === "ok") status = "failing";
    reasons.push(`${consecutiveFailures} consecutive failed/budget_stop runs (latest: ${lastRun?.error ?? lastRun?.status ?? "?"})`);
  }
  if (crashed > 0) reasons.push(`${crashed} run(s) started and never finished (crash before finishRun)`);

  return {
    status,
    checked_at: options.now.toISOString(),
    stale_after_hours: staleAfterHours,
    last_success: lastSuccess ? ref(lastSuccess) : null,
    hours_since_success: hoursSinceSuccess,
    last_run: lastRun ? ref(lastRun) : null,
    consecutive_failures: consecutiveFailures,
    crashed,
    running,
    window_24h: window,
    cost_7d_usd: round(cost7d, 4),
    reasons,
  };
}

/** Plain-text report for the log, the step summary and (Phase 4) the ops alert. */
export function formatOpsReport(report: OpsReport): string {
  const lines = [`[CC ops] ${report.checked_at} · ${report.status.toUpperCase()}`];
  if (report.last_success) lines.push(`last completed run: ${report.last_success.run_id.slice(0, 8)} ${report.last_success.status} at ${report.last_success.ended_at ?? report.last_success.started_at} (${report.hours_since_success} h ago, published ${report.last_success.published ?? 0})`);
  if (report.last_run && report.last_run.run_id !== report.last_success?.run_id) lines.push(`last run: ${report.last_run.run_id.slice(0, 8)} ${report.last_run.status}${report.last_run.error ? ` — ${report.last_run.error.slice(0, 160)}` : ""}`);
  const w = report.window_24h;
  lines.push(`24 h: runs ${w.runs} (done ${w.done}, partial ${w.partial}, budget_stop ${w.budget_stop}, failed ${w.failed}) · published ${w.published} · USD ${w.cost_usd.toFixed(2)} · 7 d USD ${report.cost_7d_usd.toFixed(2)}`);
  if (report.running > 0) lines.push(`in flight: ${report.running}`);
  for (const reason of report.reasons) lines.push(`• ${reason}`);
  return lines.join("\n");
}
