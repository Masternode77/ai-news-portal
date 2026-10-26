import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parsePipelineConfig, parseSourcesConfig, silentLogger } from "@cc/shared";
import type { QaConfig, QaRuleConfig, StageContext } from "@cc/shared";
import { createFixtureImageAdapter, createImageChain, createPlaceholderImageAdapter, MemoryImageStore } from "../src/adapters/index.ts";
import { createBudget } from "../src/budget.ts";
import { MemoryDb } from "../src/db/index.ts";
import { MemoryLedger } from "../src/ledger/index.ts";
import { runPipeline } from "../src/runner.ts";
import { IMAGE_MISSING, imageStage } from "../src/stages/image.ts";
import { QA_RULE_UNKNOWN, activeRules, decide, qaStage } from "../src/stages/qa.ts";
import { ImageOutput, QaOutput } from "../src/stages/types.ts";
import { baseRunOptions, fixtureAdapters, REPO_ROOT, TEST_PIPELINE_YAML, testBannedPhrases, testQa, testScoring } from "./helpers.ts";
import { BRIEF, NOW, THIN_LENS, candidate, draft, rawItem, source } from "./qa-fixtures.ts";

function ctxWith(qa: QaConfig = testQa()): { ctx: StageContext; db: MemoryDb } {
  const cfg = parsePipelineConfig(TEST_PIPELINE_YAML, { env: {} }).config;
  const db = new MemoryDb();
  const ctx: StageContext = { runId: "11111111-1111-4111-8111-111111111111", now: NOW, config: cfg, scoring: testScoring(), bannedPhrases: testBannedPhrases(), qa, logger: silentLogger(), ledger: new MemoryLedger(), budget: createBudget(cfg.budget), dryRun: true, replay: true, fixtureName: undefined, fetch: () => Promise.reject(new Error("no network")), adapters: { ...fixtureAdapters(db), imageStore: new MemoryImageStore(), db } };
  return { ctx, db };
}

function withRule(qa: QaConfig, rule: string, patch: Partial<QaRuleConfig>): QaConfig {
  return { ...qa, rules: qa.rules.map((entry) => (entry.rule === rule ? { ...entry, ...patch } : entry)) };
}

const input = (drafts: ReturnType<typeof draft>[]) => ({ drafts, rawItems: [rawItem()], sources: [source()], candidates: [candidate()] });

test("every enabled qa rule runs on every draft in config order with no early stop; every verdict carries reason_code, params and the config version; qa_results and the review status are written; the decision is per draft", async () => {
  const { ctx, db } = ctxWith();
  const clean = draft();
  const dirty = draft({ ...BRIEF, title_ko: "게임 체인저가 된 부산 1.2 GW 계약", summary_ko: `${BRIEF.summary_ko} 2027년에 다음 단계가 시작된다.` }, { promptVersion: "2026-10-25.2" });
  assert.notEqual(clean.id, dirty.id);
  const out = QaOutput.parse(await qaStage.run(input([clean, dirty]), ctx));
  const order = activeRules(ctx.qa).map((r) => r.rule);
  assert.equal(order.length, 12);
  assert.equal(order.includes("IMAGE_MISSING"), false, "stage: image entries are not qa rules");
  assert.equal(out.verdicts.length, 24, "12 rules × 2 drafts");
  assert.deepEqual(out.verdicts.slice(0, 12).map((v) => v.rule), order, "config order on the clean draft");
  assert.deepEqual(out.verdicts.slice(12).map((v) => v.rule), order, "config order on the failing draft — the stage does not stop at the first hard failure");
  for (const v of out.verdicts) {
    assert.equal(v.reason_code, v.rule);
    assert.equal(v.evidence["qa_version"], ctx.qa.version);
    assert.ok("params" in v.evidence);
    assert.equal(v.checked_at, NOW.toISOString());
  }
  assert.deepEqual(out.passed.map((d) => d.id), [clean.id]);
  const rows = db.rows("qa_results");
  assert.equal(rows.length, 24, "every verdict is a qa_results row (R6)");
  assert.deepEqual(rows.filter((r) => r["draft_id"] === dirty.id && r["pass"] === false).map((r) => r["rule"]), ["UNGROUNDED_NUMBER", "BANNED_PATTERN"]);
  assert.equal(rows.filter((r) => r["draft_id"] === clean.id && r["pass"] === false).length, 0);
  const statusRows = db.rows("drafts");
  assert.equal(statusRows.length, 1, "only a draft that did not pass gets a status row from QA");
  assert.equal(statusRows[0]!["id"], dirty.id);
  assert.equal(statusRows[0]!["review_status"], "rejected");
  const s = out.stats;
  assert.deepEqual([s.drafts, s.passed, s.rejected, s.held, s.verdicts, s.hard_failed, s.soft_failed, s.auto_passed, s.rule_errors, s.rules], [2, 1, 1, 0, 24, 2, 0, 0, 0, 12]);
  assert.deepEqual(s.by_rule["UNGROUNDED_NUMBER"], { checked: 2, passed: 1, failed: 1, auto_passed: 0 });
  assert.deepEqual(s.by_rule["BANNED_PATTERN"], { checked: 2, passed: 1, failed: 1, auto_passed: 0 });
  assert.equal(s.decisions.length, 2);
  assert.equal(s.decisions[0]!.outcome, "passed");
  assert.deepEqual(s.decisions[1]!.failed_rules, ["UNGROUNDED_NUMBER", "BANNED_PATTERN"]);
  assert.deepEqual(s.decisions[1]!.failed_evidence["UNGROUNDED_NUMBER"]!["ungrounded"], ["2027"]);
  assert.deepEqual(s.decisions[1]!.failed_evidence["BANNED_PATTERN"]!["matches"], ["phrase:게임 체인저"]);
  assert.equal(s.decisions[1]!.source_id, "a");
  assert.equal(qaStage.idempotencyKey(input([dirty, clean])), `qa:${[clean.id, dirty.id].sort().join("|")}`, "order-independent idempotency key");
});

test("a soft failure holds the draft (review_status pending) unless the config entry has auto_pass; the decision helper never auto-passes a hard rule", async () => {
  const thin = draft({ ...BRIEF, expert_lens_ko: THIN_LENS });
  const strict = withRule(testQa(), "THIN_EXPERT_LENS", { auto_pass: false });
  const held = ctxWith(strict);
  const outHeld = QaOutput.parse(await qaStage.run(input([thin]), held.ctx));
  assert.deepEqual(outHeld.passed, []);
  assert.equal(outHeld.stats.held, 1);
  assert.equal(outHeld.stats.soft_failed, 1);
  assert.equal(outHeld.stats.auto_passed, 0);
  assert.equal(outHeld.stats.decisions[0]!.outcome, "held");
  assert.deepEqual(outHeld.stats.decisions[0]!.failed_rules, ["THIN_EXPERT_LENS"]);
  assert.equal(held.db.rows("drafts")[0]!["review_status"], "pending", "human-review queue (ADR-004)");

  const lenient = ctxWith();
  const outPassed = QaOutput.parse(await qaStage.run(input([thin]), lenient.ctx));
  assert.equal(outPassed.passed.length, 1, "auto_pass lets the shadow period collect data without blocking");
  assert.equal(outPassed.stats.auto_passed, 1);
  assert.equal(outPassed.stats.soft_failed, 1, "the failing soft verdict is still recorded");
  assert.deepEqual(outPassed.stats.decisions[0]!.auto_passed_rules, ["THIN_EXPERT_LENS"]);
  assert.equal(outPassed.stats.by_rule["THIN_EXPERT_LENS"]!.auto_passed, 1);
  assert.equal(lenient.db.rows("drafts").length, 0);
  assert.equal(lenient.db.rows("qa_results").filter((r) => r["pass"] === false).length, 1);

  const entries = new Map<string, QaRuleConfig>([["H", { rule: "H", severity: "hard", enabled: true, stage: "qa", params: {}, auto_pass: true } as QaRuleConfig]]);
  const verdict = { rule: "H", severity: "hard" as const, pass: false, reason_code: "H", evidence: {}, checked_at: NOW.toISOString() };
  assert.equal(decide([verdict], entries).outcome, "rejected", "auto_pass on a hard rule is a config error the schema rejects; the decision ignores it either way");
});

test("a configured rule without a file fails the run (QA_RULE_UNKNOWN); a disabled entry does not run; the registry decides nothing by itself", async () => {
  const unknown: QaConfig = { ...testQa(), rules: [...testQa().rules, { rule: "NOT_A_RULE", severity: "hard", enabled: true, stage: "qa", params: {} }] };
  await assert.rejects(qaStage.run(input([draft()]), ctxWith(unknown).ctx), new RegExp(`${QA_RULE_UNKNOWN}: config/qa.yaml lists NOT_A_RULE`));
  const disabled = ctxWith(withRule(testQa(), "SCHEMA_INVALID", { enabled: false }));
  const out = QaOutput.parse(await qaStage.run(input([draft()]), disabled.ctx));
  assert.equal(out.stats.rules, 11);
  assert.equal(out.verdicts.length, 11);
  assert.equal("SCHEMA_INVALID" in out.stats.by_rule, false);
  assert.equal(disabled.db.rows("qa_results").length, 11);
  const imageOnly: QaConfig = { ...testQa(), rules: [{ rule: "IMAGE_MISSING", severity: "soft", enabled: true, stage: "image", params: {}, auto_pass: true }] };
  assert.deepEqual(activeRules(imageOnly), [], "an image-stage entry is never run by qa and needs no qa rule file");
  const nothing = QaOutput.parse(await qaStage.run(input([draft()]), ctxWith(imageOnly).ctx));
  assert.equal(nothing.passed.length, 1, "no qa rules configured → nothing can fail (the config, not the registry, decides what runs)");
});

test("a rule that throws becomes a failing verdict (QA_RULE_ERROR) and the stage still completes; a hard one rejects the draft", async () => {
  const bad = withRule(testQa(), "SOURCE_UNREACHABLE", { params: { min_source_chars: "500" } });
  const { ctx, db } = ctxWith(bad);
  const out = QaOutput.parse(await qaStage.run(input([draft()]), ctx));
  const v = out.verdicts.find((x) => x.rule === "SOURCE_UNREACHABLE")!;
  assert.equal(v.pass, false);
  assert.match(String(v.evidence["error"]), /^QA_RULE_ERROR: QA_PARAM_INVALID: SOURCE_UNREACHABLE\.params\.min_source_chars/);
  assert.equal(v.evidence["qa_version"], bad.version);
  assert.equal(out.stats.rule_errors, 1);
  assert.equal(out.stats.rejected, 1);
  assert.deepEqual(out.passed, []);
  assert.equal(out.verdicts.length, 12, "the other rules still ran");
  assert.equal(db.rows("qa_results").filter((r) => r["rule"] === "SOURCE_UNREACHABLE")[0]!["pass"], false);
});

test("the image stage takes IMAGE_MISSING's severity from config/qa.yaml (stage: image entry), soft by default", async () => {
  const yaml = TEST_PIPELINE_YAML.replace("image: { provider: placeholder, fallback_chain: [placeholder] }", "image: { provider: fixture, fallback_chain: [placeholder] }");
  const cfg = parsePipelineConfig(yaml, { env: {} }).config;
  const emptyFixtures = await mkdtemp(join(tmpdir(), "cc-images-"));
  const run = async (qa: QaConfig) => {
    const { ctx, db } = ctxWith(qa);
    const chain = createImageChain(cfg.image, { placeholder: createPlaceholderImageAdapter(), fixture: createFixtureImageAdapter({ fixturesDir: emptyFixtures }) });
    const out = ImageOutput.parse(await imageStage.run({ passed: [draft()] }, { ...ctx, config: cfg, adapters: { ...ctx.adapters, image: chain } }));
    return { out, db };
  };
  const soft = await run(testQa());
  assert.equal(soft.out.verdicts.length, 1);
  assert.equal(soft.out.verdicts[0]!.rule, IMAGE_MISSING);
  assert.equal(soft.out.verdicts[0]!.severity, "soft");
  assert.equal(soft.db.rows("qa_results")[0]!["severity"], "soft");
  assert.equal(soft.out.withImages.length, 1, "soft + auto_pass (the shipped default) forwards the placeholder draft");
  const hard = await run(withRule(testQa(), IMAGE_MISSING, { severity: "hard", auto_pass: undefined }));
  assert.equal(hard.out.verdicts[0]!.severity, "hard", "one config line changes how a missing image is judged");
  assert.equal(hard.out.withImages.length, 0, "and a hard entry keeps the draft away from publish");
  assert.equal(hard.out.stats.rejected, 1);
  assert.equal(hard.db.rows("drafts")[0]!["review_status"], "rejected");
  const holding = await run(withRule(testQa(), IMAGE_MISSING, { auto_pass: false }));
  assert.equal(holding.out.withImages.length, 0);
  assert.equal(holding.out.stats.held, 1);
  assert.equal(holding.db.rows("drafts")[0]!["review_status"], "pending", "soft without auto_pass goes to the human-review queue");
  const disabled = await run(withRule(testQa(), IMAGE_MISSING, { enabled: false }));
  assert.equal(disabled.out.verdicts.length, 0, "a disabled entry emits nothing");
  assert.equal(disabled.out.withImages.length, 1);
  assert.equal(disabled.db.rows("qa_results").length, 0);
  assert.equal(disabled.out.stats.decisions[0]!.disposition, "forward");
});

test("end to end on the scoring fixture: generate → qa → image → publish(none) with the real rules: one draft passes and gets a placeholder, one is rejected for an ungrounded number, 24 qa_results rows, the rejected draft row is marked", async () => {
  const cfg = parsePipelineConfig(TEST_PIPELINE_YAML, { env: {} }).config;
  const db = new MemoryDb();
  const sources = parseSourcesConfig(await readFile(resolve(REPO_ROOT, "fixtures/sources/scoring.yaml"), "utf8"));
  const result = await runPipeline(baseRunOptions({ config: cfg, db, adapters: fixtureAdapters(db, "scoring"), sources, fixtureName: "scoring" }));
  assert.equal(result.status, "done", JSON.stringify(result.stages));
  const qa = result.stages.find((s) => s.stage === "qa")!;
  assert.equal(qa.status, "done");
  assert.deepEqual([qa.counts["drafts"], qa.counts["qa_passed"], qa.counts["rejected"], qa.counts["held"], qa.counts["verdicts"], qa.counts["rule_errors"]], [2, 1, 1, 0, 24, 0]);
  assert.equal(result.state.qaStats.passed, 1);
  const decisions = Object.fromEntries(result.state.qaStats.decisions.map((d) => [d.source_id, d]));
  assert.equal(decisions["scoring-wire-a"]!.outcome, "passed");
  assert.equal(decisions["scoring-wire-b"]!.outcome, "rejected");
  assert.ok(decisions["scoring-wire-b"]!.failed_rules.includes("UNGROUNDED_NUMBER"));
  assert.equal(db.rows("qa_results").length, 24);
  const rejected = db.rows("drafts").filter((r) => r["review_status"] === "rejected");
  assert.equal(rejected.length, 1);
  assert.equal(((rejected[0]!["body"] as Record<string, unknown>)["source"] as Record<string, unknown>)["source_id"], "scoring-wire-b");
  const image = result.stages.find((s) => s.stage === "image")!;
  assert.deepEqual([image.counts["passed"], image.counts["with_images"], image.counts["placeholders"], image.counts["image_missing"]], [1, 1, 1, 0]);
  assert.equal(result.funnel.qa_passed, 1);
  assert.equal(result.funnel.published, 0);
  assert.equal(result.stages.find((s) => s.stage === "publish")?.status, "done");
});
