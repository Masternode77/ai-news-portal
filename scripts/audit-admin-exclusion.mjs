import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DIST_DIR = path.join(ROOT, 'dist');
const DEFAULT_REPORT_PATH = path.join(ROOT, 'docs/admin-exclusion-report.md');
const ALLOWED_ADMIN_PAGES = new Set(['/admin/', '/admin.html/', '/admin/dashboard/', '/admin/edit/']);

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function walk(dir) {
  if (!(await exists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

function hasNoindex(html = '') {
  return /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html) &&
    /<meta\s+name=["']robots["']\s+content=["'][^"']*nofollow/i.test(html);
}

function publicPath(filePath, distDir) {
  const relative = path.relative(distDir, filePath).replaceAll(path.sep, '/');
  if (relative === 'index.html') return '/';
  return `/${relative.replace(/\/index\.html$/, '/').replace(/\.html$/, '/')}`;
}

function isForbiddenPrivateArtifact(filePath, distDir) {
  const publicName = publicPath(filePath, distDir);
  return publicName === '/dashboard-data.json'
    || publicName.startsWith('/dashboard/')
    || (/\.html$/.test(filePath) && /^\/admin(?:\/|\.html\/)/.test(publicName) && !ALLOWED_ADMIN_PAGES.has(publicName));
}

async function loadPrivateArticleMarkers() {
  const records = [];
  for (const filename of ['latest-news.json', 'archived-news.json']) {
    const text = await readIfExists(path.join(ROOT, 'src/data', filename));
    const value = JSON.parse(text);
    if (Array.isArray(value)) records.push(...value);
  }
  return [...new Set(records.flatMap((article) => [
    article?.id,
    article?.title,
    article?.expertLensFull?.finalHeadline,
  ]).filter((value) => typeof value === 'string' && value.length >= 8))];
}

async function writeReport(reportPath, result) {
  if (!reportPath) return;
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  const lines = [
    '# Admin Exclusion Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    `Admin pages checked: ${result.counts.adminPages}`,
    `Index files checked: ${result.counts.indexFiles}`,
    `Forbidden private artifacts found: ${result.counts.privateArtifacts}`,
    `Private record marker leaks found: ${result.counts.privateMarkerLeaks}`,
    '',
    '## Failures',
    '',
    ...(result.failures.length ? result.failures.map((failure) => `- ${failure}`) : ['- None']),
    '',
  ];
  await fs.writeFile(reportPath, lines.join('\n'), 'utf8');
}

export async function auditAdminExclusion(options = {}) {
  const distDir = options.distDir || DEFAULT_DIST_DIR;
  const files = await walk(distDir);
  const failures = [];
  const privateMarkers = Array.isArray(options.privateMarkers)
    ? options.privateMarkers.filter((value) => typeof value === 'string' && value.length > 0)
    : await loadPrivateArticleMarkers();
  const indexFiles = files.filter((file) => /(?:sitemap(?:-\d+|-index)?\.xml|rss\.xml)$/i.test(path.basename(file)));

  for (const file of indexFiles) {
    const text = await readIfExists(file);
    if (/\/(?:api\/)?admin(?:\/|\.html|<|$)/i.test(text)) {
      failures.push(`${publicPath(file, distDir)}: admin route in sitemap/rss`);
    }
  }

  const robots = await readIfExists(path.join(distDir, 'robots.txt'));
  if (!/Disallow:\s*\/admin\b/i.test(robots)) failures.push('robots.txt missing Disallow: /admin');
  if (!/Disallow:\s*\/api\/admin\b/i.test(robots)) failures.push('robots.txt missing Disallow: /api/admin');

  const privateArtifacts = files.filter((file) => isForbiddenPrivateArtifact(file, distDir));
  for (const file of privateArtifacts) {
    failures.push(`${publicPath(file, distDir)}: forbidden private artifact in public output`);
  }

  const adminPages = files.filter((file) => {
    const publicName = publicPath(file, distDir);
    return /\.html$/.test(file) && (/^\/admin(?:\/|\.html)/.test(publicName) || /^\/admin\.html/.test(publicName));
  });
  let privateMarkerLeaks = 0;
  for (const file of adminPages) {
    const html = await readIfExists(file);
    if (!hasNoindex(html)) failures.push(`${publicPath(file, distDir)}: missing noindex,nofollow`);
    if (privateMarkers.some((marker) => html.includes(marker))) {
      privateMarkerLeaks += 1;
      failures.push(`${publicPath(file, distDir)}: private record marker in static admin html`);
    }
  }

  const result = {
    ok: failures.length === 0,
    failures,
    counts: {
      adminPages: adminPages.length,
      indexFiles: indexFiles.length,
      privateArtifacts: privateArtifacts.length,
      privateMarkerLeaks,
    },
  };
  await writeReport(options.reportPath, result);
  return result;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await auditAdminExclusion({ reportPath: DEFAULT_REPORT_PATH });
  if (!result.ok) {
    console.error(`admin exclusion audit failed:\n${result.failures.slice(0, 80).join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(`admin exclusion audit passed: adminPages=${result.counts.adminPages}, indexFiles=${result.counts.indexFiles}, privateArtifacts=${result.counts.privateArtifacts}, privateMarkerLeaks=${result.counts.privateMarkerLeaks}`);
  }
}
