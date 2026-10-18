/**
 * Ports the runner depends on: the database, the run ledger and the budget
 * guard. Implementations live in packages/pipeline (memory for dry-run and
 * tests, Supabase for real runs).
 */
import type {
  DeadLetterInsert,
  Funnel,
  JsonRecord,
  PipelineRunRow,
  RunStatus,
  RunTrigger,
  StageEventRow,
  StageName,
  StageStatus,
  TableName,
} from "../schema/index.ts";
import type { z } from "zod";

export type Row = Record<string, unknown>;

export interface UpsertResult {
  inserted: number;
  updated: number;
}

export interface DbPort {
  readonly kind: "memory" | "supabase";
  insert<T extends Row>(table: TableName, rows: T[]): Promise<T[]>;
  upsert<T extends Row>(table: TableName, rows: T[], conflictKeys: readonly string[]): Promise<UpsertResult>;
  select<T extends Row>(table: TableName, where?: Partial<Row>, options?: { limit?: number }): Promise<T[]>;
  update(table: TableName, where: Partial<Row>, patch: Row): Promise<number>;
}

export interface StartRunInput {
  trigger: RunTrigger;
  startedAt: Date;
  gitSha: string | null;
  flags: z.infer<typeof JsonRecord>;
}

export interface StageFinishInput {
  status: Exclude<StageStatus, "started">;
  counts: z.infer<typeof JsonRecord>;
  error?: string;
}

export interface FinishRunInput {
  status: Exclude<RunStatus, "started">;
  funnel: Funnel;
  costTotalUsd: number;
  error?: string;
}

export interface LedgerDump {
  runs: PipelineRunRow[];
  stageEvents: StageEventRow[];
  deadLetters: Array<DeadLetterInsert & { id: string; created_at: string }>;
}

/**
 * Run ledger (ADR-007). `startRun` is written before any stage executes so a
 * crashed run still leaves a `started` row behind.
 */
export interface Ledger {
  readonly kind: "memory" | "supabase";
  startRun(input: StartRunInput): Promise<string>;
  stageStarted(runId: string, stage: StageName, at: Date): Promise<void>;
  stageFinished(runId: string, stage: StageName, at: Date, input: StageFinishInput): Promise<void>;
  deadLetter(input: DeadLetterInsert): Promise<void>;
  finishRun(runId: string, at: Date, input: FinishRunInput): Promise<void>;
  /** Available on the memory ledger for tests and `--dry-run` output. */
  dump?(): Promise<LedgerDump>;
}

export type BudgetState = "ok" | "soft_warn" | "exceeded";

export interface Budget {
  readonly limitUsd: number;
  readonly softWarnUsd: number;
  readonly maxCalls: number;
  readonly spentUsd: number;
  readonly calls: number;
  /** True when a call costing `estimateUsd` would stay within the hard limit and call cap. */
  canSpend(estimateUsd: number): boolean;
  record(costUsd: number): void;
  state(): BudgetState;
}
