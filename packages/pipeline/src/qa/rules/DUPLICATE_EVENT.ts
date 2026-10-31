/**
 * DUPLICATE_EVENT (hard, Phase 4 — 3g notes §5-4, compare.md §3 row 13): a draft must not report an
 * event the site already published inside the comparison window, even when the second report comes
 * from another outlet with other wording. normalize (3b) only catches the same story by URL, title
 * key or body similarity, so a DOE press release and a trade-press write-up of the same loan both
 * passed and were published (runs 5 and 8, 2026-10-31).
 *
 * The comparison is on titles, which the prompt asks to lead with the key figure: each title is
 * reduced to an "event signature" — its numbers by value (`50억 달러` and `$5 billion` share a key,
 * via the 3d number normaliser) plus its Latin-script names and acronyms, lower-cased, one element
 * per name.
 * Calendar figures (years, months, days) are dropped first, because two unrelated stories of the
 * same day share them. A draft is a duplicate when its signature shares at least `min_shared`
 * elements with an earlier title AND the Jaccard overlap of the two signatures reaches
 * `min_jaccard`. Titles whose signature is smaller than `min_shared` can never match — a
 * conservative limit: a Korean-only title without figures is not checked.
 *
 * The earlier titles come from `QaEvidence.recentPublishedTitles`: published rows inside
 * `normalize.published_window_days` plus drafts that already passed earlier in the same run.
 */
import type { QaRule } from "@cc/shared";
import { numberClaims } from "../../stages/generate.ts";
import { briefOf, latinProperNouns } from "../text.ts";
import { numberParam, verdict } from "../verdict.ts";

const CALENDAR = /\d{4}\s*년|\d{1,2}\s*월(?:\s*\d{1,2}\s*일)?|\d{1,2}\s*일|\b(?:19|20)\d{2}\b/gu;
/** Codes that start with a letter and carry digits (COP31, H100e, SL4): a name, not a figure. */
const CODE = /[A-Za-z][A-Za-z0-9-]*\d[A-Za-z0-9-]*/gu;

/**
 * The comparable facts of a title: value-normalised numbers and Latin-script names. A multi-word
 * name stays one element ("National Grid"), so one shared company does not count twice, and the
 * digits of a code (COP31) count once, as the name.
 */
export function eventSignature(title: string): Set<string> {
  const signature = new Set<string>();
  const withoutDates = title.replace(CALENDAR, " ");
  for (const claim of numberClaims(withoutDates.replace(CODE, " "))) signature.add(`#${claim.key}`);
  for (const name of latinProperNouns(withoutDates, 3)) signature.add(name.toLowerCase());
  return signature;
}

export function signatureOverlap(a: Set<string>, b: Set<string>): { shared: string[]; jaccard: number } {
  const shared = [...a].filter((element) => b.has(element));
  const union = new Set([...a, ...b]).size;
  return { shared, jaccard: union === 0 ? 0 : shared.length / union };
}

export const rule: QaRule = {
  rule: "DUPLICATE_EVENT",
  check(draft, evidence, config) {
    const minShared = numberParam(config, "min_shared", 3);
    const minJaccard = numberParam(config, "min_jaccard", 0.5);
    const brief = briefOf(draft);
    if (!brief) return verdict(config, false, { skipped: "brief_invalid" }, evidence.now);
    const own = eventSignature(brief.title_ko);
    let match: { title: string; shared: string[]; jaccard: number } | null = null;
    if (own.size >= minShared) {
      for (const title of evidence.recentPublishedTitles) {
        const overlap = signatureOverlap(own, eventSignature(title));
        if (overlap.shared.length >= minShared && overlap.jaccard >= minJaccard && (!match || overlap.jaccard > match.jaccard)) {
          match = { title, shared: overlap.shared, jaccard: Math.round(overlap.jaccard * 1000) / 1000 };
        }
      }
    }
    return verdict(config, match === null, { signature: [...own], compared: evidence.recentPublishedTitles.length, duplicate_of: match, min_shared: minShared, min_jaccard: minJaccard }, evidence.now);
  },
};
