/** READABILITY_LOW (soft, ADR-004; legacy repetition detector): average words per sentence ≤ `max_avg_sentence_words`, and no sentence opening (first `opening_words` words) repeats more than `max_same_opening` times. */
import type { QaRule } from "@cc/shared";
import { briefOf, sentences, words } from "../text.ts";
import { numberParam, verdict } from "../verdict.ts";

export const rule: QaRule = {
  rule: "READABILITY_LOW",
  check(draft, evidence, config) {
    const maxAvg = numberParam(config, "max_avg_sentence_words", 40);
    const maxSame = numberParam(config, "max_same_opening", 2);
    const openingWords = numberParam(config, "opening_words", 2);
    const brief = briefOf(draft);
    if (!brief) return verdict(config, false, { skipped: "brief_invalid" }, evidence.now);
    const sents = sentences([brief.summary_ko, brief.why_it_matters_ko, brief.expert_lens_ko].join("\n"));
    const lengths = sents.map((s) => words(s).length);
    const avg = lengths.length === 0 ? 0 : lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const openings = new Map<string, number>();
    for (const s of sents) {
      const key = words(s).slice(0, openingWords).join(" ");
      if (key) openings.set(key, (openings.get(key) ?? 0) + 1);
    }
    let worst: [string, number] = ["", 0];
    for (const entry of openings) if (entry[1] > worst[1]) worst = entry;
    const pass = avg <= maxAvg && worst[1] <= maxSame;
    return verdict(config, pass, { avg_sentence_words: Number(avg.toFixed(1)), sentences: sents.length, max_same_opening_count: worst[1], opening: worst[0], max_avg_sentence_words: maxAvg, max_same_opening: maxSame }, evidence.now);
  },
};
