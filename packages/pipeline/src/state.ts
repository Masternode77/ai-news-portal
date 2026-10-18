/**
 * The accumulator every stage reads from and writes to. Stages keep their own
 * typed input/output (contracts.md §1); `StageSpec.select`/`merge` map between
 * those and this bag so the runner stays generic.
 */
import { z } from "zod";
import {
  CandidateInsert,
  DraftInsert,
  ImageResult,
  NonNegativeInt,
  QaVerdict,
  RawItemInsert,
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
  /** Listed entries dropped by adapter rules and the per-source cap. */
  skipped_items: NonNegativeInt.default(0),
  extract_ok: NonNegativeInt.default(0),
  extract_failed: NonNegativeInt.default(0),
  /** Items not eligible for extraction (no text rights, no adapter support, or extraction disabled). */
  extract_skipped: NonNegativeInt.default(0),
  sources: z.array(SourceRunStat).default([]),
});
export type SourceStats = z.infer<typeof SourceStats>;

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
  candidates: z.array(CandidateInsert),
  selected: z.array(CandidateInsert),
  drafts: z.array(DraftInsert),
  verdicts: z.array(QaVerdict),
  passed: z.array(DraftInsert),
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
    candidates: [],
    selected: [],
    drafts: [],
    verdicts: [],
    passed: [],
    withImages: [],
    published: [],
  };
}
