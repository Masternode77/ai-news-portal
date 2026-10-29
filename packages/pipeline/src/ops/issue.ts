/**
 * Ops alarm issue (Phase 4, 3i notes §5.3): one GitHub issue that mirrors the
 * `pipeline ops` verdict. The rules are rewritten from the legacy
 * operations-monitor inventory (3i notes §0), not copied: the issue is found
 * by a marker in its body, GitHub is written only on a state transition,
 * recovery closes the issue with a "recovered" comment, a relapse reopens
 * it, and an ops run that produced no verdict (exit 2) counts as the alert
 * state `unknown`, never as healthy. The planner is pure so every transition
 * is unit-tested without GitHub; `github-issues.ts` applies the plan.
 */
import type { OpsReport, OpsStatus } from "./check.ts";
import { formatOpsReport } from "./check.ts";

export const OPS_ISSUE_MARKER = "<!-- cc-ops-alarm -->";
export const OPS_ISSUE_TITLE = "[CC pipeline] ops alarm";

export type OpsAlarmState = OpsStatus | "unknown";

/** The fields of a GitHub issue the planner needs (REST `issues` list shape). */
export interface OpsIssueRef {
  number: number;
  state: "open" | "closed";
  title: string;
  body: string | null;
  /** Set on pull requests returned by the issues endpoint; those are never the alarm. */
  pull_request?: unknown;
}

export interface OpsIssueContext {
  /** `pipeline ops` exit code: 0 ok, 1 alert, 2 usage / config / fetch error (no verdict). */
  exitCode: number;
  /** Link to the workflow run that produced the verdict. */
  runUrl?: string;
  now: Date;
}

export type OpsIssuePlan =
  | { action: "none"; state: OpsAlarmState; reason: string }
  | { action: "create"; state: OpsAlarmState; title: string; body: string }
  | { action: "update"; state: OpsAlarmState; number: number; title: string; body: string; comment: string; reopen: boolean }
  | { action: "close"; state: "ok"; number: number; comment: string };

const STATE_MARKER_RE = /<!-- cc-ops-alarm:state=([a-z_]+) -->/;
const STATES: readonly OpsAlarmState[] = ["ok", "stale", "never", "failing", "unknown"];

/** The alarm state of a verdict: the report status, or `unknown` when ops produced none. */
export function alarmState(report: OpsReport | null, exitCode: number): OpsAlarmState {
  if (!report || exitCode >= 2) return "unknown";
  return report.status;
}

/** The state recorded in an alarm issue's body, or null when the body carries no (valid) state marker. */
export function readIssueState(body: string | null | undefined): OpsAlarmState | null {
  const match = body ? STATE_MARKER_RE.exec(body) : null;
  const state = match?.[1];
  return state && (STATES as readonly string[]).includes(state) ? (state as OpsAlarmState) : null;
}

/** The alarm issue among the repository's issues: the open one, else the newest closed one, else none. */
export function findOpsIssue(issues: readonly OpsIssueRef[]): OpsIssueRef | null {
  const ours = issues.filter((issue) => !issue.pull_request && typeof issue.body === "string" && issue.body.includes(OPS_ISSUE_MARKER));
  const open = ours.find((issue) => issue.state === "open");
  if (open) return open;
  return ours.slice().sort((a, b) => b.number - a.number)[0] ?? null;
}

function stateMarker(state: OpsAlarmState): string {
  return `<!-- cc-ops-alarm:state=${state} -->`;
}

/** Title and body for the alarm issue in `state`; the body carries both markers and the ops text. */
export function renderOpsIssue(report: OpsReport | null, state: OpsAlarmState, ctx: OpsIssueContext): { title: string; body: string } {
  const title = `${OPS_ISSUE_TITLE}: ${state.toUpperCase()}`;
  const lines = [
    OPS_ISSUE_MARKER,
    stateMarker(state),
    `**${state.toUpperCase()}** — \`pipeline ops\` at ${ctx.now.toISOString()} (exit ${ctx.exitCode}).`,
    "",
    "```",
    report ? formatOpsReport(report) : `no ops verdict: pipeline ops exited ${ctx.exitCode} before producing a report (usage, config or ledger fetch error)`,
    "```",
    "",
    "The verdict comes from `pipeline_runs` (ADR-007: the ledger is the heartbeat). `stale` = no completed run for longer than `schedule.slot_hours × 1.5`; `never` = no completed run at all; `failing` = the last two finished runs failed or stopped on budget; `unknown` = the check itself could not run.",
    "This issue is written only when the state changes and is closed automatically when a later check is OK (runbook: `docs/shadow/README.md`).",
  ];
  if (ctx.runUrl) lines.push("", `Workflow run: ${ctx.runUrl}`);
  return { title, body: lines.join("\n") };
}

/** The write (if any) that brings the alarm issue in line with this verdict. */
export function planOpsIssue(report: OpsReport | null, existing: OpsIssueRef | null, ctx: OpsIssueContext): OpsIssuePlan {
  const state = alarmState(report, ctx.exitCode);
  const stamp = ctx.now.toISOString();
  if (state === "ok") {
    if (!existing || existing.state === "closed") return { action: "none", state, reason: existing ? `healthy; alarm issue #${existing.number} already closed` : "healthy; no alarm issue" };
    return {
      action: "close",
      state,
      number: existing.number,
      comment: `Recovered at ${stamp}: \`pipeline ops\` is OK again.${report ? `\n\n\`\`\`\n${formatOpsReport(report)}\n\`\`\`` : ""}${ctx.runUrl ? `\n\nWorkflow run: ${ctx.runUrl}` : ""}`,
    };
  }
  const { title, body } = renderOpsIssue(report, state, ctx);
  if (!existing) return { action: "create", state, title, body };
  const previous = readIssueState(existing.body);
  if (existing.state === "open" && previous === state) return { action: "none", state, reason: `alarm issue #${existing.number} already open with state ${state}` };
  const reopen = existing.state === "closed";
  const comment = `${reopen ? "Relapse" : "State change"} at ${stamp}: ${previous ?? "?"} → **${state}**.${report ? `\n\n\`\`\`\n${formatOpsReport(report)}\n\`\`\`` : ""}${ctx.runUrl ? `\n\nWorkflow run: ${ctx.runUrl}` : ""}`;
  return { action: "update", state, number: existing.number, title, body, comment, reopen };
}
