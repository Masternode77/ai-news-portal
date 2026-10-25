/**
 * SOURCE_UNREACHABLE (hard, ADR-004): the draft must still rest on a reachable source.
 *   - the raw item the draft was generated from must be in the run;
 *   - a full-text source whose page extraction was attempted and failed (`extraction.ok === false`)
 *     is unreachable — the body the brief needed never arrived;
 *   - a full-text source must carry at least `min_source_chars` of source text (legacy fail-closed
 *     extraction floor, 500). When extraction was never attempted (replay, `extract_bodies` off) the
 *     feed text the generator actually saw is what is measured.
 * rewrite_only and link_only sources are briefs from the feed text by Josh's decision (ADR-004), so
 * for them the item's presence is enough; their text limits are the prompt's and QUOTE_TOO_LONG's.
 */
import type { QaRule } from "@cc/shared";
import { bodyTextOf } from "../../stages/normalize.ts";
import { numberParam, verdict } from "../verdict.ts";

export const rule: QaRule = {
  rule: "SOURCE_UNREACHABLE",
  check(draft, evidence, config) {
    const minChars = numberParam(config, "min_source_chars", 500);
    const item = evidence.rawItem;
    const rights = evidence.source?.text_rights ?? null;
    const extraction = (item?.payload?.["extraction"] ?? null) as { ok?: unknown } | null;
    const attempted = extraction !== null && typeof extraction === "object" && "ok" in extraction;
    const extractionOk = attempted && extraction.ok === true;
    const chars = item ? bodyTextOf(item).length : 0;
    const extractionFailed = rights === "full" && attempted && !extractionOk;
    const tooShort = rights === "full" && chars < minChars;
    const pass = item !== undefined && !extractionFailed && !tooShort;
    return verdict(config, pass, { raw_item_present: item !== undefined, text_rights: rights, extraction_attempted: attempted, extraction_ok: extractionOk, source_chars: chars, min_source_chars: minChars }, evidence.now);
  },
};
