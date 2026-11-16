/**
 * ESSAY_STRUCTURE (soft, Phase 3e — content/templates/insight_essay.md and content/voice/josh_voice.md §5–6):
 * the shape of an insight essay, which no brief rule measures. Each failed check is listed in
 * `evidence.failures`; any failure fails the verdict.
 *
 *   sections        the body carries `body_sections` `##` sections; the counterpoint and the implications each
 *                   open with their own `##` heading; `headings_min`–`headings_max` headings in all
 *   heading_shape   every heading renders as a section heading on the site: at most `heading_max_words`
 *                   words and `heading_max_chars` characters, no closing punctuation (apps/site isSubheading)
 *   retired         no heading from `retired_headings` (voice §6), compared without case or punctuation
 *   length          word counts of body, counterpoint, implications and the whole essay inside their ranges
 *   markdown        nothing but `##` headings: no bold, bullet or numbered lists, links or tables
 *   ellipsis        no ellipsis character or three dots (voice §6)
 *   question_open   the essay does not open on a rhetorical question (voice §6)
 *   contrast_title  an "X is a Y, not a Z" title at most once in `contrast_title_window` consecutive essays;
 *                   the earlier titles are the essays in `recentPublishedTitles` (the QA stage passes an
 *                   essay only the titles of other essays), newest first
 */
import type { QaRule } from "@cc/shared";
import { essayOf, essayWordCount, markdownHeadings, plainMarkdown } from "../../stages/essay.ts";
import { sentences, unreadable } from "../text.ts";
import { numberParam, stringListParam, verdict } from "../verdict.ts";

/** "Texas interconnection is a capacity gate, not a permitting delay". */
export const CONTRAST_TITLE = /\b(?:is|are)\s+(?:a|an|the)?\s*[^,;]+,\s*not\s+/iu;
const CLOSING_PUNCTUATION = /[.!?:;,"'”’)\]…]$/u;
const OTHER_MARKDOWN = /\*\*|__|^\s*(?:[-*+]\s|\d+[.)]\s)|\[[^\]]+\]\([^)]+\)|^\s*\|/mu;
const ELLIPSIS = /…|\.\.\./u;

function normalizedHeading(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function opensWithHeading(text: string): boolean {
  const first = text.trim().split(/\r?\n/u)[0] ?? "";
  return /^#{1,6}[ \t]+\S/u.test(first.trim());
}

export const rule: QaRule = {
  rule: "ESSAY_STRUCTURE",
  check(draft, evidence, config) {
    const essay = essayOf(draft);
    if (!essay) return verdict(config, false, unreadable(draft), evidence.now);
    const bodySections = numberParam(config, "body_sections_min", 2);
    const bodySectionsMax = numberParam(config, "body_sections_max", 3);
    const headingsMin = numberParam(config, "headings_min", 4);
    const headingsMax = numberParam(config, "headings_max", 6);
    const headingMaxWords = numberParam(config, "heading_max_words", 12);
    const headingMaxChars = numberParam(config, "heading_max_chars", 90);
    const retired = new Set(stringListParam(config, "retired_headings").map(normalizedHeading));
    const window = numberParam(config, "contrast_title_window", 5);
    const ranges = {
      body: [numberParam(config, "body_min_words", 800), numberParam(config, "body_max_words", 1300)],
      counterpoint: [numberParam(config, "section_min_words", 150), numberParam(config, "section_max_words", 300)],
      implications: [numberParam(config, "section_min_words", 150), numberParam(config, "section_max_words", 300)],
      total: [numberParam(config, "total_min_words", 1100), numberParam(config, "total_max_words", 1900)],
    } as const;

    const failures: string[] = [];
    const bodyHeadings = markdownHeadings(essay.body);
    const headings = [...bodyHeadings, ...markdownHeadings(essay.counterpoint), ...markdownHeadings(essay.implications)];
    if (bodyHeadings.length < bodySections || bodyHeadings.length > bodySectionsMax) failures.push("sections:body");
    if (!opensWithHeading(essay.counterpoint)) failures.push("sections:counterpoint_heading");
    if (!opensWithHeading(essay.implications)) failures.push("sections:implications_heading");
    if (headings.length < headingsMin || headings.length > headingsMax) failures.push("sections:count");

    const badShape = headings.filter((h) => h.split(/\s+/u).length > headingMaxWords || h.length > headingMaxChars || CLOSING_PUNCTUATION.test(h));
    if (badShape.length > 0) failures.push("heading_shape");
    const retiredUsed = headings.filter((h) => retired.has(normalizedHeading(h)));
    if (retiredUsed.length > 0) failures.push("retired");

    const words = {
      body: essayWordCount(plainMarkdown(essay.body)),
      counterpoint: essayWordCount(plainMarkdown(essay.counterpoint)),
      implications: essayWordCount(plainMarkdown(essay.implications)),
      total: essayWordCount([essay.deck, essay.thesis, plainMarkdown(essay.body), plainMarkdown(essay.counterpoint), plainMarkdown(essay.implications)].join("\n")),
    };
    for (const part of ["body", "counterpoint", "implications", "total"] as const) {
      const [min, max] = ranges[part];
      if (words[part] < min || words[part] > max) failures.push(`length:${part}`);
    }

    const allText = [essay.title, essay.deck, essay.thesis, essay.body, essay.counterpoint, essay.implications].join("\n");
    if (OTHER_MARKDOWN.test([essay.body, essay.counterpoint, essay.implications].join("\n"))) failures.push("markdown");
    if (ELLIPSIS.test(allText)) failures.push("ellipsis");
    const opening = sentences(plainMarkdown(essay.body))[0] ?? "";
    if (opening.trim().endsWith("?")) failures.push("question_open");

    const contrast = CONTRAST_TITLE.test(essay.title);
    const earlierContrast = evidence.recentPublishedTitles.slice(0, Math.max(window - 1, 0)).filter((title) => CONTRAST_TITLE.test(title));
    if (contrast && earlierContrast.length > 0) failures.push("contrast_title");

    return verdict(
      config,
      failures.length === 0,
      {
        failures,
        headings,
        body_sections: bodyHeadings.length,
        bad_headings: badShape.slice(0, 6),
        retired_used: retiredUsed,
        words,
        contrast_title: contrast,
        earlier_contrast_titles: earlierContrast.slice(0, 4),
      },
      evidence.now,
    );
  },
};
