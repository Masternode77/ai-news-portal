/** Dollar budget guard (ADR-007). */
import type { Budget, BudgetState } from "@cc/shared";

export interface BudgetConfigLike {
  run_usd: number;
  soft_warn_usd: number;
  max_calls: number;
}

export class BudgetExceededError extends Error {
  readonly code = "BUDGET_EXCEEDED";
  readonly spentUsd: number;
  readonly limitUsd: number;

  constructor(spentUsd: number, limitUsd: number) {
    super(`BUDGET_EXCEEDED: spent USD ${spentUsd.toFixed(4)} of cap ${limitUsd.toFixed(2)}`);
    this.name = "BudgetExceededError";
    this.spentUsd = spentUsd;
    this.limitUsd = limitUsd;
  }
}

export function createBudget(config: BudgetConfigLike): Budget {
  let spentUsd = 0;
  let calls = 0;
  let stopReason: string | null = null;
  return {
    limitUsd: config.run_usd,
    softWarnUsd: config.soft_warn_usd,
    maxCalls: config.max_calls,
    get spentUsd() {
      return spentUsd;
    },
    get calls() {
      return calls;
    },
    canSpend(estimateUsd: number): boolean {
      if (estimateUsd < 0 || Number.isNaN(estimateUsd)) return false;
      return calls < config.max_calls && spentUsd + estimateUsd <= config.run_usd;
    },
    record(costUsd: number): void {
      if (costUsd < 0 || Number.isNaN(costUsd)) throw new RangeError(`budget.record: invalid cost ${costUsd}`);
      spentUsd += costUsd;
      calls += 1;
    },
    get stopReason() {
      return stopReason;
    },
    stop(reason: string): void {
      stopReason ??= reason;
    },
    state(): BudgetState {
      if (spentUsd > config.run_usd || calls >= config.max_calls) return "exceeded";
      if (spentUsd >= config.soft_warn_usd) return "soft_warn";
      return "ok";
    },
  };
}
