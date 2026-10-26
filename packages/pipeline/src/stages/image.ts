/**
 * Image stage (Phase 3f, brief §6 3f): every QA-passed draft leaves with an
 * ImageResult. The provider chain (`image.provider` → `image.fallback_chain`,
 * always ending in the placeholder) decides who draws it; a paid provider is
 * skipped when the run budget cannot cover another image. When a real provider
 * was configured and the placeholder stood in anyway, the stage writes the
 * IMAGE_MISSING soft verdict (ADR-004) to `qa_results` and passes it on.
 */
import { draftId, NewsBrief, qaRuleEntry, renderTemplate, requireImagePrompt } from "@cc/shared";
import type { DraftInsert, ImageAdapter, ImageRequest, QaVerdict, Severity, Stage, StageContext } from "@cc/shared";
import type { QaResultInsert } from "@cc/shared";
import { PAID_IMAGE_PROVIDERS, imageChainOrder, isImageChain } from "../adapters/image/chain.ts";
import type { ImageChain, ImageChainResult } from "../adapters/image/chain.ts";
import { imageCostEstimate } from "../adapters/image/openai.ts";
import { staticPlaceholder } from "../adapters/image/placeholder.ts";
import type { DraftWithImage, ImageDecision, ImageStats } from "../state.ts";
import { defineStageSpec } from "./spec.ts";
import { ImageInput, ImageOutput } from "./types.ts";

export const IMAGE_MISSING = "IMAGE_MISSING";
const DECISION_SAMPLE = 100;

/** `{{title}}`, `{{summary}}`, `{{tags}}`, `{{source}}`, `{{why}}` in the prompt template (strict: an unknown placeholder fails before any provider call). */
export function imagePrompt(template: string, brief: NewsBrief): string {
  const fields: Record<string, string> = {
    title: brief.title_ko,
    summary: brief.summary_ko,
    why: brief.why_it_matters_ko,
    tags: brief.tags.join(", "),
    source: brief.source_name,
  };
  return renderTemplate(template, fields).trim();
}

/** Alt text is editorial metadata the stage owns, never a model output. */
export function imageAlt(brief: NewsBrief): string {
  return `${brief.title_ko} — Compute Current 편집 일러스트`;
}

export function imageRequestFor(brief: NewsBrief, template: string): ImageRequest {
  return { prompt: imagePrompt(template, brief), alt: imageAlt(brief), slug: brief.slug, title: brief.title_ko, summary: brief.summary_ko, tags: brief.tags };
}

/** A non-chain adapter (tests, custom wiring) is treated as a one-link chain. */
function asChain(adapter: ImageAdapter): Pick<ImageChain, "generateDetailed" | "order"> {
  if (isImageChain(adapter)) return adapter;
  return {
    order: [adapter.provider as ImageChain["order"][number]],
    async generateDetailed(request, ctx) {
      const started = Date.now();
      try {
        const image = await adapter.generate(request, ctx);
        return { image, attempts: [{ provider: adapter.provider, ok: true, code: null, error: null, ms: Date.now() - started }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { image: staticPlaceholder(request, ctx), attempts: [{ provider: adapter.provider, ok: false, code: "IMAGE_FAILED", error: message.slice(0, 300), ms: Date.now() - started }] };
      }
    },
  };
}

/** Severity comes from `config/qa.yaml` (ADR-004 lists IMAGE_MISSING as soft; the config may change it), default soft when the rule is not listed. */
export function imageMissingVerdict(result: ImageChainResult, order: readonly string[], reasonCode: string, checkedAt: string, severity: Severity = "soft"): QaVerdict {
  return {
    rule: IMAGE_MISSING,
    severity,
    pass: false,
    reason_code: reasonCode,
    evidence: { provider_order: [...order], attempts: result.attempts.map((attempt) => ({ ...attempt })), path: result.image.path },
    checked_at: checkedAt,
  };
}

export const imageStage: Stage<ImageInput, ImageOutput> = {
  name: "image",
  input: ImageInput,
  output: ImageOutput,
  idempotencyKey: (input) => `image:${input.passed.map((draft) => draft.id ?? `${draft.candidate_id}:${draft.prompt_version}`).join(",")}`,
  async run(input, ctx: StageContext) {
    const started = Date.now();
    const config = ctx.config.image;
    const template = requireImagePrompt(await ctx.adapters.prompts.get("image"));
    const chain = asChain(ctx.adapters.image);
    const order = chain.order;
    const realProviderConfigured = order.some((provider) => provider !== "placeholder");
    const paidInChain = order.some((provider) => PAID_IMAGE_PROVIDERS.has(provider));
    const estimate = paidInChain ? imageCostEstimate(config) : 0;
    const checkedAt = ctx.now.toISOString();

    const withImages: DraftWithImage[] = [];
    const verdicts: QaVerdict[] = [];
    const qaRows: QaResultInsert[] = [];
    const decisions: ImageDecision[] = [];
    let generated = 0;
    let placeholders = 0;
    let failedAttempts = 0;
    let budgetStopped = 0;
    let costUsd = 0;
    let rejected = 0;
    let held = 0;
    const statusUpdates: DraftInsert[] = [];

    for (const draft of input.passed) {
      const parsed = NewsBrief.safeParse(draft.body["brief"]);
      const rowId = draft.id ?? draftId(draft.candidate_id, draft.content_type, draft.prompt_version);
      if (!parsed.success) {
        await ctx.ledger.deadLetter({ run_id: ctx.runId, stage: "image", ref_table: "drafts", ref_id: rowId, payload: { content_type: draft.content_type, prompt_version: draft.prompt_version }, error: `IMAGE_INPUT_INVALID: draft body has no valid brief (${parsed.error.issues.length} issues)` });
        withImages.push({ draft, image: null });
        continue;
      }
      const brief = parsed.data;
      const request = imageRequestFor(brief, template.system);
      const skipPaid = paidInChain && !ctx.budget.canSpend(estimate);
      if (skipPaid) {
        budgetStopped += 1;
        ctx.logger.warn("image: budget cannot cover a paid image; placeholder only", { slug: brief.slug, estimate_usd: estimate, spent_usd: ctx.budget.spentUsd, cap_usd: ctx.budget.limitUsd });
      }
      // Cost is what the budget saw, not what the surviving result claims: a paid generation whose download or
      // store failed is charged (the adapter records it on the 2xx) but comes back as a free placeholder.
      const spentBefore = ctx.budget.spentUsd;
      const result = await chain.generateDetailed(request, ctx, { skipPaid });
      const { image } = result;
      failedAttempts += result.attempts.filter((attempt) => !attempt.ok).length;
      costUsd += ctx.budget.spentUsd - spentBefore;
      if (image.placeholder) placeholders += 1;
      else generated += 1;
      // The IMAGE_MISSING entry of config/qa.yaml is a gate, not a label (Codex PR #72 P2): a disabled entry
      // emits nothing, a hard entry rejects the draft, a soft entry without auto_pass holds it for review,
      // and only a soft auto_pass entry (ADR-004 default) forwards the placeholder draft to publish.
      let disposition: "forward" | "rejected" | "held" = "forward";
      if (image.placeholder && realProviderConfigured) {
        const entry = qaRuleEntry(ctx.qa, IMAGE_MISSING);
        if (!entry || entry.enabled) {
          const severity = entry?.severity ?? "soft";
          const verdict = imageMissingVerdict(result, order, skipPaid ? "IMAGE_BUDGET_SKIPPED" : "IMAGE_PROVIDERS_FAILED", checkedAt, severity);
          verdicts.push(verdict);
          qaRows.push({ draft_id: rowId, rule: verdict.rule, severity: verdict.severity, pass: verdict.pass, reason_code: verdict.reason_code, evidence: verdict.evidence, checked_at: verdict.checked_at });
          if (severity === "hard") disposition = "rejected";
          else if (entry && !entry.auto_pass) disposition = "held";
        }
      }
      if (disposition === "forward") withImages.push({ draft, image });
      else {
        if (disposition === "rejected") rejected += 1;
        else held += 1;
        statusUpdates.push({ ...draft, id: rowId, review_status: disposition === "rejected" ? "rejected" : "pending" });
        ctx.logger.warn("image: draft not forwarded; IMAGE_MISSING entry decided", { slug: brief.slug, disposition, path: image.path });
      }
      if (decisions.length < DECISION_SAMPLE) {
        decisions.push({ slug: brief.slug, provider: image.provenance.provider, placeholder: image.placeholder, path: image.path, cost_usd: image.costUsd, attempts: result.attempts.map((attempt) => ({ ...attempt })), disposition });
      }
    }

    if (qaRows.length > 0) await ctx.adapters.db.upsert("qa_results", qaRows as unknown as Record<string, unknown>[], ["draft_id", "rule", "checked_at"]);
    if (statusUpdates.length > 0) await ctx.adapters.db.upsert("drafts", statusUpdates as unknown as Record<string, unknown>[], ["candidate_id", "content_type", "prompt_version"]);

    const stats: ImageStats = {
      passed: input.passed.length,
      with_images: withImages.filter((entry) => entry.image !== null).length,
      generated,
      placeholders,
      failed_attempts: failedAttempts,
      budget_stopped: budgetStopped,
      image_missing: verdicts.length,
      rejected,
      held,
      cost_usd: Number(costUsd.toFixed(6)),
      decisions,
      ms: Date.now() - started,
    };
    ctx.logger.info("image: finished", { passed: stats.passed, generated, placeholders, failed_attempts: failedAttempts, budget_stopped: budgetStopped, image_missing: stats.image_missing, rejected, held, cost_usd: stats.cost_usd, provider_order: [...order], prompt_version: template.version });
    return { withImages, verdicts, stats };
  },
};

export const imageSpec = defineStageSpec({
  stage: imageStage,
  select: (state) => ({ passed: state.passed }),
  merge: (state, output) => ({ ...state, withImages: output.withImages, verdicts: [...state.verdicts, ...output.verdicts], imageStats: output.stats }),
  counts: (output) => ({
    passed: output.stats.passed,
    with_images: output.stats.with_images,
    generated: output.stats.generated,
    placeholders: output.stats.placeholders,
    failed_attempts: output.stats.failed_attempts,
    budget_stopped: output.stats.budget_stopped,
    image_missing: output.stats.image_missing,
    rejected: output.stats.rejected,
    held: output.stats.held,
    cost_usd_milli: Math.round(output.stats.cost_usd * 1000),
  }),
});
