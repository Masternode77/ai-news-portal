import { classifyInfrastructureRelevance } from './relevance-classifier.mjs';
import { normalizeProperNouns } from './proper-noun-normalizer.mjs';
import { routeStoryArchetype } from './story-archetype-router.mjs';
import { detectBoilerplate } from './boilerplate-detector.mjs';
import { sourceScopePolicyResult } from './source-scope-policy.mjs';

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
  /\bdata centers?\b/i,
  /\bdatacenters?\b/i,
  /\bcolocation\b/i,
  /\bcolo\b/i,
  /\bfacilit(?:y|ies)\b/i,
  /\bpower\b/i,
  /\bgrid\b/i,
  /\butility\b/i,
  /\binterconnection\b/i,
  /\bsubstation\b/i,
  /\bppa\b/i,
  /\bspot power\b/i,
  /\bpower trading\b/i,
  /\bcooling\b/i,
  /\bliquid cooling\b/i,
  /\bthermal\b/i,
  /\bcdu\b/i,
  /\bcloud capacity\b/i,
  /\bavailability zone\b/i,
  /\bcloud region\b/i,
  /\bsemiconductor supply\b/i,
  /\bsemiconductor\b/i,
  /\bchip(?:s)?\b/i,
  /\baccelerator(?:s| systems)?\b/i,
  /\bgpu\b/i,
  /\bhbm\b/i,
  /\bmemory\b/i,
  /\bnetwork(?:ing)?\b/i,
  /\bethernet\b/i,
  /\binfiniband\b/i,
  /\bfiber\b/i,
  /\bstorage\b/i,
  /\bbackup\b/i,
  /\bdisaster recovery\b/i,
  /\benterprise platform infrastructure\b/i,
  /\benterprise platform\b/i,
  /\bopenshift\b/i,
  /\bkubernetes\b/i,
  /\bcapital formation\b/i,
  /\bproject finance\b/i,
  /\bfinancing\b/i,
  /\bpermitting\b/i,
  /\bsiting\b/i,
  /\bmoratorium\b/i,
  /\bregulatory infrastructure\b/i,
  /\bconstruction\b/i,
  /\bequipment\b/i,
  /\bsupply chain\b/i,
];

const ALWAYS_ARCHIVE_PATTERNS = [
  /\bdinosaur\b/i,
  /\bfossils?\b/i,
  /\bstegosaurus\b/i,
  /\bskeleton\b/i,
  /\bcollectibles?\b/i,
  /\bconsumer gpu\b/i,
  /\bamazon deal\b/i,
  /\ball[- ]time low\b/i,
  /\bgpu deal\b/i,
  /\bgraphics card\b.{0,90}\bdeal\b/i,
  /\bdeal\b.{0,90}\bgraphics card\b/i,
  /\b(?:rx|rtx|radeon|geforce)\s?\d{3,4}\b.{0,120}\b(?:deal|discount|off|save|amazon)\b/i,
  /\b(?:deal|discount|off|save|amazon)\b.{0,120}\b(?:rx|rtx|radeon|geforce)\s?\d{3,4}\b/i,
  /\bconsumer laptop\b/i,
  /\blaptop review\b/i,
  /\bdell xps\b/i,
  /\bmacbook\b/i,
  /\bgaming laptop\b/i,
  /\bcommencement\b/i,
  /\bcommencement speech\b/i,
  /\bgraduates?\b/i,
  /\brecruitment spam\b/i,
  /\bprompt injection\b.{0,80}\blinkedin\b/i,
  /\blinkedin\b.{0,80}\brecruit(?:ing|ment)\b/i,
  /\bgeneric labor market\b/i,
  /\blabor market\b/i,
  /\bai biography\b/i,
  /\bfounder profile\b/i,
  /\bbiograph(?:y|ical)\b/i,
  /\bconsumer tech\b/i,
  /\bproductivity app\b/i,
  /\bgeneric ai app\b/i,
  /\bsmartphone\b/i,
  /\bwearable\b/i,
  /\bcelebrity\b/i,
  /\bgaming\b/i,
];

const CONDITIONAL_ARCHIVE_PATTERNS = [
  /\blife science\b/i,
  /\bbiotech\b/i,
  /\btechbio\b/i,
  /\bdrug discovery\b/i,
  /\bsiri\b/i,
  /\bios\b/i,
  /\bvisual ai\b/i,
  /\bai glasses\b/i,
  /\bsmart glasses\b/i,
  /\bessilorluxottica\b/i,
  /\bbeauty industry\b/i,
  /\bconsumer\b/i,
  /\bchild abuse\b/i,
  /\bcase files\b/i,
  /\bcrypto hack\b/i,
  /\bdefi\b/i,
  /\bcrypto startup\b/i,
  /\betf flows?\b/i,
  /\bsuper pac\b/i,
  /\bcommodities flow\b/i,
  /\brobinhood\b/i,
  /\bmarket dip\b/i,
  /\bvc stake\b/i,
  /\bgeneric finance\b/i,
  /\bmarket recap\b/i,
  /\bai adoption investors?\b/i,
  /\bai-pilled\b/i,
  /\bmystery products\b/i,
  /\bmoney machine\b/i,
];

const ADJACENT_BOUNDARY_PATTERNS = [
  /\bsports ai\b/i,
  /\bfootball\b/i,
  /\bS[ūu]merSports\b/i,
  /\bPaul Tudor Jones\b/i,
  /\barxiv\b.{0,80}\bban\b/i,
  /\bai paper\b.{0,80}\bban\b/i,
  /\blegal industry\b/i,
  /\blegal professionals\b/i,
  /\blaw firms?\b/i,
  /\blawyer\b/i,
  /\bclaude\b.{0,40}\blegal\b/i,
  /\bgeneric legal\b/i,
  /\bcybersecurity\b/i,
  /\bsecurity breach\b/i,
];

function textBundle(article = {}) {
  return normalizeProperNouns([
    article.title,
    article.source,
    article.summary,
    article.snippet,
    article.articleText,
    article.contentText,
    article.fullArticleText,
    article.cleaned_source_text,
    article.primary_category,
    article.secondary_category,
    article.infrastructure_layer,
    article.article_type,
    article.region,
    ...(article.tags || []),
  ].filter(Boolean).map((value) => String(value).slice(0, 2200)).join(' '));
}

function relevanceScore(article = {}) {
  const score = Number(
    article.infrastructure_relevance_score
      ?? article.relevance_score
      ?? article.infrastructure_relevance?.infrastructure_relevance_score
  );
  if (Number.isFinite(score)) return score;
  return classifyInfrastructureRelevance(article).infrastructure_relevance_score;
}

function explicitInfrastructureText(text = '') {
  return INFRA_LAYER_PATTERNS.some((pattern) => pattern.test(text));
}

export function namesConcreteInfrastructureLayer(article = {}) {
  return explicitInfrastructureText(textBundle(article));
}

function isHardArchive(text = '') {
  return ALWAYS_ARCHIVE_PATTERNS.some((pattern) => pattern.test(text));
}

function isAdjacentBoundary(text = '') {
  const adjacent = ADJACENT_BOUNDARY_PATTERNS.some((pattern) => pattern.test(text));
  if (!adjacent) return false;
  return !explicitInfrastructureText(text);
}

function laneForCore(article = {}, archetype) {
  const text = textBundle(article).toLowerCase();
  if (archetype.id === 'market-map' || /(roundup|market map|land and expand|nvidia, iren|coatue|switch|core scientific)/i.test(text)) {
    return { laneKey: 'market-maps', laneTitle: 'Market Maps' };
  }
  if (/(policy|permit|permitting|moratorium|regulation|risk|grid|utility|approval|siting|ratepayer|tariff|county|zoning)/i.test(text) || archetype.publicLabel === 'Policy Risk') {
    return { laneKey: 'policy-risk-watch', laneTitle: 'Policy/Risk Watch' };
  }
  if (/(power|grid|utility|ppa|spot power|power trading|virtual power plant|electricity market)/i.test(text)) {
    return { laneKey: 'operator-alerts', laneTitle: 'Operator Alerts' };
  }
  if (/(investor|capital|funding|financing|debt|equity|valuation|ipo|acquisition|m&a|joint venture|stake sale|kkr|kokusai)/i.test(text)) {
    return { laneKey: 'investor-signals', laneTitle: 'Investor Signals' };
  }
  if (/(memory|hbm|gpu|accelerator|semiconductor|chip|network|storage|backup|disaster recovery|architecture|platform|cloud|openshift|kubernetes|kokusai|equipment)/i.test(text)) {
    return { laneKey: 'stack-shifts', laneTitle: 'Stack Shifts' };
  }
  if (/(bottleneck|cooling|thermal|interconnection|facility|capacity|data center|datacenter|construction)/i.test(text)) {
    return { laneKey: 'technical-bottlenecks', laneTitle: 'Technical Bottlenecks' };
  }
  return { laneKey: 'operator-alerts', laneTitle: 'Operator Alerts' };
}

function publicLabelFor(article = {}, archetype = {}) {
  const text = textBundle(article).toLowerCase();
  if (/(power|grid|spot power|utility|ppa|electricity market)/i.test(text)) return 'Core Signal';
  if (/(moratorium|permit|siting|policy|regulation|zoning)/i.test(text)) return 'Policy Risk';
  if (/(memory|hbm|storage|openshift|platform|architecture|semiconductor|gpu|accelerator)/i.test(text)) return 'Stack Shift';
  if (/(capital|funding|financing|stake sale|kkr|investor)/i.test(text)) return 'Investor Signal';
  return archetype.publicLabel || 'Core Signal';
}

function lensFor(article = {}, archetype = {}) {
  const text = textBundle(article).toLowerCase();
  if (/(spot power|power trading|electricity market|ppa)/i.test(text)) return 'Power Market Signal';
  if (/(moratorium|permit|siting|zoning|county)/i.test(text)) return 'Policy and Siting Risk';
  if (/(netapp|openshift|backup|disaster recovery)/i.test(text)) return 'Platform Resilience';
  if (/(memory|hbm|virtualization|vm density)/i.test(text)) return 'Memory Economics';
  if (/(kkr|kokusai|stake sale|semiconductor equipment)/i.test(text)) return 'Semiconductor Capital Signal';
  return archetype.editorialLens || 'Infrastructure Signal';
}

export function routeStrictInfrastructureRelevance(article = {}) {
  const score = relevanceScore(article);
  const text = textBundle(article);
  const archetype = routeStoryArchetype(article);
  const blockedReasons = [];
  const boilerplate = detectBoilerplate([
    article.articleText,
    article.contentText,
    article.fullArticleText,
    article.cleaned_source_text,
    article.summary,
    article.snippet,
  ].filter(Boolean).map((value) => String(value).slice(0, 2200)).join('\n\n'));

  if (boilerplate.copyright_footer_detected && boilerplate.cleaned_text.length < 500) {
    return {
      score,
      visibility: 'archive',
      laneKey: 'archive-only',
      laneTitle: 'Archive Only',
      public_signal_label: 'Adjacent Signal',
      editorial_lens: 'Quarantined',
      story_archetype: archetype.name,
      routing_decision: 'quarantine',
      blocked_reasons: ['source_boilerplate_only'],
    };
  }

  const adjacentOnly = isAdjacentBoundary(text) || archetype.id === 'adjacent-signal';
  const hasLayer = namesConcreteInfrastructureLayer(article);
  const conditionalArchive = CONDITIONAL_ARCHIVE_PATTERNS.some((pattern) => pattern.test(text)) && !hasLayer;
  const sourceScope = sourceScopePolicyResult(article);

  if (isHardArchive(text) || conditionalArchive || archetype.id === 'archive-only') {
    return {
      score,
      visibility: 'archive',
      laneKey: 'archive-only',
      laneTitle: 'Archive Only',
      public_signal_label: 'Adjacent Signal',
      editorial_lens: 'Archive Only',
      story_archetype: archetype.name,
      routing_decision: 'archive_only',
      blocked_reasons: conditionalArchive ? ['generic_non_infrastructure_topic'] : ['outside_compute_current_product_boundary'],
    };
  }

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

  if (sourceScope.force_non_core_signal) {
    return {
      score,
      visibility: 'core',
      laneKey: sourceScope.public_route === 'Enterprise Platform Note' ? 'enterprise-platform-notes' : 'cloud-product-reads',
      laneTitle: sourceScope.public_route,
      public_signal_label: sourceScope.public_signal_label,
      editorial_lens: sourceScope.public_route,
      story_archetype: sourceScope.public_route,
      routing_decision: sourceScope.public_route,
      blocked_reasons: sourceScope.reasons,
      source_scope_policy: sourceScope,
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
        : lensFor(article, archetype),
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
    public_signal_label: publicLabelFor(article, archetype),
    editorial_lens: lensFor(article, archetype),
    story_archetype: archetype.name,
    routing_decision: 'core_lane',
    blocked_reasons: [],
  };
}

export const routePublicLane = routeStrictInfrastructureRelevance;

export function applyPublicRouting(article = {}) {
  const route = routeStrictInfrastructureRelevance(article);
  if (route.visibility === 'archive') {
    return {
      ...article,
      articlePagePublished: false,
      homepagePublished: false,
      archiveOnly: true,
      archiveOnlyReason: route.blocked_reasons.join('; ') || 'archive_only',
      public_routing: route,
      routing_decision: route.routing_decision,
      noindex: true,
      seo_noindex: true,
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
