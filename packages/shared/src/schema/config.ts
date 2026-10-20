/**
 * Configuration file schemas (contracts.md §4). All objects are strict so a
 * typo in YAML fails at load time instead of silently doing nothing.
 */
import { z } from "zod";
import { HttpUrl, IsoDate, RedirectRow, SourceTier, SourceType, STAGE_NAMES, TextRights, UnitInterval } from "./tables.ts";

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
  /** Per registry id, not per display name (legacy keyed the cap by name). */
  items_per_source: z.number().int().positive().default(6),
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

export const IngestConfig = z.strictObject({
  /** Feeds fetched at the same time (legacy: unbounded Promise.all). */
  concurrency: z.number().int().positive().max(32).default(6),
  /** Article pages extracted at the same time. */
  extract_concurrency: z.number().int().positive().max(16).default(3),
  feed_timeout_ms: z.number().int().positive().default(20_000),
  page_timeout_ms: z.number().int().positive().default(12_000),
  /** Streaming cap per response; Substack full-content feeds exceed 2 MiB (semianalysis 2026-10-18). */
  max_body_bytes: z.number().int().positive().default(6 * 1024 * 1024),
  /** Retries per source for timeouts and 5xx; the whole-run retry is gone. */
  retry_attempts: z.number().int().nonnegative().max(3).default(1),
  retry_backoff_ms: z.number().int().nonnegative().default(2_000),
  snippet_chars: z.number().int().positive().default(220),
  body_preview_chars: z.number().int().positive().default(800),
  min_title_chars: z.number().int().positive().default(12),
  max_title_chars: z.number().int().positive().default(220),
  /** Consecutive failed runs before a source is disabled in the sources table (brief 3a). */
  auto_disable_after: z.number().int().positive().default(5),
  /** Fetch article bodies for `text_rights: full` sources; false stores feed fields only. */
  extract_bodies: z.boolean().default(true),
  user_agent: z.string().min(1).default("Mozilla/5.0 (compatible; ComputeCurrentBot/1.0)"),
});
export type IngestConfig = z.infer<typeof IngestConfig>;

export const NormalizeConfig = z.strictObject({
  /** Stamped as `candidates.rubric_version` (`normalize/<version>`) on dedupe rejections; bump when a rule or threshold changes. */
  version: z.string().min(1).default("2026-10-20.1"),
  /** Title token Dice coefficient at or above which two items are one story (ADR-004: 0.85). */
  title_similarity: UnitInterval.default(0.85),
  /** Jaccard similarity of word 5-gram shingles over the feed body/preview at or above which two items are copies. */
  body_similarity: UnitInterval.default(0.6),
  /** Both bodies need at least this many tokens before shingle similarity is attempted (never below the 5-token shingle). */
  body_min_tokens: z.number().int().min(5).default(40),
  /** Days back a publication's titles are compared for near-duplicates (a URL identity match is unbounded). */
  published_window_days: z.number().int().positive().default(7),
  /** Publications (newest first) loaded per run for the comparison. */
  published_limit: z.number().int().positive().max(5000).default(2000),
});
export type NormalizeConfig = z.infer<typeof NormalizeConfig>;

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
  /** Optional in YAML; every field has a documented default. */
  ingest: IngestConfig.prefault({}),
  normalize: NormalizeConfig.prefault({}),
});
export type PipelineConfig = z.infer<typeof PipelineConfig>;

/** `abstract`: only the abstract/summary may be used as text (arXiv metadata is CC0, the e-print is not). */
export const TextScope = z.enum(["full", "abstract"]);
export type TextScope = z.infer<typeof TextScope>;

/** Body extraction strategy for `text_rights: full` sources; `none` stores feed fields only. */
export const ExtractKind = z.enum(["generic", "google_release_notes", "epoch_index", "arxiv_abstract", "ec_press", "none"]);
export type ExtractKind = z.infer<typeof ExtractKind>;

export const ExtractConfig = z.strictObject({
  kind: ExtractKind.default("generic"),
  /** Exact article path the source may link to (Google release notes). */
  path: z.string().startsWith("/").optional(),
  /** Section prefix; one slug segment under it, no query or fragment. */
  path_prefix: z.string().regex(/^\/.*\/$/, "must start and end with /").optional(),
  /** Article hosts beyond the feed host (`*.example.com` allowed). */
  hosts: z.array(z.string().min(1)).max(10).optional(),
  /** Visible-text licence statement every extracted page must carry. */
  license_marker: z.string().min(3).optional(),
  /** Google release notes: the product section heading to keep. */
  section: z.string().min(1).optional(),
});
export type ExtractConfig = z.infer<typeof ExtractConfig>;

/** A simple source is at most ten YAML lines (R5); `extract` is only needed for special pages. */
export const SourceConfig = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/, "kebab-case id"),
  name: z.string().min(1),
  type: SourceType,
  url: HttpUrl,
  tier: SourceTier,
  enabled: z.boolean(),
  text_rights: TextRights,
  terms_url: HttpUrl.optional(),
  reviewed_at: IsoDate.optional(),
  pool_max_age_days: z.number().int().positive().optional(),
  language: z.string().regex(/^[a-z]{2}$/, "ISO 639-1").optional(),
  text_scope: TextScope.optional(),
  extract: ExtractConfig.optional(),
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
