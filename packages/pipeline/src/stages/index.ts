import type { StageSpecAny } from "./spec.ts";
import { ingestSpec } from "./ingest.ts";
import { generateSpec, imageSpec, normalizeSpec, publishSpec, qaSpec, scoreSpec } from "./noop.ts";

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
export { generateStage, imageStage, normalizeStage, publishStage, qaStage, scoreStage } from "./noop.ts";
export * from "./types.ts";
