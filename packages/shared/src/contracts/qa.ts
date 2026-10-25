/**
 * QA rule contract (ADR-004, Phase 3g): one rule per file, named after the
 * reason_code it emits; every verdict carries a reason_code and evidence and is
 * persisted to qa_results (R6). Severity, enablement, auto_pass and thresholds
 * come from `config/qa.yaml` (`QaRuleEntry`), never from the rule file, so a
 * Phase 4 tuning change is a config change.
 *
 * Phase 3g amendment to contracts.md §2: the rule no longer declares its own
 * severity (the config does), it receives the `DraftInsert` the pipeline
 * carries (the row id is derived, not yet stored), and the evidence bag carries
 * what the deterministic rules need — the source text and rights, the raw item,
 * the scored candidate and the banned-phrase inventory. `claimLedger` is gone:
 * grounding is recomputed from the source text (3d `groundingCheck`).
 */
import type { BannedPhrasesConfig, CandidateInsert, DraftInsert, QaRuleEntry, QaVerdict, RawItemInsert, SourceConfig } from "../schema/index.ts";

export interface QaEvidence {
  /** Title, body and date of the source item, when the source's rights allow text use; null for link_only. */
  sourceText: string | null;
  source: SourceConfig | undefined;
  rawItem: RawItemInsert | undefined;
  /** The scored candidate the draft came from (rubric total for RUBRIC_BELOW_TARGET). */
  candidate: CandidateInsert | undefined;
  bannedPhrases: BannedPhrasesConfig;
  /** Published titles within the dedupe window (3h fills it; empty until then). */
  recentPublishedTitles: string[];
  /** The run's slot time: every verdict's checked_at. */
  now: Date;
}

export type QaRuleConfig = QaRuleEntry;

export interface QaRule {
  /** Equal to the reason_code it emits and to its file name. */
  readonly rule: string;
  check(draft: DraftInsert, evidence: QaEvidence, config: QaRuleConfig): Promise<QaVerdict> | QaVerdict;
}
