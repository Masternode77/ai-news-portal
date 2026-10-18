#!/usr/bin/env node
/**
 * cc-pipeline — CLI entry (brief Phase 2 §3).
 *
 *   pipeline run [--stage <name>] [--dry-run] [--fixture <name>] [--replay]
 *                [--config <path>] [--sources <path>] [--fixtures-dir <dir>]
 *                [--trigger schedule|dispatch|local] [--json] [--log-level <level>]
 *
 * Exit codes: 0 done · 1 partial/budget_stop · 2 failed, usage or config error.
 * Phase 2 ships fixture adapters only; a live run (no --dry-run/--replay) is
 * refused until Phase 3 installs real adapters.
 */
import { parseArgs } from "node:util";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { ConfigError, createLogger, isLogLevel, loadPipelineConfig, loadSourcesConfig } from "@cc/shared";
import type { DbPort, Ledger, Logger, RunTrigger, StageAdapters, StageName } from "@cc/shared";
import {
  createDisabledLlmAdapter,
  createFixtureLlmAdapter,
  createFixtureRssAdapter,
  createNoopPublisher,
  createPlaceholderImageAdapter,
} from "../src/adapters/index.ts";
import { MemoryDb, SupabaseDb } from "../src/db/index.ts";
import { MemoryLedger, SupabaseLedger } from "../src/ledger/index.ts";
import type { SupabaseLike } from "../src/ledger/index.ts";
import { resolveGitSha } from "../src/git.ts";
import { notifyConsole } from "../src/notify/console.ts";
import { disabledFetch, runPipeline } from "../src/runner.ts";

const USAGE = `usage: pipeline run [--stage <name>] [--dry-run] [--fixture <name>] [--replay]
                    [--config <path>] [--sources <path>] [--fixtures-dir <dir>]
                    [--trigger schedule|dispatch|local] [--json] [--log-level debug|info|warn|error]`;

interface Cli {
  command: string | undefined;
  stage: StageName | undefined;
  dryRun: boolean;
  fixture: string | undefined;
  replay: boolean;
  config: string;
  sources: string;
  fixturesDir: string;
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
      fixture: { type: "string" },
      replay: { type: "boolean", default: false },
      config: { type: "string", default: "config/pipeline.yaml" },
      sources: { type: "string", default: "config/sources.yaml" },
      "fixtures-dir": { type: "string", default: "fixtures" },
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
  return {
    command: positionals[0],
    stage: values.stage as StageName | undefined,
    dryRun: values["dry-run"],
    fixture: values.fixture,
    replay: values.replay,
    config: values.config,
    sources: values.sources,
    fixturesDir: values["fixtures-dir"],
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

function buildAdapters(cli: Cli, llmProvider: string): StageAdapters {
  const fixtureName = cli.fixture ?? "sample";
  const fixturesDir = resolve(cli.fixturesDir);
  return {
    sources: { rss: createFixtureRssAdapter({ fixturesDir, fixtureName }) },
    llm: llmProvider === "fixture" ? createFixtureLlmAdapter({ fixturesDir }) : createDisabledLlmAdapter(),
    image: createPlaceholderImageAdapter(),
    publishers: { site: createNoopPublisher({ baseUrl: "https://www.computecurrent.com" }) },
    db: new MemoryDb(),
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

    if (!cli.dryRun && !cli.replay) {
      throw new UsageError("Phase 2 ships fixture adapters only: pass --dry-run and/or --replay (live adapters land in Phase 3)");
    }
    const realFetch = globalThis.fetch;
    if (cli.replay) {
      // Defense in depth: the runner injects a throwing ctx.fetch; this closes the global door for adapters too.
      // The ledger client below is built with `realFetch` so a replay can still write a real run ledger.
      globalThis.fetch = disabledFetch as typeof globalThis.fetch;
    }

    const loaded = await loadPipelineConfig(resolve(cli.config), env);
    const sources = await loadSourcesConfig(resolve(cli.sources));
    const adapters = buildAdapters(cli, loaded.config.llm.provider);

    let ledger: Ledger;
    let db: DbPort;
    if (cli.dryRun) {
      ledger = new MemoryLedger();
      db = new MemoryDb();
    } else {
      const client = buildSupabase(env, realFetch);
      if (!client) throw new ConfigError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required without --dry-run (names only; values stay in the environment)");
      ledger = new SupabaseLedger(client);
      db = new SupabaseDb(client);
    }

    const result = await runPipeline({
      config: loaded.config,
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
      fixtureName: cli.fixture,
      only: cli.stage,
    });
    notifyConsole(logger, result, { capUsd: loaded.config.budget.run_usd });

    if (cli.json) {
      const dump = ledger.dump ? await ledger.dump() : undefined;
      stdout(JSON.stringify({ runId: result.runId, status: result.status, funnel: result.funnel, costTotalUsd: result.costTotalUsd, stages: result.stages, ledger: dump }, null, 2));
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
