/**
 * Pipeline runner (contracts.md §1 "러너 규약").
 *
 * 1. Write the run ledger row first (`started`), so an aborted run is visible.
 * 2. For each stage in order: flag check → parse input → stage_events started
 *    → run → parse output → merge → stage_events done(counts).
 *    An item failure is a dead letter (P5); a stage exception is a stage
 *    error and the run becomes `partial`; a budget stop keeps QA-passed
 *    drafts flowing to publish (ADR-007).
 * 3. Aggregate the 13 funnel columns and the cost, finish the ledger row.
 */
import { Funnel, STAGE_NAMES } from "@cc/shared";
import type {
  DbPort,
  FlagOverride,
  Funnel as FunnelType,
  Ledger,
  Logger,
  PipelineConfig,
  ScoringConfig,
  RunStatus,
  RunTrigger,
  SourceConfig,
  StageAdapters,
  StageContext,
  StageName,
  StageStatus,
} from "@cc/shared";
import { flagSnapshot } from "@cc/shared";
import { BudgetExceededError, createBudget } from "./budget.ts";
import { DEFAULT_STAGE_SPECS } from "./stages/index.ts";
import type { StageSpecAny } from "./stages/index.ts";
import { initialState } from "./state.ts";
import type { PipelineState } from "./state.ts";

export interface RunOptions {
  config: PipelineConfig;
  /** `config/scoring.yaml` (Phase 3c). */
  scoring: ScoringConfig;
  overrides?: FlagOverride[];
  sources: SourceConfig[];
  ledger: Ledger;
  db: DbPort;
  adapters: StageAdapters;
  logger: Logger;
  trigger: RunTrigger;
  gitSha: string | null;
  dryRun: boolean;
  replay: boolean;
  fixtureName?: string;
  /** Run only these stages (`--stage ingest,normalize`); the others are recorded as `skipped`. */
  only?: readonly StageName[];
  /** Scheduled slot time; defaults to the clock. */
  now?: Date;
  clock?: () => Date;
  fetch?: typeof globalThis.fetch;
  stages?: readonly StageSpecAny[];
}

export interface StageResult {
  stage: StageName;
  status: Exclude<StageStatus, "started">;
  counts: Record<string, number>;
  /** Why a stage was skipped: `flag_off` or `not_selected` (--stage). */
  reason?: "flag_off" | "not_selected";
  error?: string;
  durationMs: number;
}

export interface RunResult {
  runId: string;
  status: Exclude<RunStatus, "started">;
  funnel: FunnelType;
  costTotalUsd: number;
  stages: StageResult[];
  state: PipelineState;
  durationMs: number;
}

export const NETWORK_DISABLED_MESSAGE = "NETWORK_DISABLED: replay mode forbids network access";

export function disabledFetch(): Promise<Response> {
  return Promise.reject(new Error(NETWORK_DISABLED_MESSAGE));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/**
 * Reduces an error message to its taxonomy code so funnel.top_error compares
 * with the Phase 0 reason codes: `SOURCE_UNREACHABLE: 503` → SOURCE_UNREACHABLE,
 * `BudgetExceededError: BUDGET_EXCEEDED: …` → BUDGET_EXCEEDED, and a plain
 * `TypeError: boom` → TypeError.
 */
export function errorCode(message: string): string {
  const stripped = message.replace(/^[A-Za-z]*Error:\s*/, "");
  const code = stripped.match(/^([A-Z][A-Z0-9_]{2,})\b/)?.[1];
  if (code) return code;
  const name = message.match(/^([A-Za-z]*Error)\b/)?.[1];
  if (name) return name;
  return stripped.split(":")[0]?.trim() || message;
}

function topError(errors: string[]): string | null {
  if (errors.length === 0) return null;
  const tally = new Map<string, number>();
  for (const error of errors) {
    const code = errorCode(error);
    tally.set(code, (tally.get(code) ?? 0) + 1);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

/**
 * `items_scored` is an input count (candidates reaching score), so it is only
 * reported when the score stage completed; a flagged-off or failed score stage
 * leaves it at 0 instead of counting every candidate as scored. `passed_gate`
 * is the number of candidates at or above the brief threshold (Phase 0's
 * definition, so the 3.7% baseline compares); the cycle's `selected` count is
 * in the score stage's counts.
 */
export function buildFunnel(runId: string, startedAt: Date, state: PipelineState, errors: string[], completed: ReadonlySet<StageName>): FunnelType {
  return Funnel.parse({
    run_id: runId,
    started_at: startedAt.toISOString(),
    sources_configured: state.sourceStats.configured,
    sources_ok: state.sourceStats.ok,
    sources_failed: state.sourceStats.failed,
    items_fetched: state.rawItems.length,
    items_new: state.itemsNew,
    items_scored: completed.has("score") ? state.candidates.length : 0,
    passed_gate: state.scoreStats.passed,
    drafts: state.drafts.length,
    qa_passed: state.passed.length,
    published: state.published.length,
    top_error: topError(errors),
  });
}

export async function runPipeline(options: RunOptions): Promise<RunResult> {
  const clock = options.clock ?? (() => new Date());
  const startedAt = options.now ?? clock();
  const specs = options.stages ?? DEFAULT_STAGE_SPECS;
  const logger = options.logger;
  const errors: string[] = [];
  const budget = createBudget(options.config.budget);
  const flags = flagSnapshot(options.config, options.overrides ?? []);

  for (const name of options.only ?? []) {
    if (!(STAGE_NAMES as readonly string[]).includes(name)) throw new Error(`unknown stage "${name}" (known: ${STAGE_NAMES.join(", ")})`);
  }

  // Ledger-first: a crash after this point still leaves a `started` row (ADR-007).
  const runId = await options.ledger.startRun({
    trigger: options.trigger,
    startedAt,
    gitSha: options.gitSha,
    flags: { ...flags, dry_run: options.dryRun, replay: options.replay, fixture: options.fixtureName ?? null },
  });
  const runLogger = logger.child({ runId, dryRun: options.dryRun, replay: options.replay });
  runLogger.info("run started", { trigger: options.trigger, gitSha: options.gitSha, publish_target: options.config.flags.publish_target });

  const ledger: Ledger = {
    kind: options.ledger.kind,
    startRun: (input) => options.ledger.startRun(input),
    stageStarted: (id, stage, at) => options.ledger.stageStarted(id, stage, at),
    stageFinished: (id, stage, at, input) => options.ledger.stageFinished(id, stage, at, input),
    deadLetter: async (input) => {
      errors.push(input.error);
      await options.ledger.deadLetter(input);
    },
    finishRun: (id, at, input) => options.ledger.finishRun(id, at, input),
    ...(options.ledger.dump ? { dump: () => options.ledger.dump!() } : {}),
  };

  const ctx: StageContext = {
    runId,
    now: startedAt,
    config: options.config,
    scoring: options.scoring,
    logger: runLogger,
    ledger,
    budget,
    dryRun: options.dryRun,
    replay: options.replay,
    fixtureName: options.fixtureName,
    fetch: options.replay ? disabledFetch : (options.fetch ?? globalThis.fetch),
    adapters: options.adapters,
  };

  let state = initialState(options.sources);
  const stageResults: StageResult[] = [];
  const completed = new Set<StageName>();
  let status: RunResult["status"] = "done";

  try {
    for (const spec of specs) {
      const stageLogger = runLogger.child({ stage: spec.name });
      const stageStart = clock();
      await ledger.stageStarted(runId, spec.name, stageStart);

      const flagOn = options.config.flags.stages[spec.name];
      const selected = options.only === undefined || options.only.includes(spec.name);
      if (!flagOn || !selected) {
        const reason = !flagOn ? "flag_off" : "not_selected";
        const counts = { skipped: 1 };
        await ledger.stageFinished(runId, spec.name, clock(), { status: "skipped", counts: { ...counts, reason } });
        stageResults.push({ stage: spec.name, status: "skipped", counts, reason, durationMs: 0 });
        stageLogger.info("stage skipped", { reason });
        continue;
      }

      try {
        const input = spec.parseInput(spec.select(state));
        const output = spec.parseOutput(await spec.run(input, { ...ctx, logger: stageLogger }));
        state = spec.merge(state, output);
        const counts = spec.counts(output);
        const finishedAt = clock();
        completed.add(spec.name);
        await ledger.stageFinished(runId, spec.name, finishedAt, { status: "done", counts });
        stageResults.push({ stage: spec.name, status: "done", counts, durationMs: finishedAt.getTime() - stageStart.getTime() });
        stageLogger.info("stage done", counts);
      } catch (error) {
        const message = errorMessage(error);
        errors.push(message);
        const finishedAt = clock();
        await ledger.stageFinished(runId, spec.name, finishedAt, { status: "error", counts: {}, error: message });
        stageResults.push({ stage: spec.name, status: "error", counts: {}, error: message, durationMs: finishedAt.getTime() - stageStart.getTime() });
        if (error instanceof BudgetExceededError) {
          status = "budget_stop";
          stageLogger.error("budget cap reached; generation stopped, publish continues for QA-passed drafts", { error: message });
        } else {
          if (status === "done") status = "partial";
          stageLogger.error("stage failed; continuing with next stage", { error: message });
        }
      }
    }

    if (status === "done" && errors.length > 0) status = "partial";
    const endedAt = clock();
    const funnel = buildFunnel(runId, startedAt, state, errors, completed);
    const result: RunResult = {
      runId,
      status,
      funnel,
      costTotalUsd: budget.spentUsd,
      stages: stageResults,
      state,
      durationMs: endedAt.getTime() - startedAt.getTime(),
    };
    await ledger.finishRun(runId, endedAt, { status, funnel, costTotalUsd: budget.spentUsd, ...(errors.length > 0 ? { error: errors[0] } : {}) });
    runLogger.info("run finished", { status, published: funnel.published, costUsd: budget.spentUsd, durationMs: result.durationMs });
    return result;
  } catch (error) {
    const message = errorMessage(error);
    const endedAt = clock();
    await ledger.finishRun(runId, endedAt, { status: "failed", funnel: buildFunnel(runId, startedAt, state, [...errors, message], completed), costTotalUsd: budget.spentUsd, error: message });
    runLogger.error("run failed outside a stage", { error: message });
    throw error;
  }
}
