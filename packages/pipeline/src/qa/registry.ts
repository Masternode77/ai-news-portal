/**
 * Rule registry (ADR-004 "규칙 추가 = 파일 1개"): every file under ./rules exports one `rule`
 * whose `rule` equals its file name and the reason_code it emits. `config/qa.yaml` decides which
 * run and in what order; this map only says what exists. Adding a rule = add the file, add it
 * here, add a unit test, list it in the config. The test suite checks that every rules/*.ts file
 * is registered under its own name.
 */
import type { QaRule } from "@cc/shared";
import { rule as BANNED_PATTERN } from "./rules/BANNED_PATTERN.ts";
import { rule as LANG_MISMATCH } from "./rules/LANG_MISMATCH.ts";
import { rule as QUOTE_TOO_LONG } from "./rules/QUOTE_TOO_LONG.ts";
import { rule as READABILITY_LOW } from "./rules/READABILITY_LOW.ts";
import { rule as RUBRIC_BELOW_TARGET } from "./rules/RUBRIC_BELOW_TARGET.ts";
import { rule as SCHEMA_INVALID } from "./rules/SCHEMA_INVALID.ts";
import { rule as SEO_FIELDS_MISSING } from "./rules/SEO_FIELDS_MISSING.ts";
import { rule as SIMILARITY_TOO_HIGH } from "./rules/SIMILARITY_TOO_HIGH.ts";
import { rule as SOURCE_UNREACHABLE } from "./rules/SOURCE_UNREACHABLE.ts";
import { rule as THIN_EXPERT_LENS } from "./rules/THIN_EXPERT_LENS.ts";
import { rule as UNGROUNDED_ENTITY } from "./rules/UNGROUNDED_ENTITY.ts";
import { rule as UNGROUNDED_NUMBER } from "./rules/UNGROUNDED_NUMBER.ts";

const ALL: readonly QaRule[] = [
  SCHEMA_INVALID,
  SOURCE_UNREACHABLE,
  QUOTE_TOO_LONG,
  SIMILARITY_TOO_HIGH,
  UNGROUNDED_NUMBER,
  UNGROUNDED_ENTITY,
  LANG_MISMATCH,
  BANNED_PATTERN,
  RUBRIC_BELOW_TARGET,
  READABILITY_LOW,
  SEO_FIELDS_MISSING,
  THIN_EXPERT_LENS,
];

export const QA_RULES: ReadonlyMap<string, QaRule> = new Map(ALL.map((rule) => [rule.rule, rule]));

export function qaRule(code: string): QaRule | undefined {
  return QA_RULES.get(code);
}
