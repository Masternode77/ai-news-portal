import { inferRegion, unique } from './normalize.mjs';

export const PRIMARY_CATEGORIES = [
  'AI Infrastructure',
  'Data Centers',
  'Cloud Capacity',
  'Semiconductors',
  'Power & Grid',
  'Cooling & Facility Engineering',
  'Capital Markets',
  'Enterprise AI Infrastructure',
  'Policy & Siting',
  'Other',
];

export const INFRASTRUCTURE_LAYERS = [
  'Compute',
  'Facility',
  'Cloud Platform',
  'Silicon',
  'Power',
  'Cooling',
  'Network',
  'Capital',
  'Enterprise Platform',
  'Policy',
  'Demand',
];

export const ARTICLE_TYPES = [
  'Capacity Expansion',
  'Financing / M&A',
  'Policy / Regulation',
  'Product / Platform Update',
  'Supply Chain',
  'Operations Update',
  'Partnership',
  'Market Analysis',
  'Earnings / Guidance',
  'Research / Technical',
  'Other',
];

const TAXONOMY_RULES = [
  {
    primary: 'Power & Grid',
    secondary: 'Interconnection and power procurement',
    layer: 'Power',
    stakeholders: ['data center operators', 'utilities', 'cloud capacity teams', 'investors'],
    keywords: ['power', 'grid', 'interconnection', 'substation', 'utility', 'electricity', 'ppa', 'transmission', 'transformer', 'nuclear', 'gw', 'megawatt'],
  },
  {
    primary: 'Cooling & Facility Engineering',
    secondary: 'Thermal design and rack density',
    layer: 'Cooling',
    stakeholders: ['operators', 'equipment vendors', 'data center developers', 'enterprise IT'],
    keywords: ['cooling', 'liquid cooling', 'thermal', 'cdu', 'heat rejection', 'chiller', 'immersion', 'rack density', 'rear-door', 'direct-to-chip'],
  },
  {
    primary: 'Data Centers',
    secondary: 'Campus development and colocation capacity',
    layer: 'Facility',
    stakeholders: ['data center operators', 'developers', 'site selectors', 'investors'],
    keywords: ['data center', 'datacenter', 'colocation', 'colo', 'campus', 'wholesale', 'lease', 'critical facilities'],
  },
  {
    primary: 'Cloud Capacity',
    secondary: 'Hyperscale regions and accelerator availability',
    layer: 'Cloud Platform',
    stakeholders: ['hyperscalers', 'cloud buyers', 'enterprise IT', 'operators'],
    keywords: ['cloud capacity', 'cloud region', 'availability zone', 'hyperscaler', 'aws', 'azure', 'google cloud', 'oracle cloud', 'gpu instance', 'reserved capacity', 'sovereign cloud'],
  },
  {
    primary: 'Semiconductors',
    secondary: 'Accelerators, memory, and advanced packaging',
    layer: 'Silicon',
    stakeholders: ['semiconductor suppliers', 'hyperscalers', 'server OEMs', 'investors'],
    keywords: ['semiconductor', 'chip', 'gpu', 'nvidia', 'amd', 'intel', 'arm holdings', 'tsmc', 'hbm', 'advanced packaging', 'wafer', 'fab', 'asic'],
  },
  {
    primary: 'Capital Markets',
    secondary: 'Financing, valuation, and capital structure',
    layer: 'Capital',
    stakeholders: ['investors', 'lenders', 'developers', 'operators'],
    keywords: ['funding', 'financing', 'debt', 'equity', 'bond', 'capex', 'acquisition', 'merger', 'm&a', 'joint venture', 'valuation', 'ipo', 'project finance'],
  },
  {
    primary: 'Enterprise AI Infrastructure',
    secondary: 'Enterprise deployment operations',
    layer: 'Enterprise Platform',
    stakeholders: ['enterprise IT', 'cloud buyers', 'platform teams', 'software vendors'],
    keywords: ['enterprise ai', 'private ai', 'on-prem', 'on premises', 'hybrid cloud', 'openshift', 'kubernetes', 'virtualization', 'backup', 'disaster recovery', 'storage', 'ai workload'],
  },
  {
    primary: 'Policy & Siting',
    secondary: 'Permitting, regulation, and market access',
    layer: 'Policy',
    stakeholders: ['regulators', 'site selectors', 'developers', 'utilities'],
    keywords: ['policy', 'regulation', 'permit', 'permitting', 'zoning', 'moratorium', 'compliance', 'tariff', 'antitrust', 'approval'],
  },
  {
    primary: 'AI Infrastructure',
    secondary: 'GPU clusters and deployment readiness',
    layer: 'Compute',
    stakeholders: ['operators', 'hyperscalers', 'cloud buyers', 'investors'],
    keywords: ['ai infrastructure', 'gpu cluster', 'accelerator cluster', 'inference capacity', 'training capacity', 'compute capacity', 'neocloud', 'hpc', 'deployment readiness'],
  },
];

const ARTICLE_TYPE_RULES = [
  ['Capacity Expansion', ['expands', 'expansion', 'capacity', 'adds', 'opens', 'launches region', 'new campus', 'availability zone']],
  ['Financing / M&A', ['funding', 'financing', 'debt', 'equity', 'bond', 'acquisition', 'merger', 'm&a', 'joint venture', 'ipo', 'valuation']],
  ['Policy / Regulation', ['policy', 'regulation', 'permit', 'approval', 'antitrust', 'moratorium', 'zoning', 'tariff', 'compliance']],
  ['Product / Platform Update', ['announces', 'launches', 'release', 'update', 'platform', 'software', 'service', 'instance']],
  ['Supply Chain', ['supply', 'shortage', 'lead time', 'procurement', 'packaging', 'memory', 'wafer', 'fab']],
  ['Operations Update', ['operations', 'deployment', 'backup', 'recovery', 'maintenance', 'uptime', 'provisioning']],
  ['Partnership', ['partnership', 'partner', 'collaboration', 'mou', 'alliance']],
  ['Earnings / Guidance', ['earnings', 'guidance', 'revenue', 'margin', 'forecast', 'outlook']],
  ['Research / Technical', ['research', 'technical', 'standard', 'benchmark', 'architecture', 'engineering']],
  ['Market Analysis', ['market', 'demand', 'pricing', 'analysis', 'forecast', 'survey']],
];

const URGENCY_TERMS = [
  ['pause', 0.18],
  ['block', 0.16],
  ['shortage', 0.16],
  ['delay', 0.14],
  ['interconnection', 0.14],
  ['moratorium', 0.18],
  ['approval', 0.08],
  ['permit', 0.08],
  ['power', 0.08],
  ['grid', 0.1],
  ['funding', 0.08],
  ['debt', 0.08],
  ['capacity', 0.08],
  ['launch', 0.04],
  ['expands', 0.06],
  ['acquisition', 0.08],
];

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

function normalizeLabel(value = '', allowed = [], fallback = '') {
  const cleaned = String(value || '').trim();
  return allowed.includes(cleaned) ? cleaned : fallback;
}

function articleText(article = {}) {
  return [
    article.title,
    article.snippet,
    article.summary,
    article.insight,
    article.contentText,
    article.articleText,
    article.category,
    article.defaultCategory,
    article.primary_category,
    article.secondary_category,
    article.infrastructure_layer,
    article.article_type,
    ...(article.tags || []),
  ].filter(Boolean).join(' ');
}

function scoreRule(text, titleText, rule) {
  let score = 0;
  const matches = [];
  for (const keyword of rule.keywords) {
    if (!includesTerm(text, keyword)) continue;
    score += includesTerm(titleText, keyword) ? 1.35 : 1;
    matches.push(keyword);
  }
  return { score, matches };
}

function strongestRule(article, text, titleText) {
  const scoreHints = {
    'AI Infrastructure': article.direct_ai_infrastructure_relevance || 0,
    'Data Centers': article.data_center_relevance || 0,
    'Cloud Capacity': article.cloud_capacity_relevance || 0,
    Semiconductors: article.semiconductor_relevance || 0,
    'Power & Grid': article.power_grid_relevance || 0,
    'Cooling & Facility Engineering': article.cooling_relevance || 0,
    'Capital Markets': article.capital_markets_relevance || 0,
    'Enterprise AI Infrastructure': article.enterprise_ai_infrastructure_relevance || 0,
  };

  let best = null;
  for (const rule of TAXONOMY_RULES) {
    const { score, matches } = scoreRule(text, titleText, rule);
    const hintedScore = score + (scoreHints[rule.primary] || 0) * 2;
    if (!best || hintedScore > best.score) {
      best = { ...rule, score: hintedScore, matches };
    }
  }

  return best?.score > 0 ? best : {
    primary: 'Other',
    secondary: 'General AI infrastructure signal',
    layer: 'Demand',
    stakeholders: ['operators'],
    matches: [],
  };
}

function inferArticleType(text) {
  for (const [type, keywords] of ARTICLE_TYPE_RULES) {
    if (keywords.some((keyword) => includesTerm(text, keyword))) return type;
  }
  return 'Other';
}

function urgencyScore(article, text) {
  let score = 0.18;
  const relevance = Number(article.infrastructure_relevance_score || 0);
  if (Number.isFinite(relevance)) score += relevance * 0.32;
  if (article.extraction_quality_score < 0.8) score -= 0.08;

  for (const [term, weight] of URGENCY_TERMS) {
    if (includesTerm(text, term)) score += weight;
  }

  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

export function classifyTaxonomy(article = {}, aiTaxonomy = null) {
  const text = normalizeText(articleText(article));
  const titleText = normalizeText(article.title || '');
  const best = strongestRule(article, text, titleText);
  const inferredRegion = inferRegion(text, article.region || 'Global');

  const deterministic = {
    primary_category: best.primary,
    secondary_category: best.secondary,
    infrastructure_layer: best.layer,
    affected_stakeholders: unique(best.stakeholders).slice(0, 5),
    article_type: inferArticleType(text),
    region: inferredRegion,
    urgency_score: urgencyScore(article, text),
    taxonomy_confidence: Math.max(0.35, Math.min(0.95, Number((0.45 + best.score * 0.08).toFixed(2)))),
    taxonomy_reasons: best.matches?.length ? best.matches.slice(0, 6) : ['fallback_taxonomy'],
  };

  if (!aiTaxonomy || typeof aiTaxonomy !== 'object') return deterministic;

  const stakeholders = Array.isArray(aiTaxonomy.affected_stakeholders)
    ? aiTaxonomy.affected_stakeholders.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const urgency = Number(aiTaxonomy.urgency_score);

  return {
    ...deterministic,
    primary_category: normalizeLabel(aiTaxonomy.primary_category, PRIMARY_CATEGORIES, deterministic.primary_category),
    secondary_category: String(aiTaxonomy.secondary_category || deterministic.secondary_category).trim().slice(0, 80),
    infrastructure_layer: normalizeLabel(aiTaxonomy.infrastructure_layer, INFRASTRUCTURE_LAYERS, deterministic.infrastructure_layer),
    affected_stakeholders: unique([...stakeholders, ...deterministic.affected_stakeholders]).slice(0, 5),
    article_type: normalizeLabel(aiTaxonomy.article_type, ARTICLE_TYPES, deterministic.article_type),
    region: String(aiTaxonomy.region || deterministic.region).trim().slice(0, 40),
    urgency_score: Number.isFinite(urgency) ? Math.max(0, Math.min(1, Number(urgency.toFixed(2)))) : deterministic.urgency_score,
  };
}

export function taxonomySearchFields(article = {}) {
  return [
    article.primary_category,
    article.secondary_category,
    article.infrastructure_layer,
    article.article_type,
    article.region,
    ...(article.affected_stakeholders || []),
  ].filter(Boolean);
}
