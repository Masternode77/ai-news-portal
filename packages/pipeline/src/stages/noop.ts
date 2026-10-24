/**
 * Phase 2 no-op stages (ingest moved to ingest.ts in 3a, normalize to
 * normalize.ts in 3b, score to score.ts in 3c, generate to generate.ts in 3d,
 * image to image.ts in 3f). Each one validates its input, logs that the real
 * implementation lands in a later Phase 3 module, and returns an empty (or
 * pass-through) output. QA fails closed: with no rules installed nothing
 * passes, so publish never receives a draft by accident.
 */
import type { Stage } from "@cc/shared";
import { defineStageSpec } from "./spec.ts";
import {
  PublishInput,
  PublishOutput,
  QaInput,
  QaOutput,
} from "./types.ts";

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

export const qaSpec = defineStageSpec({
  stage: qaStage,
  select: (state) => ({ drafts: state.drafts }),
  merge: (state, output) => ({ ...state, passed: output.passed, verdicts: output.verdicts }),
  counts: (output) => ({ qa_passed: output.passed.length, verdicts: output.verdicts.length }),
});

export const publishSpec = defineStageSpec({
  stage: publishStage,
  select: (state) => ({ withImages: state.withImages }),
  merge: (state, output) => ({ ...state, published: output.published }),
  counts: (output) => ({ published: output.published.length }),
});
