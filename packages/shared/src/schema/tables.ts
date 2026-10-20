/**
 * Table row/insert schemas for the Supabase model in ADR-003.
 *
 * Every schema is strict: an unknown key is an error. Selects therefore name
 * their columns explicitly (see `PUBLICATION_COLUMNS`) instead of `*`.
 */
import { z } from "zod";

export const Uuid = z.uuid();
/** Only http(s) URLs are accepted anywhere a URL is stored or rendered: a `javascript:` or `data:` URL would otherwise reach `<a href>` / `<img src>`. */
export const HttpUrl = z.url({ protocol: /^https?$/ });
/** Image locations: a site-relative path or an https URL. */
export const ImagePath = z.string().regex(/^(\/[^\s"'<>]+|https:\/\/[^\s"'<>]+)$/, "site-relative path or https URL");
export const IsoDateTime = z.iso.datetime({ offset: true });
export const IsoDate = z.iso.date();
export const JsonRecord = z.record(z.string(), z.unknown());
export const NonNegativeInt = z.number().int().nonnegative();
export const UnitInterval = z.number().min(0).max(1);

export const STAGE_NAMES = [
  "ingest",
  "normalize",
  "score",
  "generate",
  "qa",
  "image",
  "publish",
] as const;
export const StageName = z.enum(STAGE_NAMES);
export type StageName = z.infer<typeof StageName>;

export const TABLE_NAMES = [
  "sources",
  "raw_items",
  "candidates",
  "drafts",
  "qa_results",
  "publications",
  "pipeline_runs",
  "stage_events",
  "dead_letters",
  "redirects",
] as const;
export const TableName = z.enum(TABLE_NAMES);
export type TableName = z.infer<typeof TableName>;

export const SourceType = z.enum(["rss", "html", "api"]);
export type SourceType = z.infer<typeof SourceType>;
export const TextRights = z.enum(["full", "rewrite_only", "link_only"]);
export type TextRights = z.infer<typeof TextRights>;
export const SourceTier = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type SourceTier = z.infer<typeof SourceTier>;
export const ContentType = z.enum(["news_brief", "insight_essay", "legacy_analysis"]);
export type ContentType = z.infer<typeof ContentType>;
export const RunStatus = z.enum(["started", "partial", "done", "failed", "budget_stop"]);
export type RunStatus = z.infer<typeof RunStatus>;
export const RunTrigger = z.enum(["schedule", "dispatch", "local"]);
export type RunTrigger = z.infer<typeof RunTrigger>;
export const StageStatus = z.enum(["started", "done", "skipped", "error"]);
export type StageStatus = z.infer<typeof StageStatus>;
export const Severity = z.enum(["hard", "soft"]);
export type Severity = z.infer<typeof Severity>;
export const PublicationStatus = z.enum(["published", "unpublished", "quarantined"]);
export type PublicationStatus = z.infer<typeof PublicationStatus>;
export const ReviewStatus = z.enum(["none", "pending", "approved", "rejected"]);
export type ReviewStatus = z.infer<typeof ReviewStatus>;
export const RedirectStatus = z.union([z.literal(301), z.literal(410)]);
export type RedirectStatus = z.infer<typeof RedirectStatus>;

// ---------------------------------------------------------------------------
// sources
// ---------------------------------------------------------------------------
export const SourceRow = z.strictObject({
  id: z.string().min(1).max(64),
  name: z.string().min(1),
  type: SourceType,
  url: HttpUrl,
  tier: SourceTier,
  enabled: z.boolean(),
  text_rights: TextRights,
  terms_url: HttpUrl.nullable(),
  reviewed_at: IsoDate.nullable(),
  last_ok_at: IsoDateTime.nullable(),
  fail_streak: NonNegativeInt,
  health: JsonRecord,
});
export type SourceRow = z.infer<typeof SourceRow>;
export const SourceRowInsert = SourceRow.partial({ terms_url: true, reviewed_at: true, last_ok_at: true, fail_streak: true, health: true });
export type SourceRowInsert = z.infer<typeof SourceRowInsert>;

/** One run outcome for a source: when it ran and whether the fetch succeeded. */
export const SourceOutcome = z.strictObject({ at: IsoDateTime, ok: z.boolean() });
export type SourceOutcome = z.infer<typeof SourceOutcome>;

/**
 * Typed view of `sources.health` (jsonb). `recent` holds the last outcomes with
 * their run time, newest last, so `success_rate_7d` is computed over the runs
 * that actually happened in the preceding seven days (missed slots and extra
 * dispatch runs do not stretch or shrink the window).
 */
export const SourceHealth = z.strictObject({
  success_rate_7d: UnitInterval.nullable(),
  last_error: z.string().nullable(),
  last_error_at: IsoDateTime.nullable(),
  items_last_run: NonNegativeInt,
  auto_disabled_at: IsoDateTime.nullable(),
  /** Every outcome inside the seven-day window, newest last; the cap only bounds the row. */
  recent: z.array(SourceOutcome).max(500),
});
export type SourceHealth = z.infer<typeof SourceHealth>;
export const EMPTY_SOURCE_HEALTH: SourceHealth = { success_rate_7d: null, last_error: null, last_error_at: null, items_last_run: 0, auto_disabled_at: null, recent: [] };

// ---------------------------------------------------------------------------
// raw_items — idempotency: unique(canonical_url)
// ---------------------------------------------------------------------------
export const RawItemRow = z.strictObject({
  id: Uuid,
  source_id: z.string().min(1),
  canonical_url: HttpUrl,
  content_hash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  title: z.string().min(1),
  published_at_source: IsoDateTime.nullable(),
  fetched_at: IsoDateTime,
  payload: JsonRecord,
  run_id: Uuid.nullable(),
});
export type RawItemRow = z.infer<typeof RawItemRow>;
/** `id` is optional on the way in (adapters omit it); ingest stamps `rawItemId(canonical_url)` before the upsert (Phase 3b). */
export const RawItemInsert = RawItemRow.partial({
  id: true,
  content_hash: true,
  published_at_source: true,
  payload: true,
  run_id: true,
});
export type RawItemInsert = z.infer<typeof RawItemInsert>;

// ---------------------------------------------------------------------------
// candidates — idempotency: unique(raw_item_id, rubric_version)
// ---------------------------------------------------------------------------
export const RubricScores = z.strictObject({
  relevance: UnitInterval,
  timeliness: UnitInterval,
  impact: UnitInterval,
  reader_value: UnitInterval,
  insight_potential: UnitInterval,
});
export type RubricScores = z.infer<typeof RubricScores>;

export const CandidateRow = z.strictObject({
  id: Uuid,
  raw_item_id: Uuid,
  run_id: Uuid,
  rubric_version: z.string().min(1),
  scores: RubricScores,
  total: UnitInterval,
  selected: z.boolean(),
  reject_reason: z.string().nullable(),
  created_at: IsoDateTime,
});
export type CandidateRow = z.infer<typeof CandidateRow>;
export const CandidateInsert = CandidateRow.omit({ id: true, created_at: true });
export type CandidateInsert = z.infer<typeof CandidateInsert>;

// ---------------------------------------------------------------------------
// drafts — idempotency: unique(candidate_id, content_type, prompt_version)
// ---------------------------------------------------------------------------
export const DraftRow = z.strictObject({
  id: Uuid,
  candidate_id: Uuid,
  run_id: Uuid,
  content_type: ContentType,
  prompt_version: z.string().min(1),
  model: z.string().min(1),
  body: JsonRecord,
  input_tokens: NonNegativeInt,
  output_tokens: NonNegativeInt,
  cost_usd: z.number().nonnegative(),
  review_status: ReviewStatus,
  created_at: IsoDateTime,
});
export type DraftRow = z.infer<typeof DraftRow>;
export const DraftInsert = DraftRow.omit({ id: true, created_at: true }).partial({ review_status: true });
export type DraftInsert = z.infer<typeof DraftInsert>;

// ---------------------------------------------------------------------------
// qa_results — idempotency: unique(draft_id, rule, checked_at)
// ---------------------------------------------------------------------------
export const QaResultRow = z.strictObject({
  id: Uuid,
  draft_id: Uuid,
  rule: z.string().min(1),
  severity: Severity,
  pass: z.boolean(),
  reason_code: z.string().min(1),
  evidence: JsonRecord,
  checked_at: IsoDateTime,
});
export type QaResultRow = z.infer<typeof QaResultRow>;
export const QaResultInsert = QaResultRow.omit({ id: true });
export type QaResultInsert = z.infer<typeof QaResultInsert>;

// ---------------------------------------------------------------------------
// publications — idempotency: unique(slug)
// ---------------------------------------------------------------------------
export const ImageProvenance = z.strictObject({
  provider: z.string().min(1),
  model: z.string().optional(),
  prompt: z.string(),
  generatedAt: IsoDateTime,
});
export type ImageProvenance = z.infer<typeof ImageProvenance>;

export const ImageResult = z.strictObject({
  path: ImagePath,
  alt: z.string(),
  provenance: ImageProvenance,
  placeholder: z.boolean(),
  costUsd: z.number().nonnegative(),
});
export type ImageResult = z.infer<typeof ImageResult>;

export const PublicationSource = z.strictObject({
  url: HttpUrl,
  name: z.string().min(1),
  published_at: IsoDateTime.nullable(),
  /** The source's own headline (Phase 3b): normalize compares new items against it, since `publications.title` is the Korean editorial title. */
  title: z.string().min(1).optional(),
});
export type PublicationSource = z.infer<typeof PublicationSource>;

/** Legacy paths are preserved verbatim: `news/<id>` and `column/<slug>` (ADR-005). */
export const PublicationSlug = z
  .string()
  .regex(/^(news|column)\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/, "slug must be news/<id> or column/<slug>");

export const PublicationRow = z.strictObject({
  id: Uuid,
  draft_id: Uuid.nullable(),
  slug: PublicationSlug,
  content_type: ContentType,
  title: z.string().min(1),
  body: JsonRecord,
  image: ImageResult.nullable(),
  sources: z.array(PublicationSource),
  published_at: IsoDateTime,
  updated_at: IsoDateTime,
  publisher: z.string().min(1),
  status: PublicationStatus,
  legacy_id: z.string().nullable(),
  noindex: z.boolean(),
  tags: z.array(z.string()),
  category: z.string().nullable(),
  region: z.string().nullable(),
});
export type PublicationRow = z.infer<typeof PublicationRow>;
export const PublicationInsert = PublicationRow.omit({ id: true, updated_at: true }).partial({
  draft_id: true,
  image: true,
  legacy_id: true,
  noindex: true,
  tags: true,
  category: true,
  region: true,
});
export type PublicationInsert = z.infer<typeof PublicationInsert>;
/** Column list for explicit selects; `search` (tsvector) is intentionally excluded. */
export const PUBLICATION_COLUMNS = Object.keys(PublicationRow.shape) as (keyof PublicationRow)[];

// ---------------------------------------------------------------------------
// pipeline_runs / stage_events / dead_letters (ADR-007)
// ---------------------------------------------------------------------------
/** The 13 funnel columns, identical to `scripts/diagnose/funnel.mjs` so Phase 0 and the rebuild compare directly. */
export const Funnel = z.strictObject({
  run_id: Uuid,
  started_at: IsoDateTime,
  sources_configured: NonNegativeInt,
  sources_ok: NonNegativeInt,
  sources_failed: NonNegativeInt,
  items_fetched: NonNegativeInt,
  items_new: NonNegativeInt,
  items_scored: NonNegativeInt,
  passed_gate: NonNegativeInt,
  drafts: NonNegativeInt,
  qa_passed: NonNegativeInt,
  published: NonNegativeInt,
  top_error: z.string().nullable(),
});
export type Funnel = z.infer<typeof Funnel>;
export const FUNNEL_COLUMNS = Object.keys(Funnel.shape) as (keyof Funnel)[];

export const PipelineRunRow = z.strictObject({
  id: Uuid,
  started_at: IsoDateTime,
  ended_at: IsoDateTime.nullable(),
  status: RunStatus,
  trigger: RunTrigger,
  funnel: Funnel.nullable(),
  cost_total_usd: z.number().nonnegative(),
  error: z.string().nullable(),
  git_sha: z.string().nullable(),
  flags: JsonRecord.nullable(),
});
export type PipelineRunRow = z.infer<typeof PipelineRunRow>;

export const StageEventRow = z.strictObject({
  id: z.number().int().positive(),
  run_id: Uuid,
  stage: StageName,
  status: StageStatus,
  started_at: IsoDateTime,
  ended_at: IsoDateTime.nullable(),
  counts: JsonRecord,
  error: z.string().nullable(),
});
export type StageEventRow = z.infer<typeof StageEventRow>;

export const DeadLetterRow = z.strictObject({
  id: Uuid,
  run_id: Uuid,
  stage: StageName,
  ref_table: TableName,
  ref_id: z.string().min(1),
  payload: JsonRecord,
  error: z.string().min(1),
  retry_count: NonNegativeInt,
  created_at: IsoDateTime,
});
export type DeadLetterRow = z.infer<typeof DeadLetterRow>;
export const DeadLetterInsert = DeadLetterRow.omit({ id: true, created_at: true }).partial({ retry_count: true });
export type DeadLetterInsert = z.infer<typeof DeadLetterInsert>;

// ---------------------------------------------------------------------------
// redirects
// ---------------------------------------------------------------------------
export const RedirectRow = z.strictObject({
  from_path: z.string().startsWith("/"),
  to_path: z.string().startsWith("/"),
  status: RedirectStatus,
});
export type RedirectRow = z.infer<typeof RedirectRow>;
