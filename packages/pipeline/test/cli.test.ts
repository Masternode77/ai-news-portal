import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
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
  const { code, stdout, stderr } = await cli(["run", "--dry-run", "--replay", "--fixture", "sample", "--json"]);
  assert.equal(code, 0, stderr);
  const out = JSON.parse(stdout) as { status: string; funnel: Record<string, unknown>; stages: { stage: string; status: string }[]; ledger: { runs: unknown[]; stageEvents: unknown[] } };
  assert.equal(out.status, "done");
  assert.equal(out.stages.length, 7);
  assert.ok(out.stages.every((s) => s.status === "done"));
  assert.equal(out.funnel["sources_configured"], 5, "config/sources.yaml has five enabled sample sources");
  assert.equal(out.funnel["items_fetched"], 150, "the shared fixture is served to each of the five sources");
  assert.equal(out.ledger.runs.length, 1);
  assert.equal(out.ledger.stageEvents.length, 7);
  assert.ok(stderr.includes('"msg":"run summary"'));
});

test("CC_FLAG_STAGES_IMAGE=false turns the image stage off from the environment", async () => {
  const { code, stdout } = await cli(["run", "--dry-run", "--replay", "--json"], { CC_FLAG_STAGES_IMAGE: "false" });
  assert.equal(code, 0);
  const out = JSON.parse(stdout) as { stages: { stage: string; status: string }[] };
  assert.equal(out.stages.find((s) => s.stage === "image")?.status, "skipped");
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

test("unknown CC_FLAG_* variables fail the run instead of being ignored", async () => {
  const { code, stderr } = await cli(["run", "--dry-run"], { CC_FLAG_STAGES_IMAGES: "false" });
  assert.equal(code, 2);
  assert.ok(stderr.includes("unknown stage"));
});
