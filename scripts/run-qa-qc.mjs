import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyProductionSurface } from './verify-production-surface.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REPORT = path.join(ROOT, 'docs/qa-qc-report.md');
const DEFAULT_JSON = path.join(ROOT, 'evidence/qa-qc/qa-qc-report.json');
const DEFAULT_PRODUCTION_REPORT = path.join(ROOT, 'evidence/qa-qc/production-verification-report.md');
const DEFAULT_PRODUCTION_JSON = path.join(ROOT, 'evidence/qa-qc/production-verification-report.json');
const ALLOWED_VERDICTS = new Set(['deployable', 'deployable with operational follow-up', 'blocked']);

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    out: DEFAULT_REPORT,
    json: DEFAULT_JSON,
    productionOut: DEFAULT_PRODUCTION_REPORT,
    productionJson: DEFAULT_PRODUCTION_JSON,
    localDist: 'dist',
    live: 'https://www.computecurrent.com',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith('--')) continue;
    const key = raw.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = argv[i + 1];
    args[key] = next && !next.startsWith('--') ? argv[++i] : true;
  }
  return args;
}

function commandLine(command, args = []) {
  return [command, ...args].join(' ');
}

function commandStatus(command = {}) {
  if (command.skipped) return 'skipped';
  return command.ok ? 'passed' : 'failed';
}

function runCommand(command, args = [], options = {}) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, ...(options.env || {}) },
  });
  return {
    command: commandLine(command, args),
    startedAt,
    exitCode: result.status ?? 1,
    ok: result.status === 0,
    stdout: (result.stdout || '').slice(-4000),
    stderr: (result.stderr || '').slice(-4000),
    error: result.error ? result.error.message : '',
  };
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function parseJsonFile(filePath, label) {
  const parsed = await readJson(path.join(ROOT, filePath));
  return {
    name: `parse ${filePath}`,
    command: `JSON.parse(${filePath})`,
    ok: Boolean(parsed),
    detail: parsed ? `${label}: parsed` : `${label}: failed to parse`,
  };
}

async function mergeIntegrityChecks() {
  const unmerged = runCommand('git', ['diff', '--name-only', '--diff-filter=U']);
  const latest = await parseJsonFile('src/data/latest-news.json', 'latest news');
  const archived = await parseJsonFile('src/data/archived-news.json', 'archived news');
  const search = await parseJsonFile('src/data/search-index.json', 'search index');
  return [
    {
      name: 'unmerged git paths',
      command: unmerged.command,
      ok: unmerged.ok && unmerged.stdout.trim() === '',
      detail: unmerged.stdout.trim() || 'none',
    },
    latest,
    archived,
    search,
  ];
}

function operationalFollowUps(production = {}) {
  const followUps = [];
  if (production.live?.skipped) followUps.push(production.live.blocker || 'live verification skipped');
  if (production.live && !production.live.skipped && production.live.ok === false) {
    followUps.push('live URL verification failed or is not yet deployed');
  }
  if (production.staging?.skipped) followUps.push(production.staging.blocker || 'staging verification skipped');
  if (production.staging && !production.staging.skipped && production.staging.ok === false) {
    followUps.push('staging URL verification failed or is not yet deployed');
  }
  if (production.cachePurge?.status && production.cachePurge.status !== 'purged') {
    followUps.push(production.cachePurge.blocker || `cache purge ${production.cachePurge.status}`);
  }
  return [...new Set(followUps)];
}

export function classifyQaQcVerdict({
  localGateOk = true,
  localGateSkipped = false,
  mergeChecks = [],
  production = {},
} = {}) {
  if (!localGateOk) return { verdict: 'blocked', reasons: ['local QA gate failed'], followUps: [] };
  const failedMergeChecks = mergeChecks.filter((check) => !check.ok);
  if (failedMergeChecks.length) {
    return {
      verdict: 'blocked',
      reasons: failedMergeChecks.map((check) => `merge/data integrity failed: ${check.name}`),
      followUps: [],
    };
  }
  if (production.localDist && production.localDist.ok === false) {
    return { verdict: 'blocked', reasons: ['local dist verification failed'], followUps: [] };
  }
  const followUps = operationalFollowUps(production);
  if (localGateSkipped) followUps.push('local content gate skipped in this run; use prior gate evidence before release');
  if (followUps.length) {
    return { verdict: 'deployable with operational follow-up', reasons: [], followUps };
  }
  return { verdict: 'deployable', reasons: [], followUps: [] };
}

function reportLines(result = {}) {
  return [
    '# AI News Portal QA/QC Report',
    '',
    `Generated at: ${result.generatedAt}`,
    `Verdict: ${result.verdict}`,
    '',
    '## Commands Run',
    '',
    ...result.commands.map((command) => `- \`${command.command}\` -> ${commandStatus(command)} (${command.exitCode})`),
    ...result.mergeChecks.map((check) => `- \`${check.command}\` -> ${check.ok ? 'passed' : 'failed'}`),
    `- \`production surface verification\` -> ${result.production.localDist?.ok ? 'local dist passed' : 'local dist failed'}`,
    '',
    '## Artifacts',
    '',
    `- JSON result: \`${path.relative(ROOT, result.jsonPath)}\``,
    `- Markdown report: \`${path.relative(ROOT, result.reportPath)}\``,
    `- Production verification report: \`${path.relative(ROOT, result.productionReportPath)}\``,
    `- Production verification JSON: \`${path.relative(ROOT, result.productionJsonPath)}\``,
    '',
    '## Pass/Fail',
    '',
    `- Verdict: ${result.verdict}`,
    `- Local gate: ${result.localGateSkipped ? 'skipped (prior gate evidence required)' : result.localGateOk ? 'passed' : 'failed'}`,
    `- Merge/data integrity: ${result.mergeChecks.every((check) => check.ok) ? 'passed' : 'failed'}`,
    `- Local distribution: ${result.production.localDist?.ok ? 'passed' : 'failed'}`,
    `- Live verification: ${result.production.live?.ok ? 'passed' : result.production.live?.skipped ? 'skipped' : 'failed'}`,
    `- Cache purge: ${result.production.cachePurge?.status || 'unknown'}`,
    '',
    '## Remaining Risks',
    '',
    ...(result.followUps.length
      ? result.followUps.map((item) => `- ${item}`)
      : ['- No operational follow-up required by this run.']),
    ...(result.reasons.length
      ? result.reasons.map((item) => `- Blocking reason: ${item}`)
      : []),
    '- This QA/QC workflow does not use production secrets and does not execute cache purge.',
    '',
    '## Cleanup Receipts',
    '',
    '- No production secret was read or required.',
    '- Cache purge was explicitly skipped by the QA/QC workflow.',
    '- No dev server, tmux session, browser context, or bound port is left running by this script.',
    '',
  ];
}

async function writeResult(result, reportPath, jsonPath) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await fs.writeFile(reportPath, reportLines(result).join('\n'), 'utf8');
}

export async function runQaQc(options = {}) {
  const commands = [];
  let localGateOk = true;
  let localGateSkipped = false;

  if (!options.skipContentGate) {
    const localGate = runCommand('npm', ['run', 'content:gate']);
    commands.push(localGate);
    localGateOk = localGate.ok;
  } else {
    localGateSkipped = true;
    commands.push({
      command: 'npm run content:gate',
      startedAt: new Date().toISOString(),
      exitCode: 0,
      ok: true,
      skipped: true,
      stdout: 'skipped by --skip-content-gate',
      stderr: '',
      error: '',
    });
  }

  const mergeChecks = await mergeIntegrityChecks();
  const productionReportPath = path.resolve(ROOT, options.productionOut || DEFAULT_PRODUCTION_REPORT);
  const productionJsonPath = path.resolve(ROOT, options.productionJson || DEFAULT_PRODUCTION_JSON);
  const production = await verifyProductionSurface({
    localDist: options.localDist || 'dist',
    live: options.skipLive ? '' : options.live,
    out: productionReportPath,
    json: productionJsonPath,
    skipCachePurge: true,
  });
  const classification = classifyQaQcVerdict({ localGateOk, localGateSkipped, mergeChecks, production });
  const reportPath = path.resolve(ROOT, options.out || DEFAULT_REPORT);
  const jsonPath = path.resolve(ROOT, options.json || DEFAULT_JSON);
  const result = {
    generatedAt: new Date().toISOString(),
    verdict: classification.verdict,
    reasons: classification.reasons,
    followUps: classification.followUps,
    localGateOk,
    localGateSkipped,
    commands,
    mergeChecks,
    production,
    reportPath,
    jsonPath,
    productionReportPath,
    productionJsonPath,
  };
  await writeResult(result, reportPath, jsonPath);
  return result;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = parseArgs();
  if (args.help) {
    console.log('Usage: node scripts/run-qa-qc.mjs [--skip-content-gate] [--skip-live] [--out <report.md>] [--json <report.json>]');
    process.exit(0);
  }
  const result = await runQaQc(args);
  if (!ALLOWED_VERDICTS.has(result.verdict)) {
    console.error(`invalid QA/QC verdict: ${result.verdict}`);
    process.exit(1);
  }
  console.log(`qa/qc verdict: ${result.verdict}`);
  console.log(`report: ${path.relative(ROOT, result.reportPath)}`);
  console.log(`json: ${path.relative(ROOT, result.jsonPath)}`);
  if (result.verdict === 'blocked') process.exitCode = 1;
}
