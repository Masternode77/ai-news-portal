/**
 * Stage contract (contracts.md §1). Every stage is `run(input, ctx) -> output`
 * with zod-validated input and output and an item-level idempotency key.
 *
 * Phase 2 amendment to contracts.md: `ctx.fetch` and `ctx.replay` were added so
 * replay mode can prove "zero network" by injecting a throwing fetch, and
 * `ctx.fixtureName` tells fixture adapters which recording to load.
 */
import type { z } from "zod";
import type { BannedPhrasesConfig, PipelineConfig, ScoringConfig, StageName } from "../schema/index.ts";
import type { ImageAdapter, ImageStore, LlmAdapter, PromptRegistry, PublisherAdapter, SourceAdapter } from "./adapters.ts";
import type { Budget, DbPort, Ledger } from "./db.ts";
import type { Logger } from "../logger.ts";

export type { StageName };

export interface StageAdapters {
  sources: Record<string, SourceAdapter>;
  llm: LlmAdapter;
  image: ImageAdapter;
  /** Generated image bytes (Phase 3f). */
  imageStore: ImageStore;
  publishers: Record<string, PublisherAdapter>;
  db: DbPort;
  /** Prompt files by task (Phase 3d). */
  prompts: PromptRegistry;
}

export interface StageContext {
  runId: string;
  /** The scheduled slot time, independent of cron delay (ADR-002). */
  now: Date;
  config: PipelineConfig;
  /** `config/scoring.yaml` (Phase 3c): rubric weights, thresholds, vocabularies. */
  scoring: ScoringConfig;
  /** `config/banned-phrases.yaml` (Phase 3d): the inventory the prompt renders and the guard matches. */
  bannedPhrases: BannedPhrasesConfig;
  logger: Logger;
  ledger: Ledger;
  budget: Budget;
  /** True: no DB writes, no publishing, no external calls; adapters use memory/fixture implementations. */
  dryRun: boolean;
  /** True: adapters read recorded fixtures and `fetch` throws on any call. */
  replay: boolean;
  fixtureName: string | undefined;
  /** The only sanctioned way to reach the network from a stage or adapter. */
  fetch: typeof globalThis.fetch;
  adapters: StageAdapters;
}

export interface Stage<I, O> {
  readonly name: StageName;
  readonly input: z.ZodType<I>;
  readonly output: z.ZodType<O>;
  /** Idempotent: the same (runId, input) must yield the same result and side effects. */
  idempotencyKey(input: I): string;
  run(input: I, ctx: StageContext): Promise<O>;
}

/** Runtime-agnostic stage shape used by the runner's ordered list. */
export type AnyStage = Stage<unknown, unknown>;
