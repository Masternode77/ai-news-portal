import type { StageSpecAny } from "./spec.ts";
import { ingestSpec } from "./ingest.ts";
import { normalizeSpec } from "./normalize.ts";
import { scoreSpec } from "./score.ts";
import { generateSpec } from "./generate.ts";
import { imageSpec } from "./image.ts";
import { publishSpec, qaSpec } from "./noop.ts";

/** Execution order (target.md §1). */
export const DEFAULT_STAGE_SPECS: readonly StageSpecAny[] = [
  ingestSpec,
  normalizeSpec,
  scoreSpec,
  generateSpec,
  qaSpec,
  imageSpec,
  publishSpec,
];

export { defineStageSpec } from "./spec.ts";
export type { StageSpec, StageSpecAny } from "./spec.ts";
export { ingestStage } from "./ingest.ts";
export { normalizeStage } from "./normalize.ts";
export { scoreStage } from "./score.ts";
export { generateStage } from "./generate.ts";
export { publishStage, qaStage } from "./noop.ts";
export { IMAGE_MISSING, imageAlt, imageMissingVerdict, imagePrompt, imageRequestFor, imageStage } from "./image.ts";
export * from "./types.ts";
