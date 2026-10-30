import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parsePipelineConfig, parseSourcesConfig } from "@cc/shared";
import type { PipelineConfig } from "@cc/shared";
import { createSitePublisher } from "../src/adapters/index.ts";
import { MemoryDb } from "../src/db/index.ts";
import { buildRunSummary, collectFailures, formatLocal, formatRunCrash, renderNotification, zeroPublishedReasons } from "../src/notify/index.ts";
import type { SummaryOptions } from "../src/notify/index.ts";
import { runPipeline } from "../src/runner.ts";
import type { RunOptions } from "../src/runner.ts";
import { REPO_ROOT, TEST_PIPELINE_YAML, baseRunOptions, fixtureAdapters } from "./helpers.ts";
import { REDIRECTS } from "./site-publisher.test.ts";

const STAGING_YAML = `${TEST_PIPELINE_YAML.replace("publish_target: none", "publish_target: staging")}\npublish: { base_url: https://example.test }\n`;

function options(cfg: PipelineConfig, over: Partial<SummaryOptions> = {}): SummaryOptions {
  return { summary: cfg.notify.summary, capUsd: cfg.budget.run_usd, softWarnUsd: cfg.budget.soft_warn_usd, trigger: "schedule", dryRun: true, replay: true, fixtureName: "scoring", gitSha: null, runUrl: null, ...over };
}

async function scoringRun(yaml = STAGING_YAML, over: Partial<RunOptions> = {}) {
  const cfg = parsePipelineConfig(yaml, { env: {} }).config;
  const db = new MemoryDb();
  const adapters = { ...fixtureAdapters(db, "scoring"), publishers: { site: createSitePublisher({ publish: cfg.publish, redirects: REDIRECTS }) } };
  const sources = parseSourcesConfig(await readFile(resolve(REPO_ROOT, "fixtures/sources/scoring.yaml"), "utf8"));
  const result = await runPipeline(baseRunOptions({ config: cfg, db, adapters, sources, fixtureName: "scoring", ...over }));
  return { cfg, result };
}

test("formatLocal renders a fixed-offset header (KST has no DST)", () => {
  assert.equal(formatLocal("2026-10-17T15:45:00.000Z", "Asia/Seoul"), "2026-10-18 00:45 KST");
  assert.equal(formatLocal("2026-10-17T15:45:00.000Z", "UTC"), "2026-10-17 15:45 UTC");
});

test("done run with one publication: header, funnel line, the published link with its title, the QA rejection in the failures line, cost and mode lines, the Actions link last", async () => {
  const { cfg, result } = await scoringRun();
  assert.equal(result.status, "done");
  const summary = buildRunSummary(result, options(cfg, { runUrl: "https://github.com/x/y/actions/runs/1" }));
  assert.equal(summary.started_local, "2026-10-18 09:45 KST", "baseRunOptions.now is 00:45Z");
  assert.equal(summary.published.length, 1);
  assert.match(summary.published[0]!.slug, /^news\/[0-9a-f]{16}$/);
  assert.equal(summary.published[0]!.content_type, "news_brief");
  assert.ok(summary.published[0]!.title && summary.published[0]!.title.length >= 10, "the brief title is looked up from the draft");
  assert.deepEqual(summary.zero_published_reasons, []);
  assert.ok(summary.failures.some((f) => f.code === "UNGROUNDED_NUMBER" && f.count === 1 && f.sample?.startsWith("news/")), JSON.stringify(summary.failures));
  assert.equal(summary.cost.cap_usd, 2);
  assert.equal(summary.cost.spent_usd, result.costTotalUsd);
  const { kind, text } = renderNotification(summary);
  assert.equal(kind, "run_summary");
  const lines = text.split("\n");
  assert.equal(lines[0], `[CC pipeline] 2026-10-18 09:45 KST · run ${result.runId.slice(0, 8)} · done`);
  assert.match(lines[1]!, /^fetched 13 \(sources 5\/5 ok\) → new 13 → scored 13 → gate \d+ → drafts 2 → qa 1 → published 1$/);
  assert.match(text, /\n• news_brief: \/news\/[0-9a-f]{16}\/ — "[^"]{10,}"\n/);
  assert.match(text, /\nfailures \(top \d\): [^\n]*UNGROUNDED_NUMBER ×1 \(news\/[0-9a-f]{16}\)/);
  assert.match(text, /\ncost USD 0\.00 \/ cap 2\.00 · calls \d+[^\n]* · \d+ (ms|s|min)\n/);
  assert.match(text, /\ndry-run · replay · fixture scoring\n/);
  assert.ok(text.endsWith("\nhttps://github.com/x/y/actions/runs/1"));
  assert.ok(!text.includes("no publication:"));
  assert.ok(text.length < 1200, "fits a Telegram message without a cut");
});

test("publish_target none: nothing published, the reason line names the dry target and how many would have been written", async () => {
  const { cfg, result } = await scoringRun(`${TEST_PIPELINE_YAML}\npublish: { base_url: https://example.test }\n`);
  assert.equal(result.funnel.published, 0);
  const summary = buildRunSummary(result, options(cfg));
  assert.deepEqual(summary.zero_published_reasons, ["publish: target none (dry, 1 would publish)"]);
  assert.match(renderNotification(summary).text, /\nno publication: publish: target none \(dry, 1 would publish\)\n/);
});

test("qa flag off is the first blocker (fail-closed), not the empty stages after it", async () => {
  const { cfg, result } = await scoringRun(STAGING_YAML.replace("qa: true", "qa: false"));
  assert.equal(result.stages.find((s) => s.stage === "qa")?.status, "skipped");
  const summary = buildRunSummary(result, options(cfg));
  assert.deepEqual(summary.zero_published_reasons, ["qa: skipped (flag_off) — fail-closed, nothing passes"]);
});

test("every source failing: partial run, SOURCE_UNREACHABLE counted with the source as sample, ingest named as the blocker", async () => {
  const opts = baseRunOptions();
  opts.adapters.sources["rss"] = { type: "rss", fetch: async () => { throw new Error("SOURCE_UNREACHABLE: 503"); } };
  const result = await runPipeline(opts);
  assert.equal(result.status, "partial");
  const summary = buildRunSummary(result, options(opts.config, { fixtureName: "sample", trigger: "dispatch", runUrl: null }));
  assert.deepEqual(summary.failures, [{ code: "SOURCE_UNREACHABLE", count: 1, sample: "eia-today-in-energy" }]);
  assert.deepEqual(summary.zero_published_reasons, ["ingest: 0/1 sources ok"]);
  const { kind, text } = renderNotification(summary);
  assert.equal(kind, "run_summary", "partial runs use the summary template");
  assert.match(text, /· partial\n/);
  assert.match(text, /\nno publication: ingest: 0\/1 sources ok\n/);
  assert.match(text, /\nfailures \(top 1\): SOURCE_UNREACHABLE ×1 \(eia-today-in-energy\)\n/);
  assert.match(text, /\ndry-run · replay · fixture sample · trigger dispatch$/);
});

test("budget stop: the failure template leads with BUDGET_EXCEEDED and the stop reason, generation stopped, QA-passed drafts still flow", async () => {
  const { cfg, result } = await scoringRun(STAGING_YAML.replace("max_calls: 60", "max_calls: 1"), { only: ["ingest", "normalize", "score", "generate"] });
  assert.equal(result.status, "budget_stop");
  assert.equal(result.budget.calls, 1);
  assert.ok(result.budget.stop_reason, "the generate stage recorded why it stopped");
  const summary = buildRunSummary(result, options(cfg));
  assert.ok(summary.failures.some((f) => f.code === "BUDGET_EXCEEDED"), JSON.stringify(summary.failures));
  const { kind, text } = renderNotification(summary);
  assert.equal(kind, "run_failure");
  const lines = text.split("\n");
  assert.equal(lines[0], `[CC pipeline] ⚠ 2026-10-18 09:45 KST · run ${result.runId.slice(0, 8)} · BUDGET_STOP`);
  assert.match(lines[1]!, /^BUDGET_EXCEEDED: .* — generation stopped, QA-passed drafts still published$/);
  assert.match(text, /\nfetched 13 /);
  assert.match(text, /\nno publication: qa: skipped \(not_selected\)/);
  assert.match(text, /\ncost USD 0\.00 \/ cap 2\.00 · calls 1/);
});

test("collectFailures and zeroPublishedReasons are empty for a clean run with publications; the crash template names the error and the trigger", async () => {
  const { result } = await scoringRun();
  assert.deepEqual(zeroPublishedReasons(result), []);
  assert.ok(collectFailures(result).every((f) => f.count >= 1));
  const text = formatRunCrash({ runId: null, startedAt: "2026-10-17T15:45:00.000Z", timezone: "Asia/Seoul", error: "ConfigError: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required", trigger: "dispatch", runUrl: "https://github.com/x/y/actions/runs/2" });
  assert.deepEqual(text.split("\n"), [
    "[CC pipeline] ⚠ 2026-10-18 00:45 KST · run ? · FAILED",
    "crashed outside a stage (SUPABASE_URL): ConfigError: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
    "trigger dispatch",
    "https://github.com/x/y/actions/runs/2",
  ]);
  const withId = formatRunCrash({ runId: "0123456789abcdef", startedAt: "2026-10-17T15:45:00.000Z", timezone: "UTC", error: "TypeError: boom", trigger: "schedule", runUrl: null });
  assert.equal(withId, "[CC pipeline] ⚠ 2026-10-17 15:45 UTC · run 01234567 · FAILED\ncrashed outside a stage (TypeError): TypeError: boom");
});

test("an all-seen ingest is the stopping stage only when nothing was scored — seen items are re-scored every run (run 375fc076, 2026-10-30)", async () => {
  const { result } = await scoringRun(STAGING_YAML, { only: ["ingest", "normalize", "score"] });
  assert.equal(result.funnel.published, 0);
  assert.ok(result.funnel.items_scored > 0, "the scoring fixture scores every candidate");
  const seen = { ...result, funnel: { ...result.funnel, items_new: 0 } };
  const reasons = zeroPublishedReasons(seen);
  assert.equal(reasons.length, 1);
  assert.doesNotMatch(reasons[0]!, /^ingest:/, `new 0 but ${seen.funnel.items_scored} scored: ingest is not where the flow stopped (got ${reasons[0]})`);
  const nothing = { ...seen, funnel: { ...seen.funnel, items_scored: 0 }, state: { ...seen.state, normalizeStats: { ...seen.state.normalizeStats, pool: 0, candidates: 0 } } };
  assert.match(zeroPublishedReasons(nothing)[0]!, /^ingest: 0 new items \(13 fetched, all seen\)$/);
});
