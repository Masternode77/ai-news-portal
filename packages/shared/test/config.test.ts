import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ConfigError,
  loadBannedPhrasesConfig,
  loadPipelineConfig,
  loadRedirectsConfig,
  loadScoringConfig,
  loadSourcesConfig,
  parseBannedPhrasesConfig,
  parsePipelineConfig,
  parseRedirectsConfig,
  parsePromptFile,
  parseScoringConfig,
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

test("config/scoring.yaml (Phase 3c) loads strictly: weights sum to 1, thresholds ordered, patterns compile, unknown keys fail", async () => {
  const path = resolve(import.meta.dirname, "../../../config/scoring.yaml");
  const scoring = await loadScoringConfig(path);
  assert.equal(scoring.thresholds.full, 0.75);
  assert.equal(scoring.thresholds.brief, 0.55);
  assert.equal(scoring.thresholds.relevance_min, 0.55);
  assert.equal(scoring.insight_trigger, 0.7);
  assert.equal(Object.keys(scoring.relevance.dimensions).length, 8);
  assert.ok(scoring.impact.signals.every((s) => (s.terms === undefined) !== (s.pattern === undefined)));
  const text = readFileSync(path, "utf8");
  assert.throws(() => parseScoringConfig(text.replace("relevance: 0.35", "relevance: 0.5"), path), (e: unknown) => e instanceof ConfigError && /weights must sum to 1/.test(e.message));
  assert.throws(() => parseScoringConfig(text.replace("full: 0.75", "full: 0.5"), path), (e: unknown) => e instanceof ConfigError && /thresholds.full must be >= thresholds.brief/.test(e.message));
  assert.throws(() => parseScoringConfig(text.replace('hard_archive_exception_pattern: "\\\\bfossils?', 'hard_archive_exception_pattern: "(fossils?'), path), (e: unknown) => e instanceof ConfigError && /invalid regular expression/.test(e.message));
  assert.throws(() => parseScoringConfig(`${text}\nextra_key: 1\n`, path), (e: unknown) => e instanceof ConfigError && /extra_key/.test(e.message));
  assert.throws(() => parseScoringConfig(text.replace("- { max_hours: 8, score: 0.75 }", "- { max_hours: 2, score: 0.75 }"), path), (e: unknown) => e instanceof ConfigError && /ascending/.test(e.message));
});

test("config/banned-phrases.yaml (Phase 3d) loads strictly: languages, hook starts, named patterns that compile, no duplicates, no unknown keys", async () => {
  const path = resolve(import.meta.dirname, "../../../config/banned-phrases.yaml");
  const banned = await loadBannedPhrasesConfig(path);
  assert.match(banned.version, /^\d{4}-\d{2}-\d{2}\.\d+$/);
  assert.ok(banned.phrases.ko.includes("전략적 의미") && banned.phrases.en.includes("strategic significance"));
  assert.ok(banned.hook_starts.en.includes("The development"));
  assert.ok(banned.patterns.some((p) => p.name === "exclamation"));
  const text = readFileSync(path, "utf8");
  assert.throws(() => parseBannedPhrasesConfig(text.replace('- "게임 체인저"', '- "게임 체인저"\n    - "전략적  의미"'), path), (e: unknown) => e instanceof ConfigError && /duplicate phrase/.test(e.message));
  assert.throws(() => parseBannedPhrasesConfig(text.replace('regex: "[!！]"', 'regex: "[!！"'), path), (e: unknown) => e instanceof ConfigError && /invalid regular expression/.test(e.message));
  assert.throws(() => parseBannedPhrasesConfig(text.replace("- name: emoji", "- name: exclamation"), path), (e: unknown) => e instanceof ConfigError && /duplicate pattern name/.test(e.message));
  assert.throws(() => parseBannedPhrasesConfig(`${text}\nextra_key: 1\n`, path), (e: unknown) => e instanceof ConfigError && /extra_key/.test(e.message));
  assert.throws(() => parseBannedPhrasesConfig(text.replace("  ko: []\n", ""), path), ConfigError, "both languages are explicit");
});

test("prompt files (Phase 3d) carry a strict YAML front matter and the body is the system prompt", () => {
  const head = "---\ntask: news_brief\nversion: 2026-10-23.1\nmodel_hint: claude-opus-5-5\noutput_schema: NewsBriefDraft\nmax_output_tokens: 2500\n---\n";
  const file = parsePromptFile(`${head}\n당신은 편집자다.\n\n규칙 1.\n`, "prompts/news_brief.md");
  assert.equal(file.task, "news_brief");
  assert.equal(file.version, "2026-10-23.1");
  assert.equal(file.max_output_tokens, 2500);
  assert.equal(file.system, "당신은 편집자다.\n\n규칙 1.");
  assert.equal(file.path, "prompts/news_brief.md");
  assert.throws(() => parsePromptFile("task: news_brief\nno front matter"), ConfigError);
  assert.throws(() => parsePromptFile(`${head}`), ConfigError, "an empty system prompt is rejected");
  assert.throws(() => parsePromptFile("---\ntask: news_brief\nversion: 1\n---\nbody"), ConfigError, "missing header fields");
  assert.throws(() => parsePromptFile(head.replace("news_brief", "poem") + "body"), ConfigError, "task must be an LlmTask");
  assert.throws(() => parsePromptFile(head.replace("---\n", "temperature: 0.2\n---\n").replace(/^temperature/m, "---\ntask: news_brief\nversion: 1\nmodel_hint: m\noutput_schema: NewsBriefDraft\nmax_output_tokens: 10\ntemperature") + "body"), ConfigError, "unknown keys fail (strict)");
  assert.throws(() => parsePromptFile(head.replace("2500", "0") + "body"), ConfigError, "max_output_tokens must be positive");
});

test("publish block (Phase 3h): documented defaults when absent, strict keys, a lowercase token_env or an unknown slug_conflict is rejected; config/redirects.yaml loads with unique root paths", async () => {
  const defaults = parsePipelineConfig(SAMPLE_PIPELINE_YAML, { env: {} }).config.publish;
  assert.deepEqual(defaults, { base_url: "https://www.computecurrent.com", slug_conflict: "update", redirects_sync: true, revalidate: { enabled: false, token_env: "CC_REVALIDATE_TOKEN", timeout_ms: 10000, extra_paths: ["/"] } });
  const custom = parsePipelineConfig(`${SAMPLE_PIPELINE_YAML}\npublish: { base_url: https://preview.example.test, slug_conflict: skip, revalidate: { enabled: true, extra_paths: ["/", "/sitemap.xml"] } }\n`, { env: {} }).config.publish;
  assert.equal(custom.slug_conflict, "skip");
  assert.equal(custom.revalidate.enabled, true);
  assert.deepEqual(custom.revalidate.extra_paths, ["/", "/sitemap.xml"]);
  assert.throws(() => parsePipelineConfig(`${SAMPLE_PIPELINE_YAML}\npublish: { revalidate: { token_env: lower_case } }\n`, { env: {} }), ConfigError);
  assert.throws(() => parsePipelineConfig(`${SAMPLE_PIPELINE_YAML}\npublish: { slug_conflict: overwrite }\n`, { env: {} }), ConfigError);
  assert.throws(() => parsePipelineConfig(`${SAMPLE_PIPELINE_YAML}\npublish: { base_url: https://x.test, extra: 1 }\n`, { env: {} }), (e: unknown) => e instanceof ConfigError && /extra/.test(e.message));
  const redirects = await loadRedirectsConfig(resolve(import.meta.dirname, "../../../config/redirects.yaml"));
  assert.equal(redirects.length, 4);
  assert.ok(redirects.every((r) => r.status === 301 && r.from_path.startsWith("/") && r.to_path.startsWith("/")));
  assert.equal(new Set(redirects.map((r) => r.from_path)).size, 4);
  assert.ok(redirects.some((r) => r.from_path === "/author/rowan-hale/" && r.to_path === "/author/josh-inn/"));
});

test("notify block (Phase 3i): Telegram defaults when only `enabled` is given, strict keys, upper-case env names, run outcomes in `on`; CC_FLAG_NOTIFY_TELEGRAM overrides the switch", () => {
  const notify = parsePipelineConfig(SAMPLE_PIPELINE_YAML, { env: {} }).config.notify;
  assert.deepEqual(notify.telegram, { enabled: false, bot_token_env: "TELEGRAM_BOT_TOKEN", chat_id_env: "TELEGRAM_CHAT_ID", base_url: "https://api.telegram.org", timeout_ms: 10000, max_retries: 1, retry_backoff_ms: 1000, max_chars: 3800, on: ["done", "partial", "budget_stop", "failed"] });
  assert.deepEqual(notify.summary, { timezone: "Asia/Seoul", top_failures: 3, max_published: 5 });
  const custom = parsePipelineConfig(SAMPLE_PIPELINE_YAML.replace("notify: { telegram: { enabled: false } }", "notify: { telegram: { enabled: true, on: [failed, budget_stop], max_chars: 1000 }, summary: { timezone: UTC, top_failures: 5 } }"), { env: {} }).config.notify;
  assert.deepEqual(custom.telegram.on, ["failed", "budget_stop"]);
  assert.equal(custom.telegram.max_chars, 1000);
  assert.equal(custom.summary.timezone, "UTC");
  assert.throws(() => parsePipelineConfig(SAMPLE_PIPELINE_YAML.replace("notify: { telegram: { enabled: false } }", "notify: { telegram: { enabled: false, bot_token: abc } }"), { env: {} }), (e: unknown) => e instanceof ConfigError && /bot_token/.test(e.message), "a token value has no place in the config (strict)");
  assert.throws(() => parsePipelineConfig(SAMPLE_PIPELINE_YAML.replace("notify: { telegram: { enabled: false } }", "notify: { telegram: { enabled: false, bot_token_env: telegram_token } }"), { env: {} }), ConfigError);
  assert.throws(() => parsePipelineConfig(SAMPLE_PIPELINE_YAML.replace("notify: { telegram: { enabled: false } }", "notify: { telegram: { enabled: false, on: [started] } }"), { env: {} }), ConfigError, "started is never notified");
  assert.throws(() => parsePipelineConfig(SAMPLE_PIPELINE_YAML.replace("notify: { telegram: { enabled: false } }", "notify: { telegram: { enabled: false, max_chars: 5000 } }"), { env: {} }), ConfigError, "above the Bot API limit");
  const overridden = parsePipelineConfig(SAMPLE_PIPELINE_YAML, { env: { CC_FLAG_NOTIFY_TELEGRAM: "true" } });
  assert.equal(overridden.config.notify.telegram.enabled, true);
  assert.deepEqual(overridden.overrides.map((o) => [o.env, o.path, o.value]), [["CC_FLAG_NOTIFY_TELEGRAM", "notify.telegram.enabled", true]]);
  assert.throws(() => parsePipelineConfig(SAMPLE_PIPELINE_YAML, { env: { CC_FLAG_NOTIFY_TELEGRAM: "maybe" } }), ConfigError);
});
