/** SEO_FIELDS_MISSING (soft, ADR-004): the title fits a SERP line (`title_max_chars`) and the summary's first paragraph is long enough (`description_min_chars`) for the publisher to cut a meta description from it. The OG image is the publisher's (3h). */
import type { QaRule } from "@cc/shared";
import { briefOf, paragraphs } from "../text.ts";
import { numberParam, verdict } from "../verdict.ts";

export const rule: QaRule = {
  rule: "SEO_FIELDS_MISSING",
  check(draft, evidence, config) {
    const titleMax = numberParam(config, "title_max_chars", 70);
    const descMin = numberParam(config, "description_min_chars", 80);
    const brief = briefOf(draft);
    if (!brief) return verdict(config, false, { skipped: "brief_invalid" }, evidence.now);
    const description = paragraphs(brief.summary_ko)[0] ?? "";
    const titleOk = brief.title_ko.length <= titleMax;
    const descOk = description.length >= descMin;
    return verdict(config, titleOk && descOk, { title_chars: brief.title_ko.length, description_chars: description.length, title_max_chars: titleMax, description_min_chars: descMin }, evidence.now);
  },
};
