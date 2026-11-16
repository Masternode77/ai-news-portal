/** SEO_FIELDS_MISSING (soft, ADR-004): the title fits a SERP line (`title_max_chars`) and the summary's first paragraph is long enough (`description_min_chars`) for the publisher to cut a meta description from it. The OG image is the publisher's (3h). */
import type { QaRule } from "@cc/shared";
import { readerOf, unreadable } from "../text.ts";
import { numberParam, verdict } from "../verdict.ts";

export const rule: QaRule = {
  rule: "SEO_FIELDS_MISSING",
  check(draft, evidence, config) {
    const titleMax = numberParam(config, "title_max_chars", 90);
    const descMin = numberParam(config, "description_min_chars", 80);
    const reader = readerOf(draft);
    if (!reader) return verdict(config, false, unreadable(draft), evidence.now);
    const description = reader.description;
    const titleOk = reader.title.length <= titleMax;
    const descOk = description.length >= descMin;
    return verdict(config, titleOk && descOk, { title_chars: reader.title.length, description_chars: description.length, title_max_chars: titleMax, description_min_chars: descMin }, evidence.now);
  },
};
