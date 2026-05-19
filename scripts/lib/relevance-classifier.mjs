export const FULL_MEMO_RELEVANCE_THRESHOLD = 0.75;
export const SIGNAL_CARD_RELEVANCE_THRESHOLD = 0.55;

const DIMENSION_KEYS = [
  'direct_ai_infrastructure_relevance',
  'data_center_relevance',
  'cloud_capacity_relevance',
  'semiconductor_relevance',
  'power_grid_relevance',
  'cooling_relevance',
  'capital_markets_relevance',
  'enterprise_ai_infrastructure_relevance',
];

const AI_TERMS = [
  'ai',
  'artificial intelligence',
  'accelerator',
  'accelerators',
  'gpu',
  'gpus',
  'inference',
  'training',
  'llm',
  'llms',
  'machine learning',
  'foundation model',
];

const INFRA_TERMS = [
  'infrastructure',
  'capacity',
  'cluster',
  'clusters',
  'data center',
  'datacenter',
  'cloud',
  'rack',
  'networking',
  'power',
  'grid',
  'cooling',
  'facility',
  'facilities',
  'deployment',
  'provisioning',
  'procurement',
  'supply chain',
  'workload',
  'workloads',
  'kubernetes',
  'storage',
  'backup',
  'disaster recovery',
  'hybrid cloud',
  'on-prem',
  'semiconductor',
  'hbm',
  'chip',
  'chips',
];

const CONSUMER_AI_TERMS = [
  'chatbot',
  'consumer app',
  'social app',
  'photo app',
  'video app',
  'agent for wordpress',
  'writing assistant',
  'search feature',
  'image generator',
  'robot dog',
  'table tennis robot',
];

const WEAK_AI_ADJACENT_TERMS = [
  'ai app',
  'agentic ai',
  'ai agent',
  'coding assistant',
  'vibe coding',
  'software engineer',
  'chatbot',
  'content generation',
  'image generator',
  'video generator',
  'productivity software',
  'browser assistant',
  'search feature',
  'consumer ai',
];

const HARD_ARCHIVE_TOPICS = [
  'dinosaur',
  'fossil',
  'stegosaurus',
  'skeleton',
];

const ADJACENT_ONLY_TOPICS = [
  'sports ai',
  'football',
  'sumersports',
  'sūmersports',
  'paul tudor jones',
  'legal industry',
  'legal professionals',
  'law firm',
  'law firms',
  'labor market',
  'consumer hardware',
];

const DIMENSIONS = {
  direct_ai_infrastructure_relevance: [
    ['ai infrastructure', 0.48],
    ['ai data center', 0.45],
    ['ai datacenter', 0.45],
    ['gpu cluster', 0.42],
    ['gpu clusters', 0.42],
    ['accelerator cluster', 0.4],
    ['accelerator capacity', 0.4],
    ['inference capacity', 0.36],
    ['training capacity', 0.36],
    ['compute capacity', 0.32],
    ['neocloud', 0.34],
    ['high-performance computing', 0.24],
    ['hpc', 0.2],
    ['rack density', 0.22],
    ['deployment readiness', 0.2],
    ['usable capacity', 0.2],
  ],
  data_center_relevance: [
    ['data center', 0.42],
    ['data centers', 0.42],
    ['datacenter', 0.42],
    ['colocation', 0.34],
    ['colo', 0.26],
    ['wholesale lease', 0.28],
    ['hyperscale campus', 0.34],
    ['campus', 0.16],
    ['critical facilities', 0.3],
    ['rack density', 0.28],
    ['mep', 0.2],
    ['server farm', 0.22],
    ['facility operator', 0.18],
  ],
  cloud_capacity_relevance: [
    ['cloud capacity', 0.44],
    ['capacity expansion', 0.28],
    ['availability zone', 0.32],
    ['cloud region', 0.32],
    ['hyperscaler', 0.32],
    ['hyperscalers', 0.32],
    ['aws', 0.22],
    ['azure', 0.22],
    ['google cloud', 0.24],
    ['oracle cloud', 0.24],
    ['gpu instance', 0.3],
    ['gpu instances', 0.3],
    ['provisioning', 0.2],
    ['reserved capacity', 0.24],
    ['sovereign cloud', 0.24],
  ],
  semiconductor_relevance: [
    ['semiconductor', 0.36],
    ['semiconductors', 0.36],
    ['nvidia', 0.28],
    ['amd', 0.22],
    ['intel', 0.2],
    ['arm holdings', 0.24],
    ['tsmc', 0.28],
    ['hbm', 0.36],
    ['high-bandwidth memory', 0.36],
    ['advanced packaging', 0.32],
    ['wafer', 0.24],
    ['fab', 0.22],
    ['accelerator', 0.22],
    ['gpu', 0.22],
    ['asic', 0.2],
    ['chip supply', 0.26],
  ],
  power_grid_relevance: [
    ['power', 0.22],
    ['grid', 0.28],
    ['interconnection', 0.36],
    ['substation', 0.34],
    ['utility', 0.26],
    ['utilities', 0.26],
    ['megawatt', 0.3],
    ['megawatts', 0.3],
    ['mw', 0.2],
    ['gigawatt', 0.34],
    ['gigawatts', 0.34],
    ['gw', 0.22],
    ['ppa', 0.28],
    ['load growth', 0.24],
    ['electricity', 0.24],
    ['transmission', 0.28],
    ['transformer', 0.26],
    ['nuclear', 0.26],
    ['renewable', 0.18],
    ['energy procurement', 0.3],
  ],
  cooling_relevance: [
    ['cooling', 0.34],
    ['liquid cooling', 0.48],
    ['direct-to-chip', 0.4],
    ['direct to chip', 0.4],
    ['immersion', 0.32],
    ['cdu', 0.3],
    ['cdus', 0.3],
    ['thermal', 0.3],
    ['heat rejection', 0.34],
    ['chiller', 0.24],
    ['water usage', 0.24],
    ['rear-door', 0.28],
    ['rear door', 0.28],
    ['rack density', 0.24],
  ],
  capital_markets_relevance: [
    ['funding', 0.28],
    ['financing', 0.32],
    ['debt', 0.28],
    ['equity', 0.26],
    ['bond', 0.24],
    ['bonds', 0.24],
    ['capex', 0.28],
    ['capital expenditure', 0.28],
    ['acquisition', 0.3],
    ['merger', 0.28],
    ['m&a', 0.28],
    ['joint venture', 0.3],
    ['valuation', 0.26],
    ['ipo', 0.24],
    ['lease', 0.18],
    ['project finance', 0.34],
  ],
  enterprise_ai_infrastructure_relevance: [
    ['enterprise ai', 0.32],
    ['private ai', 0.28],
    ['on-prem', 0.26],
    ['on premises', 0.26],
    ['hybrid cloud', 0.28],
    ['openshift', 0.22],
    ['kubernetes', 0.22],
    ['virtualization', 0.2],
    ['data management', 0.18],
    ['backup', 0.16],
    ['disaster recovery', 0.2],
    ['storage', 0.18],
    ['networking', 0.18],
    ['inference workload', 0.3],
    ['inference workloads', 0.3],
    ['ai workload', 0.24],
    ['ai workloads', 0.24],
  ],
};

function normalizeText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9.+#/$%-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesTerm(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
}

function scoreTerms(text, titleText, weightedTerms) {
  let score = 0;
  const matched = [];

  for (const [term, weight] of weightedTerms) {
    if (!includesTerm(text, term)) continue;
    const titleBoost = includesTerm(titleText, term) ? 0.35 : 0;
    const contribution = Math.min(0.55, weight * (1 + titleBoost));
    score += contribution;
    matched.push(term);
  }

  return {
    score: Math.min(1, Number(score.toFixed(3))),
    matched,
  };
}

function hasAny(text, terms) {
  return terms.some((term) => includesTerm(text, term));
}

function buildArticleText(article = {}) {
  return [
    article.title,
    article.snippet,
    article.summary,
    article.insight,
    article.contentText,
    article.articleText,
    article.category,
    article.defaultCategory,
    article.categoryHint,
    article.source,
    article.url,
  ].filter(Boolean).join(' ');
}

function classifyTier(score) {
  if (score >= FULL_MEMO_RELEVANCE_THRESHOLD) return 'full_memo';
  if (score >= SIGNAL_CARD_RELEVANCE_THRESHOLD) return 'signal_card';
  return 'archive_only';
}

function relevanceAction(tier) {
  if (tier === 'full_memo') return 'generate_full_memo';
  if (tier === 'signal_card') return 'publish_signal_card_only';
  return 'archive_only';
}

function routeFields(tier) {
  if (tier === 'archive_only') {
    return {
      infrastructureRelevanceAction: 'archive_only',
      articlePagePublished: false,
      homepagePublished: false,
      archiveOnly: true,
      archiveOnlyReason: 'infrastructure_relevance_below_signal_threshold',
    };
  }
  if (tier === 'signal_card') {
    return {
      infrastructureRelevanceAction: 'publish_signal_card_only',
      articlePagePublished: false,
      homepagePublished: true,
      archiveOnly: false,
      archiveOnlyReason: null,
    };
  }
  return {
    infrastructureRelevanceAction: 'generate_full_memo',
    articlePagePublished: true,
    homepagePublished: true,
    archiveOnly: false,
    archiveOnlyReason: null,
  };
}

export function classifyInfrastructureRelevance(article = {}) {
  const titleText = normalizeText(article.title || '');
  const text = normalizeText(buildArticleText(article));
  const dimensionResults = {};
  const matchedByDimension = {};

  for (const [key, terms] of Object.entries(DIMENSIONS)) {
    const { score, matched } = scoreTerms(text, titleText, terms);
    dimensionResults[key] = score;
    matchedByDimension[key] = matched;
  }

  const hasAi = hasAny(text, AI_TERMS);
  const hasInfra = hasAny(text, INFRA_TERMS);
  const hasConsumerAiOnly =
    hasAi &&
    !hasInfra &&
    hasAny(text, CONSUMER_AI_TERMS);
  const hasWeakAiAdjacent = hasAi && hasAny(text, WEAK_AI_ADJACENT_TERMS);
  const hasHardArchiveTopic = hasAny(text, HARD_ARCHIVE_TOPICS);
  const hasAdjacentOnlyTopic = hasAny(text, ADJACENT_ONLY_TOPICS);

  if (hasAi && hasInfra) {
    dimensionResults.direct_ai_infrastructure_relevance = Math.min(
      1,
      Number((dimensionResults.direct_ai_infrastructure_relevance + 0.22).toFixed(3))
    );
  }

  if (hasAi && dimensionResults.data_center_relevance >= 0.35) {
    dimensionResults.direct_ai_infrastructure_relevance = Math.max(
      dimensionResults.direct_ai_infrastructure_relevance,
      0.78
    );
  }

  if (hasAi && dimensionResults.power_grid_relevance >= 0.35 && dimensionResults.data_center_relevance >= 0.2) {
    dimensionResults.direct_ai_infrastructure_relevance = Math.max(
      dimensionResults.direct_ai_infrastructure_relevance,
      0.82
    );
  }

  if (hasAi && dimensionResults.cloud_capacity_relevance >= 0.4) {
    dimensionResults.direct_ai_infrastructure_relevance = Math.max(
      dimensionResults.direct_ai_infrastructure_relevance,
      0.64
    );
  }

  if (hasConsumerAiOnly) {
    dimensionResults.direct_ai_infrastructure_relevance = Math.min(
      dimensionResults.direct_ai_infrastructure_relevance,
      0.28
    );
  }

  const sortedScores = DIMENSION_KEYS.map((key) => dimensionResults[key]).sort((a, b) => b - a);
  const topScore = sortedScores[0] || 0;
  const secondScore = sortedScores[1] || 0;
  const breadthBoost = Math.min(0.14, DIMENSION_KEYS.filter((key) => dimensionResults[key] >= 0.22).length * 0.035);
  const aiInfraBoost = dimensionResults.direct_ai_infrastructure_relevance >= 0.75 ? 0.08 : 0;
  let overall = Math.min(1, topScore * 0.58 + secondScore * 0.22 + breadthBoost + aiInfraBoost);

  const physicalOrMarketScores = [
    'data_center_relevance',
    'cloud_capacity_relevance',
    'semiconductor_relevance',
    'power_grid_relevance',
    'cooling_relevance',
    'capital_markets_relevance',
  ].map((key) => dimensionResults[key]);
  if (
    dimensionResults.enterprise_ai_infrastructure_relevance >= 0.75
    && dimensionResults.direct_ai_infrastructure_relevance < 0.65
    && physicalOrMarketScores.every((score) => score < 0.22)
  ) {
    overall = Math.min(overall, 0.72);
  }

  const physicalOrMarketTop = Math.max(...physicalOrMarketScores);
  if (
    hasWeakAiAdjacent &&
    dimensionResults.direct_ai_infrastructure_relevance < 0.65 &&
    physicalOrMarketTop < 0.24
  ) {
    overall = Math.min(overall, 0.44);
  }

  if (!hasInfra) {
    overall = Math.min(overall, hasAi ? 0.38 : 0.28);
  }

  if (hasHardArchiveTopic) {
    overall = Math.min(overall, 0.2);
  } else if (hasAdjacentOnlyTopic) {
    overall = Math.min(overall, 0.62);
  }

  overall = Number(overall.toFixed(3));
  const tier = classifyTier(overall);
  const route = routeFields(tier);
  const reasons = DIMENSION_KEYS
    .filter((key) => dimensionResults[key] >= 0.22)
    .map((key) => `${key}:${dimensionResults[key].toFixed(2)}${matchedByDimension[key]?.length ? `(${matchedByDimension[key].slice(0, 3).join(', ')})` : ''}`);

  if (!reasons.length) reasons.push('no_strong_compute_current_infrastructure_match');
  if (hasHardArchiveTopic) reasons.push('hard_archive_topic_outside_compute_current_boundary');
  if (hasAdjacentOnlyTopic) reasons.push('adjacent_only_topic_requires_infrastructure_evidence');
  if (hasConsumerAiOnly) reasons.push('consumer_ai_without_infrastructure_surface');
  if (hasWeakAiAdjacent && overall < FULL_MEMO_RELEVANCE_THRESHOLD) {
    reasons.push('weak_ai_adjacent_without_compute_current_infrastructure_surface');
  }

  return {
    ...dimensionResults,
    infrastructure_relevance_score: overall,
    infrastructure_relevance_tier: tier,
    infrastructure_relevance_action: relevanceAction(tier),
    infrastructure_relevance_reasons: reasons,
    ...route,
  };
}

export function splitByInfrastructureRelevance(articles = []) {
  const fullMemoCandidates = [];
  const signalCards = [];
  const archiveOnly = [];

  for (const article of articles) {
    const relevance = article.infrastructure_relevance
      || classifyInfrastructureRelevance(article);
    const tier = relevance.infrastructure_relevance_tier;
    const routed = {
      ...article,
      ...routeFields(tier),
      infrastructure_relevance_score: relevance.infrastructure_relevance_score,
      infrastructure_relevance_tier: tier,
      infrastructure_relevance_action: relevance.infrastructure_relevance_action,
      infrastructure_relevance_reasons: relevance.infrastructure_relevance_reasons,
      infrastructure_relevance: relevance,
    };

    if (tier === 'full_memo') {
      fullMemoCandidates.push(routed);
    } else if (tier === 'signal_card') {
      signalCards.push(routed);
    } else {
      archiveOnly.push(routed);
    }
  }

  return { fullMemoCandidates, signalCards, archiveOnly };
}
