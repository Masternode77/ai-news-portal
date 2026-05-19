import { analyzeSourceTextCompleteness } from './source-text-completeness.mjs';
import { guardPublicCopy } from './copy-quality-guard.mjs';
import { routePublicLane } from './public-lane-router.mjs';
import { extractNarrativeDNA } from './narrative-dna.mjs';

export function buildAdminQualityModel(article = {}) {
  const route = article.public_routing || routePublicLane(article);
  const sourceCompleteness = analyzeSourceTextCompleteness(article);
  const publicCopy = guardPublicCopy([
    article.public_presentation?.deck,
    article.public_presentation?.why_it_matters,
    article.expertLensShort,
    article.expertLensFull?.finalArticleBody,
  ].filter(Boolean).join('\n\n'));
  const narrativeDna = article.narrative_dna || article.expertLensFull?.narrative_dna || extractNarrativeDNA(article);

  return {
    id: article.id,
    title: article.title,
    source: article.source,
    relevance_score: article.infrastructure_relevance_score ?? article.infrastructure_relevance?.infrastructure_relevance_score ?? null,
    urgency_score: article.urgency_score ?? null,
    extraction_quality_score: article.extraction_quality_score ?? article.extraction_qa?.extraction_quality_score ?? null,
    article_blueprint: article.article_blueprint || article.articleBlueprint?.id || article.expertLensFull?.blueprintId || null,
    routing_decision: route.routing_decision,
    blocked_reasons: [
      ...(route.blocked_reasons || []),
      ...(sourceCompleteness.reasons || []),
      ...(publicCopy.reasons || []),
      article.qualityGateReason,
      article.expertInsightBlockReason,
      article.repetition_block_reasons?.join('; '),
    ].filter(Boolean),
    source_adapter: article.source_domain_adapter || article.extraction_qa?.source_domain_adapter || null,
    truncation_detector_result: publicCopy.truncation,
    forbidden_phrase_guard_result: {
      ok: publicCopy.forbidden.length === 0,
      matches: publicCopy.forbidden,
    },
    generation_version: article.generation_version || article.expertLensFull?.generation_version || null,
    source_evidence_length: sourceCompleteness.source_evidence_length,
    narrative_dna: narrativeDna,
  };
}
