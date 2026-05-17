import { classifyInfrastructureRelevance } from './relevance-classifier.mjs';
import { normalizeProperNouns } from './proper-noun-normalizer.mjs';
import { routeStoryArchetype } from './story-archetype-router.mjs';

export const CORE_RELEVANCE_THRESHOLD = 0.75;
export const ADJACENT_RELEVANCE_THRESHOLD = 0.55;

export const CORE_LANE_KEYS = new Set([
  'todays-constraint',
  'operator-alerts',
  'investor-signals',
  'stack-shifts',
  'policy-risk-watch',
  'technical-bottlenecks',
  'market-maps',
]);

const INFRA_LAYER_PATTERNS = [
  /\bpower\b/i,
  /\bgrid\b/i,
  /\bcooling\b/i,
  /\bdata centers?\b/i,
  /\bdatacenters?\b/i,
  /\bfacilit(?:y|ies)\b/i,
  /\bcloud capacity\b/i,
  /\bsemiconductor\b/i,
  /\baccelerator(?:s| systems)?\b/i,
  /\bmemory\b/i,
  /\bnetwork(?:ing)?\b/i,
  /\bstorage\b/i,
  /\benterprise platform\b/i,
  /\bcapital\b/i,
  /\bpermitting\b/i,
  /\bsiting\b/i,
  /\bregulatory infrastructure\b/i,
  /\bOpenShift\b/i,
  /\bKubernetes\b/i,
  /\bbackup\b/i,
  /\bDR\b/,
  /\bHBM\b/i,
  /\bGPU\b/i,
];

const HARD_ARCHIVE_PATTERNS = [
  /\bdinosaur\b/i,
  /\bfossils?\b/i,
  /\bstegosaurus\b/i,
  /\bskeleton\b/i,
];

const ADJACENT_ONLY_PATTERNS = [
  /\bsports ai\b/i,
  /\bfootball\b/i,
  /\bS[ūu]merSports\b/i,
  /\bPaul Tudor Jones\b/i,
  /\blegal industry\b/i,
  /\blegal professionals\b/i,
  /\blaw firms?\b/i,
  /\bgeneric legal\b/i,
  /\blabor market\b/i,
  /\bconsumer hardware\b/i,
];

function textBundle(article = {}) {
  return normalizeProperNouns([
    article.title,
    article.source,
    article.summary,
    article.snippet,
    article.articleText,
    article.contentText,
    article.primary_category,
    article.secondary_category,
    article.infrastructure_layer,
    article.article_type,
    article.region,
    ...(article.tags || []),
  ].filter(Boolean).join(' '));
}

function relevanceScore(article = {}) {
  const score = Number(article.infrastructure_relevance_score ?? article.infrastructure_relevance?.infrastructure_relevance_score);
  if (Number.isFinite(score)) return score;
  return classifyInfrastructureRelevance(article).infrastructure_relevance_score;
}

export function namesConcreteInfrastructureLayer(article = {}) {
  const text = textBundle(article);
  return INFRA_LAYER_PATTERNS.some((pattern) => pattern.test(text));
}

function laneForCore(article = {}, archetype) {
  const text = textBundle(article).toLowerCase();
  if (archetype.id === 'market-map') return { laneKey: 'market-maps', laneTitle: 'Market Maps' };
  if (/(investor|capital|funding|financing|debt|equity|valuation|ipo|acquisition|m&a|joint venture)/i.test(text)) {
    return { laneKey: 'investor-signals', laneTitle: 'Investor Signals' };
  }
  if (/(policy|permit|regulation|risk|grid|utility|approval|siting|ratepayer|tariff)/i.test(text) || archetype.publicLabel === 'Policy Risk') {
    return { laneKey: 'policy-risk-watch', laneTitle: 'Policy/Risk Watch' };
  }
  if (/(memory|hbm|gpu|semiconductor|chip|network|storage|backup|disaster recovery|architecture|platform|cloud|openshift|kubernetes)/i.test(text)) {
    return { laneKey: 'stack-shifts', laneTitle: 'Stack Shifts' };
  }
  if (/(bottleneck|cooling|thermal|interconnection|power|facility|capacity|data center|datacenter)/i.test(text)) {
    return { laneKey: 'technical-bottlenecks', laneTitle: 'Technical Bottlenecks' };
  }
  return { laneKey: 'operator-alerts', laneTitle: 'Operator Alerts' };
}

export function routePublicLane(article = {}) {
  const score = relevanceScore(article);
  const text = textBundle(article);
  const archetype = routeStoryArchetype(article);
  const blockedReasons = [];

  if (HARD_ARCHIVE_PATTERNS.some((pattern) => pattern.test(text)) || archetype.id === 'archive-only') {
    return {
      score,
      visibility: 'archive',
      laneKey: 'archive-only',
      laneTitle: 'Archive Only',
      public_signal_label: 'Adjacent Signal',
      editorial_lens: 'Archive Only',
      story_archetype: archetype.name,
      routing_decision: 'archive_only',
      blocked_reasons: ['outside_compute_current_product_boundary'],
    };
  }

  const adjacentOnly = ADJACENT_ONLY_PATTERNS.some((pattern) => pattern.test(text)) || archetype.id === 'adjacent-signal';
  const hasLayer = namesConcreteInfrastructureLayer(article);

  if (score < ADJACENT_RELEVANCE_THRESHOLD) {
    return {
      score,
      visibility: 'archive',
      laneKey: 'archive-only',
      laneTitle: 'Archive Only',
      public_signal_label: 'Adjacent Signal',
      editorial_lens: 'Archive Only',
      story_archetype: archetype.name,
      routing_decision: 'archive_only',
      blocked_reasons: ['relevance_below_adjacent_threshold'],
    };
  }

  if (score < CORE_RELEVANCE_THRESHOLD || adjacentOnly || !hasLayer) {
    if (score < CORE_RELEVANCE_THRESHOLD) blockedReasons.push('relevance_below_core_threshold');
    if (adjacentOnly) blockedReasons.push('adjacent_topic_boundary');
    if (!hasLayer) blockedReasons.push('missing_concrete_infrastructure_layer');
    return {
      score,
      visibility: 'adjacent',
      laneKey: 'adjacent-watchlist',
      laneTitle: 'Adjacent Watchlist',
      public_signal_label: 'Adjacent Signal',
      editorial_lens: adjacentOnly || archetype.editorialLens === 'Archive Only'
        ? 'Adjacent Watchlist'
        : archetype.editorialLens,
      story_archetype: archetype.name,
      routing_decision: 'adjacent_watchlist',
      blocked_reasons: blockedReasons,
    };
  }

  const lane = laneForCore(article, archetype);
  return {
    score,
    visibility: 'core',
    ...lane,
    public_signal_label: archetype.publicLabel,
    editorial_lens: archetype.editorialLens,
    story_archetype: archetype.name,
    routing_decision: 'core_lane',
    blocked_reasons: [],
  };
}

export function applyPublicRouting(article = {}) {
  const route = routePublicLane(article);
  if (route.visibility === 'archive') {
    return {
      ...article,
      articlePagePublished: false,
      homepagePublished: false,
      archiveOnly: true,
      archiveOnlyReason: route.blocked_reasons.join('; ') || 'archive_only',
      public_routing: route,
      routing_decision: route.routing_decision,
    };
  }
  if (route.visibility === 'adjacent') {
    return {
      ...article,
      articlePagePublished: false,
      homepagePublished: true,
      archiveOnly: false,
      signalCardOnly: true,
      signalCardReason: route.blocked_reasons.join('; ') || 'adjacent_watchlist',
      public_routing: route,
      routing_decision: route.routing_decision,
    };
  }
  return {
    ...article,
    homepagePublished: true,
    archiveOnly: false,
    signalCardOnly: false,
    public_routing: route,
    routing_decision: route.routing_decision,
  };
}
