#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCHIVE_NEWS_PATH, LATEST_NEWS_PATH } from './lib/constants.mjs';
import { readJsonFile } from './lib/state-store.mjs';
import { buildUpstreamReconciliationAudit } from './lib/upstream-content-reconciliation.mjs';
import { loadSourceRegistry } from './lib/source-registry.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPSTREAM_ARCHIVE_PATH = 'src/data/archived-news.json';
const SAFE_REVISION = /^(?!.*(?:\.\.|@\{|[~^:?*[\]\\]))[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;

function usage() {
  return [
    'Usage: node scripts/audit-upstream-content-reconciliation.mjs [--revision <ref>] [--json]',
    '',
    'This command is read-only. It never imports legacy public projections or generated copy.',
  ].join('\n');
}

export function parseArgs(argv = process.argv.slice(2)) {
  const parsed = { revision: 'origin/main', json: false, help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--json') {
      parsed.json = true;
      continue;
    }
    if (value === '--help' || value === '-h') {
      parsed.help = true;
      continue;
    }
    if (value === '--apply') {
      throw new Error('apply mode is disabled; reconciliation must use the canonical content lifecycle');
    }
    if (value === '--revision') {
      parsed.revision = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (value.startsWith('--revision=')) {
      parsed.revision = value.slice('--revision='.length);
      continue;
    }
    throw new Error(`unknown argument: ${value}`);
  }

  return parsed;
}

export function assertSafeRevision(revision = '') {
  if (!SAFE_REVISION.test(revision)) {
    throw new Error(`unsafe revision: ${revision || '(empty)'}`);
  }
  return revision;
}

export function resolveRevision(revision, options = {}) {
  const execGit = options.execGit || execFileSync;
  return String(execGit(
    'git',
    ['rev-parse', '--verify', '--end-of-options', `${assertSafeRevision(revision)}^{commit}`],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )).trim();
}

export function loadUpstreamArchive(commitSha, options = {}) {
  const execGit = options.execGit || execFileSync;
  const raw = execGit(
    'git',
    ['show', `${commitSha}:${UPSTREAM_ARCHIVE_PATH}`],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const parsed = JSON.parse(String(raw));
  if (!Array.isArray(parsed)) {
    throw new Error(`${UPSTREAM_ARCHIVE_PATH} must contain a JSON array`);
  }
  return parsed;
}

export async function runUpstreamReconciliationAudit(args = {}, options = {}) {
  const requestedRevision = assertSafeRevision(args.revision || 'origin/main');
  const resolvedRevision = resolveRevision(requestedRevision, options);
  const upstreamArticles = loadUpstreamArchive(resolvedRevision, options);
  const readJson = options.readJson || readJsonFile;
  const loadRegistry = options.loadRegistry || loadSourceRegistry;
  const [latest, archived, sourceRegistry] = await Promise.all([
    readJson(path.join(ROOT, LATEST_NEWS_PATH), []),
    readJson(path.join(ROOT, ARCHIVE_NEWS_PATH), []),
    loadRegistry(),
  ]);
  const audit = buildUpstreamReconciliationAudit(
    [...latest, ...archived],
    upstreamArticles,
    {
      revision: requestedRevision,
      allowedDomains: sourceRegistry.map((source) => source.domain),
    },
  );

  return { ...audit, resolvedRevision };
}

function printHuman(audit) {
  console.log([
    'upstream content reconciliation: audit-only',
    `revision: ${audit.revision}`,
    `resolved revision: ${audit.resolvedRevision}`,
    `upstream rows: ${audit.counts.upstream}`,
    `already present: ${audit.counts.alreadyPresent}`,
    `source candidates for canonical re-ingestion: ${audit.counts.reingest}`,
    `rejected source discoveries: ${audit.counts.rejected}`,
  ].join('\n'));
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(usage());
    return;
  }
  const audit = await runUpstreamReconciliationAudit(args);
  if (args.json) console.log(JSON.stringify(audit, null, 2));
  else printHuman(audit);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`upstream reconciliation audit failed: ${error.message}`);
    process.exitCode = 1;
  });
}
