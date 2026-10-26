/** The run summary (ADR-007 layout) written to the structured log; the same text Telegram gets (Phase 3i). */
import type { Logger } from "@cc/shared";
import type { RunSummary } from "./summary.ts";

export function notifyConsole(logger: Logger, summary: RunSummary, text: string): void {
  logger.info("run summary", {
    summary: text,
    status: summary.status,
    published: summary.funnel.published,
    failures: summary.failures.map((f) => `${f.code}×${f.count}`),
    zero_published_reasons: summary.zero_published_reasons,
    stages: summary.stages.map((s) => `${s.stage}:${s.status}`),
  });
}
