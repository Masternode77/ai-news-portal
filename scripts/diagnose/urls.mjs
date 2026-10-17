#!/usr/bin/env node
// Phase 0 diagnosis: inventory of public URLs that a rebuild must preserve.
//
// Read-only: no network, no model calls, writes only the file named by --out.
// Routes are derived from the same data and eligibility functions the Astro
// pages use (src/pages/**), without importing the sharp/image chain.
//
// Usage:
//   node scripts/diagnose/urls.mjs [--out docs/diagnosis/05-preserve-list.csv] [--json file]

process.env.LLM_PROVIDER = 'disabled';
process.env.PIPELINE_OFFLINE = '1';
globalThis.fetch = () => {
  throw new Error('urls.mjs: network access is disabled in diagnosis mode');
};

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isPublicLongformArticle } from '../lib/public-surface-eligibility.mjs';
import { publishedColumns, columnPath } from '../lib/column-surface.mjs';
import { articleCanonicalPath, shouldNoindexArticle } from '../../src/lib/seo-safeguards.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const COLUMNS = ['url', 'type', 'source_file', 'record_id', 'indexable', 'label'];

function readJson(file, fallback = []) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  } catch {
    return fallback;
  }
}

function parseArgs(argv) {
  const args = { out: null, json: null, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') args.out = path.resolve(argv[++i]);
    else if (arg === '--json') args.json = path.resolve(argv[++i]);
    else if (arg === '--quiet') args.quiet = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function staticPages() {
  // Every non-dynamic page under src/pages except the admin surface.
  const pagesDir = path.join(ROOT, 'src/pages');
  const urls = [];
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), rel);
        continue;
      }
      if (rel.includes('[')) continue;
      if (rel.startsWith('/admin')) continue;
      let url = rel;
      let type = 'static_page';
      if (url.endsWith('.ts')) {
        url = url.replace(/\.ts$/, '');
        type = 'feed_or_asset';
      } else if (url.endsWith('.astro')) {
        url = url.replace(/\.astro$/, '');
        if (url.endsWith('/index')) url = url.slice(0, -'/index'.length);
        url = `${url || ''}/`;
      } else {
        continue;
      }
      urls.push({ url: url === '//' ? '/' : url, type, source_file: `src/pages${rel}`, record_id: '', indexable: type === 'static_page' ? 'measured' : 'n/a', label: 'measured(src/pages)' });
    }
  };
  walk(pagesDir, '');
  return urls.sort((a, b) => a.url.localeCompare(b.url));
}

function redirects() {
  const out = [];
  const vercel = readJson('vercel.json', {});
  for (const redirect of vercel.redirects || []) {
    out.push({ url: redirect.source, type: 'redirect', source_file: 'vercel.json', record_id: redirect.destination, indexable: 'n/a', label: `measured(vercel.json:redirects) -> ${redirect.destination} (${redirect.permanent ? 301 : 302})` });
  }
  const astroConfig = fs.readFileSync(path.join(ROOT, 'astro.config.mjs'), 'utf8');
  const redirectBlock = astroConfig.match(/redirects:\s*\{([\s\S]*?)\n\s*\},/);
  if (redirectBlock) {
    const re = /'([^']+)':\s*\{\s*status:\s*(\d+),\s*destination:\s*'([^']+)'/g;
    let match;
    while ((match = re.exec(redirectBlock[1]))) {
      out.push({ url: match[1], type: 'redirect', source_file: 'astro.config.mjs', record_id: match[3], indexable: 'n/a', label: `measured(astro.config.mjs:redirects) -> ${match[3]} (${match[2]})` });
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const latest = readJson('src/data/latest-news.json');
  const archived = readJson('src/data/archived-news.json');
  const columns = readJson('src/data/authored-columns.json');
  const taxonomy = readJson('src/data/taxonomy-pages.json', {});
  const reference = readJson('src/data/infrastructure-reference.json', {});
  const charter = readJson('config/editorial/persona-charter.json', {});

  const rows = [];

  // /news/{id}/ reader pages (src/pages/news/[id].astro:36-53 uses isPublicLongformArticle).
  const seen = new Set();
  for (const article of [...latest, ...archived]) {
    if (!article?.id || seen.has(article.id)) continue;
    seen.add(article.id);
    if (!isPublicLongformArticle(article)) continue;
    rows.push({ url: articleCanonicalPath(article), type: 'news_page', source_file: latest.some((item) => item.id === article.id) ? 'src/data/latest-news.json' : 'src/data/archived-news.json', record_id: article.id, indexable: shouldNoindexArticle(article) ? 'noindex' : 'index', label: 'measured(isPublicLongformArticle)' });
  }

  // /column/{slug}/ (src/pages/column/[slug].astro:20-25 uses publishedColumns).
  for (const column of publishedColumns(columns)) {
    rows.push({ url: columnPath(column), type: 'column_page', source_file: 'src/data/authored-columns.json', record_id: column.id, indexable: 'index', label: 'measured(publishedColumns)' });
  }
  for (const column of columns.filter((item) => item.quarantined)) {
    rows.push({ url: columnPath(column), type: 'column_page_quarantined', source_file: 'src/data/authored-columns.json', record_id: column.id, indexable: '404', label: `measured(quarantined: ${column.quarantine_reason || ''})` });
  }

  // Taxonomy pages (category/region/company) from src/data/taxonomy-pages.json.
  for (const [kind, key] of [['category', 'categories'], ['region', 'regions'], ['company', 'companies']]) {
    for (const page of taxonomy[key] || []) {
      rows.push({ url: `/${kind}/${page.slug}/`, type: `${kind}_page`, source_file: 'src/data/taxonomy-pages.json', record_id: page.slug, indexable: 'est(noindex when catalog empty; sitemap filter in astro.config.mjs:53-64)', label: `measured(src/pages/${kind}/[slug].astro)` });
    }
  }

  // Archive pagination: /archive/{n}/ for n >= 2 (src/pages/archive/[page].astro:12-22, pageSize 18 over the public catalog).
  const archiveTotal = (taxonomy.archive || [])[0]?.total ?? null;
  if (archiveTotal) {
    const pageCount = Math.ceil(archiveTotal / 18);
    for (let page = 2; page <= pageCount; page += 1) {
      rows.push({ url: `/archive/${page}/`, type: 'archive_page', source_file: 'src/pages/archive/[page].astro', record_id: String(page), indexable: 'est', label: `est(catalog total ${archiveTotal} from taxonomy-pages.json archive[0].total, pageSize 18)` });
    }
  }

  // Author, hubs, entities (single-source reference data).
  if (charter?.persona?.slug) {
    rows.push({ url: `/author/${charter.persona.slug}/`, type: 'author_page', source_file: 'config/editorial/persona-charter.json', record_id: charter.persona.slug, indexable: 'index', label: 'measured(src/pages/author/[slug].astro:9-11)' });
  }
  for (const hub of reference.hubs || []) {
    rows.push({ url: `/hubs/${hub.slug}/`, type: 'hub_page', source_file: 'src/data/infrastructure-reference.json', record_id: hub.slug, indexable: 'index', label: 'measured(src/pages/hubs/[slug].astro:8-17)' });
  }
  for (const entity of reference.entities || []) {
    rows.push({ url: `/entities/${entity.slug}/`, type: 'entity_page', source_file: 'src/data/infrastructure-reference.json', record_id: entity.slug, indexable: 'index', label: 'measured(src/pages/entities/[slug].astro:8-17)' });
  }

  rows.push(...staticPages());
  rows.push(...redirects());

  const summary = {};
  for (const row of rows) summary[row.type] = (summary[row.type] || 0) + 1;

  const csv = [COLUMNS.join(','), ...rows.map((row) => COLUMNS.map((column) => {
    const text = String(row[column] ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(','))].join('\n') + '\n';

  if (args.out) {
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, csv);
  }
  if (args.json) {
    fs.mkdirSync(path.dirname(args.json), { recursive: true });
    fs.writeFileSync(args.json, `${JSON.stringify({ generated_at: new Date().toISOString(), summary, rows }, null, 2)}\n`);
  }
  if (!args.quiet) {
    process.stdout.write(`# public URL inventory: ${rows.length} rows\n${JSON.stringify(summary, null, 2)}\n`);
  }
}

main();
