/**
 * QA rule contract (ADR-004): one rule per file, every verdict carries a
 * reason_code and evidence, and every verdict is persisted to qa_results.
 */
import type { DraftRow, JsonRecord, QaVerdict, Severity } from "../schema/index.ts";
import type { z } from "zod";

export interface QaEvidence {
  /** Extracted source body, when the source allows text use. */
  sourceText?: string;
  /** Numbers and entities grounded during generation (claim ledger). */
  claimLedger?: z.infer<typeof JsonRecord>;
  /** Published titles within the dedupe window. */
  recentPublishedTitles?: string[];
}

export interface QaRuleConfig {
  enabled: boolean;
  severity: Severity;
  /** Soft rules only: pass automatically while collecting shadow data. */
  auto_pass?: boolean;
  params: Record<string, unknown>;
}

export interface QaRule {
  /** Equal to the reason_code it emits. */
  readonly rule: string;
  readonly severity: Severity;
  check(draft: DraftRow, evidence: QaEvidence, config: QaRuleConfig): Promise<QaVerdict> | QaVerdict;
}
