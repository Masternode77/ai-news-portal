import fs from 'node:fs';
import path from 'node:path';
import { findInternalLanguageHits } from './lib/internal-language-guard.mjs';

const ROOT = path.resolve('.');
const SOURCE_PUBLIC_FILES = [
  'src/pages/index.astro',
  'src/pages/archive/index.astro',
  'src/pages/archive/[page].astro',
  'src/pages/category/[slug].astro',
  'src/pages/company/[slug].astro',
  'src/pages/region/[slug].astro',
  'src/pages/news/[id].astro',
  'src/pages/about.astro',
  'src/pages/methodology.astro',
  'src/pages/editorial-policy.astro',
  'src/pages/ai-disclosure.astro',
  'src/components/ArticleListCard.astro',
  'src/components/LatestAnalysisFeed.astro',
  'src/components/FeedFilterBar.astro',
  'src/components/ArticleHeader.astro',
  'src/components/ArticleBody.astro',
  'src/components/SourceAttribution.astro',
  'src/components/AIDisclosureFooter.astro',
  'src/layouts/Layout.astro',
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return full;
  });
}

function publicPathFromDist(file) {
  const relative = path.relative(path.join(ROOT, 'dist'), file).replaceAll(path.sep, '/');
  if (relative === 'index.html') return '/';
  return `/${relative.replace(/\/index\.html$/, '/').replace(/\.html$/, '/')}`;
}

export function auditPublicCopy() {
  const records = [];
  for (const file of SOURCE_PUBLIC_FILES) {
    if (!fs.existsSync(file)) continue;
    records.push({ path: `/${file}`, surface: 'source', text: fs.readFileSync(file, 'utf8') });
  }
  for (const file of walk(path.join(ROOT, 'dist'))) {
    if (!/\.(html|xml|txt)$/.test(file)) continue;
    records.push({ path: publicPathFromDist(file), surface: 'dist', text: fs.readFileSync(file, 'utf8') });
  }
  const hits = findInternalLanguageHits(records);
  return { ok: hits.length === 0, hits };
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  const result = auditPublicCopy();
  if (!result.ok) {
    console.error('public copy audit failed');
    for (const hit of result.hits.slice(0, 50)) console.error(`${hit.path}: ${hit.phrase}`);
    process.exitCode = 1;
  } else {
    console.log('public copy audit passed: 0 internal language hits');
  }
}
