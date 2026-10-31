/**
 * UNGROUNDED_ENTITY (hard, ADR-004): Latin-script names in the draft (capitalised words with a
 * lowercase letter, e.g. `Microsoft`, `Example Data Centers`) must appear in the source text or the
 * source name, case-insensitively, unless listed in `allow`. All-caps tokens (units, acronyms such as
 * RFS or PPA that the editorial voice uses) and Korean names are not checked — a documented limit.
 * `token_fallback` (Phase 4, compare.md §3): a multi-word name the source does not carry verbatim still
 * grounds when every token of at least `min_chars` is in the source — the draft rebuilds two grounded
 * names in Korean word order ("Nottinghamshire Newark" for "Newark … Nottinghamshire"); a token the
 * source never has ("Portugal" against "Portuguese") still fails.
 */
import type { QaRule } from "@cc/shared";
import { briefOf, latinProperNouns, readerText } from "../text.ts";
import { boolParam, numberParam, stringListParam, verdict } from "../verdict.ts";

export const rule: QaRule = {
  rule: "UNGROUNDED_ENTITY",
  check(draft, evidence, config) {
    const maxUngrounded = numberParam(config, "max_ungrounded", 0);
    const minChars = numberParam(config, "min_chars", 3);
    const allow = new Set(stringListParam(config, "allow").map((s) => s.toLowerCase()));
    const brief = briefOf(draft);
    if (!brief) return verdict(config, false, { skipped: "brief_invalid" }, evidence.now);
    const haystack = `${evidence.sourceText ?? ""}\n${evidence.source?.name ?? ""}\n${brief.source_name}`.toLowerCase();
    const tokenFallback = boolParam(config, "token_fallback", false);
    const entities = latinProperNouns(readerText(brief), minChars).filter((e) => /[a-z]/.test(e));
    const tokenGrounded: string[] = [];
    const byTokens = (entity: string): boolean => {
      const tokens = entity.split(/\s+/u).filter((token) => token.length >= minChars);
      if (tokens.length === 0 || !entity.includes(" ")) return false;
      return tokens.every((token) => haystack.includes(token.toLowerCase()));
    };
    const ungrounded = entities.filter((e) => {
      if (allow.has(e.toLowerCase()) || haystack.includes(e.toLowerCase())) return false;
      if (tokenFallback && byTokens(e)) {
        tokenGrounded.push(e);
        return false;
      }
      return true;
    });
    return verdict(config, ungrounded.length <= maxUngrounded, { entities: entities.length, ungrounded: ungrounded.slice(0, 20), max_ungrounded: maxUngrounded, token_fallback: tokenFallback, token_grounded: tokenGrounded.slice(0, 20) }, evidence.now);
  },
};
