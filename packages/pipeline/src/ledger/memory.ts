/** In-memory run ledger for `--dry-run` and tests. Mirrors the Supabase tables 1:1. */
import { randomUUID } from "node:crypto";
import type {
  DeadLetterInsert,
  FinishRunInput,
  Ledger,
  LedgerDump,
  PipelineRunRow,
  StageEventRow,
  StageFinishInput,
  StageName,
  StartRunInput,
} from "@cc/shared";

export class MemoryLedger implements Ledger {
  readonly kind = "memory" as const;
  private readonly runs: PipelineRunRow[] = [];
  private readonly stageEvents: StageEventRow[] = [];
  private readonly deadLetters: LedgerDump["deadLetters"] = [];
  private nextEventId = 1;

  async startRun(input: StartRunInput): Promise<string> {
    const id = randomUUID();
    this.runs.push({
      id,
      started_at: input.startedAt.toISOString(),
      ended_at: null,
      status: "started",
      trigger: input.trigger,
      funnel: null,
      cost_total_usd: 0,
      error: null,
      git_sha: input.gitSha,
      flags: input.flags,
    });
    return id;
  }

  async stageStarted(runId: string, stage: StageName, at: Date): Promise<void> {
    this.requireRun(runId);
    this.stageEvents.push({
      id: this.nextEventId++,
      run_id: runId,
      stage,
      status: "started",
      started_at: at.toISOString(),
      ended_at: null,
      counts: {},
      error: null,
    });
  }

  async stageFinished(runId: string, stage: StageName, at: Date, input: StageFinishInput): Promise<void> {
    const open = [...this.stageEvents].reverse().find((e) => e.run_id === runId && e.stage === stage && e.status === "started");
    if (!open) throw new Error(`MemoryLedger.stageFinished: no open event for ${stage} in run ${runId}`);
    open.status = input.status;
    open.ended_at = at.toISOString();
    open.counts = input.counts;
    open.error = input.error ?? null;
  }

  async deadLetter(input: DeadLetterInsert): Promise<void> {
    this.requireRun(input.run_id);
    this.deadLetters.push({ ...input, retry_count: input.retry_count ?? 0, id: randomUUID(), created_at: new Date().toISOString() });
  }

  async finishRun(runId: string, at: Date, input: FinishRunInput): Promise<void> {
    const run = this.requireRun(runId);
    run.status = input.status;
    run.ended_at = at.toISOString();
    run.funnel = input.funnel;
    run.cost_total_usd = input.costTotalUsd;
    run.error = input.error ?? null;
  }

  async dump(): Promise<LedgerDump> {
    return structuredClone({ runs: this.runs, stageEvents: this.stageEvents, deadLetters: this.deadLetters });
  }

  private requireRun(runId: string): PipelineRunRow {
    const run = this.runs.find((r) => r.id === runId);
    if (!run) throw new Error(`MemoryLedger: unknown run ${runId}`);
    return run;
  }
}
