/**
 * Phase 2 completion criterion: the site builds with zero published items.
 * Runs `astro build` for apps/site with SITE_DATA_SOURCE=empty and checks the
 * Vercel Build Output API artefacts exist.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const SITE_DIR = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(SITE_DIR, "../..");
const ASTRO_BIN = resolve(REPO_ROOT, "node_modules/astro/bin/astro.mjs");

test("astro build succeeds with SITE_DATA_SOURCE=empty and emits Vercel output", { timeout: 300_000 }, async () => {
  const { stdout, stderr } = await run(process.execPath, [ASTRO_BIN, "build"], {
    cwd: SITE_DIR,
    env: { ...process.env, SITE_DATA_SOURCE: "empty", CI: "1" },
    maxBuffer: 16 * 1024 * 1024,
  });
  const log = `${stdout}\n${stderr}`;
  assert.ok(/Complete|complete|built in/i.test(log), `build log did not report completion:\n${log.slice(-2000)}`);
  await access(resolve(SITE_DIR, ".vercel/output/config.json"));
  const config = JSON.parse(await readFile(resolve(SITE_DIR, ".vercel/output/config.json"), "utf8")) as { version: number; routes: unknown[] };
  assert.equal(config.version, 3);
  assert.ok(Array.isArray(config.routes) && config.routes.length > 0);
  await access(resolve(SITE_DIR, ".vercel/output/functions/_render.func/.vc-config.json"));
});
