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
} from "@cc/shared";

export const SourceStats = z.strictObject({
  configured: NonNegativeInt,
  ok: NonNegativeInt,
  failed: NonNegativeInt,
  errors: z.array(z.strictObject({ source_id: z.string(), error: z.string() })),
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

export function initialState(sources: SourceConfig[]): PipelineState {
  return {
    sources,
    sourceStats: { configured: 0, ok: 0, failed: 0, errors: [] },
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
