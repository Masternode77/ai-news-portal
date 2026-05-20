import { routePublicLane } from './public-lane-router.mjs';
import { sourceExtractionPassesLongformGate } from './source-extraction-fail-closed.mjs';
import { guardPublicTemplatePhrases } from './public-template-phrase-guard.mjs';
import { guardPublicCopy } from './copy-quality-guard.mjs';
import { detectBoilerplate } from './boilerplate-detector.mjs';
import { detectTruncationArtifacts } from './truncation-detector.mjs';
import { cleanArticleBodyBlocks } from './article-body-cleaner.mjs';
import { publicPublishQualityGate } from './public-publish-quality-gate.mjs';

function publicDetailText(article = {}) {
  return [
    article.title,
    article.summary,
    article.snippet,
    article.deck,
    article.why_it_matters,
    article.expertLensShort,
    article.expertLensFull?.finalHeadline,
    article.expertLensFull?.metaDescription,
    article.expertLensFull?.finalArticleBody,
    article.articleText,
  ].filter(Boolean).join('\n\n');
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))];
}

export function articleDetailQualityResult(article = {}, options = {}) {
  const route = options.route || article.public_routing || routePublicLane(article);
  const extraction = sourceExtractionPassesLongformGate(article);
  const text = publicDetailText(article);
  const copyGuard = guardPublicCopy(text);
  const templateGuard = guardPublicTemplatePhrases(copyGuard.text || text);
  const boilerplate = detectBoilerplate(text);
  const truncation = detectTruncationArtifacts(text);
  const bodyBlocks = cleanArticleBodyBlocks(article.expertLensFull?.finalArticleBody || article.articleText || '');
  const shouldEnforcePublicGate = options.enforcePublicPublishGate === true
    || article.generation_version === 'editorial_article_v2'
    || article.public_generation_version === 'editorial_article_v2';
  const publicGate = shouldEnforcePublicGate ? publicPublishQualityGate(article, options) : null;
  const reasons = [];

  if (article.public_status === 'quarantined') reasons.push('quarantined');
  if (article.archiveOnly === true || article.infrastructure_relevance_action === 'archive_only') reasons.push('archive_only');
  if (route.visibility !== 'core') reasons.push(`route_not_core:${route.visibility}`);
  if (!extraction.ok) reasons.push(...extraction.block_reasons.map((reason) => `source_extraction:${reason}`));
  if (!copyGuard.ok) reasons.push(...copyGuard.reasons);
  if (!templateGuard.ok) reasons.push(...templateGuard.reasons);
  if (boilerplate.boilerplate_ratio > 0 || boilerplate.copyright_footer_detected || boilerplate.nav_or_cta_detected) reasons.push('source_boilerplate_leakage');
  if (!truncation.ok) reasons.push(...truncation.artifacts);
  if (/editor'?s brief/i.test(text)) reasons.push('fixed_editors_brief_template');
  if (bodyBlocks.join(' ').length < 500) reasons.push('article_body_too_short_after_cleaning');
  if (publicGate && !publicGate.ok) reasons.push(...publicGate.reasons);

  return {
    ok: reasons.length === 0,
    reasons: unique(reasons),
    route,
    extraction,
    copyGuard,
    templateGuard,
    boilerplate,
    truncation,
    bodyBlocks,
    publicGate,
  };
}

export function articleDetailQualityEligible(article = {}, options = {}) {
  return articleDetailQualityResult(article, options).ok;
}
