/** SCHEMA_INVALID (hard, ADR-004): `body.brief` must be a complete NewsBrief — source fields and slug included — before any other rule reads it. */
import { NewsBrief } from "@cc/shared";
import type { QaRule } from "@cc/shared";
import { verdict } from "../verdict.ts";

export const rule: QaRule = {
  rule: "SCHEMA_INVALID",
  check(draft, evidence, config) {
    const result = NewsBrief.safeParse(draft.body["brief"]);
    const issues = result.success ? [] : result.error.issues.slice(0, 10).map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`);
    const supported = draft.content_type === "news_brief";
    if (!supported) issues.push(`content_type ${draft.content_type} has no QA schema yet (insight_essay arrives with 3e)`);
    return verdict(config, result.success && supported, { content_type: draft.content_type, issues }, evidence.now);
  },
};
