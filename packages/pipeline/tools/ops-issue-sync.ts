/**
 * ops-issue-sync — Phase 4 ops alarm (3i notes §5.3, ADR-007). Reads the JSON
 * that `pipeline ops --json` wrote (or none, when ops exited before a
 * verdict), looks the alarm issue up by its body marker, and writes GitHub
 * only on a state transition: create on the first alert, update (and reopen)
 * when the state changes, close with a "recovered" comment when the check is
 * OK again, nothing otherwise. Runs in `.github/workflows/pipeline.yml`
 * (`ops-check` job, `issues: write`); the token is GITHUB_TOKEN by name.
 *
 *   node packages/pipeline/tools/ops-issue-sync.ts --exit-code <n> [--report ops.json]
 *     [--repo owner/name] [--run-url <url>] [--dry-run] [--json]
 *
 * Exit 0 when the plan was applied (or printed under --dry-run), 1 when GitHub
 * refused or the network failed, 2 on usage or a missing token / repository.
 */
import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { OpsReport } from "../src/ops/check.ts";
import { alarmState, findOpsIssue, planOpsIssue } from "../src/ops/issue.ts";
import type { OpsIssuePlan } from "../src/ops/issue.ts";
import { applyOpsIssuePlan, createGitHubIssuesClient, GitHubIssuesError } from "../src/ops/github-issues.ts";
import type { GitHubIssuesClient } from "../src/ops/github-issues.ts";

export interface SyncOptions {
  exitCode: number;
  reportPath?: string;
  repo?: string;
  runUrl?: string;
  dryRun: boolean;
  json: boolean;
}

export class SyncUsageError extends Error {}

/** The ops report from `pipeline ops --json`, or null when the file is absent, empty or not a report (→ state unknown). */
export async function readOpsReport(path: string | undefined): Promise<OpsReport | null> {
  if (!path) return null;
  let text: string;
  try {
    text = await readFile(resolve(path), "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as Partial<OpsReport> | null;
    if (!parsed || typeof parsed !== "object" || typeof parsed.status !== "string" || !Array.isArray(parsed.reasons)) return null;
    return parsed as OpsReport;
  } catch {
    return null;
  }
}

export function parseSyncArgs(argv: string[]): SyncOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      "exit-code": { type: "string" },
      report: { type: "string" },
      repo: { type: "string" },
      "run-url": { type: "string" },
      "dry-run": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
    strict: true,
  });
  const exitCode = Number(values["exit-code"]);
  if (values["exit-code"] === undefined || !Number.isInteger(exitCode) || exitCode < 0) throw new SyncUsageError("--exit-code <n> is required (the pipeline ops exit code: 0 ok, 1 alert, 2 error)");
  return { exitCode, reportPath: values.report, repo: values.repo, runUrl: values["run-url"], dryRun: values["dry-run"] ?? false, json: values.json ?? false };
}

function planSummary(plan: OpsIssuePlan): Record<string, unknown> {
  switch (plan.action) {
    case "none":
      return { action: plan.action, state: plan.state, reason: plan.reason };
    case "create":
      return { action: plan.action, state: plan.state, title: plan.title };
    case "update":
      return { action: plan.action, state: plan.state, number: plan.number, title: plan.title, reopen: plan.reopen };
    case "close":
      return { action: plan.action, state: plan.state, number: plan.number };
  }
}

/** Plans and (unless dry run) applies the alarm issue write; returns the process exit code. */
export async function syncOpsIssue(
  options: SyncOptions,
  env: NodeJS.ProcessEnv,
  stdout: (line: string) => void,
  deps: { fetch: typeof globalThis.fetch; now?: Date; client?: GitHubIssuesClient } = { fetch: globalThis.fetch },
): Promise<number> {
  const now = deps.now ?? new Date();
  const report = await readOpsReport(options.reportPath);
  const repo = options.repo ?? env["GITHUB_REPOSITORY"];
  if (!repo) throw new SyncUsageError("--repo owner/name (or GITHUB_REPOSITORY) is required");
  const state = alarmState(report, options.exitCode);
  const emit = (payload: Record<string, unknown>): void => stdout(options.json ? JSON.stringify(payload, null, 2) : Object.entries(payload).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join("\n"));

  let client = deps.client;
  if (!client) {
    const token = env["GITHUB_TOKEN"];
    if (!token && !options.dryRun) throw new SyncUsageError("GITHUB_TOKEN is required (name only; the value stays in the environment) — or pass --dry-run to print the plan without reading GitHub");
    client = token ? createGitHubIssuesClient({ repo, token, fetch: deps.fetch }) : undefined;
  }

  try {
    const issues = client ? await client.list() : [];
    const existing = findOpsIssue(issues);
    const plan = planOpsIssue(report, existing, { exitCode: options.exitCode, runUrl: options.runUrl, now });
    if (options.dryRun || !client) {
      emit({ dry_run: true, repo, state, existing: existing ? { number: existing.number, state: existing.state } : null, plan: planSummary(plan) });
      return 0;
    }
    const result = await applyOpsIssuePlan(plan, client);
    emit({ dry_run: false, repo, state, existing: existing ? { number: existing.number, state: existing.state } : null, plan: planSummary(plan), result });
    return 0;
  } catch (error) {
    if (error instanceof GitHubIssuesError) {
      emit({ dry_run: options.dryRun, repo, state, error: error.message, status: error.status });
      return 1;
    }
    throw error;
  }
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return pathToFileURL(realpathSync(entry)).href === import.meta.url;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  let code: number;
  try {
    const options = parseSyncArgs(process.argv.slice(2));
    code = await syncOpsIssue(options, process.env, (line) => process.stdout.write(`${line}\n`));
  } catch (error) {
    const usage = error instanceof SyncUsageError || (error instanceof TypeError && /option|argument/i.test(error.message));
    process.stderr.write(`${usage ? "usage" : "error"}: ${error instanceof Error ? error.message : String(error)}\n`);
    code = usage ? 2 : 1;
  }
  process.exit(code);
}
