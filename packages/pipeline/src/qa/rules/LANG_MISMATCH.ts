/** LANG_MISMATCH (hard, ADR-004): the Hangul share of letters across the four `*_ko` fields together must reach `min_hangul_ratio` (titles alone may legitimately carry English names, so the ratio is over the whole reader text). */
import type { QaRule } from "@cc/shared";
import { READER_FIELDS, briefOf, hangulRatio, readerText } from "../text.ts";
import { numberParam, verdict } from "../verdict.ts";

export const rule: QaRule = {
  rule: "LANG_MISMATCH",
  check(draft, evidence, config) {
    const min = numberParam(config, "min_hangul_ratio", 0.6);
    const brief = briefOf(draft);
    if (!brief) return verdict(config, false, { skipped: "brief_invalid" }, evidence.now);
    const overall = hangulRatio(readerText(brief));
    const fields = Object.fromEntries(READER_FIELDS.map((field) => [field, Number(hangulRatio(brief[field]).toFixed(3))]));
    return verdict(config, overall >= min, { hangul_ratio: Number(overall.toFixed(3)), min_hangul_ratio: min, fields }, evidence.now);
  },
};
