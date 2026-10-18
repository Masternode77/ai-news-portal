/**
 * Configuration file schemas (contracts.md §4). All objects are strict so a
 * typo in YAML fails at load time instead of silently doing nothing.
 */
import { z } from "zod";
import { IsoDate, RedirectRow, SourceTier, SourceType, STAGE_NAMES, TextRights } from "./tables.ts";

export const PublishTarget = z.enum(["none", "staging", "production"]);
export type PublishTarget = z.infer<typeof PublishTarget>;

export const StageFlags = z.strictObject(
  Object.fromEntries(STAGE_NAMES.map((name) => [name, z.boolean()])) as Record<
    (typeof STAGE_NAMES)[number],
    z.ZodBoolean
  >,
);
export type StageFlags = z.infer<typeof StageFlags>;

export const ScheduleConfig = z.strictObject({
  /** 5-field cron, UTC (ADR-002). */
  cron: z.string().regex(/^(\S+\s+){4}\S+$/, "5-field cron expression"),
  timezone: z.literal("UTC"),
  slot_hours: z.number().int().positive().max(24),
});

export const CapsConfig = z.strictObject({
  briefs_per_cycle: z
    .strictObject({ min: z.number().int().nonnegative(), max: z.number().int().positive() })
    .refine((v) => v.min <= v.max, "briefs_per_cycle.min must be <= max"),
  essays_per_day: z.number().int().nonnegative(),
  pool_max_items: z.number().int().positive(),
  pool_max_age_days: z.number().int().positive(),
});

export const BudgetConfig = z
  .strictObject({
    run_usd: z.number().positive(),
    soft_warn_usd: z.number().positive(),
    max_calls: z.number().int().positive(),
  })
  .refine((v) => v.soft_warn_usd <= v.run_usd, "budget.soft_warn_usd must be <= run_usd");

export const LlmModels = z.strictObject({
  curate: z.string().min(1),
  news_brief: z.string().min(1),
  expert_lens: z.string().min(1),
  insight_essay: z.string().min(1),
  qa_assist: z.string().min(1),
});

export const LlmConfig = z.strictObject({
  provider: z.enum(["anthropic", "openrouter", "fixture", "disabled"]),
  models: LlmModels,
});

export const ImageConfig = z.strictObject({
  provider: z.enum(["placeholder", "openai", "fixture"]),
  fallback_chain: z.array(z.enum(["placeholder", "openai", "fixture"])).min(1),
});

export const NotifyConfig = z.strictObject({
  telegram: z.strictObject({ enabled: z.boolean() }),
});

export const PipelineConfig = z.strictObject({
  schedule: ScheduleConfig,
  flags: z.strictObject({
    stages: StageFlags,
    publish_target: PublishTarget,
  }),
  caps: CapsConfig,
  budget: BudgetConfig,
  llm: LlmConfig,
  image: ImageConfig,
  notify: NotifyConfig,
});
export type PipelineConfig = z.infer<typeof PipelineConfig>;

/** One source is at most ten YAML lines (R5). */
export const SourceConfig = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/, "kebab-case id"),
  name: z.string().min(1),
  type: SourceType,
  url: z.url(),
  tier: SourceTier,
  enabled: z.boolean(),
  text_rights: TextRights,
  terms_url: z.url().optional(),
  reviewed_at: IsoDate.optional(),
  pool_max_age_days: z.number().int().positive().optional(),
});
export type SourceConfig = z.infer<typeof SourceConfig>;

export const SourcesConfig = z.array(SourceConfig).superRefine((sources, ctx) => {
  const seen = new Set<string>();
  for (const [index, source] of sources.entries()) {
    if (seen.has(source.id)) {
      ctx.addIssue({ code: "custom", message: `duplicate source id "${source.id}"`, path: [index, "id"] });
    }
    seen.add(source.id);
  }
});
export type SourcesConfig = z.infer<typeof SourcesConfig>;

export const RedirectsConfig = z.array(RedirectRow).superRefine((rows, ctx) => {
  const seen = new Set<string>();
  for (const [index, row] of rows.entries()) {
    if (seen.has(row.from_path)) {
      ctx.addIssue({ code: "custom", message: `duplicate redirect from_path "${row.from_path}"`, path: [index, "from_path"] });
    }
    seen.add(row.from_path);
  }
});
export type RedirectsConfig = z.infer<typeof RedirectsConfig>;
