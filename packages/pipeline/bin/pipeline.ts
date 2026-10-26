#!/usr/bin/env node
/**
 * cc-pipeline — CLI entry (brief Phase 2 §3, Phase 3a `--live`).
 *
 *   pipeline run [--stage <name>[,<name>]] [--dry-run] [--live] [--fixture <name>] [--replay]
 *                [--config <path>] [--sources <path>] [--scoring <path>] [--banned-phrases <path>] [--qa <path>] [--redirects <path>] [--fixtures-dir <dir>] [--prompts-dir <dir>] [--images-dir <dir>]
 *                [--trigger schedule|dispatch|local] [--json] [--log-level <level>]
 *   pipeline ops [--from <runs.json>] [--config <path>] [--json] [--log-level <level>]
 *
 * Exit codes: 0 done · 1 partial/budget_stop · 2 failed, usage or config error.
 * Phase 3i: every finished run ends with one summary (ADR-007 layout) in the log,
 * the --json output and — when `notify.telegram.enabled` — one Telegram message
 * through the same fetch rule as the stages (a --replay run records a failed,
 * soft delivery). `ops` reads `pipeline_runs` (Supabase, or `--from` a JSON
 * dump) and exits 1 when the ledger is stale, never completed or failing.
 * Source adapters are fixtures unless `--live` swaps in the real RSS/Atom and
 * Epoch index adapters (Phase 3a). A fixture run also seeds the memory DB from
 * `fixtures/db/<fixture>.json` when that file exists (Phase 3b: publications
 * to dedupe against). `--dry-run` keeps the ledger and DB in memory (nothing
 * written). Phase 4 (ADR-006 M4): without `--dry-run` the run writes the
 * Supabase ledger and tables named by SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 * (the staging project), so it must be `--live` (fixtures and `--replay`
 * never reach a real database) and `flags.publish_target` may be `none` or
 * `staging` only — `production` is refused until the Phase 5 cutover.
 */
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { ConfigError, PipelineRunRow, createLogger, isLogLevel, loadBannedPhrasesConfig, loadPipelineConfig, loadQaConfig, loadRedirectsConfig, loadScoringConfig, loadSourcesConfig } from "@cc/shared";
import type { DbPort, ImageAdapter, ImageProvider, Ledger, LlmAdapter, Logger, Notifier, PipelineConfig, PublisherAdapter, RedirectsConfig, RunTrigger, SourceAdapter, StageAdapters, StageName } from "@cc/shared";
import {
  HostPacer,
  createDisabledLlmAdapter,
  createEpochIndexAdapter,
  createAnthropicLlmAdapter,
  createFilePromptRegistry,
  createFixtureLlmAdapter,
  createFixtureRssAdapter,
  createLiveRssAdapter,
  createSitePublisher,
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
import { resolveGitSha, resolveRunUrl } from "../src/git.ts";
import { buildRunSummary, createTelegramNotifier, formatRunCrash, notifyConsole, renderNotification } from "../src/notify/index.ts";
import type { SummaryOptions } from "../src/notify/index.ts";
import { assessOperations, formatOpsReport } from "../src/ops/check.ts";
import { disabledFetch, runPipeline } from "../src/runner.ts";
import type { RunCrashError, RunResult } from "../src/runner.ts";

const USAGE = `usage: pipeline run [--stage <name>[,<name>]] [--dry-run] [--live] [--fixture <name>] [--replay]
                    [--config <path>] [--sources <path>] [--scoring <path>] [--banned-phrases <path>] [--qa <path>] [--redirects <path>] [--fixtures-dir <dir>] [--prompts-dir <dir>] [--images-dir <dir>]
                    [--trigger schedule|dispatch|local] [--json] [--log-level debug|info|warn|error]
       pipeline ops [--from <runs.json>] [--config <path>] [--json] [--log-level debug|info|warn|error]`;

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
  redirects: string;
  fixturesDir: string;
  promptsDir: string;
  /** Phase 3f: where generated image bytes are written; unset keeps them in memory for the run. */
  imagesDir: string | undefined;
  /** Phase 3i `ops`: assess a JSON dump (a `pipeline run --json` result, `{ runs }` or a bare array) instead of Supabase. */
  from: string | undefined;
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
      redirects: { type: "string", default: "config/redirects.yaml" },
      "fixtures-dir": { type: "string", default: "fixtures" },
      "prompts-dir": { type: "string", default: "prompts" },
      "images-dir": { type: "string" },
      from: { type: "string" },
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
  // Phase 4: a run without --dry-run writes the real ledger and DB (Supabase, names only), so it must read the
  // live feeds — fixture or replayed rows never reach a real database.
  if (positionals[0] === "run" && values.replay && !values["dry-run"]) throw new UsageError("--replay requires --dry-run (recorded fixtures never reach the real ledger or database)");
  if (positionals[0] === "run" && !values.live && !values["dry-run"]) throw new UsageError("without --dry-run the run writes the real ledger and database, so it must read the live feeds: add --live (or --dry-run for the memory ledger)");
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
    redirects: values.redirects,
    fixturesDir: values["fixtures-dir"],
    promptsDir: values["prompts-dir"],
    imagesDir: values["images-dir"],
    from: values.from,
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

/** The site publisher: rows through the run's DB, redirects from config, ISR revalidation with a name-only token (required only when enabled). */
export function buildSitePublisher(config: PipelineConfig, env: NodeJS.ProcessEnv, redirects: RedirectsConfig): PublisherAdapter {
  const tokenEnv = config.publish.revalidate.token_env;
  const revalidateToken = env[tokenEnv];
  if (config.publish.revalidate.enabled && !revalidateToken) throw new ConfigError(`${tokenEnv} is required when publish.revalidate.enabled is true (name only; the value stays in the environment)`);
  return createSitePublisher({ publish: config.publish, redirects, revalidateToken });
}

/**
 * The Telegram notifier (Phase 3i): the bot token and chat id are read by the names in `notify.telegram`
 * and, like the other enabled integrations, required at startup when the channel is on (names only).
 */
export function buildNotifier(config: PipelineConfig, env: NodeJS.ProcessEnv): Notifier {
  const tg = config.notify.telegram;
  const botToken = env[tg.bot_token_env] || undefined;
  const chatId = env[tg.chat_id_env] || undefined;
  if (tg.enabled && !botToken) throw new ConfigError(`${tg.bot_token_env} is required when notify.telegram.enabled is true (name only; the value stays in the environment)`);
  if (tg.enabled && !chatId) throw new ConfigError(`${tg.chat_id_env} is required when notify.telegram.enabled is true (name only; the value stays in the environment)`);
  return createTelegramNotifier({ config: tg, botToken, chatId });
}

export function buildAdapters(cli: Cli, config: PipelineConfig, env: NodeJS.ProcessEnv = {}, redirects: RedirectsConfig = []): StageAdapters {
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
    publishers: { site: buildSitePublisher(config, env, redirects) },
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

/**
 * `pipeline ops` (Phase 3i, ADR-007): the heartbeat is the ledger. Reads `pipeline_runs` from Supabase
 * (names only) or from `--from <json>` (a `pipeline run --json` result, `{ runs }` or a bare array) and
 * exits 1 when the latest completed run is older than `schedule.slot_hours × 1.5`, when no run ever
 * completed, or when the last two finished runs failed.
 */
async function runOps(cli: Cli, env: NodeJS.ProcessEnv, stdout: (line: string) => void, logger: Logger): Promise<number> {
  const loaded = await loadPipelineConfig(resolve(cli.config), env);
  let rows: PipelineRunRow[];
  if (cli.from) {
    const parsed = JSON.parse(await readFile(resolve(cli.from), "utf8")) as unknown;
    const container = parsed as { ledger?: { runs?: unknown }; runs?: unknown } | unknown[];
    const raw = Array.isArray(container) ? container : (container.ledger?.runs ?? container.runs);
    if (!Array.isArray(raw)) throw new UsageError(`--from ${cli.from}: expected an array of pipeline_runs rows, a { runs } object or a pipeline --json result`);
    rows = raw.map((row) => PipelineRunRow.parse(row));
  } else {
    const client = buildSupabase(env, globalThis.fetch);
    if (!client) throw new ConfigError("ops without --from reads pipeline_runs from Supabase: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (names only; values stay in the environment)");
    rows = await new SupabaseDb(client).select<PipelineRunRow>("pipeline_runs", {}, { orderBy: { column: "started_at", ascending: false }, limit: 200 });
  }
  const report = assessOperations(rows, { now: new Date(), slotHours: loaded.config.schedule.slot_hours });
  const text = formatOpsReport(report);
  logger.info("ops check", { status: report.status, reasons: report.reasons, hours_since_success: report.hours_since_success, rows: rows.length });
  stdout(cli.json ? JSON.stringify({ ...report, text }, null, 2) : text);
  return report.status === "ok" ? 0 : 1;
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
    if (cli.command !== "run" && cli.command !== "ops") throw new UsageError(USAGE);
    logger = createLogger({ name: "cc-pipeline", level: cli.logLevel, sink: (line) => process.stderr.write(`${line}\n`) });
    if (cli.command === "ops") return await runOps(cli, env, stdout, logger);

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
    const redirects = await loadRedirectsConfig(resolve(cli.redirects));
    // The production target is the Phase 5 cutover (CLAUDE.md §4); until then only none (dry decisions) and staging exist.
    if (loaded.config.flags.publish_target === "production") throw new ConfigError("flags.publish_target production is the Phase 5 cutover; use none or staging (CC_FLAG_PUBLISH_TARGET) until then");
    const adapters = buildAdapters(cli, loaded.config, env, redirects);
    const notifier = buildNotifier(loaded.config, env);
    // Same rule as the stages: the notifier reaches the network through the (possibly disabled) fetch only.
    const notifyFetch = cli.replay ? disabledFetch : realFetch;
    const gitSha = resolveGitSha(env);
    const summaryOptions: SummaryOptions = {
      summary: loaded.config.notify.summary,
      capUsd: loaded.config.budget.run_usd,
      softWarnUsd: loaded.config.budget.soft_warn_usd,
      trigger: cli.trigger,
      dryRun: cli.dryRun,
      replay: cli.replay,
      fixtureName: cli.live ? null : (cli.fixture ?? "sample"),
      gitSha,
      runUrl: resolveRunUrl(env),
    };

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
      if (!client) throw new ConfigError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required without --dry-run (names only; values stay in the environment): the Phase 4 shadow writes the staging project's ledger and tables");
      ledger = new SupabaseLedger(client);
      db = new SupabaseDb(client);
    }

    const startedAt = new Date();
    let result: RunResult;
    try {
      result = await runPipeline({
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
      gitSha,
      dryRun: cli.dryRun,
      replay: cli.replay,
      fixtureName: cli.live ? undefined : cli.fixture,
      only: cli.stages,
      });
    } catch (error) {
      // The ledger row is already `failed` (runner catch); the channel hears about it before the exit code.
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      const runId = error instanceof Error ? ((error as RunCrashError).runId ?? null) : null;
      const text = formatRunCrash({ runId, startedAt: startedAt.toISOString(), timezone: loaded.config.notify.summary.timezone, error: message, trigger: cli.trigger, runUrl: summaryOptions.runUrl });
      await notifier.send({ kind: "run_failure", runId: runId ?? "unknown", status: "failed", text }, { fetch: notifyFetch, logger });
      throw error;
    }
    const summary = buildRunSummary(result, summaryOptions);
    const rendered = renderNotification(summary);
    notifyConsole(logger, summary, rendered.text);
    const notify = await notifier.send({ kind: rendered.kind, runId: result.runId, status: result.status, text: rendered.text }, { fetch: notifyFetch, logger });

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
            budget: result.budget,
            stages: result.stages,
            sourceStats: result.state.sourceStats,
            normalizeStats: result.state.normalizeStats,
            scoreStats: result.state.scoreStats,
            generateStats: result.state.generateStats,
            qaStats: result.state.qaStats,
            imageStats: result.state.imageStats,
            publishStats: result.state.publishStats,
            summary: { ...summary, text: rendered.text, kind: rendered.kind },
            notify,
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
