/**
 * `pipeline regenerate` (ADR-009, Josh 2026-11-04): news briefs published in Korean before the English
 * switch are re-drafted in English from their original source and replace themselves in place.
 *
 * For each target the stored chain publication → draft → candidate → raw item is read back, the slug is
 * recomputed from the raw item (it must equal the published slug, or the row is skipped: a new slug would
 * leave the Korean row behind), and the run goes through generate → qa → image → publish with the current
 * prompt and QA config. The publisher updates the existing row by slug (`publish.slug_conflict: update`,
 * first `published_at` kept). A target whose English draft QA rejects or holds is unpublished on a real
 * run (Josh's decision: a brief that cannot pass in English comes down); a target the run never reached
 * (generation error, budget stop) is kept as it is and is picked up again by the next invocation, since
 * targets are selected by their Korean title.
 *
 * Pure planning and reporting live here; the CLI wires the database, ledger and adapters.
 */
import { CandidateInsert, PUBLICATION_COLUMNS, RawItemInsert, newsBriefSlug } from "@cc/shared";
import type { DbPort, DraftRow, PublicationRow, Row } from "@cc/shared";
import type { RunResult } from "../runner.ts";

const HANGUL = /[가-힣]/u;
/** Upper bound on the published rows read to find targets; the site has tens of rows, not thousands. */
const PUBLICATION_SCAN = 2000;

/** A brief still in Korean: its title carries Hangul (English briefs never do, LANG_MISMATCH enforces it). */
export function isKoreanBrief(row: Pick<PublicationRow, "content_type" | "title">): boolean {
  return row.content_type === "news_brief" && HANGUL.test(row.title);
}

export type RegenerateSkipReason = "NO_DRAFT" | "DRAFT_NOT_FOUND" | "CANDIDATE_NOT_FOUND" | "RAW_ITEM_NOT_FOUND" | "ROW_INVALID" | "SLUG_MISMATCH" | "NOT_A_BRIEF";

export interface RegenerateTarget {
  slug: string;
  title: string;
  published_at: string;
  draft_id: string;
  candidate: CandidateInsert;
  rawItem: RawItemInsert;
}

export interface RegenerateSkip {
  slug: string;
  title: string;
  reason: RegenerateSkipReason;
  detail: string | null;
}

export interface RegeneratePlan {
  /** Published briefs matching the selection (Korean titles, or the `--slugs` asked for) before `limit`. */
  eligible: number;
  targets: RegenerateTarget[];
  skipped: RegenerateSkip[];
  /** Every published row read, so a dry run can seed its memory DB with what DUPLICATE_EVENT compares against. */
  publications: PublicationRow[];
}

export interface PlanOptions {
  /** Regenerate exactly these slugs (any language); otherwise every published brief with a Korean title. */
  slugs?: readonly string[];
  limit: number;
}

function issues(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return error.issues.map((issue) => `${issue.path.map(String).join(".") || "<root>"}: ${issue.message}`).join("; ").slice(0, 300);
}

function rawItemIdOf(draft: DraftRow): string | null {
  const source = draft.body["source"];
  const id = source && typeof source === "object" ? (source as { raw_item_id?: unknown }).raw_item_id : undefined;
  return typeof id === "string" ? id : null;
}

/** Newest first, so the home page turns English first when a run is cut short by `limit` or the budget. */
export async function planRegeneration(db: DbPort, options: PlanOptions): Promise<RegeneratePlan> {
  const publications = await db.select<PublicationRow>("publications", { status: "published" }, { columns: PUBLICATION_COLUMNS, orderBy: { column: "published_at", ascending: false }, limit: PUBLICATION_SCAN });
  const wanted = options.slugs && options.slugs.length > 0 ? new Set(options.slugs) : null;
  const skipped: RegenerateSkip[] = [];
  const skip = (row: Pick<PublicationRow, "slug" | "title">, reason: RegenerateSkipReason, detail: string | null = null): void => {
    skipped.push({ slug: row.slug, title: row.title, reason, detail });
  };

  let eligibleRows: PublicationRow[];
  if (wanted) {
    eligibleRows = publications.filter((row) => wanted.has(row.slug));
    for (const row of eligibleRows.filter((r) => r.content_type !== "news_brief")) skip(row, "NOT_A_BRIEF", row.content_type);
    eligibleRows = eligibleRows.filter((row) => row.content_type === "news_brief");
  } else {
    eligibleRows = publications.filter(isKoreanBrief);
  }
  const picked = eligibleRows.slice(0, options.limit);

  const draftIds = picked.map((row) => row.draft_id).filter((id): id is string => typeof id === "string");
  const drafts = new Map((draftIds.length > 0 ? await db.selectIn<DraftRow>("drafts", "id", draftIds) : []).map((d) => [d.id, d]));
  const candidateIds = [...drafts.values()].map((d) => d.candidate_id);
  const candidates = new Map((candidateIds.length > 0 ? await db.selectIn<Row>("candidates", "id", candidateIds) : []).map((c) => [String(c["id"]), c]));
  const rawIds = [...drafts.values()].map((d) => rawItemIdOf(d) ?? String(candidates.get(d.candidate_id)?.["raw_item_id"] ?? "")).filter(Boolean);
  const rawItems = new Map((rawIds.length > 0 ? await db.selectIn<Row>("raw_items", "id", rawIds) : []).map((r) => [String(r["id"]), r]));

  const targets: RegenerateTarget[] = [];
  for (const row of picked) {
    if (!row.draft_id) {
      skip(row, "NO_DRAFT");
      continue;
    }
    const draft = drafts.get(row.draft_id);
    if (!draft) {
      skip(row, "DRAFT_NOT_FOUND", row.draft_id);
      continue;
    }
    const candidateRow = candidates.get(draft.candidate_id);
    if (!candidateRow) {
      skip(row, "CANDIDATE_NOT_FOUND", draft.candidate_id);
      continue;
    }
    const { created_at: _created, ...candidateFields } = candidateRow;
    const candidate = CandidateInsert.safeParse(candidateFields);
    if (!candidate.success) {
      skip(row, "ROW_INVALID", `candidate: ${issues(candidate.error)}`);
      continue;
    }
    const rawId = rawItemIdOf(draft) ?? candidate.data.raw_item_id;
    const rawRow = rawItems.get(rawId);
    if (!rawRow) {
      skip(row, "RAW_ITEM_NOT_FOUND", rawId);
      continue;
    }
    const rawItem = RawItemInsert.safeParse(rawRow);
    if (!rawItem.success) {
      skip(row, "ROW_INVALID", `raw_item: ${issues(rawItem.error)}`);
      continue;
    }
    const slug = newsBriefSlug(rawItem.data.canonical_url, rawItem.data.title);
    if (slug !== row.slug) {
      skip(row, "SLUG_MISMATCH", `the raw item now yields ${slug}`);
      continue;
    }
    targets.push({ slug: row.slug, title: row.title, published_at: row.published_at, draft_id: row.draft_id, candidate: candidate.data, rawItem: rawItem.data });
  }
  return { eligible: eligibleRows.length, targets, skipped, publications };
}

export type RegenerateOutcome = "regenerated" | "qa_failed" | "kept";

export interface RegenerateEntry {
  slug: string;
  old_title: string;
  new_title: string | null;
  outcome: RegenerateOutcome;
  /** QA rules that failed (qa_failed), or why the run did not reach the target (kept). */
  reasons: string[];
  /** True once the row was set to `unpublished` (a real run's qa_failed target). */
  unpublished: boolean;
}

/** What happened to each target, read from the run's publish list and its generate / QA decisions. */
export function regenerationOutcomes(plan: RegeneratePlan, result: RunResult): RegenerateEntry[] {
  const published = new Set(result.state.published.map((p) => p.slug));
  const qa = new Map(result.state.qaStats.decisions.filter((d) => d.slug !== null).map((d) => [d.slug!, d]));
  const generate = new Map(result.state.generateStats.decisions.map((d) => [d.canonical_url, d]));
  return plan.targets.map((target) => {
    const decision = qa.get(target.slug);
    const newTitle = decision?.title ?? generate.get(target.rawItem.canonical_url)?.title ?? null;
    if (published.has(target.slug)) return { slug: target.slug, old_title: target.title, new_title: newTitle, outcome: "regenerated", reasons: [], unpublished: false };
    if (decision && decision.outcome !== "passed") return { slug: target.slug, old_title: target.title, new_title: newTitle, outcome: "qa_failed", reasons: decision.failed_rules, unpublished: false };
    const gen = generate.get(target.rawItem.canonical_url);
    const reason = gen?.error ?? (decision?.outcome === "passed" ? "PUBLISH_NOT_REACHED" : "NOT_PROCESSED");
    return { slug: target.slug, old_title: target.title, new_title: newTitle, outcome: "kept", reasons: [reason.slice(0, 200)], unpublished: false };
  });
}

/** A real run takes down the briefs whose English draft QA would not pass; returns the entries with `unpublished` set. */
export async function unpublishFailed(db: DbPort, entries: readonly RegenerateEntry[], now: Date): Promise<RegenerateEntry[]> {
  const out: RegenerateEntry[] = [];
  for (const entry of entries) {
    if (entry.outcome !== "qa_failed") {
      out.push(entry);
      continue;
    }
    await db.update("publications", { slug: entry.slug }, { status: "unpublished", updated_at: now.toISOString() });
    out.push({ ...entry, unpublished: true });
  }
  return out;
}

export interface RegenerateReport {
  target: string;
  dry_run: boolean;
  run_id: string | null;
  run_status: string | null;
  cost_usd: number;
  eligible: number;
  remaining: number;
  entries: RegenerateEntry[];
  skipped: RegenerateSkip[];
}

export function buildRegenerateReport(input: { target: string; dryRun: boolean; plan: RegeneratePlan; entries: RegenerateEntry[]; result: RunResult | null }): RegenerateReport {
  const done = input.entries.filter((e) => e.outcome !== "kept").length;
  return {
    target: input.target,
    dry_run: input.dryRun,
    run_id: input.result?.runId ?? null,
    run_status: input.result?.status ?? null,
    cost_usd: Number((input.result?.costTotalUsd ?? 0).toFixed(4)),
    eligible: input.plan.eligible,
    remaining: Math.max(0, input.plan.eligible - done),
    entries: input.entries,
    skipped: input.plan.skipped,
  };
}

function cell(value: unknown): string {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

/** Markdown for the step summary. */
export function formatRegenerateReport(report: RegenerateReport): string {
  const counts = { regenerated: 0, qa_failed: 0, kept: 0 };
  for (const entry of report.entries) counts[entry.outcome] += 1;
  const lines = [
    `### Regenerate Korean briefs in English — ${report.target}${report.dry_run ? " (dry run: nothing written)" : ""}`,
    "",
    `run \`${report.run_id ?? "—"}\` · ${report.run_status ?? "not run"} · USD ${report.cost_usd.toFixed(4)} · eligible ${report.eligible} · regenerated ${counts.regenerated} · QA failed ${counts.qa_failed}${report.dry_run ? "" : " (unpublished)"} · kept ${counts.kept} · still to do ${report.remaining}`,
    "",
  ];
  if (report.entries.length > 0) {
    lines.push("| slug | outcome | old title | new title | reasons |", "|---|---|---|---|---|");
    for (const e of report.entries) lines.push(`| ${cell(e.slug)} | ${e.outcome}${e.unpublished ? " → unpublished" : ""} | ${cell(e.old_title)} | ${cell(e.new_title ?? "")} | ${cell(e.reasons.join(", "))} |`);
    lines.push("");
  }
  if (report.skipped.length > 0) {
    lines.push("Skipped (not regenerated, left as they are):", "", "| slug | reason | detail |", "|---|---|---|");
    for (const s of report.skipped) lines.push(`| ${cell(s.slug)} | ${s.reason} | ${cell(s.detail ?? "")} |`);
    lines.push("");
  }
  if (report.entries.length === 0 && report.skipped.length === 0) lines.push("Nothing to regenerate: no published brief has a Korean title.", "");
  return lines.join("\n");
}
