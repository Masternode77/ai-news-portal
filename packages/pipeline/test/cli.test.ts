import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parsePipelineConfig, parseSourcesConfig } from "@cc/shared";
import { REPO_ROOT } from "./helpers.ts";

const run = promisify(execFile);
const BIN = resolve(REPO_ROOT, "packages/pipeline/bin/pipeline.ts");

async function cli(args: string[], env: NodeJS.ProcessEnv = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [BIN, ...args], { cwd: REPO_ROOT, env: { ...process.env, ...env }, maxBuffer: 10 * 1024 * 1024 });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string };
    return { code: typeof e.code === "number" ? e.code : 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

test("pipeline run --dry-run --fixture sample --replay --json exits 0 with a full funnel", async () => {
  const { code, stdout, stderr } = await cli(["run", "--dry-run", "--replay", "--fixture", "sample", "--json"], { CC_FLAG_STAGES_NORMALIZE: "true", CC_FLAG_STAGES_SCORE: "true", CC_FLAG_STAGES_GENERATE: "true", CC_FLAG_STAGES_QA: "true", CC_FLAG_STAGES_IMAGE: "true" });
  assert.equal(code, 0, stderr);
  const out = JSON.parse(stdout) as { status: string; funnel: Record<string, unknown>; stages: { stage: string; status: string }[]; ledger: { runs: unknown[]; stageEvents: unknown[] } };
  assert.equal(out.status, "done");
  assert.equal(out.stages.length, 7);
  assert.ok(out.stages.every((s) => s.status === "done"));
  const enabledSources = parseSourcesConfig(await readFile(resolve(REPO_ROOT, "config/sources.yaml"), "utf8")).filter((s) => s.enabled).length;
  const cap = parsePipelineConfig(await readFile(resolve(REPO_ROOT, "config/pipeline.yaml"), "utf8"), { env: {} }).config.caps.items_per_source;
  assert.equal(out.funnel["sources_configured"], enabledSources, "every enabled source in config/sources.yaml is configured");
  assert.equal(out.funnel["items_fetched"], cap, "the shared fixture yields the same newest items for every source, so unique urls == caps.items_per_source");
  assert.equal(out.funnel["sources_ok"], enabledSources, "the fixture adapter serves rss and html sources alike");
  assert.equal(out.ledger.runs.length, 1);
  assert.equal(out.ledger.stageEvents.length, 7);
  assert.ok(stderr.includes('"msg":"run summary"'));
});

test("normalize (3b) and score (3c) are off by default and --stage accepts a comma list", async () => {
  const off = await cli(["run", "--dry-run", "--replay", "--json"]);
  assert.equal(off.code, 0);
  const outOff = JSON.parse(off.stdout) as { stages: { stage: string; status: string; reason?: string }[] };
  assert.deepEqual(outOff.stages.find((s) => s.stage === "normalize"), { ...outOff.stages.find((s) => s.stage === "normalize"), status: "skipped", reason: "flag_off" });
  assert.deepEqual(outOff.stages.find((s) => s.stage === "score"), { ...outOff.stages.find((s) => s.stage === "score"), status: "skipped", reason: "flag_off" });
  assert.deepEqual(outOff.stages.find((s) => s.stage === "generate"), { ...outOff.stages.find((s) => s.stage === "generate"), status: "skipped", reason: "flag_off" }, "3d: generate is off by default");
  assert.deepEqual(outOff.stages.find((s) => s.stage === "image"), { ...outOff.stages.find((s) => s.stage === "image"), status: "skipped", reason: "flag_off" }, "3f: image is off by default");
  assert.deepEqual(outOff.stages.find((s) => s.stage === "qa"), { ...outOff.stages.find((s) => s.stage === "qa"), status: "skipped", reason: "flag_off" }, "3g: qa is off by default (nothing passes, fail-closed)");

  const two = await cli(["run", "--dry-run", "--replay", "--fixture", "dedupe", "--sources", "fixtures/sources/dedupe.yaml", "--stage", "ingest,normalize", "--json"], { CC_FLAG_STAGES_NORMALIZE: "true" });
  assert.equal(two.code, 0, two.stderr);
  const out = JSON.parse(two.stdout) as { funnel: Record<string, number>; stages: { stage: string; status: string }[]; normalizeStats: { pool: number; candidates: number; rejected: number; by_method: Record<string, number> } };
  assert.deepEqual(out.stages.filter((s) => s.status === "done").map((s) => s.stage), ["ingest", "normalize"]);
  assert.equal(out.funnel["items_fetched"], 12);
  assert.equal(out.normalizeStats.candidates, 6, "the dedupe fixture converges 12 items from 3 wires to 6 stories (seeded publication included)");
  assert.deepEqual(out.normalizeStats.by_method, { url: 2, title: 1, body: 1, title_key: 1, hash: 1 });
  assert.equal((await cli(["run", "--dry-run", "--replay", "--stage", ","])).code, 2);
});

test("the scoring fixture: 13 items → 6 pass the brief threshold → 2 selected from two sources, every row with reasons", async () => {
  const { code, stdout, stderr } = await cli(
    ["run", "--dry-run", "--replay", "--fixture", "scoring", "--sources", "fixtures/sources/scoring.yaml", "--stage", "ingest,normalize,score", "--json"],
    { CC_FLAG_STAGES_NORMALIZE: "true", CC_FLAG_STAGES_SCORE: "true" },
  );
  assert.equal(code, 0, stderr);
  const out = JSON.parse(stdout) as {
    funnel: Record<string, number>;
    stages: { stage: string; status: string; counts: Record<string, number> }[];
    scoreStats: { candidates: number; passed: number; selected: number; below_threshold: number; shortfall: number; decisions: { source_id: string; selected: boolean; tier: string | null; reject_reason: string | null; reasons: Record<string, string> }[] };
  };
  assert.deepEqual(out.stages.filter((s) => s.status === "done").map((s) => s.stage), ["ingest", "normalize", "score"]);
  const stats = out.scoreStats;
  assert.equal(stats.candidates, 13);
  assert.equal(out.funnel["items_scored"], 13);
  assert.equal(out.funnel["passed_gate"], stats.passed, "passed_gate is the threshold count, not the selection");
  assert.ok(stats.passed >= 5 && stats.below_threshold >= 5, `passed ${stats.passed}, below ${stats.below_threshold}`);
  assert.equal(stats.selected, 2, "caps.briefs_per_cycle.max");
  assert.equal(stats.shortfall, 0);
  const selected = stats.decisions.filter((d) => d.selected);
  assert.equal(new Set(selected.map((d) => d.source_id)).size, 2, "one per source");
  assert.ok(stats.decisions.every((d) => d.selected ? d.reject_reason === null : /^(BELOW_THRESHOLD|NOT_SELECTED): /.test(d.reject_reason ?? "")));
  assert.ok(stats.decisions.every((d) => ["relevance", "timeliness", "impact", "reader_value", "insight_potential"].every((axis) => d.reasons[axis]!.length > 0)), "every candidate carries a reason per axis");
  assert.equal(out.stages.find((s) => s.stage === "score")?.counts["selected"], 2);
});

test("CC_FLAG_STAGES_IMAGE=false turns the image stage off from the environment", async () => {
  const { code, stdout } = await cli(["run", "--dry-run", "--replay", "--json"], { CC_FLAG_STAGES_IMAGE: "false" });
  assert.equal(code, 0);
  const out = JSON.parse(stdout) as { stages: { stage: string; status: string }[] };
  assert.equal(out.stages.find((s) => s.stage === "image")?.status, "skipped");
});

test("budget exhaustion after the first draft ends the run as budget_stop (exit 1) and keeps that draft", async () => {
  const yaml = (await readFile(resolve(REPO_ROOT, "config/pipeline.yaml"), "utf8")).replace(/max_calls:\s*\d+/, "max_calls: 1");
  assert.match(yaml, /max_calls: 1\b/);
  const file = join(await mkdtemp(join(tmpdir(), "cc-budget-")), "pipeline.yaml");
  await writeFile(file, yaml);
  const { code, stdout, stderr } = await cli(
    ["run", "--dry-run", "--replay", "--fixture", "scoring", "--sources", "fixtures/sources/scoring.yaml", "--stage", "ingest,normalize,score,generate", "--config", file, "--json"],
    { CC_FLAG_STAGES_NORMALIZE: "true", CC_FLAG_STAGES_SCORE: "true", CC_FLAG_STAGES_GENERATE: "true" },
  );
  assert.equal(code, 1, stderr);
  const result = JSON.parse(stdout);
  assert.equal(result.status, "budget_stop");
  assert.equal(result.generateStats.drafted, 1);
  assert.equal(result.generateStats.budget_stopped, 1);
  assert.equal(result.funnel.drafts, 1);
  assert.equal(result.funnel.top_error, "BUDGET_EXCEEDED");
  assert.equal(result.stages.find((s: { stage: string }) => s.stage === "generate")?.status, "done");
});

test("a live run is refused in Phase 2 and usage errors exit 2", async () => {
  assert.equal((await cli(["run"])).code, 2);
  assert.equal((await cli(["run", "--replay"])).code, 2, "a bare --replay would write the real run ledger");
  assert.equal((await cli(["frobnicate"])).code, 2);
  assert.equal((await cli(["run", "--dry-run", "--trigger", "cron"])).code, 2);
  const missing = await cli(["run", "--dry-run", "--config", "config/does-not-exist.yaml"]);
  assert.equal(missing.code, 2);
  assert.ok(missing.stderr.includes("ConfigError"));
});

test("--live is opt-in and needs --dry-run without --replay (Phase 3a)", async () => {
  assert.equal((await cli(["run", "--live"])).code, 2);
  assert.equal((await cli(["run", "--dry-run", "--live", "--replay"])).code, 2);
});

test("unknown CC_FLAG_* variables fail the run instead of being ignored", async () => {
  const { code, stderr } = await cli(["run", "--dry-run"], { CC_FLAG_STAGES_IMAGES: "false" });
  assert.equal(code, 2);
  assert.ok(stderr.includes("unknown stage"));
});

test("scoring fixture through generate, qa and image (Phase 3g): one draft passes every gate and gets a placeholder, the other is rejected for an ungrounded number, every verdict carries a reason_code", async () => {
  const { code, stdout, stderr } = await cli(["run", "--dry-run", "--replay", "--fixture", "scoring", "--sources", "fixtures/sources/scoring.yaml", "--stage", "ingest,normalize,score,generate,qa,image", "--json"], { CC_FLAG_STAGES_NORMALIZE: "true", CC_FLAG_STAGES_SCORE: "true", CC_FLAG_STAGES_GENERATE: "true", CC_FLAG_STAGES_QA: "true", CC_FLAG_STAGES_IMAGE: "true" });
  assert.equal(code, 0, stderr);
  const result = JSON.parse(stdout);
  assert.equal(result.status, "done");
  const qa = result.qaStats;
  assert.equal(qa.drafts, 2);
  assert.equal(qa.passed, 1);
  assert.equal(qa.rejected, 1);
  assert.equal(qa.held, 0);
  assert.equal(qa.rules, 12, "the 12 stage: qa rules of config/qa.yaml (IMAGE_MISSING belongs to the image stage)");
  assert.equal(qa.verdicts, 24, "every rule on every draft, no early stop");
  assert.equal(qa.rule_errors, 0);
  const byOutcome = Object.fromEntries(qa.decisions.map((d: { source_id: string; outcome: string; failed_rules: string[]; failed_evidence: Record<string, Record<string, unknown>> }) => [d.source_id, d]));
  assert.equal(byOutcome["scoring-wire-a"].outcome, "passed");
  assert.deepEqual(byOutcome["scoring-wire-a"].failed_rules, []);
  assert.equal(byOutcome["scoring-wire-b"].outcome, "rejected");
  assert.ok(byOutcome["scoring-wire-b"].failed_rules.includes("UNGROUNDED_NUMBER"));
  assert.deepEqual(byOutcome["scoring-wire-b"].failed_evidence["UNGROUNDED_NUMBER"]["ungrounded"], ["2027"]);
  const qaStage = result.stages.find((s: { stage: string }) => s.stage === "qa");
  assert.equal(qaStage.status, "done");
  assert.equal(qaStage.counts.qa_passed, 1);
  assert.equal(qaStage.counts.rejected, 1);
  const image = result.imageStats;
  assert.equal(image.passed, 1);
  assert.equal(image.with_images, 1);
  assert.equal(image.placeholders, 1);
  assert.equal(image.image_missing, 0, "placeholder-first is a choice, not a failure");
  assert.equal(result.funnel.qa_passed, 1);
  assert.equal(result.funnel.published, 0);
});

test("publish_target staging in a dry run (Phase 3h): the QA-passed draft is published into the memory DB, redirects are synced, revalidation stays off; none publishes nothing", async () => {
  const flags = { CC_FLAG_STAGES_NORMALIZE: "true", CC_FLAG_STAGES_SCORE: "true", CC_FLAG_STAGES_GENERATE: "true", CC_FLAG_STAGES_QA: "true", CC_FLAG_STAGES_IMAGE: "true" };
  const args = ["run", "--dry-run", "--replay", "--fixture", "scoring", "--sources", "fixtures/sources/scoring.yaml", "--stage", "ingest,normalize,score,generate,qa,image,publish", "--json"];
  const staging = await cli(args, { ...flags, CC_FLAG_PUBLISH_TARGET: "staging" });
  assert.equal(staging.code, 0, staging.stderr);
  const result = JSON.parse(staging.stdout);
  assert.equal(result.status, "done");
  const p = result.publishStats;
  assert.deepEqual([p.target, p.candidates, p.published, p.inserted, p.failed, p.redirects_synced, p.revalidate.skipped], ["staging", 1, 1, 1, 0, 4, true]);
  assert.equal(result.funnel.published, 1);
  assert.match(p.decisions[0].url, /^https:\/\/www\.computecurrent\.com\/news\/[0-9a-f]{16}\/$/);
  const none = await cli(args, flags);
  assert.equal(none.code, 0, none.stderr);
  const quiet = JSON.parse(none.stdout);
  assert.equal(quiet.publishStats.target, "none");
  assert.equal(quiet.publishStats.published, 0);
  assert.equal(quiet.publishStats.decisions[0].action, "dry");
  assert.equal(quiet.funnel.published, 0);
});

test("3i: every run ends with the ADR-007 summary in the log and the JSON; Telegram is off by default (skipped), CC_FLAG_NOTIFY_TELEGRAM=true under --replay records a failed, soft delivery and the token never leaks; enabled without the token is a config error", async () => {
  const off = await cli(["run", "--dry-run", "--replay", "--json"]);
  assert.equal(off.code, 0, off.stderr);
  const outOff = JSON.parse(off.stdout) as { notify: { channel: string; sent: boolean; skipped: string | null; attempts: number }; summary: { text: string; kind: string; zero_published_reasons: string[]; cost: { calls: number; cap_usd: number } }; budget: { calls: number; state: string } };
  assert.deepEqual(outOff.notify, { ...outOff.notify, channel: "telegram", sent: false, skipped: "disabled", attempts: 0 });
  assert.equal(outOff.summary.kind, "run_summary");
  assert.match(outOff.summary.text, /^\[CC pipeline\] \d{4}-\d{2}-\d{2} \d{2}:\d{2} KST · run [0-9a-f]{8} · done\nfetched \d+ \(sources /);
  assert.deepEqual(outOff.summary.zero_published_reasons, ["normalize: skipped (flag_off)"], "the first blocker with the default flags");
  assert.equal(outOff.summary.cost.cap_usd, 2);
  assert.equal(outOff.budget.state, "ok");
  assert.ok(off.stderr.includes('"msg":"run summary"'));

  const on = await cli(["run", "--dry-run", "--replay", "--json"], { CC_FLAG_NOTIFY_TELEGRAM: "true", TELEGRAM_BOT_TOKEN: "111:secret-token-value", TELEGRAM_CHAT_ID: "42" });
  assert.equal(on.code, 0, "a failed delivery is soft; the run result stands");
  const outOn = JSON.parse(on.stdout) as { notify: { sent: boolean; skipped: string | null; attempts: number; error: string | null }; ledger: { runs: { flags: Record<string, unknown> }[] } };
  assert.deepEqual([outOn.notify.sent, outOn.notify.skipped, outOn.notify.attempts], [false, null, 1]);
  assert.match(outOn.notify.error!, /^NETWORK_DISABLED: replay mode forbids network access/);
  assert.equal(outOn.ledger.runs[0]!.flags["notify_telegram"], true, "the override is in the run's flag snapshot");
  assert.ok(!on.stdout.includes("secret-token-value") && !on.stderr.includes("secret-token-value"), "the token never reaches stdout or the log");
  assert.ok(on.stderr.includes("telegram delivery failed (soft"));

  const missing = await cli(["run", "--dry-run", "--replay", "--json"], { CC_FLAG_NOTIFY_TELEGRAM: "true", TELEGRAM_BOT_TOKEN: "", TELEGRAM_CHAT_ID: "" });
  assert.equal(missing.code, 2);
  assert.match(missing.stderr, /TELEGRAM_BOT_TOKEN is required when notify.telegram.enabled is true/);
  assert.equal((await cli(["run", "--dry-run", "--replay", "--json"], { CC_FLAG_NOTIFY_TELEGRAM: "maybe" })).code, 2, "a non-boolean flag value fails loudly");
});

test("3i: pipeline ops --from assesses a run dump; a fresh completed run is ok (exit 0), a stale ledger exits 1, Supabase without names is a config error", async () => {
  const fresh = await cli(["run", "--dry-run", "--replay", "--json"]);
  assert.equal(fresh.code, 0, fresh.stderr);
  const dir = await mkdtemp(join(tmpdir(), "cc-ops-"));
  const freshFile = join(dir, "fresh.json");
  await writeFile(freshFile, fresh.stdout);
  const ok = await cli(["ops", "--from", freshFile, "--json"]);
  assert.equal(ok.code, 0, ok.stderr);
  const report = JSON.parse(ok.stdout) as { status: string; last_success: { status: string } | null; text: string; stale_after_hours: number };
  assert.equal(report.status, "ok");
  assert.equal(report.last_success?.status, "done");
  assert.equal(report.stale_after_hours, 12, "config/pipeline.yaml slot_hours 8 × 1.5");
  assert.match(report.text, /^\[CC ops\] .* · OK\n/);

  const dump = JSON.parse(fresh.stdout) as { ledger: { runs: { started_at: string; ended_at: string | null }[] } };
  const twoDaysAgo = new Date(Date.now() - 48 * 3_600_000).toISOString();
  dump.ledger.runs[0]!.started_at = twoDaysAgo;
  dump.ledger.runs[0]!.ended_at = twoDaysAgo;
  const staleFile = join(dir, "stale.json");
  await writeFile(staleFile, JSON.stringify(dump));
  const stale = await cli(["ops", "--from", staleFile]);
  assert.equal(stale.code, 1);
  assert.match(stale.stdout, /· STALE\n/);

  const noDb = await cli(["ops"], { SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" });
  assert.equal(noDb.code, 2);
  assert.match(noDb.stderr, /SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required/);
  await rm(dir, { recursive: true, force: true });
});
