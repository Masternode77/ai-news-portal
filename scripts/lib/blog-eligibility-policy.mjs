import { buildEvidencePack } from './evidence-pack-builder.mjs';
import { detectBoilerplate } from './boilerplate-detector.mjs';
import { detectTruncationArtifacts } from './truncation-detector.mjs';

export const ROUTE_FACT_REQUIREMENTS = {
  core_longform_blog: 5,
  standard_blog: 3,
  short_signal: 2,
};

function scoreFor(article = {}) {
  const score = Number(article.infrastructure_relevance_score ?? article.relevance_score ?? 0);
  return Number.isFinite(score) ? score : 0;
}

export function blogEligibilityResult(article = {}, route = 'standard_blog') {
  const minFacts = ROUTE_FACT_REQUIREMENTS[route] || 3;
  const evidencePack = buildEvidencePack(article, { factTarget: minFacts });
  const text = [
    article.title,
    article.summary,
    article.snippet,
    article.articleText,
    article.contentText,
    article.expertLensFull?.finalArticleBody,
  ].filter(Boolean).map((value) => String(value).slice(0, 2200)).join('\n\n');
  const boilerplate = detectBoilerplate(text);
  const truncation = detectTruncationArtifacts(text);
  const score = scoreFor(article);
  const reasons = [];

  if (route === 'core_longform_blog' && score < 0.75) reasons.push('score_below_core_longform_threshold');
  if (route === 'standard_blog' && score < 0.68) reasons.push('score_below_standard_blog_threshold');
  if (!evidencePack.ok) reasons.push(...evidencePack.blockReasons);
  if (boilerplate.copyright_footer_detected || boilerplate.boilerplate_ratio > 0.08) reasons.push('boilerplate_detected');
  if (!truncation.ok) reasons.push(...truncation.artifacts);

  return {
    ok: reasons.length === 0,
    route,
    score,
    evidencePack,
    reasons: [...new Set(reasons)],
  };
}

export function blogEligible(article = {}, route = 'standard_blog') {
  return blogEligibilityResult(article, route).ok;
}
