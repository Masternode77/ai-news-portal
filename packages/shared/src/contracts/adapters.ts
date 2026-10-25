/**
 * Adapter interfaces (contracts.md §2). Stages never know a provider's name;
 * all external calls live behind these interfaces (P3).
 */
import type {
  ExtractedText,
  ImageResult,
  LlmRequest,
  LlmResponse,
  LlmTask,
  PromptFile,
  PublicationInsert,
  RawItemInsert,
  SourceConfig,
  SourceType,
  PromptTask,
} from "../schema/index.ts";
import type { StageContext } from "./stage.ts";

/** Why items a feed listed were not kept; reported per source in stage_events.counts. */
export interface SourceFetchStats {
  listed: number;
  kept: number;
  skipped: Record<string, number>;
  /** Final URL after redirects, bytes and redirect count of the feed request. */
  fetch?: { url: string; bytes: number; redirects: number; ms: number };
}

export interface SourceFetchDetail {
  items: RawItemInsert[];
  stats: SourceFetchStats;
}

export interface SourceAdapter {
  readonly type: SourceType;
  /** Fetch one source. Throw on failure; the ingest stage isolates failures per source. */
  fetch(source: SourceConfig, ctx: StageContext): Promise<RawItemInsert[]>;
  /** Same as fetch, with per-source statistics (Phase 3a amendment; ingest prefers it when present). */
  fetchDetailed?(source: SourceConfig, ctx: StageContext): Promise<SourceFetchDetail>;
  /** Optional body extraction. Without it ingest stores the snippet only. */
  extract?(item: RawItemInsert, source: SourceConfig, ctx: StageContext): Promise<ExtractedText>;
}

export interface LlmAdapter {
  /** 'anthropic' | 'openrouter' | 'fixture' | 'disabled' */
  readonly provider: string;
  complete(request: LlmRequest, ctx: StageContext): Promise<LlmResponse>;
}

/** Where stages get their prompt files (contracts.md §6); file-backed in production, in-memory in tests. */
export interface PromptRegistry {
  get(task: PromptTask): Promise<PromptFile>;
}

export interface ImageRequest {
  prompt: string;
  alt: string;
  slug: string;
  /**
   * Phase 3f: the brief's own fields, so the placeholder can pick a motif from the article alone. The rendered
   * `prompt` also holds the template's fixed instructions (its visual vocabulary names grids, cooling loops…),
   * so it is never used for topic matching.
   */
  title?: string;
  summary?: string;
  tags?: readonly string[];
}

export interface ImageAdapter {
  /** 'placeholder' | 'openai' | 'fixture' | 'chain' */
  readonly provider: string;
  generate(request: ImageRequest, ctx: StageContext): Promise<ImageResult>;
}

export type ImageMime = "image/svg+xml" | "image/png" | "image/jpeg" | "image/webp";

export interface ImageStoreInput {
  bytes: Uint8Array;
  mime: ImageMime;
  /** The publication slug (`news/<hash>`); the store derives the path from it. */
  slug: string;
  /** 'hero' | 'og' | … */
  variant: string;
}

/**
 * Where generated image bytes go (Phase 3f). Adapters hand bytes to the store
 * and put the returned site path on the ImageResult; the hosted store that the
 * publisher needs (Supabase Storage / Vercel Blob) is a 3h decision, so Phase 3
 * ships memory and local-directory implementations only.
 */
export interface ImageStore {
  readonly kind: string;
  put(input: ImageStoreInput, ctx: StageContext): Promise<{ path: string; bytes: number }>;
}

export type PublisherTarget = "site" | "blog" | "social";

export interface PublishResult {
  slug: string;
  url: string;
}

export interface PublisherAdapter {
  readonly target: PublisherTarget;
  /** Idempotent: an existing slug is updated in place, never duplicated. */
  publish(item: PublicationInsert, ctx: StageContext): Promise<PublishResult>;
  unpublish?(slug: string, ctx: StageContext): Promise<void>;
  /** Site publisher only: on-demand ISR revalidation. */
  revalidate?(paths: string[], ctx: StageContext): Promise<void>;
}
