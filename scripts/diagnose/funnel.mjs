#!/usr/bin/env node
// Phase 0 diagnosis: per-run funnel from the committed pipeline ledger.
//
// Read-only by design:
//   - no network (globalThis.fetch is replaced with a throwing stub),
//   - no model calls (LLM_PROVIDER is forced to `disabled` before any import),
//   - no writes except the files named by --out / --json.
//
// Inputs (all committed artefacts):
//   scripts/state/pipeline-state.json   runHistory / dayPlans / publishedIds
//   src/data/news-pool.json             last fetched pool snapshot
//   src/data/latest-news.json, archived-news.json, authored-columns.json
//   config/sourceRegistry.yml
// Optional:
//   --git-history   per-commit pool size and published pages for every
//                   "chore: refresh news surface and archive" commit (uses
//                   `git show`, never touches the working tree)
//   --jobs <dir>    Mac subscription job records (subscription-job.mjs schema)
//   --replay        re-run the deterministic gates in memory over the stored
//                   pool and curated items
//
// Usage:
//   node scripts/diagnose/funnel.mjs [--since 2026-08-30] [--git-history]
//        [--replay] [--jobs docs/diagnosis/mac-jobs] [--out file.csv]
//        [--json file.json] [--quiet]

process.env.LLM_PROVIDER = 'disabled';
process.env.PIPELINE_OFFLINE = '1';
globalThis.fetch = () => {
  throw new Error('funnel.mjs: network access is disabled in diagnosis mode');
};

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  loadSourceRegistrySync,
  parseSourceRegistryYaml,
  activeRegistryFeeds,
} from '../lib/source-registry.mjs';
import {
  classifyInfrastructureRelevance,
  FULL_MEMO_RELEVANCE_THRESHOLD,
  SIGNAL_CARD_RELEVANCE_THRESHOLD,
} from '../lib/relevance-classifier.mjs';
import { analyzeSourceExtractionFailClosed } from '../lib/source-extraction-fail-closed.mjs';
import { bannedPhraseMatches } from '../lib/banned-phrases.mjs';
import { isPublicLongformArticle } from '../lib/public-surface-eligibility.mjs';
import { publishedColumns } from '../lib/column-surface.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONTENT_CYCLE_COMMIT_SUBJECT = 'chore: refresh news surface and archive';
const FUNNEL_COLUMNS = [
  'run_id',
  'started_at',
  'sources_configured',
  'sources_ok',
  'sources_failed',
  'items_fetched',
  'items_new',
  'items_scored',
  'passed_gate',
  'drafts',
  'qa_passed',
  'published',
  'top_error',
  // diagnostic extras (not in the brief's 13 columns)
  'branch',
  'day',
  'slot',
  'column_published',
  'column_reason',
  'llm_calls',
  'llm_failures',
  'consistency',
  'commit',
  'labels',
];

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    since: '2026-08-30',
    state: path.join(ROOT, 'scripts/state/pipeline-state.json'),
    dataDir: path.join(ROOT, 'src/data'),
    registry: path.join(ROOT, 'config/sourceRegistry.yml'),
    jobs: null,
    gitHistory: false,
    replay: false,
    out: null,
    json: null,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case '--since': args.since = next(); break;
      case '--state': args.state = path.resolve(next()); break;
      case '--data-dir': args.dataDir = path.resolve(next()); break;
      case '--registry': args.registry = path.resolve(next()); break;
      case '--jobs': args.jobs = path.resolve(next()); break;
      case '--git-history': args.gitHistory = true; break;
      case '--replay': args.replay = true; break;
      case '--out': args.out = path.resolve(next()); break;
      case '--json': args.json = path.resolve(next()); break;
      case '--quiet': args.quiet = true; break;
      case '--help':
      case '-h':
        process.stdout.write(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 25).join('\n') + '\n');
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (fallback !== undefined) return fallback;
    throw error;
  }
}

function git(args, { maxBuffer = 64 * 1024 * 1024 } = {}) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer, stdio: ['ignore', 'pipe', 'pipe'] });
}

function mode(values = []) {
  const counts = new Map();
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  let best = null;
  for (const [value, count] of counts) {
    if (!best || count > best.count) best = { value, count };
  }
  return best ? best.value : '';
}

function histogram(values = []) {
  const counts = {};
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}

function pct(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

// ---------------------------------------------------------------------------
// Run ledger rows
// ---------------------------------------------------------------------------

// The pipeline writes runHistory from three sites with different key sets
// (scripts/pipeline.mjs:555-566, :632-636, :753-768). Classify by key presence.
function runBranch(run) {
  if (Object.prototype.hasOwnProperty.call(run, 'publishedIds')) return 'full';
  if (Object.prototype.hasOwnProperty.call(run, 'processedIds')) return 'existing_only';
  return 'normalization_only';
}

function reasonsOf(items = []) {
  return (items || []).map((item) => item?.reason || (item?.infrastructure_relevance_reasons || [])[0] || null);
}

function buildRunRows({ state, registry, since }) {
  const sinceTs = Date.parse(since);
  const runs = (state.runHistory || []).filter((run) => Date.parse(run.at) >= sinceTs);
  const dayPlans = state.dayPlans || {};

  // items_new estimate: curated ids first seen on a given KST day.
  const seenCurated = new Set();
  const firstSeenByDay = {};
  for (const day of Object.keys(dayPlans).sort()) {
    const ids = dayPlans[day]?.curatedIds || (dayPlans[day]?.curatedItems || []).map((item) => item.id);
    let fresh = 0;
    for (const id of ids) {
      if (!seenCurated.has(id)) {
        seenCurated.add(id);
        fresh += 1;
      }
    }
    firstSeenByDay[day] = fresh;
  }
  const dayRunIndex = {};

  const rows = runs.map((run) => {
    const branch = runBranch(run);
    const plan = dayPlans[run.day] || {};
    const processed = run.processedIds || [];
    const visible = new Set(plan.visibleIds || []);
    const signalCards = run.signalCardCount ?? 0;
    const archiveOnly = run.archiveOnlyCount ?? 0;
    const blocked = run.blockedCount ?? 0;
    const repetitionBlocked = run.repetitionBlockedCount ?? 0;
    const publishedCount = run.publishedCount ?? 0;
    const column = run.authoredColumn || {};

    dayRunIndex[run.day] = (dayRunIndex[run.day] || 0) + 1;
    const firstRunOfDay = dayRunIndex[run.day] === 1;

    // Arithmetic from scripts/pipeline.mjs:648-666 and :753-768:
    //   signalCards   = relevanceSignalCards + qualityBlocked + insightBlocked
    //   blocked       = qualityBlocked + insightBlocked
    //   processedIds  = repetitionPassed + signalCards + archiveOnly + repetitionBlocked
    //   fullMemoCandidates = publishable + blocked = processed - archiveOnly - (signalCards - blocked)
    const passedGate = branch === 'normalization_only' ? null : processed.length - archiveOnly - (signalCards - blocked);
    const drafts = branch === 'normalization_only' ? null : Math.max(0, passedGate - blocked);
    const qaPassed = branch === 'full' ? publishedCount : branch === 'existing_only' ? 0 : null;
    const publishedWire = processed.filter((id) => visible.has(id)).length;
    const published = branch === 'normalization_only' ? (column.published ? 1 : 0) : publishedWire + (column.published ? 1 : 0);

    const expectedProcessed = signalCards + archiveOnly + publishedCount + repetitionBlocked;
    const consistency = branch === 'normalization_only'
      ? 'n/a'
      : expectedProcessed === processed.length ? 'ok' : `mismatch:${expectedProcessed}!=${processed.length}`;

    const errorCandidates = [
      ...reasonsOf(run.blockedItems),
      ...reasonsOf(run.repetitionBlockedItems),
      ...(column.published ? [] : column.reason ? [`column:${column.reason}`] : []),
      ...(run.llmUsage?.failures ? ['llm_failure'] : []),
    ];
    const topError = mode(errorCandidates) || mode(reasonsOf(run.archiveOnlyItems)) || '';

    return {
      run_id: run.at,
      started_at: run.at,
      sources_configured: activeRegistryFeeds(registry, new Date(run.at)).length,
      sources_ok: 'n/a',
      sources_failed: 'n/a',
      items_fetched: 'n/a',
      items_new: firstRunOfDay ? firstSeenByDay[run.day] ?? 0 : 0,
      items_scored: branch === 'normalization_only' ? 0 : processed.length,
      passed_gate: passedGate ?? 0,
      drafts: drafts ?? 0,
      qa_passed: qaPassed ?? 0,
      published,
      top_error: topError,
      branch,
      day: run.day,
      slot: run.slot,
      column_published: column.published ? 1 : 0,
      column_reason: column.published ? '' : (column.reason || ''),
      llm_calls: run.llmUsage?.calls ?? '',
      llm_failures: run.llmUsage?.failures ?? '',
      consistency,
      commit: '',
      labels: 'sources_configured=measured(head-registry);items_new=est(first-seen-curated);items_scored,passed_gate,drafts,qa_passed,published=measured(state);items_fetched,sources_ok/failed=n/a(not persisted)',
      _run: run,
    };
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Git history: per content-cycle commit (GitHub Actions era)
// ---------------------------------------------------------------------------

function gitShowJson(sha, file) {
  try {
    return JSON.parse(git(['show', `${sha}:${file}`]));
  } catch {
    return null;
  }
}

function buildGitHistory({ since }) {
  const log = git(['log', '--format=%H%x09%aI%x09%s', `--since=${since}`, `--grep=${CONTENT_CYCLE_COMMIT_SUBJECT}`, '--fixed-strings']).trim();
  if (!log) return [];
  const commits = log.split('\n').map((line) => {
    const [sha, date, subject] = line.split('\t');
    return { sha, date, subject };
  }).reverse(); // oldest first

  const results = [];
  for (const commit of commits) {
    const pool = gitShowJson(commit.sha, 'src/data/news-pool.json') || [];
    const poolSources = new Set(pool.map((item) => item.sourceRegistryId || item.source).filter(Boolean));
    const state = gitShowJson(commit.sha, 'scripts/state/pipeline-state.json');
    const lastRun = state?.runHistory?.[state.runHistory.length - 1] || null;
    let registryCount = null;
    try {
      const registry = parseSourceRegistryYaml(git(['show', `${commit.sha}:config/sourceRegistry.yml`]));
      registryCount = activeRegistryFeeds(registry, new Date(commit.date)).length;
    } catch {
      registryCount = null;
    }
    const latestNow = gitShowJson(commit.sha, 'src/data/latest-news.json') || [];
    const latestBefore = gitShowJson(`${commit.sha}^`, 'src/data/latest-news.json') || [];
    const beforeIds = new Set(latestBefore.map((item) => item.id));
    const newReaderPages = latestNow.filter((item) => !beforeIds.has(item.id) && isPublicLongformArticle(item)).length;
    const columnsNow = gitShowJson(commit.sha, 'src/data/authored-columns.json') || [];
    const columnsBefore = gitShowJson(`${commit.sha}^`, 'src/data/authored-columns.json') || [];
    const columnIdsBefore = new Set(columnsBefore.map((column) => column.id));
    const newColumns = columnsNow.filter((column) => !columnIdsBefore.has(column.id)).length;
    results.push({
      sha: commit.sha.slice(0, 10),
      date: commit.date,
      run_at: lastRun?.at || null,
      items_fetched: pool.length,
      pool_sources: poolSources.size,
      sources_configured: registryCount,
      new_reader_pages: newReaderPages,
      new_columns: newColumns,
      labels: 'items_fetched=measured(git:news-pool.json);pool_sources=measured(git);new_reader_pages=measured(git:isPublicLongformArticle)',
    });
  }
  return results;
}

function joinGitHistory(rows, history) {
  const byRunAt = new Map(history.filter((entry) => entry.run_at).map((entry) => [entry.run_at, entry]));
  let joined = 0;
  for (const row of rows) {
    const entry = byRunAt.get(row.run_id);
    if (!entry) continue;
    joined += 1;
    row.items_fetched = entry.items_fetched;
    row.sources_ok = `>=${entry.pool_sources}`;
    row.commit = entry.sha;
    row.labels += ';items_fetched=measured(git);sources_ok=est(lower-bound:pool-sources)';
    if (entry.sources_configured !== null) {
      row.sources_configured = entry.sources_configured;
      row.labels = row.labels.replace('sources_configured=measured(head-registry)', 'sources_configured=measured(git-registry)');
    }
  }
  return joined;
}

// ---------------------------------------------------------------------------
// Mac subscription job records (optional)
// ---------------------------------------------------------------------------

const JOB_STEPS = [
  'npm run check',
  'node scripts/pipeline.mjs',
  'node scripts/update-industry-headlines.mjs',
  'node scripts/restore-eia-public-inventory.mjs',
  'npm run rebuild:taxonomy-pages',
  'node scripts/audit-reader-copy.mjs --strict',
  'node scripts/audit-omo-ultra-current-state.mjs',
  'npm test',
  'npm run content:gate',
];

function loadJobs(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const record = readJson(path.join(dir, name), null);
      if (!record || typeof record !== 'object') return null;
      // Never surface secrets or machine paths from the record.
      const { lock_owner: _owner, workspace: _workspace, ...safe } = record;
      return { file: name, ...safe };
    })
    .filter(Boolean);
}

function jobRows(jobs, rows) {
  const runTimes = rows.map((row) => Date.parse(row.run_id));
  const WINDOW_MS = 90 * 60 * 1000;
  const extra = [];
  const matched = [];
  for (const job of jobs) {
    const startedAt = Date.parse(job.started_at || '');
    const near = Number.isFinite(startedAt)
      ? rows.find((row, index) => Math.abs(runTimes[index] - startedAt) <= WINDOW_MS)
      : null;
    const stepIndex = JOB_STEPS.findIndex((step) => String(job.stage || '').includes(step.split(' ').pop()));
    if (near) {
      near.labels += `;mac_job=${job.status}@${job.stage || ''}`;
      if (job.status === 'failed' && !near.top_error) near.top_error = `job:${job.last_error || 'failed'}`;
      matched.push({ id: job.id, run_id: near.run_id, status: job.status });
      continue;
    }
    extra.push({
      run_id: `job:${job.id}`,
      started_at: job.started_at || '',
      sources_configured: '',
      sources_ok: 'n/a',
      sources_failed: 'n/a',
      items_fetched: 'n/a',
      items_new: 'n/a',
      items_scored: 'n/a',
      passed_gate: 'n/a',
      drafts: 'n/a',
      qa_passed: 'n/a',
      published: job.status === 'published' ? 1 : 0,
      top_error: job.status === 'failed' ? String(job.last_error || 'failed').slice(0, 200) : job.status || '',
      branch: 'mac_job',
      day: '',
      slot: '',
      column_published: '',
      column_reason: '',
      llm_calls: '',
      llm_failures: '',
      consistency: 'n/a',
      commit: job.published_commit ? String(job.published_commit).slice(0, 10) : '',
      labels: `mac_job=measured(job-record);stage_index=${stepIndex}`,
    });
  }
  return { extra, matched };
}

// ---------------------------------------------------------------------------
// Replay of deterministic gates (optional)
// ---------------------------------------------------------------------------

function stripStoredRelevance(item) {
  const copy = { ...item };
  for (const key of Object.keys(copy)) {
    if (key.startsWith('infrastructure_relevance')) delete copy[key];
  }
  return copy;
}

function replayGates({ pool, dayPlans, since, latest, archived }) {
  const sinceTs = Date.parse(since);
  const curated = [];
  for (const [day, plan] of Object.entries(dayPlans || {})) {
    if (Date.parse(day) < sinceTs) continue;
    for (const item of plan.curatedItems || []) curated.push({ ...item, _day: day });
  }
  const sets = { pool, curated };
  const report = {};
  for (const [name, items] of Object.entries(sets)) {
    const tiers = {};
    const drift = [];
    const extraction = { longform_ok: 0, longform_blocked: 0, public_ok: 0, reasons: {} };
    for (const item of items) {
      const fresh = classifyInfrastructureRelevance(stripStoredRelevance(item));
      const freshTier = fresh.infrastructure_relevance_tier || fresh.tier || 'unknown';
      const storedTier = item.infrastructure_relevance_tier || 'unknown';
      tiers[freshTier] = (tiers[freshTier] || 0) + 1;
      if (storedTier !== 'unknown' && storedTier !== freshTier) drift.push({ id: item.id, stored: storedTier, fresh: freshTier });
      const text = item.contentText || item.snippet || '';
      const qa = analyzeSourceExtractionFailClosed({
        title: item.title,
        rawText: text,
        articleText: text,
        snippet: item.snippet,
        url: item.url,
        sourceUrl: item.url,
        sourceRegistryId: item.sourceRegistryId,
      });
      if (qa.can_generate_longform) extraction.longform_ok += 1; else extraction.longform_blocked += 1;
      if (qa.can_publish_local_article) extraction.public_ok += 1;
      for (const reason of qa.extraction_qa?.block_reasons || qa.block_reasons || []) {
        extraction.reasons[reason] = (extraction.reasons[reason] || 0) + 1;
      }
    }
    report[name] = {
      items: items.length,
      distinct_sources: new Set(items.map((item) => item.sourceRegistryId || item.source)).size,
      stored_tiers: histogram(items.map((item) => item.infrastructure_relevance_tier || 'unknown')),
      replayed_tiers: tiers,
      tier_drift: drift.length,
      tier_drift_samples: drift.slice(0, 5),
      extraction_fail_closed_on_stored_text: { ...extraction, note: 'stored contentText is snippet-length; longform minimum is 1200 chars (source-extraction-fail-closed.mjs:7-8) => est:snippet-only' },
      thresholds: { full_memo: FULL_MEMO_RELEVANCE_THRESHOLD, signal_card: SIGNAL_CARD_RELEVANCE_THRESHOLD },
    };
  }

  // Banned phrase re-check on stored reader-facing bodies.
  const bodies = [...latest, ...archived]
    .filter((item) => isPublicLongformArticle(item))
    .map((item) => ({ id: item.id, text: [item.title, item.summary, item.articleText || item.body || ''].join(' ') }));
  let bannedHits = 0;
  const bannedSamples = [];
  for (const body of bodies) {
    const matches = bannedPhraseMatches(body.text);
    const hits = Array.isArray(matches) ? matches : Object.values(matches || {}).flat();
    if (hits.length) {
      bannedHits += 1;
      if (bannedSamples.length < 5) bannedSamples.push({ id: body.id, matches: hits.slice(0, 3) });
    }
  }
  report.banned_phrase_recheck = {
    reader_pages_checked: bodies.length,
    pages_with_hits: bannedHits,
    samples: bannedSamples,
    note: 'bannedPhraseMatches() returns an object (banned-phrases.mjs:49); authored-column-policy.mjs:211-212 reads .length on it',
  };
  return report;
}

// ---------------------------------------------------------------------------
// Aggregates and hypothesis signals
// ---------------------------------------------------------------------------

function aggregate(rows, { state, since, latest, archived, columns }) {
  const ledgerRows = rows.filter((row) => row.branch !== 'mac_job');
  const sum = (key) => ledgerRows.reduce((acc, row) => acc + (Number.isFinite(Number(row[key])) ? Number(row[key]) : 0), 0);
  const runsByBranch = histogram(ledgerRows.map((row) => row.branch));
  const sinceTs = Date.parse(since);
  const runs = (state.runHistory || []).filter((run) => Date.parse(run.at) >= sinceTs);

  const blockedReasons = histogram(runs.flatMap((run) => reasonsOf(run.blockedItems)));
  const archiveOnlyReasons = histogram(runs.flatMap((run) => reasonsOf(run.archiveOnlyItems)));
  const repetitionReasons = histogram(runs.flatMap((run) => (run.repetitionBlockedItems || []).flatMap((item) => item.repetition_block_reasons || [])));
  const columnReasons = histogram(runs.map((run) => (run.authoredColumn?.published ? 'published' : run.authoredColumn?.reason || 'unknown')));
  const columnSelectionCounts = {};
  for (const run of runs) {
    const counts = run.authoredColumn?.selectionDiagnostics?.counts || run.authoredColumn?.selectionDiagnostics || {};
    for (const [key, value] of Object.entries(counts)) {
      if (typeof value === 'number') columnSelectionCounts[key] = (columnSelectionCounts[key] || 0) + value;
    }
  }

  // Per-source funnel from curated items since `since`.
  const perSource = {};
  for (const [day, plan] of Object.entries(state.dayPlans || {})) {
    if (Date.parse(day) < sinceTs) continue;
    for (const item of plan.curatedItems || []) {
      const key = item.sourceRegistryId || item.source || 'unknown';
      perSource[key] = perSource[key] || { curated: 0, archive_only: 0, signal_card: 0, full_memo: 0, other: 0 };
      perSource[key].curated += 1;
      const tier = item.infrastructure_relevance_tier;
      if (tier === 'archive_only' || tier === 'signal_card' || tier === 'full_memo') perSource[key][tier] += 1; else perSource[key].other += 1;
    }
  }

  // Daily plan exhaustion.
  const dailyPlans = Object.entries(state.dayPlans || {})
    .filter(([day]) => Date.parse(day) >= sinceTs)
    .map(([day, plan]) => ({
      day,
      curated: (plan.curatedItems || []).length,
      processed: (plan.publishedIds || []).length,
      visible: (plan.visibleIds || []).length,
    }));

  // Integrity quarantine reasons in stored records.
  const quarantineReasons = histogram([...latest, ...archived]
    .filter((item) => item.public_status === 'quarantined')
    .flatMap((item) => item.publication_integrity?.reasons || item.quarantine_reasons || [item.quarantine_reason].filter(Boolean)));

  // Gaps between runs (schedule is 3 runs/day => > 16h is a missed slot).
  const times = runs.map((run) => Date.parse(run.at)).sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < times.length; i += 1) {
    const hours = (times[i] - times[i - 1]) / 3_600_000;
    if (hours > 16) gaps.push({ from: new Date(times[i - 1]).toISOString(), to: new Date(times[i]).toISOString(), hours: Math.round(hours) });
  }

  const totals = {
    runs: ledgerRows.length,
    runs_by_branch: runsByBranch,
    items_scored: sum('items_scored'),
    passed_gate: sum('passed_gate'),
    drafts: sum('drafts'),
    qa_passed: sum('qa_passed'),
    published_wire_visible: ledgerRows.reduce((acc, row) => acc + (Number(row.published) || 0) - (Number(row.column_published) || 0), 0),
    columns_published: sum('column_published'),
    runs_with_zero_published: ledgerRows.filter((row) => Number(row.published) === 0).length,
    runs_with_llm_failures: ledgerRows.filter((row) => Number(row.llm_failures) > 0).length,
    consistency_mismatches: ledgerRows.filter((row) => String(row.consistency).startsWith('mismatch')).length,
    schedule_gaps_over_16h: gaps,
    first_run: ledgerRows[0]?.run_id || null,
    last_run: ledgerRows[ledgerRows.length - 1]?.run_id || null,
  };

  const duplicateSlugs = (() => {
    const counts = {};
    for (const item of archived) if (item.slug) counts[item.slug] = (counts[item.slug] || 0) + 1;
    const dupes = Object.entries(counts).filter(([, count]) => count > 1);
    return { distinct_duplicated_slugs: dupes.length, records_involved: dupes.reduce((acc, [, count]) => acc + count, 0) };
  })();
  const duplicatePublishedIds = (() => {
    const seen = new Map();
    for (const run of runs) for (const id of run.publishedIds || []) seen.set(id, (seen.get(id) || 0) + 1);
    return [...seen.values()].filter((count) => count > 1).length;
  })();

  const measuredFetched = ledgerRows.filter((row) => Number.isFinite(Number(row.items_fetched)));
  const fetchedAvg = measuredFetched.length ? measuredFetched.reduce((acc, row) => acc + Number(row.items_fetched), 0) / measuredFetched.length : null;
  const itemsNewAvgPerDay = dailyPlans.length ? dailyPlans.reduce((acc, day) => acc + day.curated, 0) / dailyPlans.length : null;
  const topGateReasons = Object.entries({ ...archiveOnlyReasons, ...blockedReasons }).sort((a, b) => b[1] - a[1]);
  const gateReasonTotal = topGateReasons.reduce((acc, [, count]) => acc + count, 0);
  const top2Share = gateReasonTotal ? pct(topGateReasons.slice(0, 2).reduce((acc, [, count]) => acc + count, 0), gateReasonTotal) : null;

  const signals = {
    H1_source_pool: {
      sources_ok_ratio: 'not measurable from state (sources_ok not persisted); see git-history pool_sources lower bound',
      items_fetched_avg_measured: fetchedAvg === null ? null : Math.round(fetchedAvg * 10) / 10,
      items_fetched_cap: 30,
      items_new_avg_per_day_est: itemsNewAvgPerDay === null ? null : Math.round(itemsNewAvgPerDay * 10) / 10,
      brief_threshold: 'items_new < 20 per cycle',
      triggered: itemsNewAvgPerDay !== null ? itemsNewAvgPerDay < 20 : null,
    },
    H2_gates: {
      items_scored_total: totals.items_scored,
      passed_gate_ratio_pct: pct(totals.passed_gate, totals.items_scored),
      qa_passed_over_drafts_pct: pct(totals.qa_passed, totals.drafts),
      top_gate_reasons: Object.fromEntries(topGateReasons.slice(0, 5)),
      top2_reason_share_pct: top2Share,
      brief_threshold: 'items_scored >= 20 && passed_gate/items_scored < 5%, or qa_passed/drafts < 50% concentrated in 1-2 rules',
      triggered: totals.items_scored >= 20 && (pct(totals.passed_gate, totals.items_scored) ?? 100) < 5,
    },
    H3_code_defects: {
      consistency_mismatches: totals.consistency_mismatches,
      duplicate_published_ids_across_runs: duplicatePublishedIds,
      duplicate_archive_slugs: duplicateSlugs,
      unhandled_exception_runs: 'not measurable from state: pipeline.mjs:445 aborts before the ledger write (survivorship bias); needs Mac job records (--jobs)',
      runs_with_llm_failures: totals.runs_with_llm_failures,
      brief_threshold: 'unhandled-exception runs > 20%, stage count mismatch, duplicate publish, stage order error',
    },
  };

  return {
    totals,
    reasons: {
      blocked: blockedReasons,
      archive_only: archiveOnlyReasons,
      repetition: repetitionReasons,
      column_outcome: columnReasons,
      column_selection_counts: columnSelectionCounts,
      integrity_quarantine: quarantineReasons,
    },
    per_source: Object.fromEntries(Object.entries(perSource).sort((a, b) => b[1].curated - a[1].curated)),
    daily_plans: dailyPlans,
    public_inventory: {
      latest_records: latest.length,
      archived_records: archived.length,
      reader_pages_news: [...latest, ...archived].filter((item) => isPublicLongformArticle(item)).length,
      columns_records: columns.length,
      columns_published: publishedColumns(columns).length,
    },
    signals,
  };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function csvEscape(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  const lines = [FUNNEL_COLUMNS.join(',')];
  for (const row of rows) lines.push(FUNNEL_COLUMNS.map((column) => csvEscape(row[column])).join(','));
  return `${lines.join('\n')}\n`;
}

function toMarkdownTable(rows, columns = FUNNEL_COLUMNS.slice(0, 13)) {
  const head = `| ${columns.join(' | ')} |`;
  const sep = `|${columns.map(() => '---').join('|')}|`;
  const body = rows.map((row) => `| ${columns.map((column) => String(row[column] ?? '').replace(/\|/g, '\\|')).join(' | ')} |`);
  return [head, sep, ...body].join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = readJson(args.state);
  const registry = loadSourceRegistrySync(args.registry);
  const pool = readJson(path.join(args.dataDir, 'news-pool.json'), []);
  const latest = readJson(path.join(args.dataDir, 'latest-news.json'), []);
  const archived = readJson(path.join(args.dataDir, 'archived-news.json'), []);
  const columns = readJson(path.join(args.dataDir, 'authored-columns.json'), []);

  const rows = buildRunRows({ state, registry, since: args.since });
  let gitHistory = [];
  let gitJoined = 0;
  if (args.gitHistory) {
    gitHistory = buildGitHistory({ since: args.since });
    gitJoined = joinGitHistory(rows, gitHistory);
  }
  const jobs = loadJobs(args.jobs);
  const { extra: jobExtraRows, matched: jobMatched } = jobRows(jobs, rows);
  const allRows = [...rows, ...jobExtraRows].sort((a, b) => Date.parse(a.started_at || 0) - Date.parse(b.started_at || 0));
  for (const row of allRows) delete row._run;

  const summary = aggregate(allRows, { state, since: args.since, latest, archived, columns });
  const replay = args.replay ? replayGates({ pool, dayPlans: state.dayPlans, since: args.since, latest, archived }) : null;

  const output = {
    generated_at: new Date().toISOString(),
    since: args.since,
    inputs: {
      state: path.relative(ROOT, args.state),
      registry: path.relative(ROOT, args.registry),
      run_history_total: (state.runHistory || []).length,
      run_history_since: rows.length,
      git_history_commits: gitHistory.length,
      git_history_joined_runs: gitJoined,
      mac_jobs_loaded: jobs.length,
      mac_jobs_matched_to_runs: jobMatched.length,
      mac_jobs_extra_rows: jobExtraRows.length,
    },
    columns: FUNNEL_COLUMNS,
    rows: allRows,
    git_history: gitHistory,
    summary,
    replay,
  };

  if (args.out) {
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, toCsv(allRows));
  }
  if (args.json) {
    fs.mkdirSync(path.dirname(args.json), { recursive: true });
    fs.writeFileSync(args.json, `${JSON.stringify(output, null, 2)}\n`);
  }
  if (!args.quiet) {
    process.stdout.write(`# funnel since ${args.since}: ${allRows.length} rows (${rows.length} ledger runs, ${jobExtraRows.length} job-only rows)\n\n`);
    process.stdout.write(`${toMarkdownTable(allRows)}\n\n`);
    process.stdout.write(`## totals\n${JSON.stringify(summary.totals, null, 2)}\n\n## signals\n${JSON.stringify(summary.signals, null, 2)}\n`);
    if (replay) process.stdout.write(`\n## replay\n${JSON.stringify(replay, null, 2)}\n`);
  }
}

main();
