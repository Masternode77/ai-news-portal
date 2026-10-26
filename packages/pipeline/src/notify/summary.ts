/**
 * Run summary (Phase 3i, ADR-007): the one message a run leaves behind —
 * funnel line, published links, the top failure codes, why nothing was
 * published, cost against the cap. Built from the RunResult alone (no ledger
 * read), so a memory run and a Supabase run render the same text, and the
 * same text goes to the log, the `--json` output and Telegram.
 */
import type { Funnel, NotifyKind, NotifySummaryConfig, RunStatus, RunTrigger } from "@cc/shared";
import { errorCode } from "../runner.ts";
import type { RunResult, StageResult } from "../runner.ts";

export interface SummaryFailure {
  code: string;
  count: number;
  /** The first stage, source, slug or draft the code was seen on. */
  sample: string | null;
}

export interface SummaryPublished {
  slug: string;
  url: string;
  content_type: string;
  title: string | null;
  action: string | null;
}

export interface SummaryCost {
  spent_usd: number;
  cap_usd: number;
  soft_warn_usd: number;
  calls: number;
  state: "ok" | "soft_warn" | "exceeded";
  stop_reason: string | null;
  input_tokens: number;
  output_tokens: number;
}

export interface RunSummary {
  run_id: string;
  status: Exclude<RunStatus, "started">;
  trigger: RunTrigger;
  started_at: string;
  /** `2026-10-18 00:45 KST` (notify.summary.timezone). */
  started_local: string;
  duration_ms: number;
  dry_run: boolean;
  replay: boolean;
  fixture: string | null;
  git_sha: string | null;
  /** The Actions run page when the run is one (GITHUB_SERVER_URL / GITHUB_REPOSITORY / GITHUB_RUN_ID). */
  run_url: string | null;
  funnel: Funnel;
  published: SummaryPublished[];
  /** Failure codes by frequency, top `notify.summary.top_failures`. */
  failures: SummaryFailure[];
  /** Why nothing was published: the first stage that stopped the flow (skipped, failed or empty); empty when something was. */
  zero_published_reasons: string[];
  stages: { stage: string; status: string; reason: string | null; error: string | null }[];
  cost: SummaryCost;
}

export interface SummaryOptions {
  summary: NotifySummaryConfig;
  capUsd: number;
  softWarnUsd: number;
  trigger: RunTrigger;
  dryRun: boolean;
  replay: boolean;
  fixtureName: string | null;
  gitSha: string | null;
  runUrl: string | null;
}

const TZ_OFFSET_MIN: Record<NotifySummaryConfig["timezone"], number> = { "Asia/Seoul": 540, UTC: 0 };
const TZ_LABEL: Record<NotifySummaryConfig["timezone"], string> = { "Asia/Seoul": "KST", UTC: "UTC" };

const pad = (n: number): string => String(n).padStart(2, "0");

/** ISO instant → `YYYY-MM-DD HH:MM <label>` in a fixed-offset zone (KST has no DST). */
export function formatLocal(iso: string, timezone: NotifySummaryConfig["timezone"]): string {
  const shifted = new Date(Date.parse(iso) + TZ_OFFSET_MIN[timezone] * 60_000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())} ${TZ_LABEL[timezone]}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 120_000) return `${Math.round(ms / 1000)} s`;
  return `${Math.round(ms / 60_000)} min`;
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

function tally(map: Map<string, SummaryFailure>, code: string, sample: string | null): void {
  const entry = map.get(code);
  if (entry) entry.count += 1;
  else map.set(code, { code, count: 1, sample });
}

/** Every failure the run recorded, by taxonomy code: stage errors, source errors, generate / image / publish failures, QA rejections, the budget stop. */
export function collectFailures(result: RunResult): SummaryFailure[] {
  const map = new Map<string, SummaryFailure>();
  const state = result.state;
  for (const stage of result.stages) if (stage.status === "error" && stage.error) tally(map, errorCode(stage.error), stage.stage);
  for (const { source_id, error } of state.sourceStats.errors) tally(map, errorCode(error), source_id);
  for (const d of state.generateStats.decisions) if (!d.ok) tally(map, errorCode(d.error ?? "GENERATE_FAILED"), d.source_id);
  for (const d of state.qaStats.decisions) {
    if (d.outcome === "passed") continue;
    for (const rule of d.failed_rules) if (!d.auto_passed_rules.includes(rule)) tally(map, rule, d.slug ?? d.draft_id);
  }
  for (const d of state.imageStats.decisions) for (const a of d.attempts) if (!a.ok) tally(map, a.code ?? "IMAGE_PROVIDER_FAILED", d.slug);
  for (const d of state.publishStats.decisions) if (d.action === "failed") tally(map, errorCode(d.error ?? "PUBLISH_FAILED"), d.slug ?? d.draft_id);
  if (result.budget.stop_reason !== null && !map.has("BUDGET_EXCEEDED")) tally(map, "BUDGET_EXCEEDED", result.budget.stop_reason.split(":")[0]?.trim() || null);
  return [...map.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

function stageLine(stage: StageResult | undefined): string | null {
  if (!stage) return null;
  if (stage.status === "skipped") return `${stage.stage}: skipped (${stage.reason ?? "unknown"})${stage.stage === "qa" && stage.reason === "flag_off" ? " — fail-closed, nothing passes" : ""}`;
  if (stage.status === "error") return `${stage.stage}: ${errorCode(stage.error ?? "ERROR")}`;
  return null;
}

/**
 * Why `funnel.published` is 0: the first stage, in pipeline order, that was
 * skipped, failed or produced nothing. One line, so the message names the
 * cause and not its echoes; the failure codes line carries the rest.
 */
export function zeroPublishedReasons(result: RunResult): string[] {
  const f = result.funnel;
  if (f.published > 0) return [];
  const s = result.state;
  const stage = (name: StageResult["stage"]): StageResult | undefined => result.stages.find((x) => x.stage === name);
  const reasons: string[] = [];
  const steps: { name: StageResult["stage"]; empty: () => string | null }[] = [
    {
      name: "ingest",
      empty: () => {
        if (f.sources_configured > 0 && f.sources_ok === 0) return `ingest: 0/${f.sources_configured} sources ok`;
        if (f.items_fetched === 0) return "ingest: 0 items fetched";
        if (f.items_new === 0) return `ingest: 0 new items (${f.items_fetched} fetched, all seen)`;
        return null;
      },
    },
    { name: "normalize", empty: () => (s.normalizeStats.candidates === 0 && s.normalizeStats.pool > 0 ? `normalize: 0 candidates (rejected ${s.normalizeStats.rejected})` : null) },
    {
      name: "score",
      empty: () => {
        if (f.passed_gate === 0 && s.scoreStats.candidates > 0) return `score: 0 passed the brief threshold (below ${s.scoreStats.below_threshold}, relevance floor ${s.scoreStats.below_relevance})`;
        if (s.scoreStats.selected === 0 && f.passed_gate > 0) return `score: 0 selected (not selected ${s.scoreStats.not_selected})`;
        return null;
      },
    },
    { name: "generate", empty: () => (f.drafts === 0 && s.generateStats.selected > 0 ? `generate: 0 drafts (failed ${s.generateStats.failed}, budget-stopped ${s.generateStats.budget_stopped})` : null) },
    { name: "qa", empty: () => (f.qa_passed === 0 && s.qaStats.drafts > 0 ? `qa: 0 passed (rejected ${s.qaStats.rejected}, held ${s.qaStats.held})` : null) },
    { name: "image", empty: () => (s.imageStats.with_images === 0 && s.imageStats.passed > 0 ? `image: 0 forwarded (rejected ${s.imageStats.rejected}, held ${s.imageStats.held})` : null) },
    {
      name: "publish",
      empty: () => {
        const p = s.publishStats;
        if (p.target === "none") return `publish: target none (dry, ${p.candidates} would publish)`;
        if (p.candidates > 0) return `publish: 0 written (failed ${p.failed}, skipped ${p.skipped})`;
        return null;
      },
    },
  ];
  for (const step of steps) {
    const line = stageLine(stage(step.name)) ?? step.empty();
    if (line) {
      // The first stage that stopped the flow is the reason; later stages only echo the empty input.
      reasons.push(line);
      break;
    }
  }
  return reasons;
}

function publishedRefs(result: RunResult, max: number): SummaryPublished[] {
  const bySlug = new Map<string, { content_type: string; title: string | null }>();
  for (const { draft } of result.state.withImages) {
    const brief = draft.body["brief"];
    const slug = brief && typeof brief === "object" ? (brief as { slug?: unknown }).slug : undefined;
    const title = brief && typeof brief === "object" ? (brief as { title_ko?: unknown }).title_ko : undefined;
    if (typeof slug === "string") bySlug.set(slug, { content_type: draft.content_type, title: typeof title === "string" ? title : null });
  }
  return result.state.published.slice(0, max).map((p) => {
    const known = bySlug.get(p.slug);
    return { slug: p.slug, url: p.url, content_type: known?.content_type ?? (p.slug.startsWith("column/") ? "insight_essay" : "news_brief"), title: known?.title ?? null, action: p.action ?? null };
  });
}

export function buildRunSummary(result: RunResult, options: SummaryOptions): RunSummary {
  return {
    run_id: result.runId,
    status: result.status,
    trigger: options.trigger,
    started_at: result.funnel.started_at,
    started_local: formatLocal(result.funnel.started_at, options.summary.timezone),
    duration_ms: result.durationMs,
    dry_run: options.dryRun,
    replay: options.replay,
    fixture: options.fixtureName,
    git_sha: options.gitSha,
    run_url: options.runUrl,
    funnel: result.funnel,
    published: publishedRefs(result, options.summary.max_published),
    failures: collectFailures(result).slice(0, options.summary.top_failures),
    zero_published_reasons: zeroPublishedReasons(result),
    stages: result.stages.map((s) => ({ stage: s.stage, status: s.status, reason: s.reason ?? null, error: s.error ? errorCode(s.error) : null })),
    cost: {
      spent_usd: result.budget.spent_usd,
      cap_usd: options.capUsd,
      soft_warn_usd: options.softWarnUsd,
      calls: result.budget.calls,
      state: result.budget.state,
      stop_reason: result.budget.stop_reason,
      input_tokens: result.state.generateStats.input_tokens,
      output_tokens: result.state.generateStats.output_tokens,
    },
  };
}

export function funnelLine(f: Funnel): string {
  return `fetched ${f.items_fetched} (sources ${f.sources_ok}/${f.sources_configured} ok) → new ${f.items_new} → scored ${f.items_scored} → gate ${f.passed_gate} → drafts ${f.drafts} → qa ${f.qa_passed} → published ${f.published}`;
}

function costLine(s: RunSummary): string {
  const parts = [`cost USD ${s.cost.spent_usd.toFixed(2)} / cap ${s.cost.cap_usd.toFixed(2)}`, `calls ${s.cost.calls}`];
  if (s.cost.input_tokens > 0 || s.cost.output_tokens > 0) parts.push(`tokens in ${formatTokens(s.cost.input_tokens)} / out ${formatTokens(s.cost.output_tokens)}`);
  parts.push(formatDuration(s.duration_ms));
  return parts.join(" · ");
}

function failuresLine(s: RunSummary): string | null {
  if (s.failures.length === 0) return null;
  return `failures (top ${s.failures.length}): ${s.failures.map((f) => `${f.code} ×${f.count}${f.sample ? ` (${f.sample})` : ""}`).join(", ")}`;
}

function publishedLines(s: RunSummary): string[] {
  const lines = s.published.map((p) => `• ${p.content_type}: /${p.slug}/${p.title ? ` — "${p.title}"` : ""}${p.action && p.action !== "inserted" ? ` (${p.action})` : ""}`);
  const more = s.funnel.published - s.published.length;
  if (more > 0) lines.push(`• +${more} more`);
  return lines;
}

function modeLine(s: RunSummary): string | null {
  const parts: string[] = [];
  if (s.dry_run) parts.push("dry-run");
  if (s.replay) parts.push("replay");
  if (s.fixture) parts.push(`fixture ${s.fixture}`);
  if (s.trigger !== "schedule") parts.push(`trigger ${s.trigger}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** The ADR-007 layout for done / partial runs. */
export function formatRunSummary(s: RunSummary): string {
  const lines = [`[CC pipeline] ${s.started_local} · run ${s.run_id.slice(0, 8)} · ${s.status}`, funnelLine(s.funnel), ...publishedLines(s)];
  if (s.funnel.published === 0 && s.zero_published_reasons.length > 0) lines.push(`no publication: ${s.zero_published_reasons.join("; ")}`);
  const failures = failuresLine(s);
  if (failures) lines.push(failures);
  if (s.cost.state === "soft_warn") lines.push(`budget soft warning: USD ${s.cost.spent_usd.toFixed(2)} ≥ ${s.cost.soft_warn_usd.toFixed(2)}`);
  lines.push(costLine(s));
  const mode = modeLine(s);
  if (mode) lines.push(mode);
  if (s.run_url) lines.push(s.run_url);
  return lines.join("\n");
}

/** The failure template (failed / budget_stop): what stopped the run first, then the usual lines. */
export function formatRunFailure(s: RunSummary): string {
  const lines = [`[CC pipeline] ⚠ ${s.started_local} · run ${s.run_id.slice(0, 8)} · ${s.status.toUpperCase()}`];
  if (s.status === "budget_stop") lines.push(`BUDGET_EXCEEDED: ${s.cost.stop_reason ?? `USD ${s.cost.spent_usd.toFixed(2)} of cap ${s.cost.cap_usd.toFixed(2)}`} — generation stopped, QA-passed drafts still published`);
  const errored = s.stages.filter((x) => x.status === "error");
  if (errored.length > 0) lines.push(`stage errors: ${errored.map((x) => `${x.stage} ${x.error ?? "ERROR"}`).join(", ")}`);
  lines.push(funnelLine(s.funnel), ...publishedLines(s));
  if (s.funnel.published === 0 && s.zero_published_reasons.length > 0) lines.push(`no publication: ${s.zero_published_reasons.join("; ")}`);
  const failures = failuresLine(s);
  if (failures) lines.push(failures);
  lines.push(costLine(s));
  const mode = modeLine(s);
  if (mode) lines.push(mode);
  if (s.run_url) lines.push(s.run_url);
  return lines.join("\n");
}

/** The crash template: the run threw outside a stage (no RunResult); the ledger row is `failed`. */
export function formatRunCrash(input: { runId: string | null; startedAt: string; timezone: NotifySummaryConfig["timezone"]; error: string; trigger: RunTrigger; runUrl: string | null }): string {
  const lines = [`[CC pipeline] ⚠ ${formatLocal(input.startedAt, input.timezone)} · run ${input.runId ? input.runId.slice(0, 8) : "?"} · FAILED`, `crashed outside a stage (${errorCode(input.error)}): ${input.error.slice(0, 300)}`];
  if (input.trigger !== "schedule") lines.push(`trigger ${input.trigger}`);
  if (input.runUrl) lines.push(input.runUrl);
  return lines.join("\n");
}

export function notificationKind(status: RunSummary["status"]): NotifyKind {
  return status === "failed" || status === "budget_stop" ? "run_failure" : "run_summary";
}

/** The message for a finished run: summary template for done / partial, failure template otherwise. */
export function renderNotification(s: RunSummary): { kind: NotifyKind; text: string } {
  const kind = notificationKind(s.status);
  return { kind, text: kind === "run_failure" ? formatRunFailure(s) : formatRunSummary(s) };
}
