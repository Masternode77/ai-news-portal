/**
 * QUOTE_TOO_LONG (hard, Josh 2026-10-18 / ADR-004): the longest run of consecutive words the
 * reader-facing text shares with the source may not exceed `max_quote_words` (20), and the draft
 * may carry at most `max_quotes` (1) double-quoted spans. Measured with the 3d `longestCommonRun`.
 */
import type { QaRule } from "@cc/shared";
import { longestCommonRun } from "../../stages/generate.ts";
import { briefOf, quotedSpans, readerText } from "../text.ts";
import { numberParam, verdict } from "../verdict.ts";

export const rule: QaRule = {
  rule: "QUOTE_TOO_LONG",
  check(draft, evidence, config) {
    const maxWords = numberParam(config, "max_quote_words", 20);
    const maxQuotes = numberParam(config, "max_quotes", 1);
    const brief = briefOf(draft);
    if (!brief) return verdict(config, false, { skipped: "brief_invalid" }, evidence.now);
    const text = readerText(brief);
    const run = evidence.sourceText === null ? 0 : longestCommonRun(text, evidence.sourceText);
    const quotes = quotedSpans(text);
    const pass = run <= maxWords && quotes.length <= maxQuotes;
    return verdict(config, pass, { longest_shared_run: run, quoted_spans: quotes.length, quotes: quotes.slice(0, 5), max_quote_words: maxWords, max_quotes: maxQuotes, source_text: evidence.sourceText !== null }, evidence.now);
  },
};
