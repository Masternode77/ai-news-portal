/** Fixture LLM adapter: replays `fixtures/llm/<task>.sample.json`; cost is whatever the recording says (0 for synthetic samples). */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { LlmResponse } from "@cc/shared";
import type { LlmAdapter, LlmRequest, StageContext } from "@cc/shared";

export function createFixtureLlmAdapter(options: { fixturesDir: string }): LlmAdapter {
  return {
    provider: "fixture",
    async complete(request: LlmRequest, ctx: StageContext) {
      const path = join(options.fixturesDir, "llm", `${request.task}.sample.json`);
      let raw: string;
      try {
        raw = await readFile(path, "utf8");
      } catch (error) {
        throw new Error(`FIXTURE_MISSING: ${path} (${error instanceof Error ? error.message : String(error)})`);
      }
      const response = LlmResponse.parse(JSON.parse(raw));
      ctx.budget.record(response.costUsd);
      return response;
    },
  };
}

export function createDisabledLlmAdapter(): LlmAdapter {
  return {
    provider: "disabled",
    async complete(request: LlmRequest) {
      throw new Error(`LLM_DISABLED: task "${request.task}" requested but llm.provider is disabled`);
    },
  };
}
