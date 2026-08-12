import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import { homepageBlogSurfaceResult, isLocalHomepageBlog } from './lib/homepage-blog-surface-policy.mjs';
import { buildHomepageFeed } from './lib/homepage-feed-builder.mjs';
import { blogLengthResult } from './lib/blog-length-policy.mjs';
import { forbiddenPublicPhraseMatches } from './lib/copy-quality-guard.mjs';
import { detectBoilerplate } from './lib/boilerplate-detector.mjs';
import { detectTruncationArtifacts } from './lib/truncation-detector.mjs';
import { isPublicLongformArticle } from './lib/public-surface-eligibility.mjs';
import { activeRegistryFeeds, loadSourceRegistrySync } from './lib/source-registry.mjs';
import { headingSequence, visibleBodyText } from './lib/visible-body-length.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = path.join(ROOT, 'dist');
const REPORT_PATH = path.join(ROOT, 'docs/blog-surface-v4-audit-report.md');

const BANNED_GENERIC = [
  /rapidly evolving/i,
  /underscores/i,
  /highlights the importance/i,
  /as AI continues to/i,
  /in today's digital landscape/i,
  /\bthe development\b/i,
  /\bthe issue is\b/i,
  /\bthe practical question is\b/i,
  /source-backed change/i,
  /\bthe watch metric is\b/i,
  /Editor's Brief/i,
  /The issue is no longer demand alone/i,
  /The practical issue is whether demand can be converted/i,
  /Read narrowly, this is one more item/i,
  /The financial question is whether/i,
  /The market tends to price the demand story first/i,
  /The next signal to watch is customer commitments/i,
];

const LOW_VALUE_CORE = [
  /amazon deal/i,
  /laptop review/i,
  /commencement/i,
  /recruitment spam/i,
  /sports AI startup/i,
  /dinosaur|fossil/i,
];

function firstWords(text = '', count = 10) {
  return visibleBodyText(text).split(/\s+/).slice(0, count).join(' ').toLowerCase();
}

async function fileText(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function longformArticleBodyHtml(detailHtml = '') {
  const section = String(detailHtml).match(/<section\b(?=[^>]*\bclass\s*=\s*(?:"[^"]*\blongform-article-body\b[^"]*"|'[^']*\blongform-article-body\b[^']*'))[^>]*>([\s\S]*?)<\/section\s*>/i);
  return section?.[1] || '';
}

function primaryHrefFor(article = {}) {
  return article.primaryHref || article.public_presentation?.view_detail || (article.articlePagePublished !== false ? `/news/${article.id}/` : article.sourceUrl || article.url || '');
}

function auditArticle(article = {}) {
  const body = article.expertLensFull?.finalArticleBody || '';
  const route = article.blog_route || 'standard_blog';
  const text = [
    article.title,
    article.deck,
    article.why_it_matters,
    article.public_presentation?.deck,
    article.public_presentation?.why_it_matters,
    body,
  ].filter(Boolean).join('\n\n');
  const length = blogLengthResult(body, route);
  const boilerplate = detectBoilerplate(text);
  const truncation = detectTruncationArtifacts(text);
  const reasons = [];
  if (!length.ok) reasons.push(...length.reasons);
  if ((length.metrics.wordCount || 0) < 650) reasons.push('word_count_below_standard_blog_target_minimum');
  if (boilerplate.copyright_footer_detected || boilerplate.boilerplate_ratio > 0 || boilerplate.nav_or_cta_detected) reasons.push('boilerplate_or_footer_leakage');
  if (!truncation.ok) reasons.push(...truncation.artifacts);
  if (forbiddenPublicPhraseMatches(text).length) reasons.push('forbidden_public_phrase');
  if (BANNED_GENERIC.some((pattern) => pattern.test(text))) reasons.push('banned_generic_blog_phrase');
  if (!article.blog_metadata?.thesis && !/\bThesis\b/i.test(body)) reasons.push('missing_thesis');
  if (!/\b(counter|bear case|not proven|without proving|limitation|break|offset|mislead|missing)\b/i.test(body)) reasons.push('missing_counterargument_or_limitation');
  if (!/\bBottom Line\b/i.test(body)) reasons.push('missing_bottom_line_section');
  if ((article.blog_metadata?.source_summary_ratio ?? 1) > 0.4) reasons.push('source_summary_ratio_above_40_percent');
  if ((article.blog_metadata?.analysis_ratio ?? 0) < 0.6) reasons.push('analysis_ratio_below_60_percent');
  if (LOW_VALUE_CORE.some((pattern) => pattern.test(text))) reasons.push('low_value_topic_in_blog_surface');
  if (!primaryHrefFor(article).startsWith('/news/')) reasons.push('primary_href_not_local_news_page');
  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    length,
    opening: firstWords(body, 10),
    headingSequence: headingSequence(body).join(' > '),
  };
}

export async function auditBlogSurfaceV4({
  latest = latestNews,
  archived = archivedNews,
  eligibilityOptions = {},
  requireBuiltPages = false,
  distDir = DIST_DIR,
  reportPath = REPORT_PATH,
} = {}) {
  const all = [...latest, ...archived];
  const publicHomepageCards = buildHomepageFeed(all, { ...eligibilityOptions, limit: 50, minimumVisible: 30 }).items;
  const publicDetails = publicHomepageCards.filter((article) => isPublicLongformArticle(article, eligibilityOptions));
  const blogs = publicDetails.filter(isLocalHomepageBlog).slice(0, 20);
  const homepage = homepageBlogSurfaceResult(publicHomepageCards);
  const sourceRegistry = eligibilityOptions.sourceRegistry !== undefined
    ? eligibilityOptions.sourceRegistry
    : loadSourceRegistrySync(eligibilityOptions.sourceRegistryPath);
  const authorizedSourceCount = activeRegistryFeeds(Array.isArray(sourceRegistry) ? sourceRegistry : [], eligibilityOptions.now || new Date()).length;
  const rightsReviewSafeMode = authorizedSourceCount === 0 && publicHomepageCards.length === 0 && publicDetails.length === 0;
  const articleResults = blogs.map((article) => ({ article, result: auditArticle(article) }));
  const reasons = [];

  if (!homepage.ok) reasons.push(...homepage.reasons);
  if (rightsReviewSafeMode) reasons.push('rights_review_safe_mode_zero_authorized_sources');
  for (const { article, result } of articleResults) {
    if (!result.ok) reasons.push(`${article.id}:${result.reasons.join(',')}`);
  }

  const missingBuiltDetailPages = [];
  const builtDetailForbidden = [];
  if (requireBuiltPages) {
    for (const { article } of articleResults) {
      const detailHtml = await fileText(path.join(distDir, 'news', article.id, 'index.html'));
      if (!detailHtml) {
        missingBuiltDetailPages.push(article.id);
        continue;
      }
      const articleBodyHtml = longformArticleBodyHtml(detailHtml);
      if (!articleBodyHtml || forbiddenPublicPhraseMatches(articleBodyHtml).length || BANNED_GENERIC.some((pattern) => pattern.test(articleBodyHtml))) {
        builtDetailForbidden.push(article.id);
      }
    }
    if (missingBuiltDetailPages.length) reasons.push(`missing_built_local_detail_pages:${missingBuiltDetailPages.join(',')}`);
    if (builtDetailForbidden.length) reasons.push(`built_detail_forbidden_phrase:${builtDetailForbidden.join(',')}`);
  }

  const tones = new Set(blogs.map((article) => article.blog_metadata?.tone).filter(Boolean));
  const archetypes = new Set(blogs.map((article) => article.blog_metadata?.archetype).filter(Boolean));
  if (!rightsReviewSafeMode && tones.size < 5) reasons.push(`latest_20_tones_below_5:${tones.size}`);
  if (!rightsReviewSafeMode && archetypes.size < 5) reasons.push(`latest_20_archetypes_below_5:${archetypes.size}`);

  const openings = new Map();
  for (const { result } of articleResults) openings.set(result.opening, (openings.get(result.opening) || 0) + 1);
  const duplicateOpenings = [...openings.entries()].filter(([, count]) => count > 1);
  if (duplicateOpenings.length) reasons.push('duplicate_first_10_opening_words');

  const headingSequences = new Map();
  for (const { result } of articleResults) headingSequences.set(result.headingSequence, (headingSequences.get(result.headingSequence) || 0) + 1);
  const repeatedHeadingSequences = [...headingSequences.entries()].filter(([, count]) => count > 2);
  if (repeatedHeadingSequences.length) reasons.push('heading_sequence_repeated_more_than_twice');

  const archiveIds = new Set(archived.filter((article) => article.archiveOnly === true || article.public_status === 'archive_only_noindex').map((article) => article.id));
  let archiveIdsInSitemap = [];
  let archiveIdsInRss = [];
  if (requireBuiltPages) {
    const sitemapText = await fileText(path.join(distDir, 'sitemap-0.xml')) || await fileText(path.join(distDir, 'sitemap-index.xml'));
    const rssText = await fileText(path.join(distDir, 'rss.xml'));
    archiveIdsInSitemap = [...archiveIds].filter((id) => sitemapText.includes(`/news/${id}/`));
    archiveIdsInRss = [...archiveIds].filter((id) => rssText.includes(`/news/${id}/`));
    if (archiveIdsInSitemap.length) reasons.push('archive_only_ids_in_sitemap');
    if (archiveIdsInRss.length) reasons.push('archive_only_ids_in_rss');
  }

  const localBlogIds = new Set(blogs.map((article) => article.id));
  const sourceOnlyOnHomepage = publicHomepageCards.filter((article) => !localBlogIds.has(article.id));
  const reportLines = [
    '# Blog Surface v4 Audit Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    `Status: ${reasons.length ? 'failed' : 'passed'}`,
    `Authorized text sources: ${authorizedSourceCount}`,
    `Public homepage cards: ${publicHomepageCards.length}`,
    `Public local detail pages: ${publicDetails.length}`,
    `Homepage local blog count: ${homepage.localBlogCount}`,
    `Source-only/short cards on homepage: ${sourceOnlyOnHomepage.length}`,
    `Tone count in latest 20: ${tones.size}`,
    `Archetype count in latest 20: ${archetypes.size}`,
    `Duplicate first-10-word openings: ${duplicateOpenings.length}`,
    `Repeated heading sequences >2: ${repeatedHeadingSequences.length}`,
    `Archive IDs in sitemap: ${requireBuiltPages ? archiveIdsInSitemap.length : 'not checked (source-only audit)'}`,
    `Archive IDs in RSS: ${requireBuiltPages ? archiveIdsInRss.length : 'not checked (source-only audit)'}`,
    `Missing built local detail pages: ${requireBuiltPages ? missingBuiltDetailPages.length : 'not checked (source-only audit)'}`,
    `Built detail pages with forbidden phrases: ${requireBuiltPages ? builtDetailForbidden.length : 'not checked (source-only audit)'}`,
    '',
    '## Latest 20 Local Blogs',
    '',
    '| # | Status | Route | Chars | Paragraphs | Source | Tone | Archetype | Title |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...articleResults.map(({ article, result }, index) => `| ${index + 1} | ${result.ok ? 'pass' : result.reasons.join('; ')} | ${article.publishing_route} | ${result.length.metrics.visibleBodyCharacters} | ${result.length.metrics.paragraphCount} | ${article.source || ''} | ${article.blog_metadata?.tone || ''} | ${article.blog_metadata?.archetype || ''} | ${String(article.title || '').replace(/\|/g, '/')} |`),
    '',
    '## Failure Reasons',
    '',
    ...(reasons.length ? reasons.map((reason) => `- ${reason}`) : ['- none']),
  ];

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${reportLines.join('\n')}\n`, 'utf8');

  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    homepage,
    articleResults,
    tones,
    archetypes,
    missingBuiltDetailPages,
    builtDetailForbidden,
    builtOutputChecked: requireBuiltPages,
    publicHomepageCardCount: publicHomepageCards.length,
    publicDetailCount: publicDetails.length,
    sourceOnlyCardCount: sourceOnlyOnHomepage.length,
    authorizedSourceCount,
    rightsReviewSafeMode,
    reportPath,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await auditBlogSurfaceV4({ requireBuiltPages: true });
  console.log(`blog surface audit: ${result.ok ? 'pass' : 'fail'}`);
  console.log(`report: ${path.relative(ROOT, result.reportPath)}`);
  if (!result.ok) {
    console.error(result.reasons.join('\n'));
    process.exitCode = 1;
  }
}
