import { routePublicLane, CORE_LANE_KEYS, CORE_RELEVANCE_THRESHOLD } from './public-lane-router.mjs';
import { buildPublicPresentation } from './public-presentation.mjs';
import { publicVisibilityBlocked } from './content-quarantine.mjs';
import { sourceExtractionPassesPublicGate } from './source-extraction-fail-closed.mjs';
import { guardHomepageCardCopy } from './homepage-card-copy-guard.mjs';

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))];
}

function hasOnlyShortCleanEvidence(extraction = {}) {
  const reasons = extraction.block_reasons || extraction.reasons || [];
  if (extraction.ok) return false;
  if (extraction.boilerplate?.copyright_footer_detected) return false;
  if ((extraction.boilerplate?.boilerplate_ratio || 0) > 0.08) return false;
  if (!extraction.truncation?.ok) return false;
  return reasons.length > 0 && reasons.every((reason) =>
    /cleaned_source_text_below_|source_evidence_length_below_|source_completeness|sentence_completion_score_below/i.test(String(reason))
  );
}

function publicTextBundle(article = {}, presentation = {}) {
  return [
    article.title,
    article.summary,
    article.snippet,
    article.expertLensShort,
    article.expertLensFull?.finalHeadline,
    article.expertLensFull?.metaDescription,
    presentation.deck,
    presentation.why_it_matters,
    article.public_presentation?.deck,
    article.public_presentation?.why_it_matters,
  ].filter(Boolean).join('\n\n');
}

export function homepageQualityResult(article = {}, options = {}) {
  const route = options.route || routePublicLane(article);
  const presentation = options.presentation || buildPublicPresentation(article, {
    route,
    recentDecks: options.recentDecks || [],
  });
  const extraction = sourceExtractionPassesPublicGate(article);
  const deckGuard = guardHomepageCardCopy(presentation.deck || '');
  const copyGuard = guardHomepageCardCopy(publicTextBundle(article, presentation));
  const reasons = [];

  if (publicVisibilityBlocked(article)) reasons.push('public_visibility_blocked');
  if (route.visibility === 'archive') reasons.push(...(route.blocked_reasons || ['archive_route']));
  if (CORE_LANE_KEYS.has(route.laneKey) && Number(route.score) < CORE_RELEVANCE_THRESHOLD) {
    reasons.push('core_lane_relevance_below_0.75');
  }
  if (route.visibility === 'core' && !extraction.ok && !(article.signalCardOnly === true && hasOnlyShortCleanEvidence(extraction))) {
    reasons.push(...extraction.block_reasons.map((reason) => `source_extraction:${reason}`));
  }
  if (!deckGuard.ok) reasons.push(...deckGuard.reasons.map((reason) => `deck:${reason}`));
  if (!copyGuard.ok) reasons.push(...copyGuard.reasons.map((reason) => `public_copy:${reason}`));

  return {
    ok: reasons.length === 0,
    reasons: unique(reasons),
    route,
    presentation,
    extraction,
    deckGuard,
    copyGuard,
  };
}

export function homepageQualityEligible(article = {}, options = {}) {
  return homepageQualityResult(article, options).ok;
}
