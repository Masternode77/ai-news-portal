/**
 * LANG_MISMATCH (hard, ADR-004; ADR-009): the reader text must be written in the
 * publication language. `language: en` (the default since 2026-11-04, ADR-009)
 * measures the Latin-script share of letters across the four reader fields
 * together and requires `min_ratio`; a stray Hangul gloss ("KEPCO (한국전력)")
 * counts against it. `language: ko` measures the Hangul share instead (the
 * Korean-brief behaviour before the switch; `min_hangul_ratio` is still read
 * as its threshold). The ratio is over the whole reader text, so a title made
 * only of names does not decide the verdict on its own.
 */
import type { QaRule } from "@cc/shared";
import { READER_FIELDS, briefOf, hangulRatio, latinRatio, readerText } from "../text.ts";
import { numberParam, stringParam, verdict } from "../verdict.ts";

export const rule: QaRule = {
  rule: "LANG_MISMATCH",
  check(draft, evidence, config) {
    const language = stringParam(config, "language", "en");
    if (language !== "en" && language !== "ko") throw new Error(`LANG_MISMATCH: params.language must be en or ko, got "${language}"`);
    const ratioOf = language === "en" ? latinRatio : hangulRatio;
    const min = language === "en" ? numberParam(config, "min_ratio", 0.98) : numberParam(config, "min_ratio", numberParam(config, "min_hangul_ratio", 0.6));
    const brief = briefOf(draft);
    if (!brief) return verdict(config, false, { skipped: "brief_invalid" }, evidence.now);
    const overall = ratioOf(readerText(brief));
    const fields = Object.fromEntries(READER_FIELDS.map((field) => [field, Number(ratioOf(brief[field]).toFixed(3))]));
    return verdict(config, overall >= min, { language, ratio: Number(overall.toFixed(3)), min_ratio: min, fields }, evidence.now);
  },
};
