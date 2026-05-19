import { routePublicLane } from './public-lane-router.mjs';
import { sourceExtractionPassesPublicGate, sourceExtractionPassesLongformGate } from './source-extraction-fail-closed.mjs';
import { guardPublicTemplatePhrases } from './public-template-phrase-guard.mjs';
import { detectBoilerplate } from './boilerplate-detector.mjs';
import { detectTruncationArtifacts } from './truncation-detector.mjs';

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))];
}

function publicSeoText(article = {}) {
  return [
    article.title,
    article.summary,
    article.snippet,
    article.deck,
    article.why_it_matters,
    article.public_presentation?.deck,
    article.public_presentation?.why_it_matters,
    article.expertLensShort,
    article.expertLensFull?.metaDescription,
    article.expertLensFull?.finalArticleBody,
    article.articleText,
  ].filter(Boolean).join('\n\n');
}

export function seoNoindexReasons(article = {}, options = {}) {
  const route = options.route || routePublicLane(article);
  const text = publicSeoText(article);
  const publicExtraction = sourceExtractionPassesPublicGate(article);
  const longformExtraction = sourceExtractionPassesLongformGate(article);
  const templateGuard = guardPublicTemplatePhrases(text);
  const boilerplate = detectBoilerplate(text);
  const truncation = detectTruncationArtifacts(text);
  const reasons = [];

  if (article.public_status === 'quarantined' || article.quarantined === true) reasons.push('quarantined');
  if (article.public_status === 'archive_only_noindex') reasons.push('archive_only_noindex');
  if (article.noindex === true || article.seo_noindex === true) {
    if (Array.isArray(article.seo_noindex_reasons) && article.seo_noindex_reasons.length) {
      reasons.push(...article.seo_noindex_reasons);
    } else {
      reasons.push('explicit_noindex');
    }
  }
  if (article.archiveOnly === true || article.infrastructure_relevance_action === 'archive_only') reasons.push('archive_only_relevance_action');
  if (route.visibility === 'archive') reasons.push(...(route.blocked_reasons || ['archive_route']));
  if (route.visibility === 'adjacent' && !publicExtraction.ok) reasons.push(...publicExtraction.block_reasons.map((reason) => `source_extraction:${reason}`));
  if (route.visibility === 'core' && !longformExtraction.ok) reasons.push(...longformExtraction.block_reasons.map((reason) => `source_extraction:${reason}`));
  if (!templateGuard.ok) reasons.push(...templateGuard.reasons);
  if (boilerplate.boilerplate_ratio > 0 || boilerplate.copyright_footer_detected || boilerplate.nav_or_cta_detected) reasons.push('source_boilerplate_leakage');
  if (!truncation.ok) reasons.push(...truncation.artifacts);
  if (article.articlePagePublished === false && route.visibility === 'core') reasons.push('article_page_not_published');

  return unique(reasons);
}

export function shouldNoindexPublicArticle(article = {}, options = {}) {
  return seoNoindexReasons(article, options).length > 0;
}

export function sitemapArticleEligible(article = {}, options = {}) {
  const route = options.route || routePublicLane(article);
  return route.visibility === 'core'
    && article.articlePagePublished !== false
    && !shouldNoindexPublicArticle(article, { route });
}

export function rssItemEligible(article = {}, options = {}) {
  const route = options.route || routePublicLane(article);
  return (route.visibility === 'core' || route.visibility === 'adjacent')
    && article.homepagePublished !== false
    && article.archiveOnly !== true
    && !shouldNoindexPublicArticle(article, { route });
}
