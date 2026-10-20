import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConfigError,
  loadPipelineConfig,
  loadSourcesConfig,
  parsePipelineConfig,
  parseRedirectsConfig,
  parseSourcesConfig,
} from "../src/index.ts";

export const SAMPLE_PIPELINE_YAML = `
schedule: { cron: "45 15,23,7 * * *", timezone: "UTC", slot_hours: 8 }
flags:
  stages: { ingest: true, normalize: true, score: true, generate: true, qa: true, image: true, publish: true }
  publish_target: none
caps:
  briefs_per_cycle: { min: 1, max: 2 }
  essays_per_day: 1
  pool_max_items: 200
  pool_max_age_days: 10
budget: { run_usd: 2.0, soft_warn_usd: 1.5, max_calls: 60 }
llm:
  provider: fixture
  models: { curate: claude-haiku-5-5, news_brief: claude-opus-5-5, expert_lens: claude-opus-5-5, insight_essay: claude-opus-5-5, qa_assist: claude-haiku-5-5 }
image: { provider: placeholder, fallback_chain: [placeholder] }
notify: { telegram: { enabled: false } }
`;

test("parsePipelineConfig accepts the documented shape", () => {
  const loaded = parsePipelineConfig(SAMPLE_PIPELINE_YAML, { env: {} });
  assert.equal(loaded.config.caps.briefs_per_cycle.max, 2);
  assert.equal(loaded.config.flags.publish_target, "none");
  assert.deepEqual(loaded.overrides, []);
});

test("unknown keys and missing keys fail loudly", () => {
  assert.throws(() => parsePipelineConfig(SAMPLE_PIPELINE_YAML.replace("essays_per_day: 1", "essays_per_day: 1\n  essay_per_day: 2"), { env: {} }), ConfigError);
  assert.throws(() => parsePipelineConfig(SAMPLE_PIPELINE_YAML.replace(/budget:.*\n/, ""), { env: {} }), ConfigError);
  assert.throws(() => parsePipelineConfig(SAMPLE_PIPELINE_YAML.replace("soft_warn_usd: 1.5", "soft_warn_usd: 3"), { env: {} }), /soft_warn_usd/);
});

test("invalid YAML is reported as a ConfigError with the path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cc-config-"));
  const path = join(dir, "broken.yaml");
  await writeFile(path, "schedule: [unclosed", "utf8");
  await assert.rejects(loadPipelineConfig(path, {}), (error: unknown) => error instanceof ConfigError && error.message.includes(path));
});

test("loadPipelineConfig reads a file and applies env overrides", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cc-config-"));
  const path = join(dir, "pipeline.yaml");
  await writeFile(path, SAMPLE_PIPELINE_YAML, "utf8");
  const loaded = await loadPipelineConfig(path, { CC_FLAG_STAGES_IMAGE: "false" });
  assert.equal(loaded.config.flags.stages.image, false);
  assert.equal(loaded.overrides.length, 1);
  assert.equal(loaded.path, path);
});

test("sources config enforces kebab ids, rights enum and unique ids", async () => {
  const good = `
- id: eia-today-in-energy
  name: EIA Today in Energy
  type: rss
  url: https://www.eia.gov/rss/todayinenergy.xml
  tier: 1
  enabled: true
  text_rights: full
  reviewed_at: 2026-10-18
`;
  assert.equal(parseSourcesConfig(good).length, 1);
  assert.throws(() => parseSourcesConfig(good + good), /duplicate source id/);
  assert.throws(() => parseSourcesConfig(good.replace("text_rights: full", "text_rights: maybe")), ConfigError);
  assert.throws(() => parseSourcesConfig(good.replace("id: eia-today-in-energy", "id: EIA Today")), ConfigError);
  const dir = await mkdtemp(join(tmpdir(), "cc-config-"));
  const path = join(dir, "sources.yaml");
  await writeFile(path, good, "utf8");
  assert.equal((await loadSourcesConfig(path))[0]?.id, "eia-today-in-energy");
});

test("text_scope: abstract on a full-rights source needs an abstract-only extractor", () => {
  const arxiv = (extract: string, rights = "full") => `
- id: arxiv-cs-dc
  name: arXiv cs.DC
  type: rss
  url: https://rss.arxiv.org/rss/cs.DC
  tier: 3
  enabled: true
  text_rights: ${rights}
  text_scope: abstract
${extract}`;
  assert.equal(parseSourcesConfig(arxiv("  extract:\n    kind: arxiv_abstract\n"))[0]?.extract?.kind, "arxiv_abstract");
  assert.equal(parseSourcesConfig(arxiv("  extract:\n    kind: none\n")).length, 1, "feed fields only is within the scope");
  assert.throws(() => parseSourcesConfig(arxiv("")), /abstract allows only extract\.kind arxiv_abstract or none .*generic extractor/, "no extract block means the generic page extractor");
  assert.throws(() => parseSourcesConfig(arxiv("  extract:\n    kind: generic\n")), ConfigError);
  assert.throws(() => parseSourcesConfig(arxiv("  extract:\n    kind: ec_press\n")), ConfigError);
  // Without full rights no page is fetched, so the scope needs no extractor.
  assert.equal(parseSourcesConfig(arxiv("", "rewrite_only")).length, 1);
});

test("redirects config rejects duplicate from_path and non-root paths", () => {
  assert.equal(parseRedirectsConfig("- { from_path: /author/rowan-hale, to_path: /author/josh-inn/, status: 301 }").length, 1);
  assert.throws(() => parseRedirectsConfig("- { from_path: /a, to_path: /b, status: 301 }\n- { from_path: /a, to_path: /c, status: 301 }"), /duplicate redirect/);
  assert.throws(() => parseRedirectsConfig("- { from_path: a, to_path: /b, status: 302 }"), ConfigError);
});
