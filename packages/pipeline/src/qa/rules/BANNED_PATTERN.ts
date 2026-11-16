/** BANNED_PATTERN (hard, ADR-004 / AGENTS.md): no phrase, hook start or pattern from `config/banned-phrases.yaml` in the reader-facing fields — the same inventory the 3d prompt renders and reports. */
import type { QaRule } from "@cc/shared";
import { bannedPhraseCheck, compileBannedPhrases } from "../../checks/banned-phrases.ts";
import { readerOf, unreadable } from "../text.ts";
import { verdict } from "../verdict.ts";

export const rule: QaRule = {
  rule: "BANNED_PATTERN",
  check(draft, evidence, config) {
    const reader = readerOf(draft);
    if (!reader) return verdict(config, false, unreadable(draft), evidence.now);
    const result = bannedPhraseCheck(reader.fields, compileBannedPhrases(evidence.bannedPhrases));
    return verdict(config, result.pass, { matches: result.matches.slice(0, 20), inventory_version: result.version }, evidence.now);
  },
};
