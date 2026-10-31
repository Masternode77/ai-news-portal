/**
 * Verdict helper: every rule returns the same shape (ADR-004), the severity
 * comes from the config entry, `evidence` always carries the config version
 * and the params the rule used, and `checked_at` is the run's slot time.
 */
import type { QaRuleConfig, QaVerdict } from "@cc/shared";

export function verdict(config: QaRuleConfig, pass: boolean, evidence: Record<string, unknown>, now: Date): QaVerdict {
  return {
    rule: config.rule,
    severity: config.severity,
    pass,
    reason_code: config.rule,
    evidence: { ...evidence, params: config.params },
    checked_at: now.toISOString(),
  };
}

/** A numeric param with a default; a non-number value fails loudly (config is strict, a typo is a bug). */
export function numberParam(config: QaRuleConfig, key: string, fallback: number): number {
  const value = config.params[key];
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`QA_PARAM_INVALID: ${config.rule}.params.${key} must be a number`);
  return value;
}

/** A boolean param with a default; anything but true/false fails loudly. */
export function boolParam(config: QaRuleConfig, key: string, fallback: boolean): boolean {
  const value = config.params[key];
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error(`QA_PARAM_INVALID: ${config.rule}.params.${key} must be true or false`);
  return value;
}

export function stringListParam(config: QaRuleConfig, key: string, fallback: string[] = []): string[] {
  const value = config.params[key];
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) throw new Error(`QA_PARAM_INVALID: ${config.rule}.params.${key} must be a list of strings`);
  return value;
}
