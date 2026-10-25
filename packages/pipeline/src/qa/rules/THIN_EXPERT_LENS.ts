/** THIN_EXPERT_LENS (soft, ADR-004): `expert_lens_ko` needs at least `min_sentences` sentences and `min_concrete` concrete tokens (numbers with units, Latin proper nouns). */
import type { QaRule } from "@cc/shared";
import { briefOf, concreteTokens, sentences } from "../text.ts";
import { numberParam, verdict } from "../verdict.ts";

export const rule: QaRule = {
  rule: "THIN_EXPERT_LENS",
  check(draft, evidence, config) {
    const minSentences = numberParam(config, "min_sentences", 3);
    const minConcrete = numberParam(config, "min_concrete", 3);
    const brief = briefOf(draft);
    if (!brief) return verdict(config, false, { skipped: "brief_invalid" }, evidence.now);
    const sents = sentences(brief.expert_lens_ko).length;
    const concrete = concreteTokens(brief.expert_lens_ko);
    return verdict(config, sents >= minSentences && concrete.length >= minConcrete, { sentences: sents, concrete: concrete.length, concrete_sample: concrete.slice(0, 8), min_sentences: minSentences, min_concrete: minConcrete }, evidence.now);
  },
};
