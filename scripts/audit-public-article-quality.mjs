import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import { longformQualityResult } from './lib/longform-engine.mjs';
import { isPublicLongformArticle } from './lib/public-surface-eligibility.mjs';
import { detectTruncationArtifacts } from './lib/truncation-detector.mjs';
import { articleNoindexReasons } from '../src/lib/seo-safeguards.js';

const REPEATED_TEMPLATE = /(What Changed|Why Teams Care|Metric To Watch|Editorial Read|At a Glance|Editor's Brief|should care because|source-backed change|turns the reported move into|the practical issue is whether|the next signal to watch is|the watch metric is|for Compute Current readers|The issue is no longer demand alone|it is whether the surrounding infrastructure is ready|Watch execution details, customer commitments|Read narrowly, this is one more item|Read against the buildout cycle|The financial question is whether|the operating question is procurement timing|the customer question is whether|The market tends to price the demand story first|This is where AI infrastructure differs from ordinary software growth|test against source evidence|Compute Current is keeping the card short)/i;

function dedupeById(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function auditPublicArticleQuality() {
  const articles = dedupeById(
    [...latestNews, ...archivedNews].filter((article) =>
      article.articlePagePublished === true
      && article.archiveOnly !== true
      && article.public_content_tier !== 'editorial_brief'
      && article.public_content_tier !== 'signal_card'
    )
  );
  const failures = [];
  for (const article of articles) {
    const body = article.expertLensFull?.finalArticleBody || '';
    const quality = longformQualityResult(article);
    const truncation = detectTruncationArtifacts(body);
    if (!quality.ok) failures.push(`${article.id}: ${quality.reasons.join(',')}`);
    if (!truncation.ok) failures.push(`${article.id}: clipped_source_text`);
    if (REPEATED_TEMPLATE.test(body)) failures.push(`${article.id}: repeated_template_phrase`);
    if (!isPublicLongformArticle(article)) {
      const noindexReasons = articleNoindexReasons(article);
      failures.push(`${article.id}: not_public_article_route_eligible${noindexReasons.length ? `:${noindexReasons.join('|')}` : ''}`);
    }
  }
  const routeEligibleCount = articles.filter(isPublicLongformArticle).length;
  if (articles.length >= 10 && routeEligibleCount < 10) {
    failures.push(`longform_route_count_below_10:${routeEligibleCount}`);
  }
  return { ok: failures.length === 0, failures, longformCount: articles.length, routeEligibleCount };
}

const result = auditPublicArticleQuality();
if (!result.ok) {
  console.error(`article quality audit failed:\n${result.failures.slice(0, 50).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`article quality audit passed: ${result.longformCount} longform articles, ${result.routeEligibleCount} public article routes`);
}
