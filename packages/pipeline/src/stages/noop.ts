/**
 * Phase 2 no-op stages (ingest moved to ingest.ts in 3a, normalize to
 * normalize.ts in 3b). Each one validates its input, logs that the real
 * implementation lands in a later Phase 3 module, and returns an empty (or
 * pass-through) output. QA fails closed: with no rules installed nothing
 * passes, so publish never receives a draft by accident.
 */
import type { Stage } from "@cc/shared";
import { BudgetExceededError } from "../budget.ts";
import { defineStageSpec } from "./spec.ts";
import {
  GenerateInput,
  GenerateOutput,
  ImageInput,
  ImageOutput,
  PublishInput,
  PublishOutput,
  QaInput,
  QaOutput,
  ScoreInput,
  ScoreOutput,
} from "./types.ts";

export const scoreStage: Stage<ScoreInput, ScoreOutput> = {
  name: "score",
  input: ScoreInput,
  output: ScoreOutput,
  idempotencyKey: (input) => `score:${input.candidates.length}`,
  async run(input, ctx) {
    ctx.logger.info("score: no-op (Phase 3c)", { candidates: input.candidates.length });
    return { selected: [], rejected: 0 };
  },
};

export const generateStage: Stage<GenerateInput, GenerateOutput> = {
  name: "generate",
  input: GenerateInput,
  output: GenerateOutput,
  idempotencyKey: (input) => `generate:${input.selected.length}`,
  async run(input, ctx) {
    if (!ctx.budget.canSpend(0)) throw new BudgetExceededError(ctx.budget.spentUsd, ctx.budget.limitUsd);
    ctx.logger.info("generate: no-op (Phase 3d/3e)", { selected: input.selected.length, budgetUsd: ctx.budget.spentUsd });
    return { drafts: [] };
  },
};

export const qaStage: Stage<QaInput, QaOutput> = {
  name: "qa",
  input: QaInput,
  output: QaOutput,
  idempotencyKey: (input) => `qa:${input.drafts.length}`,
  async run(input, ctx) {
    ctx.logger.info("qa: no rules installed, failing closed (Phase 3g)", { drafts: input.drafts.length });
    return { passed: [], verdicts: [] };
  },
};

export const imageStage: Stage<ImageInput, ImageOutput> = {
  name: "image",
  input: ImageInput,
  output: ImageOutput,
  idempotencyKey: (input) => `image:${input.passed.length}`,
  async run(input, ctx) {
    const withImages = [];
    for (const draft of input.passed) {
      const slug = typeof draft.body["slug"] === "string" ? draft.body["slug"] : "unknown";
      const image = await ctx.adapters.image.generate({ prompt: "", alt: "", slug }, ctx);
      withImages.push({ draft, image });
    }
    ctx.logger.info("image: placeholder only (Phase 3f)", { count: withImages.length });
    return { withImages };
  },
};

export const publishStage: Stage<PublishInput, PublishOutput> = {
  name: "publish",
  input: PublishInput,
  output: PublishOutput,
  idempotencyKey: (input) => `publish:${input.withImages.length}`,
  async run(input, ctx) {
    const target = ctx.config.flags.publish_target;
    if (target === "none" || input.withImages.length === 0) {
      ctx.logger.info("publish: nothing to publish", { publish_target: target, candidates: input.withImages.length });
      return { published: [] };
    }
    const publisher = ctx.adapters.publishers["site"];
    if (!publisher) throw new Error("NO_PUBLISHER: site publisher not registered");
    const published = [];
    for (const { draft } of input.withImages) {
      const slug = typeof draft.body["slug"] === "string" ? draft.body["slug"] : null;
      if (!slug) throw new Error("publish: draft body has no slug");
      const result = await publisher.publish(
        {
          draft_id: null,
          slug,
          content_type: draft.content_type,
          title: typeof draft.body["title_ko"] === "string" ? draft.body["title_ko"] : slug,
          body: draft.body,
          sources: [],
          published_at: ctx.now.toISOString(),
          publisher: "pipeline",
          status: "published",
        },
        ctx,
      );
      published.push(result);
    }
    return { published };
  },
};

export const scoreSpec = defineStageSpec({
  stage: scoreStage,
  select: (state) => ({ candidates: state.candidates }),
  merge: (state, output) => ({ ...state, selected: output.selected }),
  counts: (output) => ({ passed_gate: output.selected.length, rejected: output.rejected }),
});

export const generateSpec = defineStageSpec({
  stage: generateStage,
  select: (state) => ({ selected: state.selected }),
  merge: (state, output) => ({ ...state, drafts: output.drafts }),
  counts: (output) => ({ drafts: output.drafts.length }),
});

export const qaSpec = defineStageSpec({
  stage: qaStage,
  select: (state) => ({ drafts: state.drafts }),
  merge: (state, output) => ({ ...state, passed: output.passed, verdicts: output.verdicts }),
  counts: (output) => ({ qa_passed: output.passed.length, verdicts: output.verdicts.length }),
});

export const imageSpec = defineStageSpec({
  stage: imageStage,
  select: (state) => ({ passed: state.passed }),
  merge: (state, output) => ({ ...state, withImages: output.withImages }),
  counts: (output) => ({ with_images: output.withImages.length, placeholders: output.withImages.filter((d) => d.image?.placeholder).length }),
});

export const publishSpec = defineStageSpec({
  stage: publishStage,
  select: (state) => ({ withImages: state.withImages }),
  merge: (state, output) => ({ ...state, published: output.published }),
  counts: (output) => ({ published: output.published.length }),
});
