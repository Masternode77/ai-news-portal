import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT_PATH = path.join(ROOT, 'docs/deployment-verification-report.md');
const DEFAULT_SITE = 'https://www.computecurrent.com';

const FORBIDDEN = [
  'Backfilled Analysis',
  'Verification frame',
  'Verified facts',
  'Key numbers',
  'Source count',
  'Unsupported claims',
  'Claim verification',
  'claim ledger',
  'evidence anchor',
  'infrastructure lane',
  'cluster clears the desk bar',
  'source item centers on',
  'control point in this story',
  'Why the desk selected it',
];

async function git(args = []) {
  const { stdout } = await execFileAsync('git', args, { cwd: ROOT });
  return stdout.trim();
}

async function readJson(relPath, fallback = []) {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, relPath), 'utf8'));
  } catch {
    return fallback;
  }
}

async function fetchText(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'ComputeCurrentLaunchVerifier/1.0' },
    });
    const text = await response.text().catch(() => '');
    return { url, ok: response.ok, status: response.status, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function vercelInspect(siteUrl = DEFAULT_SITE) {
  try {
    const { stdout } = await execFileAsync('vercel', ['inspect', siteUrl, '--format=json'], {
      cwd: ROOT,
      timeout: 30000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return { ok: true, json: JSON.parse(stdout) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function deploymentState(inspect = {}) {
  const json = inspect.json || {};
  return json.readyState || json.state || json.status || '';
}

function deploymentAliases(inspect = {}) {
  const json = inspect.json || {};
  const aliases = json.alias || json.aliases || json.targets?.production?.alias || [];
  return Array.isArray(aliases) ? aliases.map(String) : [];
}

function deploymentCommit(inspect = {}) {
  const meta = inspect.json?.meta || inspect.json?.deployment?.meta || {};
  return meta.githubCommitSha || meta.gitCommitSha || meta.commitSha || '';
}

function forbiddenHits(text = '') {
  return FORBIDDEN.filter((phrase) => text.includes(phrase));
}

export async function verifyDeployment(options = {}) {
  const siteUrl = (options.siteUrl || process.env.SITE_URL || DEFAULT_SITE).replace(/\/$/, '');
  const latest = await readJson('src/data/latest-news.json', []);
  const localArticlePaths = latest
    .filter((item) => item.articlePagePublished === true && item.noindex !== true)
    .slice(0, 20)
    .map((item) => `/news/${item.id}/`);
  const paths = [
    '/',
    '/rss.xml',
    '/sitemap.xml',
    '/archive/',
    '/about/',
    '/methodology/',
    '/editorial-policy/',
    '/ai-disclosure/',
    '/subscribe/',
    ...localArticlePaths,
  ];

  const sha = await git(['rev-parse', 'HEAD']).catch(() => '');
  const inspect = await vercelInspect(siteUrl);
  const fetches = [];
  for (const relPath of paths) {
    fetches.push(await fetchText(`${siteUrl}${relPath}`).catch((error) => ({
      url: `${siteUrl}${relPath}`,
      ok: false,
      status: 0,
      text: '',
      error: error.message,
    })));
  }
  const failedFetches = fetches.filter((item) => !item.ok);
  const strictDeploymentFetch = options.requireMatchingSha
    || process.env.REQUIRE_DEPLOYED_SHA === '1'
    || process.env.DEPLOYMENT_STRICT_FETCH === '1';
  const optionalLaunchPaths = new Set(['/subscribe/']);
  const failedCoreFetches = failedFetches.filter((item) => {
    const pathname = new URL(item.url).pathname;
    if (/\/news\//.test(pathname)) return false;
    return strictDeploymentFetch || !optionalLaunchPaths.has(pathname);
  });
  const pendingLaunchFetches = failedFetches.filter((item) => {
    const pathname = new URL(item.url).pathname;
    return !strictDeploymentFetch && optionalLaunchPaths.has(pathname);
  });
  const failedArticleFetches = failedFetches.filter((item) => /\/news\//.test(new URL(item.url).pathname));
  const publicPayload = fetches.map((item) => item.text).join('\n');
  const hits = forbiddenHits(publicPayload);
  const aliases = deploymentAliases(inspect);
  const state = deploymentState(inspect);
  const inspectCommit = deploymentCommit(inspect);
  const purgeReport = await fs.readFile(path.join(ROOT, 'docs/public-cache-purge-report.md'), 'utf8').catch(() => '');
  const purgeStatus = /Status:\s*purged/i.test(purgeReport)
    ? 'purged'
    : /Status:\s*skipped/i.test(purgeReport)
      ? 'skipped: missing purge hook env'
      : 'not recorded';

  const failures = [];
  const warnings = [];
  if (failedCoreFetches.length) failures.push(`${failedCoreFetches.length} core production URL(s) failed fetch`);
  if (pendingLaunchFetches.length) {
    warnings.push(`${pendingLaunchFetches.length} new launch page URL(s) are not live yet; strict post-push verification must re-run`);
  }
  if (failedArticleFetches.length && strictDeploymentFetch) {
    failures.push(`${failedArticleFetches.length} production article URL(s) failed fetch`);
  } else if (failedArticleFetches.length) {
    warnings.push(`${failedArticleFetches.length} production article URL(s) are not live yet; strict post-push verification must re-run`);
  }
  if (hits.length) failures.push(`forbidden public phrase leaked in deployed HTML: ${hits.join(', ')}`);
  if (inspect.ok && state && state !== 'READY') failures.push(`Vercel deployment state is ${state}`);
  if (inspect.ok && aliases.length && !aliases.some((alias) => /computecurrent\.com$/.test(alias))) {
    failures.push('production aliases do not include computecurrent.com');
  }
  if ((options.requireMatchingSha || process.env.REQUIRE_DEPLOYED_SHA === '1') && inspectCommit && sha && inspectCommit !== sha) {
    failures.push(`deployment SHA mismatch: ${inspectCommit} != ${sha}`);
  }

  const lines = [
    '# Deployment Verification Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    `Latest commit SHA: ${sha || 'unknown'}`,
    `Deployed URL: ${siteUrl}`,
    `Deployment state: ${state || (inspect.ok ? 'unknown' : 'inspect unavailable')}`,
    `Deployment commit SHA: ${inspectCommit || 'not reported by Vercel inspect'}`,
    `Production aliases: ${aliases.length ? aliases.join(', ') : 'not reported'}`,
    `Cache purge status: ${purgeStatus}`,
    `Production URLs fetched: ${fetches.length}`,
    `Failed fetches: ${failedFetches.length}`,
    `Deployed public audit status: ${failures.length ? 'fail' : 'pass'}`,
    '',
    '## Differences / Notes',
    '',
    inspectCommit && sha && inspectCommit !== sha
      ? `- Production reported ${inspectCommit}; local HEAD is ${sha}.`
      : '- No local/deployed SHA difference was reported by Vercel inspect.',
    purgeStatus.startsWith('skipped')
      ? '- Cache purge did not run because COMPUTE_CURRENT_CACHE_PURGE_URL or VERCEL_DEPLOY_HOOK_URL was not configured.'
      : `- Cache purge: ${purgeStatus}.`,
    ...warnings.map((warning) => `- ${warning}.`),
    '',
    '## Failures',
    '',
    failures.length ? failures.map((failure) => `- ${failure}`).join('\n') : '- None',
  ];
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${lines.join('\n')}\n`, 'utf8');

  return {
    ok: failures.length === 0,
    failures,
    reportPath: REPORT_PATH,
    sha,
    siteUrl,
    state,
    aliases,
    inspectCommit,
    purgeStatus,
    fetches,
  };
}
