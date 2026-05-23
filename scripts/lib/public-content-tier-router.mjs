import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectBoilerplate } from './boilerplate-detector.mjs';
import { detectTruncationArtifacts } from './truncation-detector.mjs';
import { buildEvidencePack } from './evidence-pack-builder.mjs';
import { namesConcreteInfrastructureLayer, routePublicLane } from './public-lane-router.mjs';
import {
  sourceExtractionPassesLongformGate,
  sourceExtractionPassesPublicGate,
} from './source-extraction-fail-closed.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const POLICY_PATH = path.join(ROOT, 'config/editorial/content-tier-policy.json');

export const PUBLIC_CONTENT_TIERS = {
  LONGFORM_ANALYSIS: 'longform_analysis',
  EDITORIAL_BRIEF: 'editorial_brief',
  SIGNAL_CARD: 'signal_card',
  HIDDEN: 'hidden',
};

export function loadContentTierPolicy() {
  return JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
}

function scoreFor(article = {}) {
  const score = Number(article.infrastructure_relevance_score ?? article.relevance_score ?? article.public_routing?.score ?? 0);
  return Number.isFinite(score) ? score : 0;
}

function extractionFor(article = {}) {
  const score = Number(article.extraction_quality_score ?? article.source_quality_score ?? 0.85);
  return Number.isFinite(score) ? score : 0.85;
}

function evidenceText(article = {}) {
  return [
    article.cleaned_source_text,
    article.source_evidence_text,
    article.fullArticleText,
    article.articleText,
    article.contentText,
    article.summary,
    article.snippet,
  ].filter(Boolean).join(' ');
}

function isLowValueConsumer(article = {}) {
  const text = [
    article.title,
    article.source,
    article.summary,
    article.snippet,
    article.articleText,
  ].filter(Boolean).join(' ');
  return /\b(gaming laptop|amazon deal|all-time low|graphics card|consumer laptop|surface laptop|business pc|smartphone|wearable|celebrity|fossil|dinosaur|search box|gaming chair|playstation|ps5|refurbished console|research bits|chip stocks bounce|yields retreat|ai builders|developer community|what.?s new with google data cloud|private markets.*spacex could spoil|could spoil the party|ai-pilled arm ceo|turn it into a money machine|life science firm|metis techbio|magic quadrant|ai application development platforms|striking back at ai memory pricing|everpure)\b/i.test(text);
}

function publicFieldsForTier(tier) {
  if (tier === PUBLIC_CONTENT_TIERS.LONGFORM_ANALYSIS) {
    return { homepageVisible: true, detailPage: true, noindex: false };
  }
  if (tier === PUBLIC_CONTENT_TIERS.EDITORIAL_BRIEF) {
    return { homepageVisible: true, detailPage: false, noindex: false };
  }
  if (tier === PUBLIC_CONTENT_TIERS.SIGNAL_CARD) {
    return { homepageVisible: true, detailPage: false, noindex: false };
  }
  return { homepageVisible: false, detailPage: false, noindex: true };
}

export function routePublicContentTier(article = {}, options = {}) {
  const policy = options.policy || loadContentTierPolicy();
  const score = scoreFor(article);
  const extractionQuality = extractionFor(article);
  const text = evidenceText(article);
  const boilerplate = detectBoilerplate(text);
  const truncation = detectTruncationArtifacts(text);
  const evidencePack = options.evidencePack || buildEvidencePack(article);
  const strict = article.public_routing || routePublicLane(article);
  const publicExtraction = sourceExtractionPassesPublicGate(article);
  const longformExtraction = sourceExtractionPassesLongformGate(article);
  const reasons = [];
  const dirty = extractionQuality < policy.signal_card.minExtractionQuality
    || article.quarantined === true
    || article.public_status === 'quarantined'
    || !publicExtraction.ok
    || boilerplate.copyright_footer_detected
    || boilerplate.boilerplate_ratio > 0.25
    || !truncation.ok;

  if (isLowValueConsumer(article)) reasons.push('outside_product_boundary');
  if ((strict.blocked_reasons || []).some((reason) => /outside_compute_current_product_boundary|low_value_non_infrastructure_topic/i.test(reason))) {
    reasons.push('outside_product_boundary');
  }
  if (dirty) reasons.push('dirty_extraction');
  if (score < policy.signal_card.minRelevance) reasons.push('low_relevance');
  if (!namesConcreteInfrastructureLayer(article)) reasons.push('missing_concrete_infrastructure_layer');
  if (strict.visibility === 'archive') reasons.push(...(strict.blocked_reasons || ['archive_route']));

  let tier = PUBLIC_CONTENT_TIERS.HIDDEN;
  const productFit = !reasons.includes('outside_product_boundary') && !reasons.includes('missing_concrete_infrastructure_layer');

  if (productFit && !dirty && longformExtraction.ok && score >= policy.longform_analysis.minRelevance && strict.visibility === 'core') {
    if (text.length >= policy.longform_analysis.minEvidenceCharacters && evidencePack.facts.length >= policy.longform_analysis.minFacts) {
      tier = PUBLIC_CONTENT_TIERS.LONGFORM_ANALYSIS;
    } else if (text.length >= policy.signal_card.minEvidenceCharacters) {
      tier = PUBLIC_CONTENT_TIERS.SIGNAL_CARD;
      reasons.push('thin_source');
    }
  } else if (productFit && !dirty && score >= policy.editorial_brief.minRelevance && strict.visibility !== 'archive') {
    if (text.length >= policy.editorial_brief.minEvidenceCharacters && evidencePack.facts.length >= policy.editorial_brief.minFacts) {
      tier = PUBLIC_CONTENT_TIERS.EDITORIAL_BRIEF;
    } else if (text.length >= policy.signal_card.minEvidenceCharacters && evidencePack.facts.length >= policy.signal_card.minFacts) {
      tier = PUBLIC_CONTENT_TIERS.SIGNAL_CARD;
      reasons.push('thin_source');
    }
  }

  if (
    tier === PUBLIC_CONTENT_TIERS.HIDDEN
    && productFit
    && dirty
    && score >= policy.signal_card.minRelevance
    && strict.visibility !== 'archive'
    && (article.sourceUrl || article.url)
    && article.title
  ) {
    tier = PUBLIC_CONTENT_TIERS.SIGNAL_CARD;
    reasons.push('source_only_due_dirty_extraction');
  }

  if (tier === PUBLIC_CONTENT_TIERS.HIDDEN && reasons.length === 0) reasons.push('not_enough_public_evidence');

  return {
    tier,
    ...publicFieldsForTier(tier),
    score,
    extractionQuality,
    evidenceCharacters: text.length,
    factCount: evidencePack.facts.length,
    publicLabel: tier === PUBLIC_CONTENT_TIERS.LONGFORM_ANALYSIS
      ? 'Analysis'
      : tier === PUBLIC_CONTENT_TIERS.EDITORIAL_BRIEF
        ? 'Brief'
        : tier === PUBLIC_CONTENT_TIERS.SIGNAL_CARD
          ? 'Signal'
          : 'Hidden',
    reasons: [...new Set(reasons)],
    evidencePack,
    strict,
  };
}

export function applyPublicContentTier(article = {}, options = {}) {
  const result = routePublicContentTier(article, options);
  return {
    ...article,
    public_content_tier: result.tier,
    homepagePublished: result.homepageVisible,
    articlePagePublished: result.detailPage,
    signalCardOnly: result.tier === PUBLIC_CONTENT_TIERS.SIGNAL_CARD || result.tier === PUBLIC_CONTENT_TIERS.EDITORIAL_BRIEF,
    archiveOnly: result.tier === PUBLIC_CONTENT_TIERS.HIDDEN,
    seo_noindex: result.noindex,
    noindex: result.noindex,
    public_tier_reasons: result.reasons,
  };
}
