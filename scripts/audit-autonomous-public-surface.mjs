import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRssItems } from './lib/rss-builder.mjs';
import { buildSitemapEntries } from './lib/sitemap-builder.mjs';
import { articleDetailQualityEligible } from './lib/article-detail-quality-gate.mjs';
import { shouldNoindexArticle } from '../src/lib/seo-safeguards.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'docs/autonomous-public-surface-audit-report.md');

const FORBIDDEN = [
  'Commercially,',
  'Operationally,',
  'worth a local Compute Current read',
  'puts power under',
  'lens for infrastructure readers',
  'reported item can translate into',
  'readers should test whether',
  'not just another AI headline',
  'The issue is no longer',
  'in the rapidly evolving',
  'underscores',
  'highlights the importance',
  'as AI continues to',
];

function firstWords(text = '', count = 10) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, count).join(' ');
}

function headingsFor(article = {}) {
  return String(article.expertLensFull?.finalArticleBody || '')
    .split(/\n{2,}/)
    .filter((block) => /^[A-Z][A-Za-z0-9 /&'-]{2,70}$/.test(block.trim()))
    .join(' > ');
}

async function readJson(relPath, fallback) {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, relPath), 'utf8'));
  } catch {
    return fallback;
  }
}

async function readTextIfExists(absPath) {
  try {
    return await fs.readFile(absPath, 'utf8');
  } catch {
    return '';
  }
}

function distPathFor(loc = '/') {
  const clean = String(loc || '/').replace(/^https?:\/\/[^/]+/i, '') || '/';
  if (clean === '/') return path.join(ROOT, 'dist/index.html');
  if (/\.[a-z0-9]+$/i.test(clean)) return path.join(ROOT, 'dist', clean.replace(/^\//, ''));
  return path.join(ROOT, 'dist', clean.replace(/^\//, ''), 'index.html');
}

export async function auditAutonomousPublicSurface() {
  const latest = await readJson('src/data/latest-news.json', []);
  const search = await readJson('src/data/search-index.json', []);
  const cycles = await readJson('src/data/editorial-cycles.json', []);
  const publicAnalyses = latest.filter((item) =>
    item.articlePagePublished === true
    && item.archiveOnly !== true
    && item.noindex !== true
    && !shouldNoindexArticle(item)
    && articleDetailQualityEligible(item)
  );
  const publicPayload = JSON.stringify([latest, search]);
  const failures = [];
  const forbiddenHits = FORBIDDEN.map((phrase) => ({ phrase, count: (publicPayload.match(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length })).filter((hit) => hit.count);

  for (const hit of forbiddenHits) failures.push(`Forbidden phrase leaked: ${hit.phrase} (${hit.count})`);
  for (const article of publicAnalyses) {
    if ((article.claim_ledger || []).length < 4) failures.push(`${article.title} has fewer than 4 claim-ledger records`);
    if ((article.evidence_pack?.verified_facts || []).length < 4) failures.push(`${article.title} has fewer than 4 verified facts`);
    if (!article.editorial_thesis?.counterargument) failures.push(`${article.title} has no counterargument`);
    if (!article.editorial_thesis?.bottom_line && !article.expertLensFull?.bottomLine) failures.push(`${article.title} has no bottom-line thesis`);
    if ((article.blog_metadata?.source_summary_ratio ?? 1) > 0.35) failures.push(`${article.title} is source-summary dominant`);
    if ((article.blog_metadata?.unsupported_claim_count || 0) !== 0) failures.push(`${article.title} has unsupported claims`);
    if ((article.blog_metadata?.forbidden_phrase_count || 0) !== 0) failures.push(`${article.title} has forbidden phrase metadata`);
    if ((article.blog_metadata?.repeated_paragraph_count || 0) !== 0) failures.push(`${article.title} repeats paragraphs`);
  }

  const openingCounts = new Map();
  for (const article of publicAnalyses) {
    const opening = firstWords(article.expertLensFull?.finalArticleBody || '', 10);
    if (!opening) continue;
    openingCounts.set(opening, (openingCounts.get(opening) || 0) + 1);
  }
  const duplicateOpenings = [...openingCounts.entries()].filter(([, count]) => count > 1);
  for (const [opening, count] of duplicateOpenings) failures.push(`Duplicate opening first 10 words: ${opening} (${count})`);

  const headingCounts = new Map();
  for (const article of publicAnalyses) {
    const sequence = headingsFor(article);
    if (!sequence) continue;
    headingCounts.set(sequence, (headingCounts.get(sequence) || 0) + 1);
  }
  const duplicateHeadings = [...headingCounts.entries()].filter(([, count]) => count > 2);
  for (const [, count] of duplicateHeadings) failures.push(`Heading sequence repeated more than twice (${count})`);

  const rssItems = buildRssItems(latest);
  const sitemapEntries = buildSitemapEntries([...latest, ...search]);
  if (!sitemapEntries.some((entry) => entry.loc === '/')) failures.push('Sitemap entries missing homepage');
  if (rssItems.some((item) => item.link.startsWith('http'))) failures.push('RSS contains source-only external primary link');
  const sitemapFile = await readTextIfExists(path.join(ROOT, 'dist/sitemap.xml'));
  const rssFile = await readTextIfExists(path.join(ROOT, 'dist/rss.xml'));
  if (!sitemapFile) failures.push('Built /sitemap.xml is missing');
  if (!rssFile) failures.push('Built /rss.xml is missing');

  const publicHtmlPaths = [
    '/',
    '/rss.xml',
    '/sitemap.xml',
    '/archive/',
    ...publicAnalyses.map((article) => `/news/${article.id}/`),
    ...sitemapEntries
      .map((entry) => entry.loc)
      .filter((loc) => /^\/(?:category|region|company)\//.test(loc))
      .slice(0, 80),
  ];
  const publicHtmlPairs = [];
  for (const loc of [...new Set(publicHtmlPaths)]) {
    const text = await readTextIfExists(distPathFor(loc));
    if (text) publicHtmlPairs.push([loc, text]);
    else if (loc === '/' || loc === '/sitemap.xml') failures.push(`Built public route missing: ${loc}`);
  }
  const publicHtmlPayload = publicHtmlPairs.map(([, text]) => text).join('\n');
  const htmlForbiddenHits = FORBIDDEN
    .map((phrase) => ({ phrase, count: (publicHtmlPayload.match(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length }))
    .filter((hit) => hit.count);
  for (const hit of htmlForbiddenHits) failures.push(`Forbidden phrase leaked in built HTML: ${hit.phrase} (${hit.count})`);
  const missingArticleHtml = publicAnalyses
    .filter((article) => !(publicHtmlPairs.find(([loc]) => loc === `/news/${article.id}/`)))
    .map((article) => article.id);
  for (const id of missingArticleHtml) failures.push(`Published analysis missing built article HTML: ${id}`);

  const latestCycle = cycles[0] || null;
  if (latestCycle?.status === 'completed_no_qualifying_signals' && latestCycle.published_analyses?.length) {
    failures.push('No-qualifying cycle contains published analyses');
  }

  const lines = [
    '# Autonomous Public Surface Audit Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    `Public analyses audited: ${publicAnalyses.length}`,
    `Homepage-visible items audited: ${latest.filter((item) => item.homepagePublished).length}`,
    `RSS items: ${rssItems.length}`,
    `Sitemap entries: ${sitemapEntries.length}`,
    `Forbidden phrase leaks: ${forbiddenHits.reduce((sum, hit) => sum + hit.count, 0)}`,
    `Built HTML forbidden phrase leaks: ${htmlForbiddenHits.reduce((sum, hit) => sum + hit.count, 0)}`,
    `Built public files audited: ${publicHtmlPairs.length}`,
    `Duplicate openings: ${duplicateOpenings.length}`,
    `Repeated heading sequences: ${duplicateHeadings.length}`,
    `Latest cycle status: ${latestCycle?.status || 'missing'}`,
    '',
    '## Published Analyses',
    '',
    '| Title | Route | Words | Facts | Claims | Source summary ratio |',
    '| --- | --- | --- | --- | --- | --- |',
    ...publicAnalyses.map((article) => `| ${String(article.title).replace(/\|/g, '/')} | ${article.publishing_route || ''} | ${article.blog_metadata?.word_count || 0} | ${article.evidence_pack?.verified_facts?.length || 0} | ${article.claim_ledger?.length || 0} | ${Number(article.blog_metadata?.source_summary_ratio || 0).toFixed(2)} |`),
    '',
    '## Failures',
    '',
    failures.length ? failures.map((failure) => `- ${failure}`).join('\n') : '- None',
  ];
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${lines.join('\n')}\n`, 'utf8');
  return { ok: failures.length === 0, failures, reportPath: REPORT_PATH };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await auditAutonomousPublicSurface();
  console.log(`autonomous public audit: ${result.ok ? 'pass' : 'fail'}`);
  console.log(`report: ${path.relative(ROOT, result.reportPath)}`);
  if (!result.ok) {
    console.error(result.failures.join('\n'));
    process.exitCode = 1;
  }
}
