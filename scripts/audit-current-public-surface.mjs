import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import { analyzeSourceExtractionFailClosed } from './lib/source-extraction-fail-closed.mjs';
import { routeStrictInfrastructureRelevance } from './lib/strict-infrastructure-relevance-router.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'docs/current-archive-state-audit.md');

function isLocalBlog(article = {}) {
  const route = String(article.blog_route || article.publishing_route || article.route || '').toLowerCase();
  return article.id
    && article.articlePagePublished !== false
    && article.homepagePublished !== false
    && !article.archiveOnly
    && article.noindex !== true
    && /core_longform_blog|standard_blog|core longform blog|standard blog/.test(route);
}

function sourceOnly(article = {}) {
  return article.homepagePublished !== false
    && (article.articlePagePublished === false || article.signalCardOnly === true || article.public_status === 'short_signal' || article.public_status === 'adjacent_watchlist');
}

function countBy(items = [], predicate) {
  return items.reduce((count, item) => count + (predicate(item) ? 1 : 0), 0);
}

export async function auditCurrentPublicSurface() {
  const all = [...latestNews, ...archivedNews];
  const extractionResults = all.map((article) => [article, analyzeSourceExtractionFailClosed(article)]);
  const relevanceResults = all.map((article) => [article, routeStrictInfrastructureRelevance(article)]);
  const counts = {
    totalCrawledItems: all.length,
    totalArchivedItems: archivedNews.length,
    totalHomepageVisibleItems: countBy(all, (article) => article.homepagePublished !== false && article.archiveOnly !== true),
    totalLocalComputeCurrentArticlePages: countBy(all, isLocalBlog),
    totalSourceOnlyDirectLinkCards: countBy(all, sourceOnly),
    totalItemsBlockedByExtractionQa: extractionResults.filter(([, result]) => !result.can_generate_longform).length,
    totalItemsBlockedByRelevanceClassifier: relevanceResults.filter(([, result]) => result.visibility === 'archive').length,
    totalItemsBlockedByArticlePagePublishedFalse: countBy(all, (article) => article.articlePagePublished === false),
    totalItemsWithHomepagePublishedFalse: countBy(all, (article) => article.homepagePublished === false),
    totalItemsWithArchiveOnlyTrue: countBy(all, (article) => article.archiveOnly === true),
    totalItemsWithNoindexTrue: countBy(all, (article) => article.noindex === true || article.seo_noindex === true),
    currentHomepageLocalBlogCount: latestNews.filter(isLocalBlog).length,
  };

  const blockers = [
    ['extraction_quality_score below threshold', countBy(all, (article) => Number(article.extraction_quality_score || 0) < 0.8)],
    ['relevance_score below threshold', countBy(all, (article) => Number(article.infrastructure_relevance_score ?? article.relevance_score ?? 0) < 0.68)],
    ['articlePagePublished false', counts.totalItemsBlockedByArticlePagePublishedFalse],
    ['homepagePublished false', counts.totalItemsWithHomepagePublishedFalse],
    ['source evidence too short or dirty', counts.totalItemsBlockedByExtractionQa],
    ['boilerplate detected', extractionResults.filter(([, result]) => result.boilerplate.copyright_footer_detected || result.boilerplate.boilerplate_ratio > 0.08).length],
    ['truncation detected', extractionResults.filter(([, result]) => !result.truncation.ok).length],
    ['missing local slug', countBy(all, (article) => !article.id && !article.slug)],
    ['stale generation version', countBy(all, (article) => article.public_generation_version !== 'blog_engine_v4' && article.generation_version !== 'blog_engine_v4')],
    ['direct-source-only route', counts.totalSourceOnlyDirectLinkCards],
  ];

  const lines = [
    '# Current Archive State Audit',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    '## Current Counts',
    '',
    ...Object.entries(counts).map(([key, value]) => `- ${key}: ${value}`),
    '',
    '## Why Homepage Local Blog Count Is Below 20',
    '',
    `Current homepage local blog count is ${counts.currentHomepageLocalBlogCount}. The public surface is below 20 because the emergency cleanup marked ${counts.totalItemsWithNoindexTrue} items noindex, ${counts.totalItemsBlockedByArticlePagePublishedFalse} items as articlePagePublished false, and ${counts.totalItemsWithArchiveOnlyTrue} items archiveOnly. Those are data-store facts from src/data/latest-news.json and src/data/archived-news.json.`,
    '',
    '## Blocker Breakdown',
    '',
    ...blockers.map(([label, count]) => `- ${label}: ${count}`),
    '',
    '## Recovery Direction',
    '',
    'The next pass should keep extraction, relevance, boilerplate, and truncation gates, but route clean relevant items into Core Longform Blog or Standard Blog instead of leaving every safe-but-imperfect item as source-only or archive-only.',
  ];

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${lines.join('\n')}\n`, 'utf8');
  return { counts, blockers, reportPath: REPORT_PATH };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await auditCurrentPublicSurface();
  console.log(`current homepage local blog count: ${result.counts.currentHomepageLocalBlogCount}`);
  console.log(`report: ${path.relative(ROOT, result.reportPath)}`);
}
