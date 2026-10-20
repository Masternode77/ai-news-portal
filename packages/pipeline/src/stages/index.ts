import type { StageSpecAny } from "./spec.ts";
import { ingestSpec } from "./ingest.ts";
import { normalizeSpec } from "./normalize.ts";
import { generateSpec, imageSpec, publishSpec, qaSpec, scoreSpec } from "./noop.ts";

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
export { generateStage, imageStage, publishStage, qaStage, scoreStage } from "./noop.ts";
export * from "./types.ts";
