/**
 * The accumulator every stage reads from and writes to. Stages keep their own
 * typed input/output (contracts.md §1); `StageSpec.select`/`merge` map between
 * those and this bag so the runner stays generic.
 */
import { z } from "zod";
import {
  CandidateInsert,
  CandidateReasons,
  DraftInsert,
  ImageResult,
  NonNegativeInt,
  QaVerdict,
  RawItemInsert,
  RubricScores,
  SourceConfig,
  SourceTier,
} from "@cc/shared";

/** One source's outcome in a run (Phase 3a); mirrored into the log and the `--json` output, not into the funnel. */
export const SourceRunStat = z.strictObject({
  source_id: z.string(),
  tier: SourceTier,
  status: z.enum(["ok", "failed", "auto_disabled"]),
  /** Entries the feed listed before any rule applied. */
  listed: NonNegativeInt,
  /** Entries kept after url/date/title rules and the per-source cap. */
  kept: NonNegativeInt,
  /** Why listed entries were not kept, by reason (`too_old`, `capped`, `offhost`, ...). */
  skipped: z.record(z.string(), NonNegativeInt),
  ms: NonNegativeInt,
  error: z.string().nullable(),
  fail_streak: NonNegativeInt,
  sample: z.array(z.strictObject({ title: z.string(), url: z.string(), published_at: z.string().nullable() })).max(3),
  /** Final URL after redirects, bytes and redirect count of the feed request (live adapters only). */
  fetch: z.strictObject({ url: z.string(), bytes: NonNegativeInt, redirects: NonNegativeInt, ms: NonNegativeInt }).optional(),
});
export type SourceRunStat = z.infer<typeof SourceRunStat>;

export const SourceStats = z.strictObject({
  configured: NonNegativeInt,
  ok: NonNegativeInt,
  failed: NonNegativeInt,
  /** Items a source returned that failed RawItemInsert validation (dead-lettered individually). */
  invalid_items: NonNegativeInt,
  errors: z.array(z.strictObject({ source_id: z.string(), error: z.string() })),
  /** Enabled in YAML but switched off in the sources table after repeated failures. */
  auto_disabled: NonNegativeInt.default(0),
  /** Unique canonical URLs not present in raw_items before this run. */
  items_new: NonNegativeInt.default(0),
  /** Same canonical URL listed by more than one source (first source by tier wins). */
  duplicates: NonNegativeInt.default(0),
  /** Unique items dropped by caps.pool_max_items (lowest tiers first) before extraction and persistence. */
  pool_capped: NonNegativeInt.default(0),
  /** Listed entries dropped by adapter rules and the per-source cap. */
  skipped_items: NonNegativeInt.default(0),
  extract_ok: NonNegativeInt.default(0),
  extract_failed: NonNegativeInt.default(0),
  /** Items not eligible for extraction (no text rights, no adapter support, or extraction disabled). */
  extract_skipped: NonNegativeInt.default(0),
  sources: z.array(SourceRunStat).default([]),
});
export type SourceStats = z.infer<typeof SourceStats>;

/** One normalize rejection (Phase 3b); the first 100 are mirrored into the `--json` output. */
export const NormalizeDecision = z.strictObject({
  canonical_url: z.string(),
  source_id: z.string(),
  /** DUPLICATE_OF_PUBLISHED | DUPLICATE_IN_POOL */
  reason: z.string(),
  /** url | title | hash | title_key | body */
  method: z.string(),
  /** The publication slug or the canonical URL of the copy that was kept. */
  duplicate_of: z.string().nullable(),
  score: z.number().nullable(),
});
export type NormalizeDecision = z.infer<typeof NormalizeDecision>;

export const NormalizeStats = z.strictObject({
  pool: NonNegativeInt,
  candidates: NonNegativeInt,
  rejected: NonNegativeInt,
  duplicate_of_published: NonNegativeInt,
  duplicate_in_pool: NonNegativeInt,
  by_method: z.record(z.string(), NonNegativeInt),
  /** Publications loaded for the comparison, and how many fell inside the title window. */
  published_compared: NonNegativeInt,
  published_in_window: NonNegativeInt,
  decisions: z.array(NormalizeDecision).max(100),
  ms: NonNegativeInt,
});
export type NormalizeStats = z.infer<typeof NormalizeStats>;

export function emptyNormalizeStats(): NormalizeStats {
  return { pool: 0, candidates: 0, rejected: 0, duplicate_of_published: 0, duplicate_in_pool: 0, by_method: {}, published_compared: 0, published_in_window: 0, decisions: [], ms: 0 };
}

/** One scored candidate (Phase 3c); the top 100 by total are mirrored into the `--json` output. */
export const ScoreDecision = z.strictObject({
  canonical_url: z.string(),
  source_id: z.string(),
  total: z.number(),
  /** full | brief | null (below the brief threshold) */
  tier: z.enum(["full", "brief"]).nullable(),
  selected: z.boolean(),
  /** 1-based position among passing candidates; null when it did not pass. */
  rank: NonNegativeInt.nullable(),
  /** BELOW_THRESHOLD | NOT_SELECTED, with the detail after the colon */
  reject_reason: z.string().nullable(),
  scores: RubricScores,
  reasons: CandidateReasons,
});
export type ScoreDecision = z.infer<typeof ScoreDecision>;

export const ScoreStats = z.strictObject({
  candidates: NonNegativeInt,
  /** At or above thresholds.brief. */
  passed: NonNegativeInt,
  full: NonNegativeInt,
  brief: NonNegativeInt,
  below_threshold: NonNegativeInt,
  /** Of below_threshold: rejected by the relevance floor (thresholds.relevance_min) rather than by the total. */
  below_relevance: NonNegativeInt,
  selected: NonNegativeInt,
  /** Passed but beyond the cycle cap or the per-source cap. */
  not_selected: NonNegativeInt,
  insight_eligible: NonNegativeInt,
  /** caps.briefs_per_cycle.min minus selected, when positive (never filled from below the threshold). */
  shortfall: NonNegativeInt,
  decisions: z.array(ScoreDecision).max(100),
  ms: NonNegativeInt,
});
export type ScoreStats = z.infer<typeof ScoreStats>;

export function emptyScoreStats(): ScoreStats {
  return { candidates: 0, passed: 0, full: 0, brief: 0, below_threshold: 0, below_relevance: 0, selected: 0, not_selected: 0, insight_eligible: 0, shortfall: 0, decisions: [], ms: 0 };
}

/** One generation attempt (Phase 3d); the first 100 are mirrored into the `--json` output. */
export const GenerateDecision = z.strictObject({
  canonical_url: z.string(),
  source_id: z.string(),
  slug: z.string().nullable(),
  ok: z.boolean(),
  /** `<CODE>: <detail>` when the attempt failed (SCHEMA_INVALID, LLM_*, BUDGET_EXCEEDED). */
  error: z.string().nullable(),
  model: z.string().nullable(),
  cost_usd: z.number().nonnegative(),
  input_tokens: NonNegativeInt,
  output_tokens: NonNegativeInt,
  /** Numbers found in the draft and the subset missing from the source text. */
  grounding_numbers: NonNegativeInt,
  grounding_ungrounded: z.array(z.string()).max(20),
  /** Longest run of consecutive words the draft shares with the source (QA 3g caps it at 20). */
  quote_max_words: NonNegativeInt,
  /** Banned-phrase guard matches (`phrase:…`, `hook_start:…`, `pattern:…`), reported in 3d and blocking in QA 3g. */
  banned_matches: z.array(z.string()).max(20),
  title_ko: z.string().nullable(),
});
export type GenerateDecision = z.infer<typeof GenerateDecision>;

export const GenerateStats = z.strictObject({
  selected: NonNegativeInt,
  drafted: NonNegativeInt,
  failed: NonNegativeInt,
  /** Candidates not attempted because the run budget could not cover another call. */
  budget_stopped: NonNegativeInt,
  cost_usd: z.number().nonnegative(),
  input_tokens: NonNegativeInt,
  output_tokens: NonNegativeInt,
  grounding: z.strictObject({
    checked: NonNegativeInt,
    /** Drafts whose every number appears in their source. */
    passed: NonNegativeInt,
    numbers: NonNegativeInt,
    ungrounded: NonNegativeInt,
  }),
  /** passed / checked, null when nothing was checked. */
  grounding_pass_rate: z.number().min(0).max(1).nullable(),
  quote_max_words: NonNegativeInt,
  /** Banned-phrase guard (config/banned-phrases.yaml) over the drafted briefs. */
  banned: z.strictObject({
    checked: NonNegativeInt,
    /** Drafts with no match. */
    passed: NonNegativeInt,
    /** Distinct matches summed over the drafts. */
    matches: NonNegativeInt,
  }),
  decisions: z.array(GenerateDecision).max(100),
  ms: NonNegativeInt,
});
export type GenerateStats = z.infer<typeof GenerateStats>;

export function emptyGenerateStats(): GenerateStats {
  return { selected: 0, drafted: 0, failed: 0, budget_stopped: 0, cost_usd: 0, input_tokens: 0, output_tokens: 0, grounding: { checked: 0, passed: 0, numbers: 0, ungrounded: 0 }, grounding_pass_rate: null, quote_max_words: 0, banned: { checked: 0, passed: 0, matches: 0 }, decisions: [], ms: 0 };
}

/** One draft's image outcome (Phase 3f), kept in `--json` and the step summary. */
export const ImageAttemptRecord = z.strictObject({
  provider: z.string(),
  ok: z.boolean(),
  code: z.string().nullable(),
  error: z.string().nullable(),
  ms: NonNegativeInt,
});
export const ImageDecision = z.strictObject({
  slug: z.string(),
  provider: z.string(),
  placeholder: z.boolean(),
  path: z.string(),
  cost_usd: z.number().nonnegative(),
  attempts: z.array(ImageAttemptRecord),
});
export type ImageDecision = z.infer<typeof ImageDecision>;

export const ImageStats = z.strictObject({
  passed: NonNegativeInt,
  with_images: NonNegativeInt,
  /** Images a real provider produced. */
  generated: NonNegativeInt,
  placeholders: NonNegativeInt,
  /** Provider attempts that failed (a draft can have several). */
  failed_attempts: NonNegativeInt,
  /** Drafts whose paid provider was skipped because the run budget could not cover another image. */
  budget_stopped: NonNegativeInt,
  /** IMAGE_MISSING soft verdicts written (a real provider was configured but the draft got a placeholder). */
  image_missing: NonNegativeInt,
  cost_usd: z.number().nonnegative(),
  decisions: z.array(ImageDecision).max(100),
  ms: NonNegativeInt,
});
export type ImageStats = z.infer<typeof ImageStats>;

export function emptyImageStats(): ImageStats {
  return { passed: 0, with_images: 0, generated: 0, placeholders: 0, failed_attempts: 0, budget_stopped: 0, image_missing: 0, cost_usd: 0, decisions: [], ms: 0 };
}

export const DraftWithImage = z.strictObject({
  draft: DraftInsert,
  image: ImageResult.nullable(),
});
export type DraftWithImage = z.infer<typeof DraftWithImage>;

export const PublishedRef = z.strictObject({ slug: z.string(), url: z.string() });
export type PublishedRef = z.infer<typeof PublishedRef>;

export const PipelineState = z.strictObject({
  sources: z.array(SourceConfig),
  sourceStats: SourceStats,
  rawItems: z.array(RawItemInsert),
  itemsNew: NonNegativeInt,
  normalizeStats: NormalizeStats,
  candidates: z.array(CandidateInsert),
  scoreStats: ScoreStats,
  selected: z.array(CandidateInsert),
  generateStats: GenerateStats,
  drafts: z.array(DraftInsert),
  verdicts: z.array(QaVerdict),
  passed: z.array(DraftInsert),
  imageStats: ImageStats,
  withImages: z.array(DraftWithImage),
  published: z.array(PublishedRef),
});
export type PipelineState = z.infer<typeof PipelineState>;

export function emptySourceStats(): SourceStats {
  return {
    configured: 0,
    ok: 0,
    failed: 0,
    invalid_items: 0,
    errors: [],
    auto_disabled: 0,
    items_new: 0,
    duplicates: 0,
    pool_capped: 0,
    skipped_items: 0,
    extract_ok: 0,
    extract_failed: 0,
    extract_skipped: 0,
    sources: [],
  };
}

export function initialState(sources: SourceConfig[]): PipelineState {
  return {
    sources,
    sourceStats: emptySourceStats(),
    rawItems: [],
    itemsNew: 0,
    normalizeStats: emptyNormalizeStats(),
    candidates: [],
    scoreStats: emptyScoreStats(),
    selected: [],
    generateStats: emptyGenerateStats(),
    drafts: [],
    verdicts: [],
    passed: [],
    imageStats: emptyImageStats(),
    withImages: [],
    published: [],
  };
}
