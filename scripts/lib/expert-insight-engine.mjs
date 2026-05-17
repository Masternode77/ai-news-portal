import { INFRASTRUCTURE_LAYERS } from './taxonomy.mjs';
import { sanitizeGeneratedText, truncate, unique } from './normalize.mjs';

const REQUIRED_TEXT_FIELDS = [
  'bottleneck_type',
  'who_gains_leverage',
  'who_takes_execution_risk',
  'timing_dependency',
  'counterargument',
  'next_observable_signal',
];

const COMPANY_SUFFIX_PATTERN = [
  'Inc',
  'Inc.',
  'Corp',
  'Corp.',
  'Corporation',
  'Co',
  'Co.',
  'Company',
  'Ltd',
  'Ltd.',
  'PLC',
  'LLC',
  'LP',
  'AG',
  'SA',
  'NV',
  'GmbH',
  'Group',
  'Holdings',
  'Technologies',
  'Systems',
  'Cloud',
  'Energy',
  'Power',
  'Data',
].join('|');

const KNOWN_COMPANIES = [
  'Amazon',
  'AWS',
  'AMD',
  'Anthropic',
  'Apple',
  'Arm',
  'Blackstone',
  'Bloomberg',
  'Broadcom',
  'CoreWeave',
  'Digital Realty',
  'Equinix',
  'Google',
  'Google Cloud',
  'Intel',
  'Meta',
  'Microsoft',
  'NVIDIA',
  'Oracle',
  'OpenAI',
  'Samsung',
  'SK hynix',
  'SoftBank',
  'Supermicro',
  'TSMC',
  'xAI',
];

const BOTTLENECK_RULES = [
  {
    type: 'power_grid',
    layer: 'Power & Energy',
    keywords: /\b(power|grid|utility|substation|interconnection|energy|electricity|ppa|transformer|load)\b/i,
    leverage: 'utilities, power-secured developers, and operators with firm interconnection positions',
    risk: 'developers and cloud buyers whose delivery dates depend on utility upgrades or energization schedules',
    timing: 'utility interconnection, equipment procurement, and energization milestones',
    signal: 'interconnection approvals, substation equipment dates, power purchase agreements, or disclosed energization windows',
  },
  {
    type: 'cooling_density',
    layer: 'Cooling & Facility',
    keywords: /\b(cooling|liquid|thermal|cdu|chiller|rack density|heat|immersion)\b/i,
    leverage: 'facility operators and suppliers that can standardize high-density cooling deployments',
    risk: 'operators retrofitting sites before thermal design, maintenance processes, and vendor capacity are proven',
    timing: 'cooling equipment delivery, commissioning, and high-density rack qualification',
    signal: 'cooling vendor capacity, rack-density targets, commissioning dates, or customer acceptance tests',
  },
  {
    type: 'compute_supply',
    layer: 'Compute Hardware',
    keywords: /\b(gpu|accelerator|nvidia|amd|hbm|chip|semiconductor|silicon|server|cluster)\b/i,
    leverage: 'chip suppliers, systems integrators, and buyers with committed accelerator allocations',
    risk: 'cloud providers and enterprises that still need networking, power, and facility readiness around purchased systems',
    timing: 'accelerator allocation, server integration, memory supply, and cluster turn-up',
    signal: 'delivery schedules, memory availability, networking readiness, or deployed cluster utilization',
  },
  {
    type: 'cloud_capacity',
    layer: 'Cloud Capacity',
    keywords: /\b(cloud|region|availability zone|instance|capacity|hyperscaler|reservation|tenant|workload)\b/i,
    leverage: 'cloud platforms and capacity brokers that can translate reserved demand into available AI instances',
    risk: 'buyers that commit workloads before regional capacity, pricing, and service levels are visible',
    timing: 'regional capacity release, customer onboarding, and service availability dates',
    signal: 'new instance availability, regional capacity disclosures, pricing changes, or workload migration updates',
  },
  {
    type: 'capital_structure',
    layer: 'Capital & Ownership',
    keywords: /\b(funding|financing|debt|bond|ipo|valuation|acquisition|merger|joint venture|investment|capex)\b/i,
    leverage: 'capital providers and sponsors with credible customer contracts and delivery milestones',
    risk: 'developers whose financing assumptions depend on demand materializing before sites are operational',
    timing: 'financing close, construction drawdowns, signed customer commitments, and delivery milestones',
    signal: 'financing terms, lease commitments, backlog conversion, or construction milestone disclosures',
  },
  {
    type: 'siting_policy',
    layer: 'Siting & Permitting',
    keywords: /\b(permit|siting|land|zoning|regulation|policy|approval|campus|market access|moratorium)\b/i,
    leverage: 'operators with permitted sites and local stakeholder alignment',
    risk: 'developers exposed to permitting delays, community opposition, or changing policy conditions',
    timing: 'permit approvals, land-use decisions, and local utility coordination',
    signal: 'planning approvals, environmental filings, utility agreements, or policy changes',
  },
  {
    type: 'network_storage',
    layer: 'Networking & Storage',
    keywords: /\b(network|ethernet|infiniband|switch|storage|ssd|nvme|backup|latency|throughput)\b/i,
    leverage: 'platform teams and suppliers that can remove data movement constraints around AI clusters',
    risk: 'operators that add compute faster than storage, networking, or resilience architecture can support',
    timing: 'network fabric deployment, storage qualification, and workload performance validation',
    signal: 'throughput benchmarks, fabric availability, failure-domain design, or storage deployment milestones',
  },
];

function cleanText(text = '') {
  return sanitizeGeneratedText(text).replace(/\s+/g, ' ').trim();
}

function sourceText(article = {}) {
  return cleanText([
    article.title,
    article.summary,
    article.snippet,
    article.insight,
    article.articleText,
    article.contentText,
  ].filter(Boolean).join(' '));
}

function splitSentences(text = '') {
  return cleanText(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 45 && sentence.length <= 360);
}

function factScore(sentence = '') {
  let score = 0;
  if (/\b\d+(?:[.,]\d+)?\s?(?:MW|GW|kW|B|M|million|billion|trillion|%|percent|servers?|GPUs?|chips?|racks?|months?|years?|days?)\b/i.test(sentence)) score += 3;
  if (/\b(announced|reported|said|launched|opened|secured|raised|acquired|signed|plans|will|expects|began|completed|expanded|delayed)\b/i.test(sentence)) score += 2;
  if (extractNamedCompanies(sentence).length) score += 2;
  if (/\b(US|U.S.|EU|UK|Korea|Japan|Singapore|Malaysia|India|Texas|Virginia|Arizona|Ohio|Europe|APAC)\b/.test(sentence)) score += 1;
  if (/\b(power|grid|data center|cloud|GPU|semiconductor|cooling|capacity|facility|campus|financing)\b/i.test(sentence)) score += 1;
  return score;
}

function extractConcreteFacts(article = {}) {
  const text = sourceText(article);
  const sentences = splitSentences(text)
    .map((sentence) => cleanText(sentence).replace(/\s+([,.;:!?])/g, '$1'))
    .filter(Boolean)
    .sort((a, b) => factScore(b) - factScore(a));

  return unique(sentences.filter((sentence) => factScore(sentence) >= 2)).slice(0, 5);
}

export function extractNamedCompanies(text = '') {
  const matches = [];
  const knownPattern = new RegExp(`\\b(${KNOWN_COMPANIES.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi');
  for (const match of cleanText(text).matchAll(knownPattern)) {
    matches.push(match[1]);
  }

  const suffixPattern = new RegExp(`\\b([A-Z][A-Za-z0-9&.-]*(?:\\s+[A-Z][A-Za-z0-9&.-]*){0,4}\\s+(?:${COMPANY_SUFFIX_PATTERN}))\\b`, 'g');
  for (const match of cleanText(text).matchAll(suffixPattern)) {
    matches.push(match[1]);
  }

  return unique(matches.map((name) => name.replace(/\s+/g, ' ').trim()))
    .filter((name) => name.length >= 2 && !/^(The|This|That|Data Center|AI Infrastructure)$/i.test(name))
    .slice(0, 8);
}

function classifyBottleneck(article = {}) {
  const text = sourceText(article);
  const preferredLayer = article.infrastructure_layer && INFRASTRUCTURE_LAYERS.includes(article.infrastructure_layer)
    ? article.infrastructure_layer
    : '';
  const matched = BOTTLENECK_RULES.find((rule) => rule.keywords.test(text));
  if (matched) return matched;

  return {
    type: preferredLayer ? preferredLayer.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') : '',
    layer: preferredLayer,
    leverage: '',
    risk: '',
    timing: '',
    signal: '',
  };
}

function counterargumentFor(article = {}, bottleneck = {}) {
  const text = sourceText(article).toLowerCase();
  if (/\b(early|pilot|trial|test|preview|could|may|plans?|expects?)\b/.test(text)) {
    return 'The source may still describe intent rather than delivered capacity, so the operating impact depends on follow-through.';
  }
  if (/\b(funding|financing|investment|valuation|acquisition)\b/.test(text)) {
    return 'Capital alone does not prove capacity will arrive on schedule without power, equipment, permits, and customers lining up.';
  }
  if (/\b(gpu|chip|semiconductor|server)\b/.test(text)) {
    return 'More compute supply does not automatically become useful capacity if facilities, power, networking, and software readiness lag.';
  }
  if (/\b(power|grid|utility)\b/.test(text)) {
    return 'A power-side development can still be too narrow to change the broader delivery curve unless it scales across sites.';
  }
  return bottleneck.type
    ? 'The source supports a specific infrastructure read, but it does not by itself prove a broad market shift.'
    : '';
}

function hasSpecificField(value = '') {
  const text = cleanText(value);
  if (text.length < 20) return false;
  return !/\b(execution risk|infrastructure demand|capacity planning|market participants|stakeholders)\b$/i.test(text);
}

export function extractExpertInsight(article = {}) {
  const text = sourceText(article);
  const concreteFacts = extractConcreteFacts(article);
  const namedCompanies = extractNamedCompanies(text);
  const bottleneck = classifyBottleneck(article);
  const infrastructureLayer = article.infrastructure_layer || bottleneck.layer || '';

  const insight = {
    concrete_facts: concreteFacts,
    named_companies: namedCompanies,
    infrastructure_layer: infrastructureLayer,
    bottleneck_type: bottleneck.type || '',
    who_gains_leverage: bottleneck.leverage || '',
    who_takes_execution_risk: bottleneck.risk || '',
    timing_dependency: bottleneck.timing || '',
    counterargument: counterargumentFor(article, bottleneck),
    next_observable_signal: bottleneck.signal || '',
  };

  const missing = [];
  if (!insight.concrete_facts.length) missing.push('concrete_facts');
  if (!insight.named_companies.length) missing.push('named_companies');
  if (!insight.infrastructure_layer) missing.push('infrastructure_layer');
  for (const field of REQUIRED_TEXT_FIELDS) {
    if (field === 'bottleneck_type') {
      if (!insight[field]) missing.push(field);
      continue;
    }
    if (!hasSpecificField(insight[field])) missing.push(field);
  }

  return {
    ...insight,
    expert_insight_complete: missing.length === 0,
    expert_insight_missing_fields: missing,
  };
}

export function articleHasExpertInsight(article = {}) {
  const insight = article.expert_insight || article.expertInsight || {};
  return Boolean(
    insight.expert_insight_complete &&
      Array.isArray(insight.concrete_facts) &&
      insight.concrete_facts.length &&
      Array.isArray(insight.named_companies) &&
      insight.named_companies.length &&
      REQUIRED_TEXT_FIELDS.every((field) => field === 'bottleneck_type' ? Boolean(insight[field]) : hasSpecificField(insight[field]))
  );
}

export function expertInsightUsageScore(body = '', insight = {}) {
  const text = cleanText(body).toLowerCase();
  if (!text) return 0;

  const checks = [
    (insight.concrete_facts || []).some((fact) => text.includes(cleanText(fact).toLowerCase().slice(0, 80))),
    (insight.named_companies || []).some((company) => text.includes(company.toLowerCase())),
    insight.bottleneck_type && text.includes(insight.bottleneck_type.replace(/_/g, ' ')),
    insight.infrastructure_layer && text.includes(insight.infrastructure_layer.toLowerCase().split(/\s*&\s*|\s+/)[0]),
    insight.who_gains_leverage && text.includes(cleanText(insight.who_gains_leverage).toLowerCase().split(/\s+/).slice(0, 3).join(' ')),
    insight.who_takes_execution_risk && text.includes(cleanText(insight.who_takes_execution_risk).toLowerCase().split(/\s+/).slice(0, 3).join(' ')),
    insight.timing_dependency && text.includes(cleanText(insight.timing_dependency).toLowerCase().split(/\s+/).slice(0, 3).join(' ')),
    insight.counterargument && text.includes(cleanText(insight.counterargument).toLowerCase().split(/\s+/).slice(0, 4).join(' ')),
    insight.next_observable_signal && text.includes(cleanText(insight.next_observable_signal).toLowerCase().split(/\s+/).slice(0, 3).join(' ')),
  ];

  return checks.filter(Boolean).length / checks.length;
}

export function expertInsightGateReason(article = {}) {
  const insight = article.expert_insight || extractExpertInsight(article);
  if (insight.expert_insight_complete) return null;
  return `expert_insight_missing_fields ${insight.expert_insight_missing_fields.join(', ')}`;
}

export function splitByExpertInsightGate(articles = []) {
  const publishable = [];
  const blocked = [];

  for (const article of articles) {
    const expertInsight = article.expert_insight || extractExpertInsight(article);
    const annotated = {
      ...article,
      expert_insight: expertInsight,
      expertInsight,
    };
    const reason = expertInsightGateReason(annotated);
    if (reason) {
      blocked.push({
        ...annotated,
        articlePagePublished: false,
        expertInsightBlocked: true,
        expertInsightBlockedAt: new Date().toISOString(),
        expertInsightBlockReason: reason,
      });
      continue;
    }
    publishable.push(annotated);
  }

  return { publishable, blocked };
}

export function insightFieldSummary(insight = {}) {
  return [
    `Facts: ${(insight.concrete_facts || []).map((fact) => truncate(fact, 140)).join(' | ')}`,
    `Companies: ${(insight.named_companies || []).join(', ')}`,
    `Layer: ${insight.infrastructure_layer || 'n/a'}`,
    `Bottleneck: ${insight.bottleneck_type || 'n/a'}`,
    `Leverage: ${insight.who_gains_leverage || 'n/a'}`,
    `Execution risk: ${insight.who_takes_execution_risk || 'n/a'}`,
    `Timing: ${insight.timing_dependency || 'n/a'}`,
    `Counterargument: ${insight.counterargument || 'n/a'}`,
    `Next signal: ${insight.next_observable_signal || 'n/a'}`,
  ].join('\n');
}
