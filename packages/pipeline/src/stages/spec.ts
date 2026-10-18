/**
 * A StageSpec binds a typed Stage to the PipelineState bag. `defineStageSpec`
 * erases the generics for the runner's ordered list while keeping every call
 * type-safe: the output is re-parsed with the stage's own schema before merge.
 */
import type { Stage, StageContext, StageName } from "@cc/shared";
import type { PipelineState } from "../state.ts";

export interface StageSpec<I, O> {
  stage: Stage<I, O>;
  select(state: PipelineState): I;
  merge(state: PipelineState, output: O): PipelineState;
  counts(output: O): Record<string, number>;
}

export interface StageSpecAny {
  readonly name: StageName;
  select(state: PipelineState): unknown;
  parseInput(input: unknown): unknown;
  run(input: unknown, ctx: StageContext): Promise<unknown>;
  parseOutput(output: unknown): unknown;
  merge(state: PipelineState, output: unknown): PipelineState;
  counts(output: unknown): Record<string, number>;
  idempotencyKey(input: unknown): string;
}

export function defineStageSpec<I, O>(spec: StageSpec<I, O>): StageSpecAny {
  const { stage } = spec;
  return {
    name: stage.name,
    select: (state) => spec.select(state),
    parseInput: (input) => stage.input.parse(input),
    run: (input, ctx) => stage.run(stage.input.parse(input), ctx),
    parseOutput: (output) => stage.output.parse(output),
    merge: (state, output) => spec.merge(state, stage.output.parse(output)),
    counts: (output) => spec.counts(stage.output.parse(output)),
    idempotencyKey: (input) => stage.idempotencyKey(stage.input.parse(input)),
  };
}
