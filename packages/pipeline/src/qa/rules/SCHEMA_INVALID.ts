/**
 * SCHEMA_INVALID (hard, ADR-004): the draft's reader record must be complete — source fields and slug
 * included — before any other rule reads it: `body.brief` a NewsBrief for a news_brief, `body.essay` an
 * InsightEssay for an insight_essay (Phase 3e). Any other content type has no QA schema and fails.
 */
import { InsightEssay, NewsBrief } from "@cc/shared";
import type { QaRule } from "@cc/shared";
import { verdict } from "../verdict.ts";

export const rule: QaRule = {
  rule: "SCHEMA_INVALID",
  check(draft, evidence, config) {
    const result =
      draft.content_type === "news_brief" ? NewsBrief.safeParse(draft.body["brief"]) : draft.content_type === "insight_essay" ? InsightEssay.safeParse(draft.body["essay"]) : null;
    const issues = result === null ? [`content_type ${draft.content_type} has no QA schema`] : result.success ? [] : result.error.issues.slice(0, 10).map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`);
    return verdict(config, result !== null && result.success, { content_type: draft.content_type, issues }, evidence.now);
  },
};
