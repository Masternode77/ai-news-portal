#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCHIVE_NEWS_PATH, LATEST_NEWS_PATH } from './lib/constants.mjs';
import { readJsonFile } from './lib/state-store.mjs';
import { routeStrictInfrastructureRelevance } from './lib/strict-infrastructure-relevance-router.mjs';
import { buildUpstreamReconciliationAudit } from './lib/upstream-content-reconciliation.mjs';
import { loadSourceRegistry } from './lib/source-registry.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPSTREAM_ARCHIVE_PATH = 'src/data/archived-news.json';
const SAFE_REVISION = /^(?!.*(?:\.\.|@\{|[~^:?*[\]\\]))[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;

function usage() {
  return [
    'Usage: node scripts/audit-upstream-content-reconciliation.mjs [--revision <ref>] [--json|--review]',
    '',
    'This command is read-only. It never imports legacy public projections or generated copy.',
    'Review output is title-only advisory triage; canonical extraction and classification remain required.',
  ].join('\n');
}

export function parseArgs(argv = process.argv.slice(2)) {
  const parsed = { revision: 'origin/main', json: false, review: false, help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--json') {
      parsed.json = true;
      continue;
    }
    if (value === '--review') {
      parsed.review = true;
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

  if (parsed.json && parsed.review) {
    throw new Error('--json and --review are mutually exclusive');
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

export function buildAdvisoryReview(audit = {}) {
  const rows = (audit.candidates || []).map((candidate) => {
    const route = routeStrictInfrastructureRelevance(candidate);
    return {
      id: candidate.id,
      title: candidate.title,
      source: candidate.source,
      score: route.score,
      decision: route.routing_decision,
      lane: route.laneKey,
      reasons: route.blocked_reasons,
    };
  });
  const counts = {
    core_lane: 0,
    adjacent_watchlist: 0,
    archive_only: 0,
  };
  for (const row of rows) counts[row.decision] = (counts[row.decision] || 0) + 1;
  return {
    authority: 'advisory_title_only',
    warning: 'Do not publish or permanently reject from this review; canonical source extraction and classification remain required.',
    revision: audit.resolvedRevision || audit.revision || '',
    counts,
    rows,
  };
}

function printReview(audit) {
  const review = buildAdvisoryReview(audit);
  console.log([
    'upstream content reconciliation: advisory title-only review',
    `revision: ${review.revision}`,
    `core lane: ${review.counts.core_lane}`,
    `adjacent watchlist: ${review.counts.adjacent_watchlist}`,
    `archive only: ${review.counts.archive_only}`,
    `warning: ${review.warning}`,
    '',
    ...review.rows.map((row) => (
      `[${row.decision} ${Number(row.score).toFixed(3)}] ${row.id} | ${row.source} | ${row.title}`
    )),
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
  else if (args.review) printReview(audit);
  else printHuman(audit);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`upstream reconciliation audit failed: ${error.message}`);
    process.exitCode = 1;
  });
}
