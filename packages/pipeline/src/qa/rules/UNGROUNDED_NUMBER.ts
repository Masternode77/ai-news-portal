/** UNGROUNDED_NUMBER (hard, ADR-004): every number in the reader-facing fields must appear in the source text by value (3d `groundingCheck`, Korean scale words aware). */
import type { QaRule } from "@cc/shared";
import { groundingCheck } from "../../stages/generate.ts";
import { readerOf, readerText, unreadable } from "../text.ts";
import { numberParam, verdict } from "../verdict.ts";

export const rule: QaRule = {
  rule: "UNGROUNDED_NUMBER",
  check(draft, evidence, config) {
    const maxUngrounded = numberParam(config, "max_ungrounded", 0);
    const reader = readerOf(draft);
    if (!reader) return verdict(config, false, unreadable(draft), evidence.now);
    const grounding = groundingCheck(readerText(reader), evidence.sourceText ?? "");
    return verdict(config, grounding.ungrounded.length <= maxUngrounded, { numbers: grounding.numbers.length, ungrounded: grounding.ungrounded.slice(0, 20), max_ungrounded: maxUngrounded, source_text: evidence.sourceText !== null }, evidence.now);
  },
};
