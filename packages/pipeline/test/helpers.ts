import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseBannedPhrasesConfig, parsePipelineConfig, parseScoringConfig, parseSourcesConfig, silentLogger } from "@cc/shared";
import type { BannedPhrasesConfig, PipelineConfig, ScoringConfig, SourceConfig, StageAdapters } from "@cc/shared";
import {
  createFilePromptRegistry,
  createFixtureLlmAdapter,
  createFixtureRssAdapter,
  createNoopPublisher,
  createPlaceholderImageAdapter,
  MemoryImageStore,
} from "../src/adapters/index.ts";
import { MemoryDb } from "../src/db/index.ts";
import { MemoryLedger } from "../src/ledger/index.ts";
import type { RunOptions } from "../src/runner.ts";

export const REPO_ROOT = resolve(import.meta.dirname, "../../..");
export const FIXTURES_DIR = resolve(REPO_ROOT, "fixtures");

export const TEST_PIPELINE_YAML = `
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

export const TEST_SOURCES_YAML = `
- id: eia-today-in-energy
  name: EIA Today in Energy
  type: rss
  url: https://www.eia.gov/rss/todayinenergy.xml
  tier: 1
  enabled: true
  text_rights: full
- id: disabled-source
  name: Disabled
  type: rss
  url: https://example.com/disabled.xml
  tier: 3
  enabled: false
  text_rights: link_only
`;

export function testConfig(env: NodeJS.ProcessEnv = {}): { config: PipelineConfig; overrides: RunOptions["overrides"] } {
  const loaded = parsePipelineConfig(TEST_PIPELINE_YAML, { env });
  return { config: loaded.config, overrides: loaded.overrides };
}

export function testSources(): SourceConfig[] {
  return parseSourcesConfig(TEST_SOURCES_YAML);
}

let scoringCache: ScoringConfig | undefined;
/** The repo's `config/scoring.yaml` (deterministic, no network); tests override fields on a copy. */
export function testScoring(overrides: Partial<ScoringConfig> = {}): ScoringConfig {
  scoringCache ??= parseScoringConfig(readFileSync(resolve(REPO_ROOT, "config/scoring.yaml"), "utf8"), "config/scoring.yaml");
  return { ...scoringCache, ...overrides };
}

let bannedCache: BannedPhrasesConfig | undefined;
/** The repo's `config/banned-phrases.yaml` (Phase 3d); tests override fields on a copy. */
export function testBannedPhrases(overrides: Partial<BannedPhrasesConfig> = {}): BannedPhrasesConfig {
  bannedCache ??= parseBannedPhrasesConfig(readFileSync(resolve(REPO_ROOT, "config/banned-phrases.yaml"), "utf8"), "config/banned-phrases.yaml");
  return { ...bannedCache, ...overrides };
}

export function fixtureAdapters(db = new MemoryDb(), fixtureName = "sample"): StageAdapters {
  const fixture = createFixtureRssAdapter({ fixturesDir: FIXTURES_DIR, fixtureName });
  return {
    sources: { rss: fixture, html: { ...fixture, type: "html" } },
    llm: createFixtureLlmAdapter({ fixturesDir: FIXTURES_DIR }),
    image: createPlaceholderImageAdapter(),
    imageStore: new MemoryImageStore(),
    publishers: { site: createNoopPublisher({ baseUrl: "https://example.test" }) },
    db,
    prompts: createFilePromptRegistry({ promptsDir: resolve(REPO_ROOT, "prompts") }),
  };
}

export function fixedClock(start = Date.parse("2026-10-18T00:45:00Z"), stepMs = 1000): () => Date {
  let t = start;
  return () => {
    const d = new Date(t);
    t += stepMs;
    return d;
  };
}

export function baseRunOptions(overrides: Partial<RunOptions> = {}): RunOptions {
  const { config, overrides: flagOverrides } = testConfig();
  const db = new MemoryDb();
  return {
    config,
    scoring: testScoring(),
    bannedPhrases: testBannedPhrases(),
    overrides: flagOverrides,
    sources: testSources(),
    ledger: new MemoryLedger(),
    db,
    adapters: fixtureAdapters(db),
    logger: silentLogger(),
    trigger: "local",
    gitSha: "0123456789abcdef0123456789abcdef01234567",
    dryRun: true,
    replay: true,
    fixtureName: "sample",
    now: new Date("2026-10-18T00:45:00Z"),
    clock: fixedClock(),
    ...overrides,
  };
}
