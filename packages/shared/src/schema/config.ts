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

/** USD per million tokens (ADR-007 cost table); the adapter refuses a model with no row so the budget guard is never blind. */
export const LlmPricing = z.strictObject({
  input_per_mtok: z.number().nonnegative(),
  output_per_mtok: z.number().nonnegative(),
  cache_read_per_mtok: z.number().nonnegative().default(0),
});
export type LlmPricing = z.infer<typeof LlmPricing>;

export const LlmConfig = z.strictObject({
  provider: z.enum(["anthropic", "openrouter", "fixture", "disabled"]),
  models: LlmModels,
  /** Keyed by model id. */
  pricing: z.record(z.string(), LlmPricing).default({}),
  base_url: HttpUrl.default("https://api.anthropic.com"),
  timeout_ms: z.number().int().positive().default(90000),
  /** Retries on 429/5xx/network errors (Phase 3d adapter). */
  max_retries: z.number().int().nonnegative().max(5).default(2),
  /** Source text sent to the model is cut at this many characters. */
  max_source_chars: z.number().int().positive().default(12000),
});
export type LlmConfig = z.infer<typeof LlmConfig>;

export const ImageProvider = z.enum(["placeholder", "openai", "fixture"]);
export type ImageProvider = z.infer<typeof ImageProvider>;

/** USD per generated image (ADR-007); the OpenAI adapter refuses a model without a row. */
export const ImagePricing = z.strictObject({ usd_per_image: z.number().nonnegative() });
export type ImagePricing = z.infer<typeof ImagePricing>;

export const OpenAiImageConfig = z.strictObject({
  model: z.string().min(1).default("gpt-image-2"),
  size: z.string().regex(/^\d{3,4}x\d{3,4}$/).default("1536x1024"),
  quality: z.enum(["low", "medium", "high", "auto"]).default("medium"),
  output_format: z.enum(["png", "jpeg", "webp"]).default("webp"),
  base_url: HttpUrl.default("https://api.openai.com"),
});
export type OpenAiImageConfig = z.infer<typeof OpenAiImageConfig>;

/** Deterministic brand placeholder (Phase 3f): topic vocabulary picks the motif, the slug picks the palette. */
export const PlaceholderImageConfig = z.strictObject({
  default_topic: z.string().regex(/^[a-z0-9-]+$/).default("ai-infrastructure"),
  topics: z.record(z.string().regex(/^[a-z0-9-]+$/), z.array(z.string().min(1)).min(1)).default({}),
});
export type PlaceholderImageConfig = z.infer<typeof PlaceholderImageConfig>;

export const ImageConfig = z
  .strictObject({
    /** Tried first. */
    provider: ImageProvider,
    /** Tried after the provider fails, in order; the last entry must be placeholder (P5: an image failure never blocks publishing). */
    fallback_chain: z.array(ImageProvider).min(1),
    openai: OpenAiImageConfig.prefault({}),
    placeholder: PlaceholderImageConfig.prefault({}),
    /** Keyed by model id. */
    pricing: z.record(z.string(), ImagePricing).default({}),
    timeout_ms: z.number().int().positive().default(60000),
    /** Retries on 429/5xx/network errors (Phase 3f adapter). */
    max_retries: z.number().int().nonnegative().max(5).default(1),
  })
  .refine((config) => config.provider === "placeholder" || config.fallback_chain[config.fallback_chain.length - 1] === "placeholder", {
    message: "image.fallback_chain must end with placeholder (fail-safe: an image failure never blocks publishing)",
    path: ["fallback_chain"],
  });
export type ImageConfig = z.infer<typeof ImageConfig>;

const EnvName = z.string().regex(/^[A-Z][A-Z0-9_]*$/, "an environment variable name");

/** Run outcomes that can trigger a notification (a run is never notified while `started`). */
export const NotifyOn = z.enum(["done", "partial", "budget_stop", "failed"]);
export type NotifyOn = z.infer<typeof NotifyOn>;

/**
 * Telegram delivery of the run summary (Phase 3i, ADR-007). Off by default. The bot token and the chat id
 * are read from the environment by NAME only and never logged; a delivery failure is soft (counted and
 * logged, never a run failure). Plain text, no parse mode, so no escaping can break a message.
 */
export const TelegramNotifyConfig = z.strictObject({
  enabled: z.boolean(),
  bot_token_env: EnvName.default("TELEGRAM_BOT_TOKEN"),
  chat_id_env: EnvName.default("TELEGRAM_CHAT_ID"),
  base_url: z.string().url().default("https://api.telegram.org"),
  timeout_ms: z.number().int().positive().max(60_000).default(10_000),
  /** Retries on 429 / 5xx / network errors only (never on another 4xx, never in --replay). */
  max_retries: z.number().int().nonnegative().max(3).default(1),
  retry_backoff_ms: z.number().int().nonnegative().max(30_000).default(1000),
  /** Bot API messages are capped at 4096 characters; a longer summary is cut with a marker (head first). */
  max_chars: z.number().int().min(200).max(4096).default(3800),
  /** Which run outcomes are sent; the others are reported as `status_filtered`. */
  on: z.array(NotifyOn).min(1).default(["done", "partial", "budget_stop", "failed"]),
});
export type TelegramNotifyConfig = z.infer<typeof TelegramNotifyConfig>;

/** Shape of the run summary text (Phase 3i); the same text goes to the log, the --json output and Telegram. */
export const NotifySummaryConfig = z.strictObject({
  /** Local time zone of the header (ADR-007 shows KST); fixed offsets, no DST. */
  timezone: z.enum(["Asia/Seoul", "UTC"]).default("Asia/Seoul"),
  /** Failure codes listed ("failures (top 3)"). */
  top_failures: z.number().int().positive().max(10).default(3),
  /** Published lines listed before the rest folds into "+N more". */
  max_published: z.number().int().positive().max(20).default(5),
});
export type NotifySummaryConfig = z.infer<typeof NotifySummaryConfig>;

export const NotifyConfig = z.strictObject({
  telegram: TelegramNotifyConfig,
  summary: NotifySummaryConfig.prefault({}),
});
export type NotifyConfig = z.infer<typeof NotifyConfig>;

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
  /** Minimum interval between page requests to one registrable host (`extract.delay_ms` raises it per source, e.g. a robots Crawl-delay). */
  extract_host_delay_ms: z.number().int().nonnegative().max(60_000).default(1_000),
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
  /** Rows per page while every published row is read (newest first) for the URL index; PostgREST caps one response at max-rows (1000). */
  published_page_size: z.number().int().positive().max(1000).default(1000),
});
export type NormalizeConfig = z.infer<typeof NormalizeConfig>;

/**
 * Phase 3h site publisher. `publish_target` (flags) decides whether anything is written;
 * this block decides how. Revalidation is off until the Phase 4 preview deployment: a
 * failed revalidation never fails a publication (ADR-005: ISR expires within 300 s).
 */
export const PublishConfig = z.strictObject({
  /** Public URL root for published refs and revalidation requests. */
  base_url: z.string().url().default("https://www.computecurrent.com"),
  /** An existing slug written by a *different* draft: update in place (default), skip it, or fail that publication. A re-run of the same draft always updates in place. */
  slug_conflict: z.enum(["update", "skip", "fail"]).default("update"),
  /** Upsert config/redirects.yaml into the redirects table on every publishing run. */
  redirects_sync: z.boolean().default(true),
  revalidate: z
    .strictObject({
      enabled: z.boolean().default(false),
      /** Name of the environment variable holding the ISR bypass token (`x-prerender-revalidate`); the value stays in the environment. */
      token_env: z.string().regex(/^[A-Z][A-Z0-9_]*$/, "an environment variable name").default("CC_REVALIDATE_TOKEN"),
      timeout_ms: z.number().int().positive().max(60_000).default(10_000),
      /** Paths revalidated after every publishing run in addition to the published slugs. */
      extra_paths: z.array(z.string().startsWith("/")).max(20).default(["/"]),
    })
    .prefault({}),
});
export type PublishConfig = z.infer<typeof PublishConfig>;

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
  publish: PublishConfig.prefault({}),
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
  /** Minimum interval between page requests to this source's host (robots `Crawl-delay`, e.g. arXiv 15 s); never below `ingest.extract_host_delay_ms`. */
  delay_ms: z.number().int().nonnegative().max(60_000).optional(),
});
export type ExtractConfig = z.infer<typeof ExtractConfig>;

/** Extractors that store an abstract/summary only; `text_scope: abstract` on a full-rights source allows nothing else. */
export const ABSTRACT_EXTRACT_KINDS: readonly ExtractKind[] = ["arxiv_abstract", "none"];

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
}).superRefine((source, ctx) => {
  // Only a full-rights source fetches pages, and there the scope must be matched by the extractor: the generic
  // (default) and page extractors would store the whole article, which `abstract` forbids.
  const kind = source.extract?.kind ?? "generic";
  if (source.text_scope === "abstract" && source.text_rights === "full" && !ABSTRACT_EXTRACT_KINDS.includes(kind)) {
    ctx.addIssue({ code: "custom", path: ["extract", "kind"], message: `text_scope: abstract allows only extract.kind arxiv_abstract or none on a full-rights source (the ${kind} extractor would store the whole page)` });
  }
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
