#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeSourceExtractionFailClosed,
  sourceExtractionPassesLongformGate,
  sourceExtractionPassesPublicGate,
} from '../../scripts/lib/source-extraction-fail-closed.mjs';
import { routeStrictInfrastructureRelevance } from '../../scripts/lib/strict-infrastructure-relevance-router.mjs';
import {
  PUBLIC_CONTENT_TIERS,
  routePublicContentTier,
} from '../../scripts/lib/public-content-tier-router.mjs';
import { buildEvidencePack } from '../../scripts/lib/evidence-pack-builder.mjs';
import { generateLongformAnalysis, longformQualityResult } from '../../scripts/lib/longform-engine.mjs';
import { sourceFidelityCheck } from '../../scripts/lib/source-fidelity-check.mjs';
import {
  checkClaimsAgainstEvidence,
  seoMetadataClaimsSupported,
} from '../../scripts/lib/source-fidelity-claim-check.mjs';
import { forbiddenPublicPhraseMatches } from '../../scripts/lib/copy-quality-guard.mjs';
import { sectionCount, visibleBodyLength } from '../../scripts/lib/visible-body-length.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function clean(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
function wordCount(value = '') {
  return clean(value).split(/\s+/).filter(Boolean).length;
}
function sentenceList(values = []) {
  return values
    .flatMap((value) => clean(value).split(/(?<=[.!?])\s+/))
    .map(clean)
    .filter((sentence) => sentence.length >= 20);
}
function normalizeTier(tier) {
  return tier === PUBLIC_CONTENT_TIERS.SIGNAL_CARD ? 'source_only' : tier;
}
function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))];
}
function buildEditorialBrief(article = {}, evidencePack = {}) {
  const title = clean(article.title || evidencePack.title || 'This infrastructure signal');
  const facts = sentenceList(evidencePack.facts || []).slice(0, 5);
  const implications = sentenceList([
    evidencePack.whyThisMattersNow,
    evidencePack.operatingImplication,
    evidencePack.commercialImplication,
    evidencePack.counterargument,
    evidencePack.whatWouldChangeOurView,
  ]);
  const sourceLimit = clean(evidencePack.sourceLimitations);
  const lines = unique([
    `${title} is a brief because the source evidence is clean but not deep enough for a local longform article.`,
    ...facts,
    ...implications,
    sourceLimit,
  ]);
  const words = [];
  for (const line of lines) {
    for (const word of line.split(/\s+/).filter(Boolean)) {
      if (words.length >= 285) break;
      words.push(word);
    }
    if (words.length >= 150) break;
  }
  return words.join(' ');
}
export async function runContentCycleForArticle(article = {}) {
  const extraction = analyzeSourceExtractionFailClosed(article);
  const publicExtraction = sourceExtractionPassesPublicGate(article);
  const longformExtraction = sourceExtractionPassesLongformGate(article);
  const extractedArticle = {
    ...article,
    cleaned_source_text: extraction.cleaned_source_text,
    extraction_quality_score: article.extraction_quality_score ?? (
      publicExtraction.ok ? 0.85 : 0
    ),
  };
  const relevance = routeStrictInfrastructureRelevance(extractedArticle);
  const routedArticle = {
    ...extractedArticle,
    public_routing: relevance,
  };
  const evidencePack = buildEvidencePack(routedArticle);
  const tierRoute = routePublicContentTier(routedArticle, { evidencePack });
  const requestedTier = normalizeTier(tierRoute.tier);
  const publicStatus = requestedTier === PUBLIC_CONTENT_TIERS.HIDDEN ? 'hidden' : 'draft';
  if (process.env.FORCE_GENERATION_FAILURE === '1') {
    const failureReasons = unique([...extraction.reasons, ...(publicExtraction.block_reasons || []), ...(longformExtraction.block_reasons || []), ...(relevance.blocked_reasons || []), ...(tierRoute.reasons || []), ...(evidencePack.blockReasons || []), 'forced_generation_failure']);
    return {
      id: clean(article.id),
      title: clean(article.title),
      generationFailed: true,
      extraction_passed: false,
      public_extraction_passed: publicExtraction.ok,
      extraction_can_generate_longform: false,
      extraction_can_publish_local_article: publicExtraction.ok,
      relevance: { score: relevance.score, visibility: relevance.visibility, laneKey: relevance.laneKey, routing_decision: relevance.routing_decision, blocked_reasons: relevance.blocked_reasons || [] },
      tier: PUBLIC_CONTENT_TIERS.HIDDEN,
      rawTier: PUBLIC_CONTENT_TIERS.HIDDEN,
      public_status: 'draft',
      coreFeedEligible: false,
      detailPage: false,
      longformGenerated: false,
      facts: evidencePack.facts.length,
      evidenceFactCount: evidencePack.facts.length,
      bodyVisibleCharacters: 0,
      sections: 0,
      bannedPhraseMatches: [],
      longformQuality: null,
      finalArticleBody: '',
      brief: '',
      briefWordCount: 0,
      wordCount: 0,
      sourceEvidenceCharacters: extraction.cleaned_source_length,
      reasons: failureReasons,
    };
  }
  const longformArticle = requestedTier === PUBLIC_CONTENT_TIERS.LONGFORM_ANALYSIS && longformExtraction.ok
    ? generateLongformAnalysis(routedArticle, { evidencePack })
    : null;
  const longformBody = longformArticle?.expertLensFull?.finalArticleBody || '';
  const sourceFidelity = longformArticle
    ? sourceFidelityCheck(longformArticle, evidencePack, longformBody)
    : null;
  const claimFidelity = longformArticle
    ? checkClaimsAgainstEvidence(longformBody, evidencePack)
    : null;
  const seoFidelity = longformArticle
    ? seoMetadataClaimsSupported(longformArticle, evidencePack)
    : null;
  const editorialGatesPass = sourceFidelity?.ok === true
    && claimFidelity?.ok === true
    && (claimFidelity.unsupportedClaims?.length || 0) === 0
    && seoFidelity?.ok === true;
  const tier = requestedTier === PUBLIC_CONTENT_TIERS.LONGFORM_ANALYSIS && !editorialGatesPass
    ? PUBLIC_CONTENT_TIERS.EDITORIAL_BRIEF
    : requestedTier;
  const brief = tier === PUBLIC_CONTENT_TIERS.EDITORIAL_BRIEF
    ? buildEditorialBrief(routedArticle, evidencePack)
    : '';
  const longformQuality = longformBody
    ? longformQualityResult({ expertLensFull: { finalArticleBody: longformBody } })
    : null;
  const reasons = unique([
    ...extraction.reasons,
    ...(publicExtraction.block_reasons || []),
    ...(longformExtraction.block_reasons || []),
    ...(relevance.blocked_reasons || []),
    ...(tierRoute.reasons || []),
    ...(evidencePack.blockReasons || []),
    ...(requestedTier === PUBLIC_CONTENT_TIERS.LONGFORM_ANALYSIS && !editorialGatesPass
      ? ['longform_editorial_fidelity_failed']
      : []),
  ]);
  return {
    id: clean(article.id),
    title: clean(article.title),
    extraction_passed: longformExtraction.ok,
    public_extraction_passed: publicExtraction.ok,
    extraction_can_generate_longform: extraction.can_generate_longform,
    extraction_can_publish_local_article: extraction.can_publish_local_article,
    relevance: {
      score: relevance.score,
      visibility: relevance.visibility,
      laneKey: relevance.laneKey,
      routing_decision: relevance.routing_decision,
      blocked_reasons: relevance.blocked_reasons || [],
    },
    tier,
    rawTier: tierRoute.tier,
    public_status: publicStatus,
    coreFeedEligible: relevance.visibility === 'core'
      && [PUBLIC_CONTENT_TIERS.LONGFORM_ANALYSIS, PUBLIC_CONTENT_TIERS.EDITORIAL_BRIEF].includes(tier)
      && publicStatus !== 'hidden',
    detailPage: tier === PUBLIC_CONTENT_TIERS.LONGFORM_ANALYSIS && editorialGatesPass,
    longformGenerated: Boolean(longformArticle),
    bodyVisibleCharacters: visibleBodyLength(tier === PUBLIC_CONTENT_TIERS.LONGFORM_ANALYSIS ? longformBody : brief),
    facts: evidencePack.facts.length,
    sections: sectionCount(longformBody),
    bannedPhraseMatches: forbiddenPublicPhraseMatches([longformBody, brief].filter(Boolean).join('\n\n')),
    longformQuality,
    finalArticleBody: tier === PUBLIC_CONTENT_TIERS.LONGFORM_ANALYSIS ? longformBody : brief,
    brief,
    briefWordCount: wordCount(brief),
    wordCount: wordCount(brief || longformBody),
    evidenceFactCount: evidencePack.facts.length,
    sourceEvidenceCharacters: extraction.cleaned_source_length,
    source_fidelity: sourceFidelity,
    claim_fidelity: claimFidelity,
    seo_fidelity: seoFidelity,
    reasons,
  };
}
export async function runFullContentCycleForArticles(articles = [], options = {}) {
  const { runPublishCycle } = await import('../../scripts/lib/publish-cycle.mjs');
  return runPublishCycle({
    articles,
    routeArticle: runContentCycleForArticle,
    now: options.now || new Date().toISOString(),
    existing: options.existing || {},
  });
}
export async function runContentCycleForFixture(fixturePath) {
  const inputPath = fixturePath instanceof URL ? fileURLToPath(fixturePath) : fixturePath;
  const absolutePath = path.isAbsolute(inputPath)
    ? fixturePath
    : path.join(ROOT, inputPath);
  const payload = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  const articles = Array.isArray(payload) ? payload : payload.articles;
  if (Array.isArray(articles)) return runFullContentCycleForArticles(articles, { now: payload.now });
  return runContentCycleForArticle(payload);
}
