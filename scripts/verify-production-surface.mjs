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
const PUBLICATION_ROUTES = ['/archive/', '/sample/'];
const INDEXED_PUBLICATION_ROUTES = ['/archive/'];
const LEGACY_OPEN_ROUTES = ['/subscribe/', '/pricing/', '/briefing/'];
const NONINDEXED_ROUTES = [...LEGACY_OPEN_ROUTES, '/sample/'];
const SMOKE_PATHS = [
  '/',
  ...PUBLICATION_ROUTES,
  '/rss.xml',
  '/sitemap.xml',
  '/sitemap-index.xml',
  '/robots.txt',
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

function usage() {
  return [
    'Usage: node scripts/verify-production-surface.mjs [options]',
    '',
    'Options:',
    '  --local-dist <path>       Built static output to inspect',
    '  --staging <url>           Preview deployment URL',
    '  --live <url>              Live deployment URL',
    '  --skip-cache-purge        Never invoke the cache purge endpoint',
    '  --screenshots <a,b,...>   Screenshot paths to include in the receipt',
    '  --out <path>              Markdown report path',
    '  --json <path>             JSON receipt path',
  ].join('\n');
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

async function readText(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function firstAstroChildSitemap(distDir) {
  const entries = await fs.readdir(distDir).catch(() => []);
  return entries.find((entry) => /^sitemap-\d+\.xml$/.test(entry)) || '';
}

function routeFile(route) {
  const slug = route.replace(/^\/|\/$/g, '');
  return slug ? `${slug}/index.html` : 'index.html';
}

function localNewsIdsFromXml(xml = '') {
  return [...xml.matchAll(/https:\/\/www\.computecurrent\.com\/news\/([^/]+)\//g)].map((match) => match[1]);
}

async function inspectLocalDistributionDetails(distDir) {
  const homepage = await readText(path.join(distDir, 'index.html'));
  const sitemap = await readText(path.join(distDir, 'sitemap.xml'));
  const rss = await readText(path.join(distDir, 'rss.xml'));
  const sitemapIndex = await readText(path.join(distDir, 'sitemap-index.xml'));
  const childSitemap = await firstAstroChildSitemap(distDir);
  const childXml = childSitemap ? await readText(path.join(distDir, childSitemap)) : '';
  const homepageMissingPublicLinks = [...PUBLICATION_ROUTES, '/rss.xml'].filter((route) => !homepage.includes(`href="${route}"`) && !homepage.includes(`href='${route}'`));
  const homepageUnexpectedLegacyLinks = LEGACY_OPEN_ROUTES.filter((route) => homepage.includes(`href="${route}"`) || homepage.includes(`href='${route}'`));
  const customSitemapMissingPublic = INDEXED_PUBLICATION_ROUTES.filter((route) => !sitemap.includes(route));
  const customSitemapUnexpectedLegacy = NONINDEXED_ROUTES.filter((route) => sitemap.includes(route));
  const astroSitemapMissingPublic = INDEXED_PUBLICATION_ROUTES.filter((route) => !childXml.includes(route));
  const astroSitemapUnexpectedLegacy = NONINDEXED_ROUTES.filter((route) => childXml.includes(route));
  const rssLocalNewsIds = localNewsIdsFromXml(rss);
  const rssLocalFileStatuses = await Promise.all(rssLocalNewsIds.map(async (id) => ({
    id,
    exists: await exists(path.join(distDir, 'news', id, 'index.html')),
  })));
  const rssLocalMissingFiles = rssLocalFileStatuses.filter((item) => !item.exists).map((item) => item.id);
  const sitemapIndexReferencesChild = Boolean(childSitemap && sitemapIndex.includes(childSitemap));

  return {
    homepageMissingPublicLinks,
    homepageUnexpectedLegacyLinks,
    customSitemapMissingPublic,
    customSitemapUnexpectedLegacy,
    astroSitemapChild: childSitemap || null,
    astroSitemapMissingPublic,
    astroSitemapUnexpectedLegacy,
    sitemapIndexReferencesChild,
    rssLocalNewsLinks: rssLocalNewsIds.length,
    rssLocalMissingFiles,
    ok: homepageMissingPublicLinks.length === 0
      && homepageUnexpectedLegacyLinks.length === 0
      && customSitemapMissingPublic.length === 0
      && customSitemapUnexpectedLegacy.length === 0
      && astroSitemapMissingPublic.length === 0
      && astroSitemapUnexpectedLegacy.length === 0
      && sitemapIndexReferencesChild
      && rssLocalMissingFiles.length === 0,
  };
}

async function inspectLocalDist(distDir) {
  if (!distDir) return { kind: 'local-dist', ok: false, blocker: 'local dist path not provided' };
  const absolute = path.resolve(ROOT, distDir);
  const requiredFiles = [
    'index.html',
    'rss.xml',
    'sitemap.xml',
    'sitemap-index.xml',
    'robots.txt',
    ...PUBLICATION_ROUTES.map(routeFile),
    ...LEGACY_OPEN_ROUTES.map(routeFile),
  ];
  const files = await Promise.all(requiredFiles.map((file) => distFileStatus(absolute, file)));
  const distribution = await inspectLocalDistributionDetails(absolute);
  const stat = await fs.stat(absolute).catch(() => null);
  return {
    kind: 'local-dist',
    path: absolute,
    ok: files.every((file) => file.ok) && distribution.ok,
    buildId: stat ? `dist-mtime-${Math.trunc(stat.mtimeMs)}` : 'dist-missing',
    files,
    distribution,
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
  const checks = await Promise.all(SMOKE_PATHS.map((pathname) => fetchUrl(url, pathname)));
  return { label, url, ok: checks.every((check) => check.ok), checks };
}

export async function maybePurgeCache(options = {}) {
  if (options.skipCachePurge || options['skip-cache-purge']) {
    return {
      status: 'skipped',
      blocker: 'cache purge skipped by QA/QC non-goal',
    };
  }
  const allowCachePurge = Boolean(
    options.allowCachePurge
      || options['allow-cache-purge']
      || options.purgeCache
      || options['purge-cache'],
  );
  if (!allowCachePurge) {
    return {
      status: 'skipped',
      blocker: 'cache purge requires explicit --purge-cache opt-in',
    };
  }
  const purgeUrl = process.env.COMPUTE_CURRENT_CACHE_PURGE_URL || '';
  const token = process.env.COMPUTE_CURRENT_CACHE_PURGE_TOKEN || '';
  if (!purgeUrl) {
    return {
      status: 'skipped',
      blocker: 'credential blocker: missing COMPUTE_CURRENT_CACHE_PURGE_URL',
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

function requestedScreenshots(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return DEFAULT_SCREENSHOTS;
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export function productionVerificationRisks(result = {}) {
  const risks = [];
  if (result.live?.skipped) {
    risks.push('Live routes were not checked because no live URL was supplied.');
  } else if (!result.live?.ok) {
    risks.push('One or more live route checks failed.');
  } else if (result.cachePurge?.status !== 'purged') {
    risks.push('Live route health passed, but no cache-freshness claim is made because cache purge was excluded.');
  }

  if (result.staging?.skipped) {
    risks.push('Staging was not checked because no staging URL was supplied.');
  } else if (!result.staging?.ok) {
    risks.push('One or more staging route checks failed.');
  }
  risks.push('Existing Astro check hints remain informational unless they become build errors.');
  return risks;
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
  const distribution = result.localDist.distribution || {};
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
    `  - homepage public links missing: ${(distribution.homepageMissingPublicLinks || []).join(', ') || 'none'}`,
    `  - homepage legacy conversion links present: ${(distribution.homepageUnexpectedLegacyLinks || []).join(', ') || 'none'}`,
    `  - custom sitemap public paths missing: ${(distribution.customSitemapMissingPublic || []).join(', ') || 'none'}`,
    `  - custom sitemap legacy conversion paths present: ${(distribution.customSitemapUnexpectedLegacy || []).join(', ') || 'none'}`,
    `  - Astro sitemap child: ${distribution.astroSitemapChild || 'missing'}`,
    `  - Astro sitemap public paths missing: ${(distribution.astroSitemapMissingPublic || []).join(', ') || 'none'}`,
    `  - Astro sitemap legacy conversion paths present: ${(distribution.astroSitemapUnexpectedLegacy || []).join(', ') || 'none'}`,
    `  - RSS local news links: ${distribution.rssLocalNewsLinks ?? 'n/a'}`,
    `  - RSS local missing files: ${(distribution.rssLocalMissingFiles || []).join(', ') || 'none'}`,
    ...linesForUrl(result.local),
    ...linesForUrl(result.staging),
    ...linesForUrl(result.live),
    `- Cache purge status: ${result.cachePurge.status}${result.cachePurge.httpStatus ? ` HTTP ${result.cachePurge.httpStatus}` : ''}`,
    result.cachePurge.blocker ? `- Cache purge blocker: ${result.cachePurge.blocker}` : '- Cache purge response captured.',
    '',
    '## Remaining Risks',
    '',
    ...productionVerificationRisks(result).map((risk) => `- ${risk}`),
    '',
    '## Cleanup Receipts',
    '',
    '- No dev server, tmux session, browser context, temp directory, or cache-purge credential was created by this harness run.',
    '- Screenshot artifacts listed above were verified by path; no screenshot process remained open.',
    '',
  ];
  await fs.writeFile(reportPath, lines.join('\n'), 'utf8');
}

export async function verifyProductionSurface(options = {}) {
  const packageJson = await readJson(path.join(ROOT, 'package.json'));
  const localDist = await inspectLocalDist(options.localDist || options['local-dist'] || options.dist || 'dist');
  const [local, staging, live, cachePurge, screenshots] = await Promise.all([
    inspectUrl('local', options.local),
    inspectUrl('staging', options.staging),
    inspectUrl('live', options.live),
    maybePurgeCache(options),
    screenshotArtifacts(requestedScreenshots(options.screenshots)),
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
  const args = parseArgs();
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  const result = await verifyProductionSurface(args);
  console.log(`production verification harness completed: localDist=${result.localDist.ok ? 'passed' : 'failed'}, live=${result.live.ok ? 'passed' : result.live.skipped ? 'skipped' : 'failed'}, cache=${result.cachePurge.status}`);
  if (!result.localDist.ok) process.exitCode = 1;
}
