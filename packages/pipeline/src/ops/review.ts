/**
 * `pipeline review` — Phase 4 M4 step 8, the sample-review dump.
 *
 * Reads drafts from the DbPort (one run, or the newest rows with a review
 * status), each draft's QA verdicts and its source item, and renders markdown
 * with the brief as written, the grounding evidence and short excerpts of the
 * source around every number QA could not ground. A reviewer judges false
 * rejections (and false passes) from the step summary without opening the
 * database. Read-only: nothing is written, and the Supabase names come from the
 * caller (CLI) like `pipeline ops`.
 */
import type { DbPort, DraftRow, QaResultRow, RawItemRow, ReviewStatus } from "@cc/shared";
import { bodyTextOf } from "../stages/normalize.ts";

export const REVIEW_STATUSES = ["rejected", "pending", "none", "approved", "any"] as const;
export type ReviewStatusFilter = (typeof REVIEW_STATUSES)[number];

export interface ReviewOptions {
  /** `pipeline_runs.id`: review every draft of that run (newest first). */
  runId?: string | undefined;
  /** Without `runId`: drafts with this review status, newest first (`any` = every status). */
  status?: ReviewStatusFilter | undefined;
  /** Max drafts (default 5). */
  limit?: number | undefined;
  /** Characters of source text kept on each side of a matched number (default 160). */
  window?: number | undefined;
}

export interface ReviewExcerpt {
  /** The ungrounded token as the draft wrote it (`450억`, `1`). */
  token: string;
  /** What was searched in the source text (digits, and the digits without trailing zeros). */
  needles: string[];
  /** Source windows around the matches, the match wrapped in «»; empty when no needle occurs. */
  snippets: string[];
}

export interface ReviewEntry {
  draft_id: string;
  run_id: string;
  created_at: string;
  review_status: ReviewStatus;
  prompt_version: string;
  model: string;
  cost_usd: number;
  slug: string | null;
  source_id: string | null;
  canonical_url: string | null;
  source_title: string | null;
  published_at_source: string | null;
  brief: { title_ko: string | null; summary_ko: string | null; why_it_matters_ko: string | null; expert_lens_ko: string | null; tags: string[] };
  checks: { grounding_pass: boolean | null; ungrounded: string[]; quote_max_words: number | null; banned_matches: number | null };
  qa: Array<{ rule: string; severity: string; pass: boolean; reason_code: string; evidence: Record<string, unknown> }>;
  source_chars: number;
  source_head: string;
  excerpts: ReviewExcerpt[];
}

const DEFAULT_LIMIT = 5;
const DEFAULT_WINDOW = 160;
const MAX_SNIPPETS = 3;
const HEAD_CHARS = 400;

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Collapses whitespace so a snippet stays on one line in markdown. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Same, but keeps a leading / trailing space so the text around a «match» stays separated. */
function collapse(text: string): string {
  return text.replace(/\s+/g, " ");
}

/** Digits (with separators) of a token, plus the same without trailing zeros (`450억` → `450`, `45`; `2.1 billion` → `2.1`). */
export function needlesFor(token: string): string[] {
  const digits = token.replace(/[^\d.,]/g, "").replace(/^[.,]+|[.,]+$/g, "");
  if (!digits) return [];
  const needles = [digits];
  const trimmed = digits.replace(/0+$/, "");
  if (trimmed && trimmed !== digits && !/[.,]$/.test(trimmed)) needles.push(trimmed);
  return needles;
}

/** Source windows around every needle occurrence (whole-number boundaries, so `45` does not match inside `1450`). */
export function excerptsFor(text: string, token: string, window = DEFAULT_WINDOW, max = MAX_SNIPPETS): ReviewExcerpt {
  const needles = needlesFor(token);
  const snippets: string[] = [];
  const seen = new Set<number>();
  for (const needle of needles) {
    // Whole-number boundaries: no digit (or separator + digit) on either side, so `45` is not the inside of `1,450` and `1` is not its first digit.
    const pattern = new RegExp(`(?<!\\d|\\d[.,])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\d|[.,]\\d)`, "g");
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined || snippets.length >= max) break;
      const bucket = Math.floor(match.index / Math.max(1, window));
      if (seen.has(bucket)) continue;
      seen.add(bucket);
      const start = Math.max(0, match.index - window);
      const end = Math.min(text.length, match.index + match[0].length + window);
      snippets.push(`${start > 0 ? "…" : ""}${collapse(text.slice(start, match.index))}«${match[0]}»${collapse(text.slice(match.index + match[0].length, end))}${end < text.length ? "…" : ""}`.trim());
    }
    if (snippets.length >= max) break;
  }
  return { token, needles, snippets };
}

async function sourceFor(db: DbPort, draft: DraftRow): Promise<RawItemRow | null> {
  const body = record(draft.body);
  const sourceRef = record(body["source"]);
  let rawItemId = str(sourceRef["raw_item_id"]);
  if (!rawItemId) {
    const candidates = await db.select<{ raw_item_id: string }>("candidates", { id: draft.candidate_id }, { columns: ["raw_item_id"], limit: 1 });
    rawItemId = candidates[0]?.raw_item_id ?? null;
  }
  if (!rawItemId) return null;
  const items = await db.select<RawItemRow>("raw_items", { id: rawItemId }, { limit: 1 });
  return items[0] ?? null;
}

export async function collectReview(db: DbPort, options: ReviewOptions = {}): Promise<ReviewEntry[]> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const window = options.window ?? DEFAULT_WINDOW;
  const where: Record<string, unknown> = options.runId ? { run_id: options.runId } : options.status && options.status !== "any" ? { review_status: options.status } : {};
  const drafts = await db.select<DraftRow>("drafts", where, { orderBy: { column: "created_at", ascending: false }, limit });
  const entries: ReviewEntry[] = [];
  for (const draft of drafts) {
    const body = record(draft.body);
    const brief = record(body["brief"]);
    const checks = record(body["checks"]);
    const grounding = record(checks["grounding"]);
    const banned = record(checks["banned"]);
    const ungrounded = Array.isArray(grounding["ungrounded"]) ? (grounding["ungrounded"] as unknown[]).filter((value): value is string => typeof value === "string") : [];
    const qaRows = await db.select<QaResultRow>("qa_results", { draft_id: draft.id }, { orderBy: { column: "checked_at", ascending: true }, limit: 100 });
    const item = await sourceFor(db, draft);
    const text = item ? bodyTextOf(item) : "";
    entries.push({
      draft_id: draft.id,
      run_id: draft.run_id,
      created_at: draft.created_at,
      review_status: draft.review_status,
      prompt_version: draft.prompt_version,
      model: draft.model,
      cost_usd: draft.cost_usd,
      slug: str(brief["slug"]),
      source_id: item?.source_id ?? str(record(body["source"])["source_id"]),
      canonical_url: item?.canonical_url ?? str(brief["source_url"]),
      source_title: item?.title ?? null,
      published_at_source: item?.published_at_source ?? str(brief["published_at_source"]),
      brief: {
        title_ko: str(brief["title_ko"]),
        summary_ko: str(brief["summary_ko"]),
        why_it_matters_ko: str(brief["why_it_matters_ko"]),
        expert_lens_ko: str(brief["expert_lens_ko"]),
        tags: Array.isArray(brief["tags"]) ? (brief["tags"] as unknown[]).filter((value): value is string => typeof value === "string") : [],
      },
      checks: {
        grounding_pass: typeof grounding["pass"] === "boolean" ? (grounding["pass"] as boolean) : null,
        ungrounded,
        quote_max_words: typeof checks["quote_max_words"] === "number" ? (checks["quote_max_words"] as number) : null,
        banned_matches: Array.isArray(banned["matches"]) ? (banned["matches"] as unknown[]).length : null,
      },
      qa: qaRows.map((row) => ({ rule: row.rule, severity: row.severity, pass: row.pass, reason_code: row.reason_code, evidence: row.evidence })),
      source_chars: text.length,
      source_head: oneLine(text.slice(0, HEAD_CHARS)),
      excerpts: ungrounded.map((token) => excerptsFor(text, token, window)),
    });
  }
  return entries;
}

function cell(value: unknown): string {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function shortEvidence(evidence: Record<string, unknown>): string {
  const text = JSON.stringify(evidence);
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

/** Markdown for the step summary / an artifact: one section per draft. */
export function formatReview(entries: ReviewEntry[], options: ReviewOptions = {}): string {
  const scope = options.runId ? `run \`${options.runId}\`` : `status \`${options.status ?? "rejected"}\``;
  const lines = [`# Shadow review — ${scope} · ${entries.length} draft${entries.length === 1 ? "" : "s"}`, ""];
  if (entries.length === 0) {
    lines.push("No drafts matched.");
    return `${lines.join("\n")}\n`;
  }
  entries.forEach((entry, index) => {
    lines.push(`## ${index + 1}. ${entry.brief.title_ko ?? "(no title)"}`);
    lines.push("");
    lines.push(`- slug \`${entry.slug ?? "?"}\` · source \`${entry.source_id ?? "?"}\` · review_status **${entry.review_status}** · prompt \`${entry.prompt_version}\` · model \`${entry.model}\` · USD ${entry.cost_usd.toFixed(4)}`);
    lines.push(`- draft \`${entry.draft_id}\` · run \`${entry.run_id}\` · created ${entry.created_at}`);
    lines.push(`- 원문: ${entry.source_title ? `${entry.source_title} — ` : ""}${entry.canonical_url ?? "?"}${entry.published_at_source ? ` (${entry.published_at_source})` : ""} · ${entry.source_chars} chars`);
    lines.push("");
    lines.push(`**요약**: ${entry.brief.summary_ko ?? "—"}`);
    lines.push("");
    lines.push(`**의미**: ${entry.brief.why_it_matters_ko ?? "—"}`);
    lines.push("");
    lines.push(`**렌즈**: ${entry.brief.expert_lens_ko ?? "—"}`);
    lines.push("");
    lines.push(`태그: ${entry.brief.tags.length ? entry.brief.tags.map((tag) => `\`${tag}\``).join(" ") : "—"}`);
    lines.push("");
    lines.push(`**checks**: grounding ${entry.checks.grounding_pass === null ? "?" : entry.checks.grounding_pass ? "pass" : "fail"}${entry.checks.ungrounded.length ? ` (ungrounded: ${entry.checks.ungrounded.map((token) => `\`${token}\``).join(", ")})` : ""} · quote_max_words ${entry.checks.quote_max_words ?? "?"} · banned matches ${entry.checks.banned_matches ?? "?"}`);
    lines.push("");
    if (entry.qa.length > 0) {
      lines.push("| rule | severity | pass | reason_code | evidence |");
      lines.push("|---|---|---|---|---|");
      for (const verdict of entry.qa) lines.push(`| ${cell(verdict.rule)} | ${cell(verdict.severity)} | ${verdict.pass ? "✓" : "✗"} | ${cell(verdict.reason_code)} | ${cell(shortEvidence(verdict.evidence))} |`);
      lines.push("");
    }
    lines.push(`**원문 머리** (${HEAD_CHARS}자): ${entry.source_head || "—"}`);
    lines.push("");
    for (const excerpt of entry.excerpts) {
      lines.push(`**원문 대조 \`${excerpt.token}\`** (검색: ${excerpt.needles.map((needle) => `\`${needle}\``).join(", ") || "—"}):`);
      if (excerpt.snippets.length === 0) lines.push("- (원문에 그 숫자가 없음)");
      for (const snippet of excerpt.snippets) lines.push(`- ${snippet}`);
      lines.push("");
    }
  });
  return `${lines.join("\n")}\n`;
}
