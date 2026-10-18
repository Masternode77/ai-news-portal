/**
 * Adapter interfaces (contracts.md §2). Stages never know a provider's name;
 * all external calls live behind these interfaces (P3).
 */
import type {
  ExtractedText,
  ImageResult,
  LlmRequest,
  LlmResponse,
  PublicationInsert,
  RawItemInsert,
  SourceConfig,
  SourceType,
} from "../schema/index.ts";
import type { StageContext } from "./stage.ts";

export interface SourceAdapter {
  readonly type: SourceType;
  /** Fetch one source. Throw on failure; the ingest stage isolates failures per source. */
  fetch(source: SourceConfig, ctx: StageContext): Promise<RawItemInsert[]>;
  /** Optional body extraction. Without it ingest stores the snippet only. */
  extract?(item: RawItemInsert, ctx: StageContext): Promise<ExtractedText>;
}

export interface LlmAdapter {
  /** 'anthropic' | 'openrouter' | 'fixture' | 'disabled' */
  readonly provider: string;
  complete(request: LlmRequest, ctx: StageContext): Promise<LlmResponse>;
}

export interface ImageRequest {
  prompt: string;
  alt: string;
  slug: string;
}

export interface ImageAdapter {
  /** 'placeholder' | 'openai' | 'fixture' */
  readonly provider: string;
  generate(request: ImageRequest, ctx: StageContext): Promise<ImageResult>;
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
