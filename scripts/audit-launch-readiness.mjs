import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicPublishQualityGateV3 } from './lib/public-publish-quality-gate-v3.mjs';
import { buildRssItems } from './lib/rss-builder.mjs';
import { buildSitemapEntries } from './lib/sitemap-builder.mjs';
import { hasExplicitInfrastructureCapacityEvidence, isSingleSourceVendorOrProductPost } from './lib/source-scope-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'docs/launch-readiness-report.md');

const FORBIDDEN_PUBLIC = [
  'Backfilled Analysis',
  'Evidence',
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
  'The source item centers on',
  'gives the analysis a concrete event',
  'moves the item into Compute Current',
];

async function readJson(relPath, fallback = []) {
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, relPath), 'utf8'));
  } catch {
    return fallback;
  }
}

async function readText(absPath) {
  try {
    return await fs.readFile(absPath, 'utf8');
  } catch {
    return '';
  }
}

function publicBody(article = {}) {
  return String(article.article_body_markdown || article.expertLensFull?.finalArticleBody || article.fullArticleText || '');
}

function visibleItems(latest = []) {
  return latest.filter((item) => item.homepagePublished !== false && item.archiveOnly !== true && item.public_status !== 'quarantined');
}

function localArticles(items = []) {
  return items.filter((item) => item.articlePagePublished === true && item.signalCardOnly !== true && item.noindex !== true);
}

function sourceOnlyItems(items = []) {
  return items.filter((item) => item.signalCardOnly === true || item.public_route === 'Source Card');
}

function publicHtmlPaths(articles = []) {
  return [
    'dist/index.html',
    'dist/archive/index.html',
    'dist/about/index.html',
    'dist/methodology/index.html',
    'dist/editorial-policy/index.html',
    'dist/ai-disclosure/index.html',
    'dist/subscribe/index.html',
    'dist/rss.xml',
    'dist/sitemap.xml',
    ...articles.map((article) => `dist/news/${article.id}/index.html`),
  ].map((relPath) => path.join(ROOT, relPath));
}

function forbiddenHits(text = '') {
  return FORBIDDEN_PUBLIC.filter((phrase) => text.includes(phrase));
}

function hasNewsletterCta(html = '') {
  return /Daily AI Infrastructure Brief|newsletter-capture|Get the Daily AI Infrastructure Brief/i.test(html);
}

function hasTransparencyPages(htmlByPath = new Map()) {
  return ['about', 'methodology', 'editorial-policy', 'ai-disclosure', 'subscribe']
    .every((slug) => Boolean(htmlByPath.get(path.join(ROOT, `dist/${slug}/index.html`))));
}

export async function auditLaunchReadiness() {
  const latest = await readJson('src/data/latest-news.json', []);
  const archive = await readJson('src/data/archived-news.json', []);
  const search = await readJson('src/data/search-index.json', []);
  const visible = visibleItems(latest);
  const local = localArticles(visible);
  const sourceOnly = sourceOnlyItems(visible);
  const full = local.filter((item) => /Core Longform Blog|Standard Blog/i.test(item.public_route || ''));
  const failures = [];

  if (visible.length < 12) failures.push(`homepage visible items below 12: ${visible.length}`);
  if (local.length < 6) failures.push(`local article count below 6: ${local.length}`);
  if (visible.length && sourceOnly.length / visible.length > 0.3) failures.push('source-only cards dominate homepage');
  if (search.length === 0 && local.length > 0) failures.push('search index is 0 while clean articles exist');
  if (full.length < 6) failures.push(`full local article count below 6: ${full.length}`);

  const recent = [];
  for (const article of local.slice(0, 50)) {
    const gate = publicPublishQualityGateV3(article, { recent });
    if (!gate.ok) failures.push(`${article.id}: v3 gate failed: ${gate.reasons.join(', ')}`);
    if (isSingleSourceVendorOrProductPost(article)
      && (article.public_signal_label || article.public_routing?.public_signal_label) === 'Core Signal'
      && !hasExplicitInfrastructureCapacityEvidence(article)) {
      failures.push(`${article.id}: single-source vendor post is Core Signal without explicit capacity evidence`);
    }
    if ((article.primary_category === 'Cloud Capacity' || article.category === 'Cloud Capacity') && !hasExplicitInfrastructureCapacityEvidence(article)) {
      failures.push(`${article.id}: Cloud Capacity without explicit capacity evidence`);
    }
    if (!article.sourceUrl && !article.source_url && !article.url) failures.push(`${article.id}: source attribution missing`);
    if (/^https?:\/\//i.test(article.public_presentation?.view_detail || '')) failures.push(`${article.id}: local article primary link points to external source`);
    recent.push(article);
  }

  const sitemap = buildSitemapEntries([...latest, ...archive]);
  const rss = buildRssItems([...latest, ...archive]);
  const badDiscoveryItems = [...latest, ...archive].filter((item) => item.public_status === 'quarantined' || item.noindex === true || item.seo_noindex === true);
  for (const item of badDiscoveryItems) {
    if (sitemap.some((entry) => entry.loc === `/news/${item.id}/`)) failures.push(`${item.id}: noindex/quarantined item appears in sitemap`);
    if (rss.some((entry) => entry.link?.endsWith(`/news/${item.id}/`))) failures.push(`${item.id}: noindex/quarantined item appears in RSS`);
  }

  const htmlByPath = new Map();
  for (const htmlPath of publicHtmlPaths(local.slice(0, 20))) {
    const text = await readText(htmlPath);
    if (text) htmlByPath.set(htmlPath, text);
    else failures.push(`missing built public file: ${path.relative(ROOT, htmlPath)}`);
  }
  const html = [...htmlByPath.values()].join('\n');
  for (const phrase of forbiddenHits(html)) failures.push(`public HTML contains forbidden phrase: ${phrase}`);
  if (!hasNewsletterCta(htmlByPath.get(path.join(ROOT, 'dist/index.html')) || '')) failures.push('newsletter CTA missing from homepage');
  if (!hasTransparencyPages(htmlByPath)) failures.push('one or more transparency pages missing');

  const lines = [
    '# Launch Readiness Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    `Homepage visible items: ${visible.length}`,
    `Local article count: ${local.length}`,
    `Full local article count: ${full.length}`,
    `Source-only count: ${sourceOnly.length}`,
    `Search index count: ${Array.isArray(search) ? search.length : 0}`,
    `Sitemap entries: ${sitemap.length}`,
    `RSS items: ${rss.length}`,
    `Built public files inspected: ${htmlByPath.size}`,
    `Status: ${failures.length ? 'fail' : 'pass'}`,
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
  const result = await auditLaunchReadiness();
  console.log(`launch readiness audit: ${result.ok ? 'pass' : 'fail'}`);
  console.log(`report: ${path.relative(ROOT, result.reportPath)}`);
  if (!result.ok) {
    console.error(result.failures.join('\n'));
    process.exitCode = 1;
  }
}
