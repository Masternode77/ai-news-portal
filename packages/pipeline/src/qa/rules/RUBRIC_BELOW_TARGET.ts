/** RUBRIC_BELOW_TARGET (soft, ADR-004): the 3c rubric total of the candidate the draft came from must reach `min_total` (0–1 scale; ADR "70/100"). */
import type { QaRule } from "@cc/shared";
import { numberParam, verdict } from "../verdict.ts";

export const rule: QaRule = {
  rule: "RUBRIC_BELOW_TARGET",
  check(_draft, evidence, config) {
    const min = numberParam(config, "min_total", 0.7);
    const total = evidence.candidate?.total ?? null;
    if (total === null) return verdict(config, true, { skipped: "no_candidate", min_total: min }, evidence.now);
    return verdict(config, total >= min, { total, min_total: min, tier: (evidence.candidate?.rubric as { tier?: unknown } | null)?.tier ?? null }, evidence.now);
  },
};
