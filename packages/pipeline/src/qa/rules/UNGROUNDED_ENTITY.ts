/**
 * UNGROUNDED_ENTITY (hard, ADR-004): Latin-script names in the draft (capitalised words with a
 * lowercase letter, e.g. `Microsoft`, `Example Data Centers`) must appear in the source text or the
 * source name, case-insensitively, unless listed in `allow`. All-caps tokens (units, acronyms such as
 * RFS or PPA that the editorial voice uses) and Korean names are not checked — a documented limit.
 */
import type { QaRule } from "@cc/shared";
import { briefOf, latinProperNouns, readerText } from "../text.ts";
import { numberParam, stringListParam, verdict } from "../verdict.ts";

export const rule: QaRule = {
  rule: "UNGROUNDED_ENTITY",
  check(draft, evidence, config) {
    const maxUngrounded = numberParam(config, "max_ungrounded", 0);
    const minChars = numberParam(config, "min_chars", 3);
    const allow = new Set(stringListParam(config, "allow").map((s) => s.toLowerCase()));
    const brief = briefOf(draft);
    if (!brief) return verdict(config, false, { skipped: "brief_invalid" }, evidence.now);
    const haystack = `${evidence.sourceText ?? ""}\n${evidence.source?.name ?? ""}\n${brief.source_name}`.toLowerCase();
    const entities = latinProperNouns(readerText(brief), minChars).filter((e) => /[a-z]/.test(e));
    const ungrounded = entities.filter((e) => !allow.has(e.toLowerCase()) && !haystack.includes(e.toLowerCase()));
    return verdict(config, ungrounded.length <= maxUngrounded, { entities: entities.length, ungrounded: ungrounded.slice(0, 20), max_ungrounded: maxUngrounded }, evidence.now);
  },
};
