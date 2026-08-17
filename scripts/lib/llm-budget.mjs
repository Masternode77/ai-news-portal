// Per-process LLM spend accounting. Every OpenRouter call registers its
// token usage here; once the run budget is exhausted further calls throw
// LlmBudgetExceededError so a runaway loop can never burn unbounded credit
// inside a scheduled pipeline run.

const DEFAULT_TOKEN_BUDGET = 60_000;
const DEFAULT_CALL_BUDGET = 40;

const state = {
  calls: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  failures: 0,
};

export class LlmBudgetExceededError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LlmBudgetExceededError';
  }
}

function tokenBudget() {
  const value = Number(process.env.LLM_RUN_BUDGET_TOKENS || DEFAULT_TOKEN_BUDGET);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TOKEN_BUDGET;
}

function callBudget() {
  const value = Number(process.env.LLM_RUN_BUDGET_CALLS || DEFAULT_CALL_BUDGET);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_CALL_BUDGET;
}

export function assertLlmBudget() {
  if (state.calls >= callBudget()) {
    throw new LlmBudgetExceededError(`llm call budget exhausted (${state.calls}/${callBudget()} calls)`);
  }
  if (state.totalTokens >= tokenBudget()) {
    throw new LlmBudgetExceededError(`llm token budget exhausted (${state.totalTokens}/${tokenBudget()} tokens)`);
  }
}

export function recordLlmCall(usage = {}) {
  state.calls += 1;
  const prompt = Number(usage.prompt_tokens || 0);
  const completion = Number(usage.completion_tokens || 0);
  const total = Number(usage.total_tokens || prompt + completion);
  if (Number.isFinite(prompt)) state.promptTokens += prompt;
  if (Number.isFinite(completion)) state.completionTokens += completion;
  if (Number.isFinite(total)) state.totalTokens += total;
}

export function recordLlmFailure() {
  state.failures += 1;
}

export function llmUsageSummary() {
  return {
    calls: state.calls,
    failures: state.failures,
    prompt_tokens: state.promptTokens,
    completion_tokens: state.completionTokens,
    total_tokens: state.totalTokens,
    token_budget: tokenBudget(),
    call_budget: callBudget(),
  };
}

export function resetLlmUsageForTests() {
  state.calls = 0;
  state.promptTokens = 0;
  state.completionTokens = 0;
  state.totalTokens = 0;
  state.failures = 0;
}
