import { routePublicLane } from './public-lane-router.mjs';
import { analyzeSourceTextCompleteness } from './source-text-completeness.mjs';
import { guardPublicCopy } from './copy-quality-guard.mjs';
import { evaluatePremiumArticleQuality } from './premium-article-quality-gate.mjs';
import { normalizeProperNouns } from './proper-noun-normalizer.mjs';

const WEAK_PUBLIC_PATTERNS = [
  /\bconsumer laptop\b/i,
  /\blaptop deals?\b/i,
  /\bgpu deals?\b/i,
  /\bgaming\b/i,
  /\bconsumer tech\b/i,
  /\bgeneric ai\b/i,
  /\blabor market\b/i,
  /\brecruit(?:ing|ment)\b/i,
  /\bcommencement speech\b/i,
  /\bbiograph(?:y|ical)\b/i,
  /\bcelebrity\b/i,
];

function bundle(article = {}) {
  return [
    article.title,
    article.summary,
    article.snippet,
    article.articleText,
    article.primary_category,
    article.secondary_category,
    article.infrastructure_layer,
    ...(article.tags || []),
  ].filter(Boolean).join(' ');
}

export function evaluateMonetizationReadiness(article = {}) {
  const text = bundle(article);
  const route = routePublicLane(article);
  const source = analyzeSourceTextCompleteness(article);
  const publicCopy = guardPublicCopy([
    normalizeProperNouns(String(article.title || '').replace(/…/g, ' ')),
    article.public_presentation?.deck || article.deck,
    article.public_presentation?.why_it_matters || article.why_it_matters,
  ].filter(Boolean).join(' '));
  const weakTopic = WEAK_PUBLIC_PATTERNS.find((pattern) => pattern.test(text));
  const premium = ['pro', 'team', 'enterprise'].includes(String(article.access_level || '').toLowerCase())
    ? evaluatePremiumArticleQuality(article)
    : { ok: true, reasons: [] };
  const reasons = [];

  if (weakTopic && route.visibility === 'core') reasons.push('weak_topic_in_core_lane');
  if (!source.ok && ['pro', 'team', 'enterprise'].includes(String(article.access_level || '').toLowerCase())) {
    reasons.push(...source.reasons);
  }
  if (!publicCopy.ok) reasons.push(...publicCopy.reasons);
  if (!premium.ok) reasons.push(...premium.reasons.map((reason) => `premium:${reason}`));

  return {
    ok: reasons.length === 0,
    reasons,
    route,
    source,
    public_copy: publicCopy,
    premium,
  };
}

export function monetizationReady(article = {}) {
  return evaluateMonetizationReadiness(article).ok;
}
