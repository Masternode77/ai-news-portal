/**
 * UNGROUNDED_ENTITY (hard, ADR-004): Latin-script names in the draft (capitalised words with a
 * lowercase letter, e.g. `Microsoft`, `Example Data Centers`) must appear in the source text or the
 * source name, case-insensitively, unless listed in `allow`. All-caps tokens (units, acronyms such as
 * RFS or PPA that the editorial voice uses) and Hangul names are not checked — a documented limit.
 * Drafts are English (ADR-009), where every sentence starts with a capital: with
 * `skip_sentence_initial` (default true) a plain capitalised first word ("Operators", "Meanwhile") is not
 * read as a name, and calendar words (months, weekdays) never are (a sentence-initial
 * "Microsoft" is therefore not checked — a documented limit; mid-sentence names are).
 * `token_fallback` (Phase 4, compare.md §3): a multi-word name the source does not carry verbatim still
 * grounds when every token of at least `min_chars` is in the source — the draft rebuilds two grounded
 * names in another word order ("Nottinghamshire Newark" for "Newark … Nottinghamshire"); a token the
 * source never has ("Portugal" against "Portuguese") still fails, and a token is matched as a whole
 * word, so "Arm" is not found inside "farm" (Codex PR #80).
 * `unchecked_source_languages` (ADR-009): an English brief from a Korean-language source writes Korean
 * names romanised ("Saemangeum" for 새만금), which the source text cannot carry, so for a source whose
 * `language` is listed the rule records the names it found and passes — a documented gap; the numbers
 * are still grounded by UNGROUNDED_NUMBER.
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
    const skipSentenceInitial = boolParam(config, "skip_sentence_initial", true);
    const entities = latinProperNouns(readerText(brief), minChars, { skipSentenceInitial }).filter((e) => /[a-z]/.test(e));
    const sourceLanguage = evidence.source?.language ?? null;
    if (sourceLanguage !== null && stringListParam(config, "unchecked_source_languages").includes(sourceLanguage)) {
      return verdict(config, true, { skipped: "source_language", source_language: sourceLanguage, entities: entities.length, names: entities.slice(0, 20) }, evidence.now);
    }
    const tokenGrounded: string[] = [];
    const hasWord = (token: string): boolean => new RegExp(`(?<![\\p{L}\\p{N}])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu").test(haystack);
    const byTokens = (entity: string): boolean => {
      const tokens = entity.split(/\s+/u).filter((token) => token.length >= minChars);
      if (tokens.length === 0 || !entity.includes(" ")) return false;
      return tokens.every((token) => hasWord(token));
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
