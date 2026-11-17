/**
 * Insight essays for The Current (Phase 3e, Josh 2026-11-16). Stage names are a database enum, so the essay
 * is not a stage of its own: generate drafts at most one per run after the briefs, and qa, image and publish
 * read `drafts.body.essay` next to `drafts.body.brief`. This module holds the pure parts: who is eligible,
 * the KST day limits, what the model sees of the recent essays, the slug, and the text views the QA rules
 * and the publisher share. Voice and structure live in content/voice/josh_voice.md and
 * content/templates/insight_essay.md, rendered into prompts/insight_essay.md.
 *
 * Eligibility (E1, D4): the candidate passed the brief threshold with a total of at least `essay.min_total`
 * and is `insight_eligible` (3c `insight_trigger`), its source is `text_rights: full` without an abstract-only scope, extraction did not
 * fail, the body has at least `essay.min_source_chars`, and no essay was ever drafted from that raw item.
 * The best one by insight potential, then total, is written.
 *
 * Limits (E2), per KST day: no essay once `caps.essays_per_day` essays are published; no more than
 * `essay.max_attempts_per_day` generations whatever their outcome (the cost guard against a run of
 * rejections). An attempt is an essay draft or an essay dead letter (a reply cut at `max_tokens`, a schema
 * failure, an LLM error), because a failed generation is paid for but writes no draft (first production
 * essay run, 2026-11-17). Rows without `created_at` (the memory database) never count as today's attempts.
 */
import { InsightEssay, InsightEssayDraft } from "@cc/shared";
import type { CandidateInsert, DbPort, DraftInsert, EssayConfig, LlmResponse, RawItemInsert, Row, SourceConfig } from "@cc/shared";
import { bodyTextOf } from "./normalize.ts";

export const ESSAY_CONTENT_TYPE = "insight_essay" as const;
export const ESSAY_DAILY_CAP = "ESSAY_DAILY_CAP";
export const ESSAY_ATTEMPTS_EXHAUSTED = "ESSAY_ATTEMPTS_EXHAUSTED";
export const NO_ELIGIBLE_CANDIDATE = "NO_ELIGIBLE_CANDIDATE";
export const ESSAY_SCHEMA_INVALID = "SCHEMA_INVALID";

/** The Current dates its essays in Korea Standard Time (no daylight saving). */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TAGS = 6;
const SLUG_MAX = 64;
/** Prior essay drafts read to know which raw items were essayed and how many attempts today has seen. */
const HISTORY_DRAFTS = 100;
/** Newest generate-stage dead letters read to count today's failed essay generations. */
const HISTORY_DEAD_LETTERS = 100;

/** Midnight KST of the day `now` falls in, as an instant. */
export function kstDayStart(now: Date): Date {
  const shifted = now.getTime() + KST_OFFSET_MS;
  return new Date(shifted - (shifted % DAY_MS) - KST_OFFSET_MS);
}

/** `YYYY-MM-DD` of the KST day `now` falls in. */
export function kstDate(now: Date): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** `column/<title words>-YYYY-MM-DD` (InsightEssaySlug): lower-case ASCII words of the title, cut at a word boundary within 64 characters. */
export function insightEssaySlug(title: string, now: Date): string {
  const words = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  let stem = "";
  for (const word of words) {
    const next = stem ? `${stem}-${word}` : word;
    if (next.length > SLUG_MAX) break;
    stem = next;
  }
  return `column/${stem || "essay"}-${kstDate(now)}`;
}

// ---------------------------------------------------------------------------
// text views
// ---------------------------------------------------------------------------
const HEADING = /^#{1,6}[ \t]+(.+?)[ \t#]*$/u;

/** The `##` headings of a Markdown field, in order, without their markers. */
export function markdownHeadings(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/u)) {
    const match = HEADING.exec(line.trim());
    if (match?.[1]) out.push(match[1].trim());
  }
  return out;
}

/** A Markdown field as plain text: heading markers dropped, the heading kept as its own line. */
export function plainMarkdown(text: string): string {
  return text
    .split(/\r?\n/u)
    .map((line) => {
      const match = HEADING.exec(line.trim());
      return match?.[1] ? match[1].trim() : line;
    })
    .join("\n")
    .trim();
}

/** The essay stored on a draft, or null when `body.essay` is not a valid InsightEssay. */
export function essayOf(draft: Pick<DraftInsert, "body">): InsightEssay | null {
  const result = InsightEssay.safeParse(draft.body["essay"]);
  return result.success ? result.data : null;
}

/** Reader-facing text by field, in reading order, Markdown heading markers removed (what QA and the checks read). */
export function essayFields(essay: Pick<InsightEssay, "title" | "deck" | "thesis" | "body" | "counterpoint" | "implications">): Record<string, string> {
  return {
    title: essay.title,
    deck: essay.deck,
    thesis: essay.thesis,
    body: plainMarkdown(essay.body),
    counterpoint: plainMarkdown(essay.counterpoint),
    implications: plainMarkdown(essay.implications),
  };
}

/** Every section heading of the essay, body first, then the counterpoint's and the implications'. */
export function essayHeadings(essay: Pick<InsightEssay, "body" | "counterpoint" | "implications">): string[] {
  return [...markdownHeadings(essay.body), ...markdownHeadings(essay.counterpoint), ...markdownHeadings(essay.implications)];
}

/**
 * The publication's `article_body`: body, counterpoint and implications as one long-form text with the
 * headings as their own short paragraphs, which is how the legacy columns store them and how the site's
 * long-form renderer turns them into section headings (apps/site view.ts isSubheading). ESSAY_STRUCTURE
 * checks that every heading has that shape.
 */
export function essayArticleBody(essay: Pick<InsightEssay, "body" | "counterpoint" | "implications">): string {
  return [essay.body, essay.counterpoint, essay.implications]
    .map((part) =>
      plainMarkdown(part)
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .join("\n")
        .replace(/\n{3,}/gu, "\n\n"),
    )
    .join("\n\n");
}

/** Whole words of an essay (all reader-facing fields but the title). */
export function essayWordCount(text: string): number {
  return (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) ?? []).length;
}

// ---------------------------------------------------------------------------
// eligibility
// ---------------------------------------------------------------------------
export interface EssayCandidate {
  candidate: CandidateInsert;
  item: RawItemInsert;
  source: SourceConfig;
  chars: number;
}

/** Why a candidate cannot carry an essay, or null when it can. */
export function essayIneligibility(candidate: CandidateInsert, item: RawItemInsert | undefined, source: SourceConfig | undefined, config: EssayConfig, essayed: ReadonlySet<string>): string | null {
  if (!candidate.rubric?.insight_eligible) return "not_insight_eligible";
  if (candidate.rubric.tier === null) return "below_threshold";
  if (candidate.total < config.min_total) return "below_min_total";
  if (!item || !source) return "no_raw_item";
  if (essayed.has(candidate.raw_item_id)) return "already_essayed";
  if (source.text_rights !== "full") return "text_rights";
  if (source.text_scope === "abstract") return "abstract_only";
  const extraction = (item.payload?.["extraction"] ?? null) as { ok?: unknown } | null;
  if (extraction && typeof extraction === "object" && "ok" in extraction && extraction.ok !== true) return "extraction_failed";
  if (bodyTextOf(item).length < config.min_source_chars) return "short_body";
  return null;
}

/**
 * Eligible candidates, best first: insight potential, then total, then raw item id (deterministic). When
 * `ineligible` is given, each rejected candidate's first failed rule (`essayIneligibility`) is counted into it.
 */
export function eligibleEssayCandidates(
  candidates: readonly CandidateInsert[],
  items: ReadonlyMap<string, RawItemInsert>,
  sources: ReadonlyMap<string, SourceConfig>,
  config: EssayConfig,
  essayed: ReadonlySet<string>,
  ineligible?: Record<string, number>,
): EssayCandidate[] {
  const out: EssayCandidate[] = [];
  for (const candidate of candidates) {
    const item = items.get(candidate.raw_item_id);
    const source = item ? sources.get(item.source_id) : undefined;
    const reason = essayIneligibility(candidate, item, source, config, essayed);
    if (reason !== null) {
      if (ineligible) ineligible[reason] = (ineligible[reason] ?? 0) + 1;
      continue;
    }
    out.push({ candidate, item: item!, source: source!, chars: bodyTextOf(item!).length });
  }
  return out.sort(
    (a, b) =>
      b.candidate.scores.insight_potential - a.candidate.scores.insight_potential ||
      b.candidate.total - a.candidate.total ||
      a.candidate.raw_item_id.localeCompare(b.candidate.raw_item_id),
  );
}

// ---------------------------------------------------------------------------
// history (the database)
// ---------------------------------------------------------------------------
export interface RecentEssay {
  title: string;
  headings: string[];
  published_at: string;
}

export interface EssayHistory {
  publishedToday: number;
  attemptsToday: number;
  /** Raw items an essay was ever drafted from (any prompt version, any outcome). */
  essayed: Set<string>;
  /** Newest first, at most `essay.recent_essays`. */
  recent: RecentEssay[];
}

/** Legacy columns keep their headings as short unpunctuated paragraphs of `article_body`; pipeline essays store `headings`. */
export function storedHeadings(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  if (Array.isArray(record["headings"])) return record["headings"].filter((h): h is string => typeof h === "string");
  const text = record["article_body"];
  if (typeof text !== "string") return [];
  const paragraphs = text.split(/\r?\n/u).map((p) => p.trim()).filter(Boolean);
  return paragraphs.filter((p, index) => index < paragraphs.length - 1 && p.length <= 90 && p.split(/\s+/u).length <= 12 && !/[.!?:;,"'”’)\]…]$/u.test(p));
}

export async function essayHistory(db: DbPort, now: Date, config: EssayConfig, essaysPerDay: number): Promise<EssayHistory> {
  const dayStart = kstDayStart(now).getTime();
  const isToday = (value: unknown): boolean => typeof value === "string" && Date.parse(value) >= dayStart;
  const publications = await db.select<Row>("publications", { content_type: ESSAY_CONTENT_TYPE, status: "published" }, {
    columns: ["slug", "title", "body", "published_at"],
    limit: Math.max(config.recent_essays, essaysPerDay + 1, 1),
    orderBy: { column: "published_at", ascending: false },
  });
  const drafts = await db.select<Row>("drafts", { content_type: ESSAY_CONTENT_TYPE }, { columns: ["body", "created_at"], limit: HISTORY_DRAFTS, orderBy: { column: "created_at", ascending: false } });
  const failures = await db.select<Row>("dead_letters", { stage: "generate", ref_table: "candidates" }, { columns: ["payload", "created_at"], limit: HISTORY_DEAD_LETTERS, orderBy: { column: "created_at", ascending: false } });
  const failedToday = failures.filter((row) => (row["payload"] as { content_type?: unknown } | null)?.content_type === ESSAY_CONTENT_TYPE && isToday(row["created_at"])).length;
  const essayed = new Set<string>();
  for (const row of drafts) {
    const source = (row["body"] as { source?: { raw_item_id?: unknown } } | null)?.source;
    if (typeof source?.raw_item_id === "string") essayed.add(source.raw_item_id);
  }
  return {
    publishedToday: publications.filter((row) => isToday(row["published_at"])).length,
    attemptsToday: drafts.filter((row) => isToday(row["created_at"])).length + failedToday,
    essayed,
    recent: publications.slice(0, config.recent_essays).map((row) => ({
      title: typeof row["title"] === "string" ? row["title"] : "",
      headings: storedHeadings(row["body"]),
      published_at: typeof row["published_at"] === "string" ? row["published_at"] : "",
    })),
  };
}

// ---------------------------------------------------------------------------
// the request and the reply
// ---------------------------------------------------------------------------
/** The user message: the source packet, then the recent essays whose titles, headings and openings must not be reused. */
export function essayUserMessage(packet: unknown, recent: readonly RecentEssay[]): string {
  const history = recent.length > 0 ? JSON.stringify(recent, null, 2) : "[] (no earlier essays)";
  return `Source packet:\n${JSON.stringify(packet, null, 2)}\n\nRecent essays of The Current, newest first (do not reuse their headings, their title shape or their opening device):\n${history}`;
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}

/** The model's reply as a validated essay draft; throws `SCHEMA_INVALID: …` with the zod issues. */
export function parseEssayDraft(response: LlmResponse): InsightEssayDraft {
  let raw: unknown = response.json;
  if (raw === undefined) {
    try {
      raw = JSON.parse(stripFences(response.text));
    } catch {
      throw new Error(`${ESSAY_SCHEMA_INVALID}: reply is not JSON (${response.text.length} chars, stop_reason ${response.stopReason})`);
    }
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as { tags?: unknown }).tags)) {
    const tags = [...new Set(((raw as { tags: unknown[] }).tags).filter((t): t is string => typeof t === "string").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, MAX_TAGS);
    raw = { ...(raw as object), tags };
  }
  const result = InsightEssayDraft.safeParse(raw);
  if (!result.success) throw new Error(`${ESSAY_SCHEMA_INVALID}: ${result.error.issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`).join("; ")}`);
  return result.data;
}
