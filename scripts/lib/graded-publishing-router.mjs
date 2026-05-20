import { routeStrictInfrastructureRelevance, namesConcreteInfrastructureLayer } from './strict-infrastructure-relevance-router.mjs';
import { buildEvidencePack } from './evidence-pack-builder.mjs';
import { blogEligibilityResult } from './blog-eligibility-policy.mjs';

export const GRADED_ROUTES = {
  CORE_LONGFORM_BLOG: 'core_longform_blog',
  STANDARD_BLOG: 'standard_blog',
  SHORT_SIGNAL: 'short_signal',
  SOURCE_CARD: 'source_card',
  ARCHIVE_ONLY: 'archive_only',
};

const LOW_VALUE_PATTERNS = [
  /^\s*sponsored:/i,
  /\b(gpu|graphics card|radeon|geforce|rtx|rx)\b.{0,100}\b(deal|discount|amazon|all-time low|save)\b/i,
  /\b(laptop review|dell xps|macbook|consumer laptop)\b/i,
  /\b(ryzen|core i\d|igpu|integrated graphics|dual-gpu radeon|video cards?)\b.{0,120}\b(review|launched|workstations?|midrange|consumer)\b/i,
  /\bshareholder letter\b/i,
  /\btech destination\b/i,
  /\brobot isn.t coming for your job\b/i,
  /\bwater made from air\b/i,
  /\batomic innovation\b/i,
  /\bBay Area home\b/i,
  /\bAnthropic equity\b/i,
  /\bheard these AI terms\b/i,
  /\bnodded along\b/i,
  /\bsocial media platform\b/i,
  /\bdoomscrolling\b/i,
  /\bad platform\b/i,
  /\bX announces\b/i,
  /\bmainstream client ssds?\b/i,
  /\bInfosys\b/i,
  /\bAI tools to more businesses\b/i,
  /\bTrump administration\b/i,
  /\bStrictlyVC\b/i,
  /\bReplit\b/i,
  /\bTP-Link\b/i,
  /\bTL-SX1008\b/i,
  /\bTokenmaxxing\b/i,
  /\bshopping spree\b/i,
  /\bAI Anxiety Gap\b/i,
  /\bApple under Ternus\b/i,
  /\bhardware strategy\b/i,
  /\bAI gadgets\b/i,
  /\bprotecting telecom operators from cyberattacks\b/i,
  /\btwo neat features\b/i,
  /\bai uncertainty: more adoption, more caution\b/i,
  /\bcommencement\b/i,
  /\blinkedin\b.{0,80}\brecruit/i,
  /\bsports ai|football analytics|S[ūu]merSports|Paul Tudor Jones\b/i,
  /\bdinosaur|fossil|collectible\b/i,
  /\bgeneric legal|law firm|legal ai tool\b/i,
  /\blabor market|biography|founder profile\b/i,
];

function scoreFor(article = {}) {
  const score = Number(article.infrastructure_relevance_score ?? article.relevance_score ?? article.public_routing?.score ?? 0);
  return Number.isFinite(score) ? score : 0;
}

function textBundle(article = {}) {
  return [
    article.title,
    article.source,
    article.summary,
    article.snippet,
    article.articleText,
    article.contentText,
    article.category,
    article.infrastructure_layer,
  ].filter(Boolean).join(' ');
}

export function routeGradedPublishing(article = {}, options = {}) {
  const score = scoreFor(article);
  const strict = routeStrictInfrastructureRelevance(article);
  const text = textBundle(article);
  const lowValue = LOW_VALUE_PATTERNS.some((pattern) => pattern.test(text));
  const evidencePack = buildEvidencePack(article);
  const reasons = [];

  if (lowValue) reasons.push('low_value_non_infrastructure_topic');
  if (strict.visibility === 'archive') reasons.push(...(strict.blocked_reasons || ['strict_archive']));
  if (!evidencePack.affectedInfrastructureLayer) reasons.push('missing_concrete_infrastructure_layer');
  if (evidencePack.blockReasons.includes('unclean_or_short_evidence')) reasons.push('unclean_or_short_evidence');

  if (lowValue || score < 0.55 || strict.visibility === 'archive') {
    return {
      route: GRADED_ROUTES.ARCHIVE_ONLY,
      label: 'Archive Only',
      visibility: 'archive',
      homepageEligible: false,
      localArticleRequired: false,
      sourceLinkPrimary: false,
      score,
      strict,
      evidencePack,
      reasons: [...new Set(reasons.length ? reasons : ['relevance_below_adjacent_threshold'])],
    };
  }

  const coreEligibility = blogEligibilityResult(article, GRADED_ROUTES.CORE_LONGFORM_BLOG);
  if (score >= 0.75 && strict.visibility === 'core' && coreEligibility.ok && evidencePack.facts.length >= 4) {
    return {
      route: GRADED_ROUTES.CORE_LONGFORM_BLOG,
      label: 'Core Longform Blog',
      visibility: 'core',
      homepageEligible: true,
      localArticleRequired: true,
      sourceLinkPrimary: false,
      score,
      strict,
      evidencePack,
      reasons: [],
    };
  }

  const standardEligibility = blogEligibilityResult(article, GRADED_ROUTES.STANDARD_BLOG);
  if (score >= 0.68 && strict.visibility !== 'archive' && standardEligibility.ok && evidencePack.facts.length >= 3) {
    return {
      route: GRADED_ROUTES.STANDARD_BLOG,
      label: 'Standard Blog',
      visibility: 'core',
      homepageEligible: true,
      localArticleRequired: true,
      sourceLinkPrimary: false,
      score,
      strict,
      evidencePack,
      reasons: coreEligibility.reasons,
    };
  }

  if (score >= 0.55 && evidencePack.facts.length >= 2 && !evidencePack.blockReasons.includes('unclean_or_short_evidence')) {
    return {
      route: GRADED_ROUTES.SHORT_SIGNAL,
      label: 'Short Signal',
      visibility: 'adjacent',
      homepageEligible: true,
      localArticleRequired: false,
      sourceLinkPrimary: false,
      score,
      strict,
      evidencePack,
      reasons: standardEligibility.reasons,
    };
  }

  if (score >= 0.55 && !lowValue) {
    return {
      route: GRADED_ROUTES.SOURCE_CARD,
      label: 'Source Card',
      visibility: 'source_card',
      homepageEligible: false,
      localArticleRequired: false,
      sourceLinkPrimary: true,
      score,
      strict,
      evidencePack,
      reasons: standardEligibility.reasons.length ? standardEligibility.reasons : ['evidence_too_thin_for_blog'],
    };
  }

  return {
    route: GRADED_ROUTES.ARCHIVE_ONLY,
    label: 'Archive Only',
    visibility: 'archive',
    homepageEligible: false,
    localArticleRequired: false,
    sourceLinkPrimary: false,
    score,
    strict,
    evidencePack,
    reasons: [...new Set(reasons.length ? reasons : ['not_enough_relevance_or_evidence'])],
  };
}
