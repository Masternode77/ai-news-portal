import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
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
  const { code, stdout, stderr } = await cli(["run", "--dry-run", "--replay", "--fixture", "sample", "--json"], { CC_FLAG_STAGES_NORMALIZE: "true", CC_FLAG_STAGES_SCORE: "true", CC_FLAG_STAGES_GENERATE: "true" });
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
