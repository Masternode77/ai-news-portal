/** Per-stage input/output schemas. Each stage parses both (P2). */
import { z } from "zod";
import { CandidateInsert, DraftInsert, NonNegativeInt, QaVerdict, RawItemInsert, SourceConfig } from "@cc/shared";
import { DraftWithImage, PublishedRef, SourceStats } from "../state.ts";

export const IngestInput = z.strictObject({ sources: z.array(SourceConfig) });
export type IngestInput = z.infer<typeof IngestInput>;
export const IngestOutput = z.strictObject({ rawItems: z.array(RawItemInsert), stats: SourceStats });
export type IngestOutput = z.infer<typeof IngestOutput>;

export const NormalizeInput = z.strictObject({ rawItems: z.array(RawItemInsert) });
export type NormalizeInput = z.infer<typeof NormalizeInput>;
export const NormalizeOutput = z.strictObject({
  candidates: z.array(CandidateInsert),
  itemsNew: NonNegativeInt,
  duplicates: NonNegativeInt,
});
export type NormalizeOutput = z.infer<typeof NormalizeOutput>;

export const ScoreInput = z.strictObject({ candidates: z.array(CandidateInsert) });
export type ScoreInput = z.infer<typeof ScoreInput>;
export const ScoreOutput = z.strictObject({ selected: z.array(CandidateInsert), rejected: NonNegativeInt });
export type ScoreOutput = z.infer<typeof ScoreOutput>;

export const GenerateInput = z.strictObject({ selected: z.array(CandidateInsert) });
export type GenerateInput = z.infer<typeof GenerateInput>;
export const GenerateOutput = z.strictObject({ drafts: z.array(DraftInsert) });
export type GenerateOutput = z.infer<typeof GenerateOutput>;

export const QaInput = z.strictObject({ drafts: z.array(DraftInsert) });
export type QaInput = z.infer<typeof QaInput>;
export const QaOutput = z.strictObject({ passed: z.array(DraftInsert), verdicts: z.array(QaVerdict) });
export type QaOutput = z.infer<typeof QaOutput>;

export const ImageInput = z.strictObject({ passed: z.array(DraftInsert) });
export type ImageInput = z.infer<typeof ImageInput>;
export const ImageOutput = z.strictObject({ withImages: z.array(DraftWithImage) });
export type ImageOutput = z.infer<typeof ImageOutput>;

export const PublishInput = z.strictObject({ withImages: z.array(DraftWithImage) });
export type PublishInput = z.infer<typeof PublishInput>;
export const PublishOutput = z.strictObject({ published: z.array(PublishedRef) });
export type PublishOutput = z.infer<typeof PublishOutput>;
