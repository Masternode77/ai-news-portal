/** Run summary in the ADR-007 Telegram layout, written to the logger. Telegram delivery lands in Phase 3i. */
import type { Logger } from "@cc/shared";
import type { RunResult } from "../runner.ts";

export function formatRunSummary(result: RunResult, options: { capUsd: number }): string {
  const f = result.funnel;
  const lines = [
    `[CC pipeline] ${f.started_at} · run ${result.runId.slice(0, 8)} · ${result.status}`,
    `fetched ${f.items_fetched} (sources ${f.sources_ok}/${f.sources_configured} ok) → new ${f.items_new} → scored ${f.items_scored} → gate ${f.passed_gate} → drafts ${f.drafts} → qa ${f.qa_passed} → published ${f.published}`,
  ];
  for (const published of result.state.published) lines.push(`• ${published.slug} — ${published.url}`);
  if (f.top_error) lines.push(`top error: ${f.top_error}`);
  lines.push(`cost USD ${result.costTotalUsd.toFixed(2)} / cap ${options.capUsd.toFixed(2)} · ${result.durationMs} ms`);
  return lines.join("\n");
}

export function notifyConsole(logger: Logger, result: RunResult, options: { capUsd: number }): void {
  logger.info("run summary", { summary: formatRunSummary(result, options), stages: result.stages.map((s) => `${s.stage}:${s.status}`) });
}
