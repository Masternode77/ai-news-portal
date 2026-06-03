import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REPORT = path.join(ROOT, 'docs/production-verification-report.md');
const DEFAULT_JSON = path.join(ROOT, 'evidence/compute-current-omo-ultra-rebuild/task-16-production.json');
const DEFAULT_SCREENSHOTS = [
  'evidence/compute-current-omo-ultra-rebuild/task-14-homepage.png',
  'evidence/compute-current-omo-ultra-rebuild/task-14-article.png',
];

function parseArgs(argv = process.argv.slice(2)) {
  const args = { out: DEFAULT_REPORT, json: DEFAULT_JSON };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    args[key.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return args;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return {};
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function distFileStatus(distDir, relativePath) {
  const filePath = path.join(distDir, relativePath);
  if (!(await exists(filePath))) return { path: relativePath, ok: false, status: 'missing' };
  const stat = await fs.stat(filePath);
  return { path: relativePath, ok: stat.size > 0, status: stat.size > 0 ? 'present' : 'empty', bytes: stat.size };
}

async function inspectLocalDist(distDir) {
  if (!distDir) return { kind: 'local-dist', ok: false, blocker: 'local dist path not provided' };
  const absolute = path.resolve(ROOT, distDir);
  const sitemap = await exists(path.join(absolute, 'sitemap.xml')) ? 'sitemap.xml' : 'sitemap-index.xml';
  const files = await Promise.all([
    distFileStatus(absolute, 'index.html'),
    distFileStatus(absolute, 'rss.xml'),
    distFileStatus(absolute, sitemap),
  ]);
  const stat = await fs.stat(absolute).catch(() => null);
  return {
    kind: 'local-dist',
    path: absolute,
    ok: files.every((file) => file.ok),
    buildId: stat ? `dist-mtime-${Math.trunc(stat.mtimeMs)}` : 'dist-missing',
    files,
  };
}

async function fetchUrl(url, pathname = '/') {
  const target = new URL(pathname, url).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(target, { signal: controller.signal, redirect: 'follow' });
    const text = await response.text().catch(() => '');
    return { url: target, ok: response.ok, status: response.status, bytes: text.length };
  } catch (error) {
    return { url: target, ok: false, error: error.name === 'AbortError' ? 'timeout' : error.message };
  } finally {
    clearTimeout(timeout);
  }
}

async function inspectUrl(label, url) {
  if (!url) {
    return { label, ok: false, skipped: true, blocker: `skipped ${label} step: URL not provided` };
  }
  const checks = await Promise.all([
    fetchUrl(url, '/'),
    fetchUrl(url, '/rss.xml'),
    fetchUrl(url, '/sitemap.xml'),
  ]);
  return { label, url, ok: checks.every((check) => check.ok), checks };
}

async function maybePurgeCache() {
  const purgeUrl = process.env.COMPUTE_CURRENT_CACHE_PURGE_URL || process.env.VERCEL_DEPLOY_HOOK_URL || '';
  const token = process.env.COMPUTE_CURRENT_CACHE_PURGE_TOKEN || process.env.VERCEL_TOKEN || '';
  if (!purgeUrl) {
    return {
      status: 'skipped',
      blocker: 'credential blocker: missing COMPUTE_CURRENT_CACHE_PURGE_URL or VERCEL_DEPLOY_HOOK_URL',
    };
  }
  const response = await fetch(purgeUrl, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason: 'compute_current_final_verification', at: new Date().toISOString() }),
  });
  const body = await response.text().catch(() => '');
  return { status: response.ok ? 'purged' : 'failed', httpStatus: response.status, response: body.slice(0, 500) };
}

async function screenshotArtifacts(paths = DEFAULT_SCREENSHOTS) {
  const out = [];
  for (const screenshotPath of paths) {
    const absolute = path.resolve(ROOT, screenshotPath);
    if (await exists(absolute)) {
      const stat = await fs.stat(absolute);
      out.push({ path: screenshotPath, bytes: stat.size, status: 'present' });
    } else {
      out.push({ path: screenshotPath, status: 'missing' });
    }
  }
  return out;
}

function linesForUrl(result) {
  if (result.skipped) return [`- ${result.label}: ${result.blocker}`];
  return [
    `- ${result.label} URL: ${result.url}`,
    ...result.checks.map((check) => `  - ${check.url}: ${check.ok ? 'live status passed' : 'live status failed'} ${check.status || check.error}`),
  ];
}

async function writeReport(result, reportPath) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  const localFiles = result.localDist.files || [];
  const lines = [
    '# Production Verification Report',
    '',
    `Generated at: ${result.generatedAt}`,
    `Build ID: ${result.buildId}`,
    '',
    '## Target URL Summary',
    '',
    `- Local URL: ${result.localUrl || result.localDist.path || 'skipped local URL step: URL not provided'}`,
    `- Staging URL: ${result.stagingUrl || 'skipped staging step: URL not provided'}`,
    `- Live URL: ${result.liveUrl || 'skipped live step: URL not provided'}`,
    '',
    '## Commands Run',
    '',
    `- \`${result.command}\``,
    '',
    '## Artifacts',
    '',
    `- JSON result: \`${path.relative(ROOT, result.jsonPath)}\``,
    `- Markdown report: \`${path.relative(ROOT, reportPath)}\``,
    ...result.screenshots.map((item) => `- Screenshot: \`${item.path}\` (${item.status}${item.bytes ? `, ${item.bytes} bytes` : ''})`),
    '',
    '## Pass/Fail',
    '',
    `- Local dist status: ${result.localDist.ok ? 'passed' : 'failed'}`,
    ...localFiles.map((file) => `  - ${file.path}: ${file.status}${file.bytes ? ` (${file.bytes} bytes)` : ''}`),
    ...linesForUrl(result.local),
    ...linesForUrl(result.staging),
    ...linesForUrl(result.live),
    `- Cache purge status: ${result.cachePurge.status}${result.cachePurge.httpStatus ? ` HTTP ${result.cachePurge.httpStatus}` : ''}`,
    result.cachePurge.blocker ? `- Cache purge blocker: ${result.cachePurge.blocker}` : '- Cache purge response captured.',
    '',
    '## Remaining Risks',
    '',
    '- Live content freshness cannot be asserted unless the live URL checks and cache purge both succeed in the same credentialed run.',
    '- Staging was not checked when no staging URL was supplied.',
    '- Existing Astro check hints remain informational unless they become build errors.',
    '',
    '## Cleanup Receipts',
    '',
    '- No dev server, tmux session, browser context, temp directory, or cache-purge credential was created by this harness run.',
    '- Screenshot artifacts reused from Task 14 local browser QA; no screenshot process remained open.',
    '',
  ];
  await fs.writeFile(reportPath, lines.join('\n'), 'utf8');
}

export async function verifyProductionSurface(options = {}) {
  const packageJson = await readJson(path.join(ROOT, 'package.json'));
  const localDist = await inspectLocalDist(options.localDist || options['local-dist'] || 'dist');
  const [local, staging, live, cachePurge, screenshots] = await Promise.all([
    inspectUrl('local', options.local),
    inspectUrl('staging', options.staging),
    inspectUrl('live', options.live),
    maybePurgeCache(),
    screenshotArtifacts(),
  ]);
  const result = {
    generatedAt: new Date().toISOString(),
    command: `node scripts/verify-production-surface.mjs ${process.argv.slice(2).join(' ')}`,
    buildId: `${packageJson.version || '0.0.0'}:${localDist.buildId}`,
    localUrl: options.local || '',
    stagingUrl: options.staging || '',
    liveUrl: options.live || '',
    localDist,
    local,
    staging,
    live,
    cachePurge,
    screenshots,
    jsonPath: path.resolve(ROOT, options.json || DEFAULT_JSON),
  };
  const reportPath = path.resolve(ROOT, options.out || DEFAULT_REPORT);
  await fs.mkdir(path.dirname(result.jsonPath), { recursive: true });
  await fs.writeFile(result.jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await writeReport(result, reportPath);
  return result;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await verifyProductionSurface(parseArgs());
  console.log(`production verification harness completed: localDist=${result.localDist.ok ? 'passed' : 'failed'}, live=${result.live.ok ? 'passed' : result.live.skipped ? 'skipped' : 'failed'}, cache=${result.cachePurge.status}`);
  if (!result.localDist.ok) process.exitCode = 1;
}
