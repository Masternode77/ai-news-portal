import { buildNarrativeLensFields, buildNarrativeArticleBody, extractNarrativeDNA, GENERATION_VERSION } from './narrative-dna.mjs';
import { analyzeSourceTextCompleteness } from './source-text-completeness.mjs';
import { guardPublicCopy } from './copy-quality-guard.mjs';
import { routePublicLane } from './public-lane-router.mjs';

export function canGenerateFullArticle(article = {}) {
  const route = routePublicLane(article);
  const sourceCompleteness = analyzeSourceTextCompleteness(article);
  const dna = extractNarrativeDNA(article);
  const reasons = [];
  if (route.visibility !== 'core') reasons.push(route.routing_decision);
  if (!sourceCompleteness.ok) reasons.push(...sourceCompleteness.reasons);
  if (!dna.valid_for_full_article) reasons.push(...(dna.missing_fields || []), ...(dna.truncation?.artifacts || []));
  if (/next .* disclosure/i.test(dna.watch_metric || '')) reasons.push('generic_watch_metric');
  return {
    ok: reasons.length === 0,
    route,
    sourceCompleteness,
    narrative_dna: dna,
    reasons: [...new Set(reasons.filter(Boolean))],
  };
}

export function buildEditorialStoryV2(article = {}, options = {}) {
  const gate = canGenerateFullArticle(article);
  const lens = buildNarrativeLensFields(article, options);
  const body = buildNarrativeArticleBody(article, {
    narrativeDNA: lens.narrative_dna,
    recentHooks: options.recentHooks || [],
  });
  const bodyGuard = guardPublicCopy(body);
  const blockedReasons = [
    ...gate.reasons,
    ...(bodyGuard.ok ? [] : bodyGuard.reasons),
  ];

  return {
    ok: gate.ok && bodyGuard.ok,
    generation_version: GENERATION_VERSION,
    blocked_reasons: [...new Set(blockedReasons)],
    narrative_dna: lens.narrative_dna,
    dynamicBriefLabel: lens.dynamicBriefLabel,
    executiveSummary: lens.executiveSummary,
    thesis: lens.thesis,
    whatHappened: lens.whatHappened,
    whyThisMatters: lens.whyThisMatters,
    marketMissing: lens.marketMissing,
    investors: lens.investors,
    operators: lens.operators,
    hyperscalers: lens.hyperscalers,
    watchNext: lens.watchNext,
    finalHeadline: lens.finalHeadline,
    metaDescription: lens.metaDescription,
    finalArticleBody: body,
    sourceLink: article.sourceUrl || article.url || '',
  };
}
