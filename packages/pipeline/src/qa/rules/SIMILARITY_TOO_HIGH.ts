/**
 * SIMILARITY_TOO_HIGH (hard, ADR-004). Two measures against the source text, re-expressed from the
 * legacy copyright-safe copy guard (8-word shingles, overlap > 0.22 blocked; a copied sentence is a
 * ≥ 45-char draft sentence found verbatim in the source) and the never-enforced policy file's
 * `max_source_sentence_reuse: 0.15`, which is enforced here for the first time:
 *   overlap        = shared word `shingle_words`-grams ÷ draft shingles          → must be ≤ overlap_max
 *   sentence_reuse = copied sentences ÷ draft sentences of ≥ copied_sentence_min_chars → must be ≤ sentence_reuse_max
 * Texts are normalised to lower-case words first, so punctuation and spacing differences do not hide a copy.
 * A Korean re-narration of an English source shares almost nothing; the rule catches pasted passages.
 */
import type { QaRule } from "@cc/shared";
import { briefOf, sentences, shingles, words } from "../text.ts";
import { numberParam, verdict } from "../verdict.ts";

function normalized(text: string): string {
  return words(text).join(" ");
}

export const rule: QaRule = {
  rule: "SIMILARITY_TOO_HIGH",
  check(draft, evidence, config) {
    const overlapMax = numberParam(config, "overlap_max", 0.22);
    const n = numberParam(config, "shingle_words", 8);
    const reuseMax = numberParam(config, "sentence_reuse_max", 0.15);
    const minChars = numberParam(config, "copied_sentence_min_chars", 45);
    const brief = briefOf(draft);
    if (!brief) return verdict(config, false, { skipped: "brief_invalid" }, evidence.now);
    if (evidence.sourceText === null) return verdict(config, true, { skipped: "no_source_text" }, evidence.now);
    const body = [brief.title_ko, brief.summary_ko, brief.why_it_matters_ko, brief.expert_lens_ko].join("\n\n");
    const own = shingles(body, n);
    const against = new Set(shingles(evidence.sourceText, n));
    const shared = own.filter((s) => against.has(s)).length;
    const overlap = own.length === 0 ? 0 : shared / own.length;
    const sourceNorm = normalized(evidence.sourceText);
    const candidates = sentences(body).filter((s) => s.length >= minChars);
    const copied = candidates.filter((s) => {
      const norm = normalized(s);
      return norm.length > 0 && sourceNorm.includes(norm);
    });
    const reuse = candidates.length === 0 ? 0 : copied.length / candidates.length;
    const pass = overlap <= overlapMax && reuse <= reuseMax;
    return verdict(config, pass, { overlap: Number(overlap.toFixed(3)), shared_shingles: shared, draft_shingles: own.length, shingle_words: n, sentence_reuse: Number(reuse.toFixed(3)), copied_sentences: copied.length, sentences_checked: candidates.length, copied_sample: copied.slice(0, 3).map((s) => s.slice(0, 120)) }, evidence.now);
  },
};
