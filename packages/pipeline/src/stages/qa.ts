/**
 * qa — Phase 3g (ADR-004). Every draft goes through every enabled `stage: qa`
 * rule of `config/qa.yaml`, in the config's order, and every verdict is kept:
 * the stage never stops at the first failure, so Phase 4 tuning sees the whole
 * picture. The decision per draft is then
 *
 *   any hard verdict failed                     → rejected  (drafts.review_status = rejected)
 *   any soft verdict failed without auto_pass   → held      (review_status = pending, human queue)
 *   otherwise                                   → passed    (flows on to image and publish)
 *
 * All verdicts are upserted into `qa_results` on (draft_id, rule, checked_at)
 * with the config version in their evidence (R6: 100 % reason_code). A rule
 * listed in the config but missing from the registry fails the run — the
 * config decides what runs, the registry only says what exists. A rule that
 * throws becomes a failing verdict carrying the error (fail-closed) and is
 * logged, never swallowed.
 */
import { draftId, rawItemId } from "@cc/shared";
import type { CandidateInsert, DbPort, DraftInsert, QaEvidence, QaResultInsert, QaRuleConfig, QaVerdict, RawItemInsert, Row, SourceConfig, Stage, StageContext } from "@cc/shared";
import { QA_RULES } from "../qa/registry.ts";
import type { QaDecision, QaRuleStat, QaStats } from "../state.ts";
import { sourceTextOf } from "./generate.ts";
import { defineStageSpec } from "./spec.ts";
import { QaInput, QaOutput } from "./types.ts";

export const QA_RULE_UNKNOWN = "QA_RULE_UNKNOWN";
export const QA_RULE_ERROR = "QA_RULE_ERROR";
const DECISION_SAMPLE = 100;

export type QaOutcome = "passed" | "rejected" | "held";

/** The rules the QA stage runs, in config order; a listed rule without a file is a configuration error. */
export function activeRules(config: { rules: QaRuleConfig[] }): QaRuleConfig[] {
  const active = config.rules.filter((entry) => entry.stage === "qa" && entry.enabled);
  for (const entry of active) {
    if (!QA_RULES.has(entry.rule)) throw new Error(`${QA_RULE_UNKNOWN}: config/qa.yaml lists ${entry.rule} but packages/pipeline/src/qa/rules/${entry.rule}.ts is not registered`);
  }
  return active;
}

/** The decision the verdicts imply under the config (auto_pass soft fails do not hold the draft). */
export function decide(verdicts: QaVerdict[], entries: Map<string, QaRuleConfig>): { outcome: QaOutcome; failed: string[]; autoPassed: string[] } {
  const failed: string[] = [];
  const autoPassed: string[] = [];
  let hard = false;
  let held = false;
  for (const v of verdicts) {
    if (v.pass) continue;
    failed.push(v.rule);
    if (v.severity === "hard") hard = true;
    else if (entries.get(v.rule)?.auto_pass) autoPassed.push(v.rule);
    else held = true;
  }
  return { outcome: hard ? "rejected" : held ? "held" : "passed", failed, autoPassed };
}

/**
 * Titles of the publications inside the comparison window (newest first), for the cross-article
 * rules (DUPLICATE_EVENT). The window is `normalize.published_window_days`, the same one normalize
 * uses for its title comparison, read in pages so a large archive is never cut to one select.
 */
export async function recentPublications(db: DbPort, now: Date, windowDays: number, pageSize: number): Promise<{ slug: string; title: string }[]> {
  const since = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const out: { slug: string; title: string }[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await db.select<Row>("publications", { status: "published" }, { columns: ["slug", "title", "published_at"], limit: pageSize, offset, orderBy: { column: "published_at", ascending: false } });
    for (const row of page) {
      const at = typeof row["published_at"] === "string" ? Date.parse(row["published_at"]) : Number.NaN;
      if (Number.isFinite(at) && at < since) return out;
      if (typeof row["slug"] === "string" && typeof row["title"] === "string") out.push({ slug: row["slug"], title: row["title"] });
    }
    if (page.length < pageSize) return out;
  }
}

export function draftRowId(draft: DraftInsert): string {
  return draft.id ?? draftId(draft.candidate_id, draft.content_type, draft.prompt_version);
}

function draftSlug(draft: DraftInsert): string | null {
  const slug = (draft.body["brief"] as { slug?: unknown } | undefined)?.slug;
  return typeof slug === "string" ? slug : null;
}

export const qaStage: Stage<QaInput, QaOutput> = {
  name: "qa",
  input: QaInput,
  output: QaOutput,
  idempotencyKey: (input) => `qa:${input.drafts.map((draft) => draftRowId(draft)).sort().join("|")}`,
  async run(input, ctx: StageContext) {
    const started = Date.now();
    const rules = activeRules(ctx.qa);
    const entries = new Map(ctx.qa.rules.map((entry) => [entry.rule, entry]));
    const items = new Map<string, RawItemInsert>(input.rawItems.map((item) => [item.id ?? rawItemId(item.canonical_url), item]));
    const sources = new Map<string, SourceConfig>(input.sources.map((source) => [source.id, source]));
    const candidates = new Map<string, CandidateInsert>(input.candidates.filter((c) => c.id).map((c) => [c.id!, c]));
    const checkedAt = ctx.now;
    const published = rules.some((r) => r.rule === "DUPLICATE_EVENT")
      ? await recentPublications(ctx.adapters.db, ctx.now, ctx.config.normalize.published_window_days, ctx.config.normalize.published_page_size)
      : [];
    /** Titles of drafts that passed earlier in this run: two outlets' takes on one event in the same run are duplicates too. */
    const passedTitles: { slug: string; title: string }[] = [];

    const passed: DraftInsert[] = [];
    const verdicts: QaVerdict[] = [];
    const rows: QaResultInsert[] = [];
    const statusUpdates: DraftInsert[] = [];
    const decisions: QaDecision[] = [];
    const byRule: Record<string, QaRuleStat> = Object.fromEntries(rules.map((r) => [r.rule, { checked: 0, passed: 0, failed: 0, auto_passed: 0 }]));
    let rejected = 0;
    let held = 0;
    let hardFailed = 0;
    let softFailed = 0;
    let autoPassedTotal = 0;
    let ruleErrors = 0;

    for (const draft of input.drafts) {
      const id = draftRowId(draft);
      const sourceInfo = (draft.body["source"] ?? null) as { raw_item_id?: unknown } | null;
      const rawItemKey = sourceInfo && typeof sourceInfo.raw_item_id === "string" ? sourceInfo.raw_item_id : null;
      const item = rawItemKey ? items.get(rawItemKey) : undefined;
      const source = item ? sources.get(item.source_id) : undefined;
      const evidence: QaEvidence = {
        sourceText: item ? sourceTextOf(item, source) : null,
        source,
        rawItem: item,
        candidate: candidates.get(draft.candidate_id),
        bannedPhrases: ctx.bannedPhrases,
        recentPublishedTitles: [...published, ...passedTitles].filter((p) => p.slug !== draftSlug(draft)).map((p) => p.title),
        now: checkedAt,
      };

      const own: QaVerdict[] = [];
      for (const entry of rules) {
        const rule = QA_RULES.get(entry.rule)!;
        let v: QaVerdict;
        try {
          v = await rule.check(draft, evidence, entry);
        } catch (error) {
          ruleErrors += 1;
          const message = error instanceof Error ? error.message : String(error);
          ctx.logger.error("qa: rule threw; recorded as a failing verdict", { rule: entry.rule, draft_id: id, error: message });
          v = { rule: entry.rule, severity: entry.severity, pass: false, reason_code: entry.rule, evidence: { error: `${QA_RULE_ERROR}: ${message}`, params: entry.params }, checked_at: checkedAt.toISOString() };
        }
        v = { ...v, evidence: { ...v.evidence, qa_version: ctx.qa.version } };
        own.push(v);
        const stat = byRule[entry.rule]!;
        stat.checked += 1;
        if (v.pass) stat.passed += 1;
        else {
          stat.failed += 1;
          if (v.severity === "hard") hardFailed += 1;
          else softFailed += 1;
          if (v.severity === "soft" && entry.auto_pass) {
            stat.auto_passed += 1;
            autoPassedTotal += 1;
          }
        }
        rows.push({ draft_id: id, rule: v.rule, severity: v.severity, pass: v.pass, reason_code: v.reason_code, evidence: v.evidence, checked_at: v.checked_at });
      }
      verdicts.push(...own);

      const decision = decide(own, entries);
      if (decision.outcome === "passed") {
        passed.push(draft);
        const title = (draft.body["brief"] as { title_ko?: unknown } | undefined)?.title_ko;
        if (typeof title === "string") passedTitles.push({ slug: draftSlug(draft) ?? id, title });
      } else {
        if (decision.outcome === "rejected") rejected += 1;
        else held += 1;
        statusUpdates.push({ ...draft, id, review_status: decision.outcome === "rejected" ? "rejected" : "pending" });
      }
      const brief = (draft.body["brief"] ?? null) as { slug?: unknown; title_ko?: unknown } | null;
      if (decisions.length < DECISION_SAMPLE) {
        decisions.push({
          draft_id: id,
          slug: typeof brief?.slug === "string" ? brief.slug : null,
          title_ko: typeof brief?.title_ko === "string" ? brief.title_ko : null,
          source_id: item?.source_id ?? null,
          outcome: decision.outcome,
          failed_rules: decision.failed,
          auto_passed_rules: decision.autoPassed,
          failed_evidence: Object.fromEntries(own.filter((v) => !v.pass).map((v) => [v.rule, v.evidence])),
        });
      }
      ctx.logger.info("qa: draft judged", { draft_id: id, outcome: decision.outcome, failed: decision.failed, auto_passed: decision.autoPassed, source_id: item?.source_id ?? null });
    }

    if (rows.length > 0) await ctx.adapters.db.upsert("qa_results", rows as unknown as Record<string, unknown>[], ["draft_id", "rule", "checked_at"]);
    if (statusUpdates.length > 0) await ctx.adapters.db.upsert("drafts", statusUpdates as unknown as Record<string, unknown>[], ["candidate_id", "content_type", "prompt_version"]);

    const stats: QaStats = {
      drafts: input.drafts.length,
      passed: passed.length,
      rejected,
      held,
      verdicts: verdicts.length,
      hard_failed: hardFailed,
      soft_failed: softFailed,
      auto_passed: autoPassedTotal,
      rule_errors: ruleErrors,
      rules: rules.length,
      by_rule: byRule,
      decisions,
      ms: Date.now() - started,
    };
    ctx.logger.info("qa: finished", { drafts: stats.drafts, passed: stats.passed, rejected: stats.rejected, held: stats.held, verdicts: stats.verdicts, hard_failed: stats.hard_failed, soft_failed: stats.soft_failed, auto_passed: stats.auto_passed, rule_errors: stats.rule_errors, qa_version: ctx.qa.version });
    return { passed, verdicts, stats };
  },
};

export const qaSpec = defineStageSpec({
  stage: qaStage,
  select: (state) => ({ drafts: state.drafts, rawItems: state.rawItems, sources: state.sources, candidates: state.candidates }),
  merge: (state, output) => ({ ...state, passed: output.passed, verdicts: output.verdicts, qaStats: output.stats }),
  counts: (output) => ({
    drafts: output.stats.drafts,
    qa_passed: output.stats.passed,
    rejected: output.stats.rejected,
    held: output.stats.held,
    verdicts: output.stats.verdicts,
    hard_failed: output.stats.hard_failed,
    soft_failed: output.stats.soft_failed,
    auto_passed: output.stats.auto_passed,
    rule_errors: output.stats.rule_errors,
  }),
});
