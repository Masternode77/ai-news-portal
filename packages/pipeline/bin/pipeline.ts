#!/usr/bin/env node
/**
 * cc-pipeline — CLI entry (brief Phase 2 §3, Phase 3a `--live`).
 *
 *   pipeline run [--stage <name>[,<name>]] [--dry-run] [--live] [--fixture <name>] [--replay]
 *                [--config <path>] [--sources <path>] [--scoring <path>] [--banned-phrases <path>] [--qa <path>] [--fixtures-dir <dir>] [--prompts-dir <dir>] [--images-dir <dir>]
 *                [--trigger schedule|dispatch|local] [--json] [--log-level <level>]
 *
 * Exit codes: 0 done · 1 partial/budget_stop · 2 failed, usage or config error.
 * Source adapters are fixtures unless `--live` swaps in the real RSS/Atom and
 * Epoch index adapters (Phase 3a). A fixture run also seeds the memory DB from
 * `fixtures/db/<fixture>.json` when that file exists (Phase 3b: publications
 * to dedupe against). Every run needs `--dry-run` (memory ledger
 * and DB, nothing written) until Phase 4 wires Supabase: a bare `--replay`
 * would keep adapters offline but still write the real run ledger. `--live`
 * cannot be combined with `--replay`, which forbids all network access.
 */
import { parseArgs } from "node:util";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { ConfigError, createLogger, isLogLevel, loadBannedPhrasesConfig, loadPipelineConfig, loadQaConfig, loadScoringConfig, loadSourcesConfig } from "@cc/shared";
import type { DbPort, Ledger, Logger, PipelineConfig, RunTrigger, SourceAdapter, LlmAdapter,
  StageAdapters, StageName, ImageAdapter, ImageProvider } from "@cc/shared";
import {
  HostPacer,
  createDisabledLlmAdapter,
  createEpochIndexAdapter,
  createAnthropicLlmAdapter,
  createFilePromptRegistry,
  createFixtureLlmAdapter,
  createFixtureRssAdapter,
  createLiveRssAdapter,
  createNoopPublisher,
  createPlaceholderImageAdapter,
  createFixtureImageAdapter,
  createOpenAiImageAdapter,
  createImageChain,
  imageChainOrder,
  MemoryImageStore,
  createLocalImageStore,
} from "../src/adapters/index.ts";
import { MemoryDb, SupabaseDb, seedMemoryDb } from "../src/db/index.ts";
import { MemoryLedger, SupabaseLedger } from "../src/ledger/index.ts";
import type { SupabaseLike } from "../src/ledger/index.ts";
import { resolveGitSha } from "../src/git.ts";
import { notifyConsole } from "../src/notify/console.ts";
import { disabledFetch, runPipeline } from "../src/runner.ts";

const USAGE = `usage: pipeline run [--stage <name>[,<name>]] [--dry-run] [--live] [--fixture <name>] [--replay]
                    [--config <path>] [--sources <path>] [--scoring <path>] [--banned-phrases <path>] [--qa <path>] [--fixtures-dir <dir>] [--prompts-dir <dir>] [--images-dir <dir>]
                    [--trigger schedule|dispatch|local] [--json] [--log-level debug|info|warn|error]`;

export interface Cli {
  command: string | undefined;
  stages: StageName[] | undefined;
  dryRun: boolean;
  live: boolean;
  fixture: string | undefined;
  replay: boolean;
  config: string;
  sources: string;
  scoring: string;
  bannedPhrases: string;
  qa: string;
  fixturesDir: string;
  promptsDir: string;
  /** Phase 3f: where generated image bytes are written; unset keeps them in memory for the run. */
  imagesDir: string | undefined;
  trigger: RunTrigger;
  json: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
}

export function parseCli(argv: string[]): Cli {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      stage: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      live: { type: "boolean", default: false },
      fixture: { type: "string" },
      replay: { type: "boolean", default: false },
      config: { type: "string", default: "config/pipeline.yaml" },
      sources: { type: "string", default: "config/sources.yaml" },
      scoring: { type: "string", default: "config/scoring.yaml" },
      "banned-phrases": { type: "string", default: "config/banned-phrases.yaml" },
      qa: { type: "string", default: "config/qa.yaml" },
      "fixtures-dir": { type: "string", default: "fixtures" },
      "prompts-dir": { type: "string", default: "prompts" },
      "images-dir": { type: "string" },
      trigger: { type: "string", default: "local" },
      json: { type: "boolean", default: false },
      "log-level": { type: "string", default: "info" },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) throw new UsageError(USAGE);
  const trigger = values.trigger;
  if (trigger !== "schedule" && trigger !== "dispatch" && trigger !== "local") throw new UsageError(`--trigger must be schedule|dispatch|local, got "${trigger}"`);
  const logLevel = values["log-level"];
  if (!isLogLevel(logLevel)) throw new UsageError(`--log-level must be debug|info|warn|error, got "${logLevel}"`);
  if (values.live && values.replay) throw new UsageError("--live and --replay are mutually exclusive (--replay forbids network access)");
  if (values.live && !values["dry-run"]) throw new UsageError("--live requires --dry-run until Phase 4 (nothing is written outside the memory ledger)");
  const stages = values.stage === undefined ? undefined : values.stage.split(",").map((name) => name.trim()).filter(Boolean);
  if (stages !== undefined && stages.length === 0) throw new UsageError("--stage needs at least one stage name");
  return {
    command: positionals[0],
    stages: stages as StageName[] | undefined,
    dryRun: values["dry-run"],
    live: values.live,
    fixture: values.fixture,
    replay: values.replay,
    config: values.config,
    sources: values.sources,
    scoring: values.scoring,
    bannedPhrases: values["banned-phrases"],
    qa: values.qa,
    fixturesDir: values["fixtures-dir"],
    promptsDir: values["prompts-dir"],
    imagesDir: values["images-dir"],
    trigger,
    json: values.json,
    logLevel,
  };
}

class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

/** The LLM adapter for `llm.provider`; the Anthropic key is read by name only and never logged. */
export function buildLlmAdapter(config: PipelineConfig, env: NodeJS.ProcessEnv, fixturesDir: string): LlmAdapter {
  switch (config.llm.provider) {
    case "fixture":
      return createFixtureLlmAdapter({ fixturesDir });
    case "anthropic": {
      const apiKey = env["ANTHROPIC_API_KEY"];
      if (!apiKey) throw new ConfigError("ANTHROPIC_API_KEY is required when llm.provider is anthropic (name only; the value stays in the environment)");
      return createAnthropicLlmAdapter({ apiKey, llm: config.llm });
    }
    case "openrouter":
      throw new ConfigError("llm.provider openrouter is not implemented (ADR-002: Anthropic direct); use anthropic, fixture or disabled");
    case "disabled":
      return createDisabledLlmAdapter();
  }
}

/** The image chain for `image.provider` + `image.fallback_chain`; the OpenAI key is read by name only when that provider is in the chain. */
export function buildImageAdapter(config: PipelineConfig, env: NodeJS.ProcessEnv, fixturesDir: string): ImageAdapter {
  const order = imageChainOrder(config.image);
  const adapters: Partial<Record<ImageProvider, ImageAdapter>> = {
    placeholder: createPlaceholderImageAdapter({ topics: config.image.placeholder.topics, defaultTopic: config.image.placeholder.default_topic }),
  };
  if (order.includes("fixture")) adapters.fixture = createFixtureImageAdapter({ fixturesDir });
  if (order.includes("openai")) {
    const apiKey = env["OPENAI_API_KEY"];
    if (!apiKey) throw new ConfigError("OPENAI_API_KEY is required when image.provider or image.fallback_chain includes openai (name only; the value stays in the environment)");
    adapters.openai = createOpenAiImageAdapter({ apiKey, image: config.image });
  }
  return createImageChain(config.image, adapters);
}

export function buildAdapters(cli: Cli, config: PipelineConfig, env: NodeJS.ProcessEnv = {}): StageAdapters {
  const fixtureName = cli.fixture ?? "sample";
  const fixturesDir = resolve(cli.fixturesDir);
  let sources: Record<string, SourceAdapter>;
  if (cli.live) {
    // One pacer for both adapters: a publisher host is paced across every source that touches it.
    const options = { ingest: config.ingest, defaultMaxAgeDays: config.caps.pool_max_age_days, itemsPerSource: config.caps.items_per_source, pacer: new HostPacer() };
    sources = { rss: createLiveRssAdapter(options), html: createEpochIndexAdapter(options) };
  } else {
    // The fixture serves every source type; `type` is informational on the adapter.
    const fixture = createFixtureRssAdapter({ fixturesDir, fixtureName });
    sources = { rss: fixture, html: { ...fixture, type: "html" } };
  }
  return {
    sources,
    llm: buildLlmAdapter(config, env, fixturesDir),
    image: buildImageAdapter(config, env, fixturesDir),
    imageStore: cli.imagesDir ? createLocalImageStore({ dir: resolve(cli.imagesDir) }) : new MemoryImageStore(),
    publishers: { site: createNoopPublisher({ baseUrl: "https://www.computecurrent.com" }) },
    db: new MemoryDb(),
    prompts: createFilePromptRegistry({ promptsDir: resolve(cli.promptsDir) }),
  };
}

/** The ledger keeps the real fetch even in --replay, where the global fetch is disabled for adapters. */
function buildSupabase(env: NodeJS.ProcessEnv, fetchImpl: typeof globalThis.fetch): SupabaseLike | null {
  const url = env["SUPABASE_URL"];
  const key = env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) return null;
  // Structural cast: SupabaseClient satisfies the minimal shape the ledger needs.
  return createClient(url, key, { global: { fetch: fetchImpl } }) as unknown as SupabaseLike;
}

/** True when this file is the process entry, also through the `cc-pipeline` bin symlink or a symlinked checkout. */
function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return pathToFileURL(realpathSync(entry)).href === import.meta.url;
  } catch {
    return false;
  }
}

export async function main(argv: string[], env: NodeJS.ProcessEnv, stdout: (line: string) => void): Promise<number> {
  let logger: Logger | undefined;
  try {
    const cli = parseCli(argv);
    if (cli.command !== "run") throw new UsageError(USAGE);
    logger = createLogger({ name: "cc-pipeline", level: cli.logLevel, sink: (line) => process.stderr.write(`${line}\n`) });

    if (!cli.dryRun) {
      throw new UsageError("Phase 3a writes nothing outside the memory ledger: pass --dry-run (add --live for real feeds or --replay to forbid network access); real ledger writes land in Phase 4");
    }
    const realFetch = globalThis.fetch;
    if (cli.replay) {
      // Defense in depth: the runner injects a throwing ctx.fetch; this closes the global door for adapters too.
      // The ledger client below is built with `realFetch` so a replay can still write a real run ledger.
      globalThis.fetch = disabledFetch as typeof globalThis.fetch;
    }

    const loaded = await loadPipelineConfig(resolve(cli.config), env);
    const sources = await loadSourcesConfig(resolve(cli.sources));
    const scoring = await loadScoringConfig(resolve(cli.scoring));
    const bannedPhrases = await loadBannedPhrasesConfig(resolve(cli.bannedPhrases));
    const qa = await loadQaConfig(resolve(cli.qa));
    const adapters = buildAdapters(cli, loaded.config, env);

    let ledger: Ledger;
    let db: DbPort;
    if (cli.dryRun) {
      ledger = new MemoryLedger();
      const memory = new MemoryDb();
      if (!cli.live) {
        const seeded = await seedMemoryDb(memory, resolve(cli.fixturesDir), cli.fixture ?? "sample");
        if (seeded) logger.info("memory db seeded from fixture", { ...seeded });
      }
      db = memory;
    } else {
      const client = buildSupabase(env, realFetch);
      if (!client) throw new ConfigError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required without --dry-run (names only; values stay in the environment)");
      ledger = new SupabaseLedger(client);
      db = new SupabaseDb(client);
    }

    const result = await runPipeline({
      config: loaded.config,
      scoring,
      bannedPhrases,
      qa,
      overrides: loaded.overrides,
      sources,
      ledger,
      db,
      adapters: { ...adapters, db },
      logger,
      trigger: cli.trigger,
      gitSha: resolveGitSha(env),
      dryRun: cli.dryRun,
      replay: cli.replay,
      fixtureName: cli.live ? undefined : cli.fixture,
      only: cli.stages,
    });
    notifyConsole(logger, result, { capUsd: loaded.config.budget.run_usd });

    if (cli.json) {
      const dump = ledger.dump ? await ledger.dump() : undefined;
      stdout(
        JSON.stringify(
          {
            runId: result.runId,
            status: result.status,
            live: cli.live,
            funnel: result.funnel,
            costTotalUsd: result.costTotalUsd,
            stages: result.stages,
            sourceStats: result.state.sourceStats,
            normalizeStats: result.state.normalizeStats,
            scoreStats: result.state.scoreStats,
            generateStats: result.state.generateStats,
            qaStats: result.state.qaStats,
        imageStats: result.state.imageStats,
            ledger: dump,
          },
          null,
          2,
        ),
      );
    }
    return result.status === "done" ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    if (logger) logger.error("pipeline failed", { error: message });
    else process.stderr.write(`${message}\n`);
    return 2;
  }
}

if (isMainModule()) {
  main(process.argv.slice(2), process.env, (line) => process.stdout.write(`${line}\n`)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 2;
    },
  );
}
