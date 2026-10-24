/** Per-stage input/output schemas. Each stage parses both (P2). */
import { z } from "zod";
import { CandidateInsert, DraftInsert, NonNegativeInt, QaVerdict, RawItemInsert, SourceConfig } from "@cc/shared";
import { DraftWithImage, GenerateStats, ImageStats, NormalizeStats, PublishedRef, ScoreStats, SourceStats } from "../state.ts";

export const IngestInput = z.strictObject({ sources: z.array(SourceConfig) });
export type IngestInput = z.infer<typeof IngestInput>;
export const IngestOutput = z.strictObject({ rawItems: z.array(RawItemInsert), stats: SourceStats });
export type IngestOutput = z.infer<typeof IngestOutput>;

/** Sources are passed so normalize can prefer the copy with the best text rights and tier (Phase 3b). */
export const NormalizeInput = z.strictObject({ rawItems: z.array(RawItemInsert), sources: z.array(SourceConfig) });
export type NormalizeInput = z.infer<typeof NormalizeInput>;
/**
 * Candidates leaving normalize are unscored: `scores` are zero, `selected` is
 * false and `rubric_version` is normalize's own; score (3c) writes the scored
 * rows. Rejections are already in the `candidates` table with a reject_reason.
 */
export const NormalizeOutput = z.strictObject({
  candidates: z.array(CandidateInsert),
  stats: NormalizeStats,
});
export type NormalizeOutput = z.infer<typeof NormalizeOutput>;

/** Phase 3c: the raw items and sources ride along so the rubric can read title, body, date, tier and rights. */
export const ScoreInput = z.strictObject({ candidates: z.array(CandidateInsert), rawItems: z.array(RawItemInsert), sources: z.array(SourceConfig) });
export type ScoreInput = z.infer<typeof ScoreInput>;
/** `candidates` are the scored rows for every input candidate; `selected` is the subset chosen for this cycle. */
export const ScoreOutput = z.strictObject({ candidates: z.array(CandidateInsert), selected: z.array(CandidateInsert), stats: ScoreStats });
export type ScoreOutput = z.infer<typeof ScoreOutput>;

/** Phase 3d: raw items and sources ride along so the stage can build the source packet (title, body, date, rights). */
export const GenerateInput = z.strictObject({ selected: z.array(CandidateInsert), rawItems: z.array(RawItemInsert), sources: z.array(SourceConfig) });
export type GenerateInput = z.infer<typeof GenerateInput>;
export const GenerateOutput = z.strictObject({ drafts: z.array(DraftInsert), stats: GenerateStats });
export type GenerateOutput = z.infer<typeof GenerateOutput>;

export const QaInput = z.strictObject({ drafts: z.array(DraftInsert) });
export type QaInput = z.infer<typeof QaInput>;
export const QaOutput = z.strictObject({ passed: z.array(DraftInsert), verdicts: z.array(QaVerdict) });
export type QaOutput = z.infer<typeof QaOutput>;

export const ImageInput = z.strictObject({ passed: z.array(DraftInsert) });
export type ImageInput = z.infer<typeof ImageInput>;
/** Phase 3f: the stage appends IMAGE_MISSING soft verdicts (ADR-004) when a configured provider failed and the placeholder stood in. */
export const ImageOutput = z.strictObject({ withImages: z.array(DraftWithImage), verdicts: z.array(QaVerdict), stats: ImageStats });
export type ImageOutput = z.infer<typeof ImageOutput>;

export const PublishInput = z.strictObject({ withImages: z.array(DraftWithImage) });
export type PublishInput = z.infer<typeof PublishInput>;
export const PublishOutput = z.strictObject({ published: z.array(PublishedRef) });
export type PublishOutput = z.infer<typeof PublishOutput>;
