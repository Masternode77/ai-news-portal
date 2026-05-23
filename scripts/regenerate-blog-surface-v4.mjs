import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARCHIVE_NEWS_PATH,
  LATEST_NEWS_LIMIT,
  LATEST_NEWS_PATH,
  SEARCH_INDEX_PATH,
} from './lib/constants.mjs';
import { readJsonFile, writeJsonFile } from './lib/state-store.mjs';
import { routeGradedPublishing, GRADED_ROUTES } from './lib/graded-publishing-router.mjs';
import { generateBlogArticle, BLOG_ENGINE_V4_VERSION } from './lib/blog-engine-v4.mjs';
import { homepageBlogSurfaceResult } from './lib/homepage-blog-surface-policy.mjs';
import { runSourceHealthCheck } from './lib/source-health-check.mjs';
import { REQUESTED_SOURCE_IDS, loadSourceRegistry } from './lib/source-registry.mjs';
import { visibleBodyLength, wordCount } from './lib/visible-body-length.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'docs/blog-surface-restoration-report.md');

function publishedTime(article = {}) {
  const ms = new Date(article.publishedAt || article.updatedAt || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function uniqueById(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function sourceIdFromArticle(article = {}, sources = []) {
  const text = [article.source, article.sourceUrl, article.url].filter(Boolean).join(' ').toLowerCase();
  return sources.find((source) => text.includes(source.name.toLowerCase()) || text.includes(source.domain.toLowerCase()))?.id || '';
}

function applyNonBlogRoute(article = {}, routed) {
  if (routed.route === GRADED_ROUTES.SHORT_SIGNAL) {
    return {
      ...article,
      blog_route: GRADED_ROUTES.SHORT_SIGNAL,
      publishing_route: 'Short Signal',
      homepagePublished: false,
      articlePagePublished: false,
      signalCardOnly: true,
      archiveOnly: false,
      noindex: true,
      seo_noindex: true,
      seo_noindex_reasons: ['short_signal_not_counted_as_blog'],
      public_status: 'short_signal',
      public_routing: {
        ...(article.public_routing || routed.strict || {}),
        visibility: 'adjacent',
        laneKey: 'adjacent-watchlist',
        laneTitle: 'Adjacent Watchlist',
        routing_decision: GRADED_ROUTES.SHORT_SIGNAL,
      },
    };
  }

  return {
    ...article,
    blog_route: routed.route,
    publishing_route: routed.label,
    homepagePublished: false,
    articlePagePublished: false,
    signalCardOnly: false,
    archiveOnly: true,
    noindex: true,
    seo_noindex: true,
    seo_noindex_reasons: routed.reasons || ['not_blog_surface_eligible'],
    public_status: routed.route === GRADED_ROUTES.SOURCE_CARD ? 'source_card' : 'archive_only_noindex',
    public_routing: {
      ...(article.public_routing || routed.strict || {}),
      visibility: routed.route === GRADED_ROUTES.SOURCE_CARD ? 'source_card' : 'archive',
      laneKey: routed.route === GRADED_ROUTES.SOURCE_CARD ? 'source-card' : 'archive-only',
      laneTitle: routed.route === GRADED_ROUTES.SOURCE_CARD ? 'Source Card' : 'Archive Only',
      routing_decision: routed.route,
      blocked_reasons: routed.reasons || [],
    },
  };
}

function candidateRows(items = [], options = {}) {
  const now = options.now ? new Date(options.now).getTime() : Date.now();
  const cutoff = now - (options.lookbackDays || 45) * 24 * 60 * 60 * 1000;
  return items
    .filter((article) => article?.id && publishedTime(article) >= cutoff)
    .map((article) => ({ article, route: routeGradedPublishing(article) }))
    .filter(({ route }) => [GRADED_ROUTES.CORE_LONGFORM_BLOG, GRADED_ROUTES.STANDARD_BLOG].includes(route.route))
    .sort((a, b) => {
      const coreDelta = (b.route.route === GRADED_ROUTES.CORE_LONGFORM_BLOG ? 1 : 0) - (a.route.route === GRADED_ROUTES.CORE_LONGFORM_BLOG ? 1 : 0);
      if (coreDelta) return coreDelta;
      return (b.route.score || 0) - (a.route.score || 0) || publishedTime(b.article) - publishedTime(a.article);
    });
}

function chooseBlogCandidates(items = [], target = 20) {
  const rows = candidateRows(items);
  const coreRows = rows.filter((row) => row.route.route === GRADED_ROUTES.CORE_LONGFORM_BLOG);
  const standardRows = rows.filter((row) => row.route.route === GRADED_ROUTES.STANDARD_BLOG);
  const picked = [];
  const sourceCounts = new Map();

  const pickRow = (row, maxPerSource = 7) => {
    const source = row.article.source || 'Unknown';
    if ((sourceCounts.get(source) || 0) >= maxPerSource) return false;
    picked.push(row);
    sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
    return true;
  };

  const standardTarget = Math.min(4, standardRows.length, Math.max(0, target - 8));
  const coreTarget = Math.min(coreRows.length, target - standardTarget);

  for (const row of coreRows) {
    if (picked.length >= coreTarget) break;
    pickRow(row, picked.length < 12 ? 5 : 7);
  }
  for (const row of standardRows) {
    if (picked.filter((item) => item.route.route === GRADED_ROUTES.STANDARD_BLOG).length >= standardTarget) break;
    pickRow(row, 5);
  }
  if (picked.length < target) {
    for (const row of rows) {
      if (picked.some((existing) => existing.article.id === row.article.id)) continue;
      picked.push(row);
      if (picked.length >= target) break;
    }
  }
  return picked;
}

function searchable(article = {}) {
  return {
    ...article,
    slug: article.slug || article.id,
    searchText: [
      article.title,
      article.source,
      article.category,
      article.primary_category,
      article.infrastructure_layer,
      article.deck,
      article.why_it_matters,
      article.expertLensFull?.finalArticleBody,
      ...(article.tags || []),
    ].filter(Boolean).join(' '),
  };
}

export async function regenerateBlogSurfaceV4(options = {}) {
  const [latest, archived, sourceRegistry] = await Promise.all([
    readJsonFile(LATEST_NEWS_PATH, []),
    readJsonFile(ARCHIVE_NEWS_PATH, []),
    loadSourceRegistry(),
  ]);
  const all = uniqueById([...latest, ...archived]);
  const before = homepageBlogSurfaceResult(latest);
  const chosen = chooseBlogCandidates(all, options.min || 20);
  const recent = [];
  const generated = [];
  const failures = [];

  for (const row of chosen) {
    const result = generateBlogArticle(row.article, {
      route: row.route,
      recent,
      index: recent.length,
    });
    if (!result.ok) {
      failures.push({ id: row.article.id, title: row.article.title, reasons: result.reasons });
      continue;
    }
    generated.push(result.article);
    recent.push(result.article);
  }

  if (generated.length < (options.min || 20)) {
    for (const row of candidateRows(all)) {
      if (generated.some((article) => article.id === row.article.id)) continue;
      const result = generateBlogArticle(row.article, { route: row.route, recent, index: recent.length });
      if (!result.ok) {
        failures.push({ id: row.article.id, title: row.article.title, reasons: result.reasons });
        continue;
      }
      generated.push(result.article);
      recent.push(result.article);
      if (generated.length >= (options.min || 20)) break;
    }
  }

  const generatedIds = new Set(generated.map((article) => article.id));
  const routedArchive = all
    .filter((article) => !generatedIds.has(article.id))
    .map((article) => applyNonBlogRoute(article, routeGradedPublishing(article)));
  const latestOut = generated
    .sort((a, b) => publishedTime(b) - publishedTime(a))
    .slice(0, Math.max(LATEST_NEWS_LIMIT, options.min || 20));
  const archiveOut = uniqueById([...routedArchive, ...generated.slice(latestOut.length)]);
  const searchIndex = uniqueById([...latestOut, ...archiveOut]).map(searchable);

  await writeJsonFile(LATEST_NEWS_PATH, latestOut.map(searchable));
  await writeJsonFile(ARCHIVE_NEWS_PATH, archiveOut.map(searchable));
  await writeJsonFile(SEARCH_INDEX_PATH, searchIndex);

  const after = homepageBlogSurfaceResult(latestOut);
  const routes = all.map((article) => routeGradedPublishing(article));
  const fromNewSources = all.filter((article) => REQUESTED_SOURCE_IDS.includes(sourceIdFromArticle(article, sourceRegistry))).length;
  const sourceHealth = await runSourceHealthCheck({
    skipNetwork: process.env.SOURCE_HEALTH_NETWORK !== '1',
    timeoutMs: Number(process.env.SOURCE_HEALTH_TIMEOUT_MS || 4000),
    writeReport: true,
  }).catch((error) => ({ activeCount: 0, discovery: [], error: error.message }));

  const lines = [
    '# Blog Surface Restoration Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    `Generation version: ${BLOG_ENGINE_V4_VERSION}`,
    '',
    '## Counts',
    '',
    `- total crawled/current records scanned: ${all.length}`,
    `- total from new requested sources currently in store: ${fromNewSources}`,
    `- total eligible for Core Longform: ${routes.filter((route) => route.route === GRADED_ROUTES.CORE_LONGFORM_BLOG).length}`,
    `- total eligible for Standard Blog: ${routes.filter((route) => route.route === GRADED_ROUTES.STANDARD_BLOG).length}`,
    `- total Short Signal: ${routes.filter((route) => route.route === GRADED_ROUTES.SHORT_SIGNAL).length}`,
    `- total Source Card: ${routes.filter((route) => route.route === GRADED_ROUTES.SOURCE_CARD).length}`,
    `- total Archive Only: ${routes.filter((route) => route.route === GRADED_ROUTES.ARCHIVE_ONLY).length}`,
    `- homepage local blog count before: ${before.localBlogCount}`,
    `- homepage local blog count after: ${after.localBlogCount}`,
    `- source health active count: ${sourceHealth.activeCount || 0} / 10`,
    '',
    '## Visible Local Blog Posts',
    '',
    '| # | Route | Words | Visible chars | Source | Tone | Archetype | Score | Title |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...latestOut.slice(0, 20).map((article, index) => {
      const body = article.expertLensFull?.finalArticleBody || '';
      return `| ${index + 1} | ${article.publishing_route} | ${wordCount(body)} | ${visibleBodyLength(body)} | ${article.source || ''} | ${article.blog_metadata?.tone || ''} | ${article.blog_metadata?.archetype || ''} | ${Number(article.infrastructure_relevance_score || 0).toFixed(3)} | ${String(article.title || '').replace(/\|/g, '/')} |`;
    }),
    '',
    '## Recovery Notes',
    '',
    after.ok
      ? 'The homepage has been restored with at least 20 local Compute Current blog posts. Approved blog cards use local /news/[id]/ pages as the primary destination and source links as secondary attribution.'
      : `The homepage is still below target: ${after.reasons.join(', ')}.`,
    failures.length ? `Generation failures encountered during candidate backfill: ${JSON.stringify(failures.slice(0, 10), null, 2)}` : 'Generation failures encountered during candidate backfill: none.',
    '',
    '## Cache Purge',
    '',
    'Run npm run purge:public-cache after regeneration; the purge script writes docs/public-cache-purge-report.md with credential-dependent status.',
  ];

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${lines.join('\n')}\n`, 'utf8');

  return {
    ok: after.ok,
    before,
    after,
    generated: latestOut,
    archive: archiveOut,
    failures,
    reportPath: REPORT_PATH,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await regenerateBlogSurfaceV4();
  console.log(`homepage local blog count after regeneration: ${result.after.localBlogCount}`);
  console.log(`report: ${path.relative(ROOT, result.reportPath)}`);
  if (!result.ok) process.exitCode = 1;
}
