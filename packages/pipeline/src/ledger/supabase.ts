/**
 * Supabase-backed run ledger. The client is injected through the minimal
 * `SupabaseLike` shape so tests can pass a fake and no network is needed.
 * Writes use the service role key supplied by the environment (never logged).
 */
import { randomUUID } from "node:crypto";
import type {
  DeadLetterInsert,
  FinishRunInput,
  Ledger,
  StageFinishInput,
  StageName,
  StartRunInput,
} from "@cc/shared";

export interface SupabaseResult {
  error: { message: string } | null;
}

export interface SupabaseQuery {
  limit(count: number): PromiseLike<SupabaseResult & { data: unknown[] | null }>;
  /** Optional on fakes; SupabaseDb only calls it when a select asks for `orderBy`. */
  order?(column: string, options: { ascending: boolean }): { limit(count: number): PromiseLike<SupabaseResult & { data: unknown[] | null }> };
}

export interface SupabaseTable {
  insert(rows: Record<string, unknown>[]): PromiseLike<SupabaseResult>;
  upsert(rows: Record<string, unknown>[], options: { onConflict: string }): PromiseLike<SupabaseResult>;
  update(patch: Record<string, unknown>): { match(filter: Record<string, unknown>): PromiseLike<SupabaseResult> };
  select(columns: string): {
    match(filter: Record<string, unknown>): SupabaseQuery;
    in(column: string, values: unknown[]): SupabaseQuery;
  };
}

export interface SupabaseLike {
  from(table: string): SupabaseTable;
}

function check(result: SupabaseResult, operation: string): void {
  if (result.error) throw new Error(`SupabaseLedger.${operation}: ${result.error.message}`);
}

export class SupabaseLedger implements Ledger {
  readonly kind = "supabase" as const;
  private readonly client: SupabaseLike;

  constructor(client: SupabaseLike) {
    this.client = client;
  }

  async startRun(input: StartRunInput): Promise<string> {
    const id = randomUUID();
    check(
      await this.client.from("pipeline_runs").insert([
        {
          id,
          started_at: input.startedAt.toISOString(),
          status: "started",
          trigger: input.trigger,
          git_sha: input.gitSha,
          flags: input.flags,
          cost_total_usd: 0,
        },
      ]),
      "startRun",
    );
    return id;
  }

  async stageStarted(runId: string, stage: StageName, at: Date): Promise<void> {
    check(
      await this.client.from("stage_events").insert([{ run_id: runId, stage, status: "started", started_at: at.toISOString(), counts: {} }]),
      "stageStarted",
    );
  }

  async stageFinished(runId: string, stage: StageName, at: Date, input: StageFinishInput): Promise<void> {
    check(
      await this.client
        .from("stage_events")
        .update({ status: input.status, ended_at: at.toISOString(), counts: input.counts, error: input.error ?? null })
        .match({ run_id: runId, stage, status: "started" }),
      "stageFinished",
    );
  }

  async deadLetter(input: DeadLetterInsert): Promise<void> {
    check(await this.client.from("dead_letters").insert([{ ...input, retry_count: input.retry_count ?? 0 }]), "deadLetter");
  }

  async finishRun(runId: string, at: Date, input: FinishRunInput): Promise<void> {
    check(
      await this.client
        .from("pipeline_runs")
        .update({
          status: input.status,
          ended_at: at.toISOString(),
          funnel: input.funnel,
          cost_total_usd: input.costTotalUsd,
          error: input.error ?? null,
        })
        .match({ id: runId }),
      "finishRun",
    );
  }
}
