/**
 * `config/qa.yaml` (contracts.md §4, ADR-004, Phase 3g). The QA stage runs the
 * listed rules in this order, all of them, and records every verdict with a
 * reason_code (R6). Severity, enablement, `auto_pass` and every threshold live
 * here, so Phase 4 tuning is a config change (ADR-004 "튜닝 절차"). A rule is one
 * file under packages/pipeline/src/qa/rules/<RULE>.ts whose name equals the
 * reason_code it emits; listing a code here that has no file fails the run,
 * and a file not listed here never runs (the config decides, not the code).
 */
import { z } from "zod";
import { Severity } from "./tables.ts";

/** reason_code style: `UNGROUNDED_NUMBER`. */
export const QaRuleCode = z.string().regex(/^[A-Z][A-Z0-9_]*$/, "reason_code style name (UPPER_SNAKE)");

export const QaRuleEntry = z
  .strictObject({
    rule: QaRuleCode,
    severity: Severity,
    enabled: z.boolean().default(true),
    /** Soft rules only: a failing verdict is recorded but does not hold the draft (Phase 4 shadow data). */
    auto_pass: z.boolean().optional(),
    /** `qa`: run by the QA stage in list order. `image`: emitted by the image stage, which runs after QA (ADR-004 IMAGE_MISSING). */
    stage: z.enum(["qa", "image"]).default("qa"),
    /** Thresholds and vocabularies the rule reads; each rule validates its own params. */
    params: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((entry, ctx) => {
    if (entry.severity === "hard" && entry.auto_pass !== undefined) {
      ctx.addIssue({ code: "custom", path: ["auto_pass"], message: `${entry.rule}: auto_pass applies to soft rules only (a hard rule always rejects)` });
    }
  });
export type QaRuleEntry = z.infer<typeof QaRuleEntry>;

export const QaConfig = z
  .strictObject({
    /** Bump when a rule, threshold or order changes; every verdict's evidence carries it. */
    version: z.string().min(1),
    rules: z.array(QaRuleEntry).min(1),
  })
  .superRefine((config, ctx) => {
    const seen = new Set<string>();
    for (const [index, entry] of config.rules.entries()) {
      if (seen.has(entry.rule)) ctx.addIssue({ code: "custom", path: ["rules", index, "rule"], message: `duplicate rule: ${entry.rule}` });
      seen.add(entry.rule);
    }
  });
export type QaConfig = z.infer<typeof QaConfig>;

/** The config entry for a rule code, or undefined when the config does not list it. */
export function qaRuleEntry(config: QaConfig, rule: string): QaRuleEntry | undefined {
  return config.rules.find((entry) => entry.rule === rule);
}
