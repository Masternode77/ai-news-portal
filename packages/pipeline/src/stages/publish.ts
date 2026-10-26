/**
 * publish — Phase 3h (ADR-005). Every draft that left QA and image becomes one
 * `publications` row through the site publisher; nothing here touches the site
 * build. What runs depends on `flags.publish_target`:
 *
 *   none        nothing is written; every candidate is reported as `dry` (the
 *               "would publish" list of the Phase 3 completion criterion)
 *   staging     rows go to the run's DB (memory in --dry-run, the staging
 *               schema in Phase 4) and the preview is revalidated when enabled
 *   production  the same against production (Phase 5 cutover only)
 *
 * One failed publication is a dead letter (P5), not a failed run; redirects
 * are synced before the first row; revalidation is reported, never fatal.
 */
import { NewsBrief, draftId, rawItemId } from "@cc/shared";
import type { DraftInsert, PublicationInsert, PublishResult, RawItemInsert, Stage, StageContext } from "@cc/shared";
import { PublishError } from "../adapters/publisher/site.ts";
import type { PublishDecision, PublishStats } from "../state.ts";
import { defineStageSpec } from "./spec.ts";
import { PublishInput, PublishOutput } from "./types.ts";
import type { DraftWithImage, PublishedRef } from "../state.ts";

export const NO_PUBLISHER = "NO_PUBLISHER";
export const PUBLISH_INPUT_INVALID = "PUBLISH_INPUT_INVALID";
const DECISION_SAMPLE = 100;

export function draftRowId(draft: DraftInsert): string {
  return draft.id ?? draftId(draft.candidate_id, draft.content_type, draft.prompt_version);
}

/** The publications row for a news_brief draft: the brief's reader fields are the body, the source becomes the sources list, the stage owns the rest. */
export function publicationFromDraft(entry: DraftWithImage, rawItem: RawItemInsert | undefined, ctx: StageContext): PublicationInsert {
  const { draft, image } = entry;
  if (draft.content_type !== "news_brief") throw new PublishError(PUBLISH_INPUT_INVALID, `content_type ${draft.content_type} has no publisher mapping yet (insight_essay arrives with 3e)`);
  const parsed = NewsBrief.safeParse(draft.body["brief"]);
  if (!parsed.success) throw new PublishError(PUBLISH_INPUT_INVALID, `draft body.brief is not a NewsBrief: ${parsed.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`).join("; ")}`);
  const brief = parsed.data;
  const source: PublicationInsert["sources"][number] = { url: brief.source_url, name: brief.source_name, published_at: brief.published_at_source, ...(rawItem?.title ? { title: rawItem.title } : {}) };
  return {
    draft_id: draftRowId(draft),
    slug: brief.slug,
    content_type: draft.content_type,
    title: brief.title_ko,
    body: {
      summary_ko: brief.summary_ko,
      why_it_matters_ko: brief.why_it_matters_ko,
      expert_lens_ko: brief.expert_lens_ko,
      tags: brief.tags,
      source_url: brief.source_url,
      source_name: brief.source_name,
      published_at_source: brief.published_at_source,
      checks: draft.body["checks"] ?? null,
      generation: { prompt_version: draft.prompt_version, model: draft.model, run_id: ctx.runId },
    },
    image,
    sources: [source],
    published_at: ctx.now.toISOString(),
    publisher: "pipeline",
    status: "published",
    legacy_id: null,
    noindex: false,
    tags: brief.tags,
    category: null,
    region: null,
  };
}

function slugOf(draft: DraftInsert): string | null {
  const brief = draft.body["brief"];
  const slug = brief && typeof brief === "object" ? (brief as { slug?: unknown }).slug : undefined;
  return typeof slug === "string" ? slug : null;
}

export const publishStage: Stage<PublishInput, PublishOutput> = {
  name: "publish",
  input: PublishInput,
  output: PublishOutput,
  idempotencyKey: (input) => `publish:${input.withImages.map((entry) => slugOf(entry.draft) ?? draftRowId(entry.draft)).sort().join("|")}`,
  async run(input, ctx: StageContext) {
    const started = Date.now();
    const target = ctx.config.flags.publish_target;
    const items = new Map<string, RawItemInsert>(input.rawItems.map((item) => [item.id ?? rawItemId(item.canonical_url), item]));
    const rawItemFor = (draft: DraftInsert): RawItemInsert | undefined => {
      const source = draft.body["source"];
      const id = source && typeof source === "object" ? (source as { raw_item_id?: unknown }).raw_item_id : undefined;
      return typeof id === "string" ? items.get(id) : undefined;
    };
    const decisions: PublishDecision[] = [];
    const stats: PublishStats = { target, candidates: input.withImages.length, published: 0, inserted: 0, updated: 0, skipped: 0, failed: 0, redirects_synced: 0, revalidate: { requested: 0, ok: 0, failed: 0, skipped: true }, decisions, ms: 0 };

    if (target === "none") {
      for (const entry of input.withImages) {
        if (decisions.length < DECISION_SAMPLE) decisions.push({ draft_id: draftRowId(entry.draft), slug: slugOf(entry.draft), action: "dry", url: null, error: null });
      }
      ctx.logger.info("publish: publish_target is none; nothing written", { would_publish: input.withImages.length });
      stats.ms = Date.now() - started;
      return { published: [], stats };
    }

    const publisher = ctx.adapters.publishers["site"];
    if (!publisher) throw new Error(`${NO_PUBLISHER}: site publisher not registered`);
    if (publisher.syncRedirects) stats.redirects_synced = await publisher.syncRedirects(ctx);

    const published: PublishedRef[] = [];
    for (const entry of input.withImages) {
      const id = draftRowId(entry.draft);
      const slug = slugOf(entry.draft);
      try {
        const row = publicationFromDraft(entry, rawItemFor(entry.draft), ctx);
        const result: PublishResult = await publisher.publish(row, ctx);
        const action = result.action ?? "inserted";
        if (action === "skipped") stats.skipped += 1;
        else {
          if (action === "updated") stats.updated += 1;
          else stats.inserted += 1;
          stats.published += 1;
          published.push({ slug: result.slug, url: result.url, action, ...(result.id ? { id: result.id } : {}) });
        }
        if (decisions.length < DECISION_SAMPLE) decisions.push({ draft_id: id, slug: result.slug, action, url: result.url, error: null });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stats.failed += 1;
        ctx.logger.error("publish: publication failed; dead letter", { draft_id: id, slug, error: message });
        await ctx.ledger.deadLetter({ run_id: ctx.runId, stage: "publish", ref_table: "drafts", ref_id: id, payload: { slug, target }, error: message });
        if (decisions.length < DECISION_SAMPLE) decisions.push({ draft_id: id, slug, action: "failed", url: null, error: message.slice(0, 300) });
      }
    }

    if (published.length > 0 && publisher.revalidate) {
      const paths = [...published.map((p) => `/${p.slug}/`), ...ctx.config.publish.revalidate.extra_paths];
      const result = await publisher.revalidate(paths, ctx);
      stats.revalidate = { requested: result.requested, ok: result.ok, failed: result.failed, skipped: result.skipped };
    }

    stats.ms = Date.now() - started;
    ctx.logger.info("publish: finished", { target, candidates: stats.candidates, published: stats.published, inserted: stats.inserted, updated: stats.updated, skipped: stats.skipped, failed: stats.failed, redirects_synced: stats.redirects_synced, revalidate: stats.revalidate });
    return { published, stats };
  },
};

export const publishSpec = defineStageSpec({
  stage: publishStage,
  select: (state) => ({ withImages: state.withImages, rawItems: state.rawItems }),
  merge: (state, output) => ({ ...state, published: output.published, publishStats: output.stats }),
  counts: (output) => ({
    candidates: output.stats.candidates,
    published: output.stats.published,
    inserted: output.stats.inserted,
    updated: output.stats.updated,
    skipped: output.stats.skipped,
    failed: output.stats.failed,
    redirects_synced: output.stats.redirects_synced,
    revalidate_ok: output.stats.revalidate.ok,
    revalidate_failed: output.stats.revalidate.failed,
  }),
});
