import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRssItems } from './lib/rss-builder.mjs';
import { buildSitemapEntries } from './lib/sitemap-builder.mjs';
import { cleanArticleBodyBlocks } from './lib/article-body-cleaner.mjs';
import { publicPublishQualityGate, PUBLIC_INTERNAL_LABELS } from './lib/public-publish-quality-gate.mjs';
import { routePublicLane } from './lib/public-lane-router.mjs';
import {
  hasExplicitInfrastructureCapacityEvidence,
  isSingleSourceVendorOrProductPost,
  sourceScopePolicyResult,
} from './lib/source-scope-policy.mjs';
import { sourceSummaryRatio } from './lib/source-summary-ratio.mjs';
import { shouldNoindexArticle } from '../src/lib/seo-safeguards.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'docs/autonomous-public-surface-audit-report.md');

const FORBIDDEN = [
  ...PUBLIC_INTERNAL_LABELS,
  'evidence anchor',
  'infrastructure lane',
  'cluster clears the desk bar',
  'source item centers on',
  'control point in this story',
  'Why the desk selected it',
];

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function byDateDesc(a, b) {
  return new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime();
}

function uniqueById(items = []) {
  const byId = new Map();
  for (const item of items) {
    if (!item?.id) continue;
    byId.set(item.id, { ...(byId.get(item.id) || {}), ...item });
  }
  return [...byId.values()];
}

function publicBody(article = {}) {
  return String(
    article.article_body_markdown
    || article.expertLensFull?.finalArticleBody
    || article.fullArticleText
    || article.contentText
    || article.articleText
    || ''
  );
}

function publicText(article = {}) {
  return [
    article.title,
    article.deck,
    article.summary,
    article.snippet,
    article.why_it_matters,
    article.public_presentation?.deck,
    article.public_presentation?.why_it_matters,
    publicBody(article),
    article.bottom_line,
    article.expertLensFull?.bottomLine,
  ].filter(Boolean).join('\n\n');
}

function forbiddenHits(text = '') {
  return FORBIDDEN
    .map((phrase) => ({
      phrase,
      count: (String(text).match(new RegExp(escapeRegExp(phrase), phrase === 'claim ledger' ? 'gi' : 'g')) || []).length,
    }))
    .filter((hit) => hit.count);
}

function firstWords(text = '', count = 10) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, count).join(' ');
}

function headingSequence(article = {}) {
  return publicBody(article)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => /^[A-Z][A-Za-z0-9 /&'-]{2,70}$/.test(block))
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

function publicArticleCandidates(records = []) {
  return records
    .filter((item) =>
      item?.id
      && item.articlePagePublished === true
      && item.archiveOnly !== true
      && item.public_status !== 'quarantined'
      && item.public_status !== 'archive_only_noindex'
      && item.noindex !== true
      && !shouldNoindexArticle(item)
    )
    .sort(byDateDesc);
}

function routeReasons(article = {}) {
  const strict = routePublicLane(article);
  const current = article.public_routing || {};
  const reasons = [];
  if (current.routing_decision && strict.routing_decision && current.routing_decision !== strict.routing_decision) {
    reasons.push(`public route differs from strict router decision: ${current.routing_decision} -> ${strict.routing_decision}`);
  }
  if (current.public_signal_label && strict.public_signal_label && current.public_signal_label !== strict.public_signal_label) {
    reasons.push(`public signal label differs from strict router decision: ${current.public_signal_label} -> ${strict.public_signal_label}`);
  }
  return reasons;
}

function sourceScopeAuditReasons(article = {}) {
  const policy = sourceScopePolicyResult(article);
  const reasons = [];
  const label = article.public_signal_label || article.public_routing?.public_signal_label || article.public_presentation?.signal_label;
  if (isSingleSourceVendorOrProductPost(article) && label === 'Core Signal') {
    reasons.push('source_count=1 vendor/product post routed as Core Signal');
  }
  if ((article.primary_category === 'Cloud Capacity' || article.category === 'Cloud Capacity')
    && !hasExplicitInfrastructureCapacityEvidence(article)) {
    reasons.push('primary_category=Cloud Capacity without explicit capacity evidence');
  }
  if (policy.force_non_core_signal && !['Cloud Product Read', 'Enterprise Platform Note'].includes(article.public_route || article.public_routing?.routing_decision)) {
    reasons.push('public route differs from source scope policy');
  }
  return reasons;
}

function articleQualityReasons(article = {}, recent = []) {
  const gate = publicPublishQualityGate(article, { recent });
  const reasons = gate.ok ? [] : gate.reasons.map((reason) => `public publish gate: ${reason}`);
  const body = publicBody(article);
  const bodyBlocks = cleanArticleBodyBlocks(body);
  const summary = sourceSummaryRatio(body, [
    article.cleaned_source_text,
    article.source_evidence_text,
    ...(article.evidence_pack?.verified_facts || []),
    ...(article.evidence_pack?.facts || []),
  ].filter(Boolean).join(' '));

  if (bodyBlocks.length < 8) reasons.push('article body has fewer than 8 meaningful paragraphs');
  if (!/\b(what this does not prove|does not prove|limitation|the open question|counterargument)\b/i.test(publicText(article))) {
    reasons.push('full article has no limitation/counterargument');
  }
  if (!/\bbottom line\b/i.test(publicText(article)) && !article.bottom_line && !article.expertLensFull?.bottomLine) {
    reasons.push('full article has no bottom line');
  }
  if (summary.source_summary_ratio > 0.4) reasons.push('source summary ratio > 40%');
  if ((1 - summary.source_summary_ratio) < 0.6) reasons.push('analysis ratio < 60%');
  reasons.push(...routeReasons(article));
  reasons.push(...sourceScopeAuditReasons(article));
  return [...new Set(reasons)];
}

export async function auditAutonomousPublicSurface() {
  const latest = await readJson('src/data/latest-news.json', []);
  const archive = await readJson('src/data/archived-news.json', []);
  const search = await readJson('src/data/search-index.json', []);
  const allRecords = uniqueById([...latest, ...archive, ...search]);
  const candidates = publicArticleCandidates(allRecords);
  const latest50 = candidates.slice(0, 50);
  const failures = [];

  for (const hit of forbiddenHits(latest.filter((item) => item.homepagePublished !== false).map(publicText).join('\n'))) {
    failures.push(`Forbidden phrase leaked on homepage data: ${hit.phrase} (${hit.count})`);
  }

  const recent = [];
  for (const article of latest50) {
    const reasons = articleQualityReasons(article, recent);
    for (const reason of reasons) failures.push(`${article.id}: ${reason}`);
    recent.push(article);
  }

  const openingCounts = new Map();
  for (const article of latest50) {
    const opening = firstWords(publicBody(article), 10);
    if (!opening) continue;
    openingCounts.set(opening, (openingCounts.get(opening) || 0) + 1);
  }
  for (const [opening, count] of [...openingCounts.entries()].filter(([, count]) => count > 1)) {
    failures.push(`Duplicate opening first 10 words: ${opening} (${count})`);
  }

  const headingCounts = new Map();
  for (const article of latest50) {
    const sequence = headingSequence(article);
    if (!sequence) continue;
    headingCounts.set(sequence, (headingCounts.get(sequence) || 0) + 1);
  }
  for (const [, count] of [...headingCounts.entries()].filter(([, count]) => count > 2)) {
    failures.push(`Heading sequence repeated more than twice (${count})`);
  }

  const rssItems = buildRssItems(latest);
  const sitemapEntries = buildSitemapEntries(allRecords);
  if (!sitemapEntries.some((entry) => entry.loc === '/')) failures.push('Sitemap entries missing homepage');
  const sitemapFile = await readTextIfExists(path.join(ROOT, 'dist/sitemap.xml'));
  const rssFile = await readTextIfExists(path.join(ROOT, 'dist/rss.xml'));
  if (!sitemapFile) failures.push('Built /sitemap.xml is missing');
  if (!rssFile) failures.push('Built /rss.xml is missing');

  const publicHtmlPaths = [
    '/',
    '/rss.xml',
    '/sitemap.xml',
    '/archive/',
    ...latest50.map((article) => `/news/${article.id}/`),
    ...sitemapEntries
      .map((entry) => entry.loc)
      .filter((loc) => /^\/(?:category|region|company)\//.test(loc))
      .slice(0, 80),
  ];
  const publicHtmlPairs = [];
  for (const loc of [...new Set(publicHtmlPaths)]) {
    const text = await readTextIfExists(distPathFor(loc));
    if (text) publicHtmlPairs.push([loc, text]);
    else if (loc === '/' || loc === '/sitemap.xml' || loc.startsWith('/news/')) failures.push(`Built public route missing: ${loc}`);
  }

  const htmlPayload = publicHtmlPairs.map(([, text]) => text).join('\n');
  for (const hit of forbiddenHits(htmlPayload)) {
    failures.push(`Forbidden phrase leaked in built HTML: ${hit.phrase} (${hit.count})`);
  }

  const lines = [
    '# Autonomous Public Surface Audit Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    `Latest article pages audited: ${latest50.length}`,
    `Homepage-visible items audited: ${latest.filter((item) => item.homepagePublished !== false).length}`,
    `RSS items: ${rssItems.length}`,
    `Sitemap entries: ${sitemapEntries.length}`,
    `Built public files audited: ${publicHtmlPairs.length}`,
    `Failures: ${failures.length}`,
    '',
    '## Published Article Pages',
    '',
    '| Title | Route | Words | Paragraphs | Source summary ratio |',
    '| --- | --- | ---: | ---: | ---: |',
    ...latest50.map((article) => {
      const gate = publicPublishQualityGate(article);
      return `| ${String(article.title).replace(/\|/g, '/')} | ${article.public_route || article.public_routing?.routing_decision || ''} | ${gate.metrics.word_count} | ${gate.metrics.paragraph_count} | ${Number(gate.metrics.source_summary_ratio || 0).toFixed(2)} |`;
    }),
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
