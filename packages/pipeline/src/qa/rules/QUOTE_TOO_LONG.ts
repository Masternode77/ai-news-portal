/**
 * QUOTE_TOO_LONG (hard, Josh 2026-10-18 / ADR-004): the longest run of consecutive words the
 * reader-facing text shares with the source may not exceed `max_quote_words` (20), and the draft
 * may carry at most `max_quotes` (1) double-quoted spans. Measured with the 3d `longestCommonRun`.
 * `count_min_words` (Josh 2026-11-08): a quoted span shorter than this many words is a quoted term
 * (a slogan, a coined name, one word such as "indicative"), not a quotation, and does not count toward
 * `max_quotes`; it is listed as `short_quotes` and still falls under the shared-run cap. Default 1 counts
 * every span (the rule as before).
 */
import type { QaRule } from "@cc/shared";
import { longestCommonRun } from "../../stages/generate.ts";
import { briefOf, quotedSpans, readerText } from "../text.ts";
import { numberParam, verdict } from "../verdict.ts";

/** Words in a quoted span: whitespace-separated pieces that carry a letter or a digit. */
export function quoteWordCount(span: string): number {
  return span.split(/\s+/u).filter((piece) => /[\p{L}\p{N}]/u.test(piece)).length;
}

export const rule: QaRule = {
  rule: "QUOTE_TOO_LONG",
  check(draft, evidence, config) {
    const maxWords = numberParam(config, "max_quote_words", 20);
    const maxQuotes = numberParam(config, "max_quotes", 1);
    const countMinWords = numberParam(config, "count_min_words", 1);
    const brief = briefOf(draft);
    if (!brief) return verdict(config, false, { skipped: "brief_invalid" }, evidence.now);
    const text = readerText(brief);
    const run = evidence.sourceText === null ? 0 : longestCommonRun(text, evidence.sourceText);
    const spans = quotedSpans(text);
    const quotes = spans.filter((span) => quoteWordCount(span) >= countMinWords);
    const shortQuotes = spans.filter((span) => quoteWordCount(span) < countMinWords);
    const pass = run <= maxWords && quotes.length <= maxQuotes;
    return verdict(config, pass, { longest_shared_run: run, quoted_spans: quotes.length, quotes: quotes.slice(0, 5), short_quotes: shortQuotes.slice(0, 10), max_quote_words: maxWords, max_quotes: maxQuotes, count_min_words: countMinWords, source_text: evidence.sourceText !== null }, evidence.now);
  },
};
