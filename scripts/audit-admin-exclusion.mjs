import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DIST_DIR = path.join(ROOT, 'dist');

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

async function writeReport(reportPath, result) {
  if (!reportPath) return;
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  const lines = [
    '# Admin Exclusion Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    `Admin pages checked: ${result.counts.adminPages}`,
    `Index files checked: ${result.counts.indexFiles}`,
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

  const adminPages = files.filter((file) => {
    const publicName = publicPath(file, distDir);
    return /\.html$/.test(file) && (/^\/admin(?:\/|\.html)/.test(publicName) || /^\/admin\.html/.test(publicName));
  });
  for (const file of adminPages) {
    const html = await readIfExists(file);
    if (!hasNoindex(html)) failures.push(`${publicPath(file, distDir)}: missing noindex,nofollow`);
  }

  const result = {
    ok: failures.length === 0,
    failures,
    counts: { adminPages: adminPages.length, indexFiles: indexFiles.length },
  };
  await writeReport(options.reportPath, result);
  return result;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const { values } = parseArgs({
    options: {
      out: { type: 'string' },
    },
  });
  const result = await auditAdminExclusion({
    reportPath: values.out ? path.resolve(values.out) : undefined,
  });
  if (!result.ok) {
    console.error(`admin exclusion audit failed:\n${result.failures.slice(0, 80).join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(`admin exclusion audit passed: adminPages=${result.counts.adminPages}, indexFiles=${result.counts.indexFiles}`);
  }
}
