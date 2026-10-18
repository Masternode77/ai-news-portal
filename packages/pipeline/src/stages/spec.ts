/**
 * A StageSpec binds a typed Stage to the PipelineState bag. `defineStageSpec`
 * erases the generics for the runner's ordered list. Runner contract: call
 * `parseInput` before `run` and `parseOutput` before `merge`/`counts`; those
 * two parses are the only schema walks, the other methods trust their input.
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
    run: (input, ctx) => stage.run(input as I, ctx),
    parseOutput: (output) => stage.output.parse(output),
    merge: (state, output) => spec.merge(state, output as O),
    counts: (output) => spec.counts(output as O),
    idempotencyKey: (input) => stage.idempotencyKey(input as I),
  };
}
