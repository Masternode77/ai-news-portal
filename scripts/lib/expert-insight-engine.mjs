import { INFRASTRUCTURE_LAYERS } from './taxonomy.mjs';
import { extractNumericClaims } from './autonomous-desk-utils.mjs';
import { numericClaimKey } from './numeric-claim-policy.mjs';
import { sanitizeGeneratedText, truncate, unique } from './normalize.mjs';

const REQUIRED_TEXT_FIELDS = [
  'bottleneck_type',
  'who_gains_leverage',
  'who_takes_execution_risk',
  'timing_dependency',
  'counterargument',
  'next_observable_signal',
];

export const SOURCE_EXPERT_INSIGHT_FIELDS = Object.freeze([
  'concrete_facts',
  'named_actors',
  'infrastructure_layer',
  ...REQUIRED_TEXT_FIELDS,
]);

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
  'NetApp',
  'NVIDIA',
  'Oracle',
  'Proxmox',
  'Red Hat',
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

function sourceInsightError(reason) {
  const error = new Error(`Source-grounded expert insight rejected: ${reason}`);
  error.code = 'SOURCE_EXPERT_INSIGHT_INVALID';
  error.reason = reason;
  return error;
}

function exactSourceExcerptList(value, source, field) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 5 || value.some((excerpt) => typeof excerpt !== 'string')) {
    throw sourceInsightError(`evidence_shape:${field}`);
  }
  const excerpts = value.map(cleanText);
  if (excerpts.some((excerpt) => excerpt.length < 20 || excerpt.length > 1200 || !source.includes(excerpt))) {
    throw sourceInsightError(`unsupported_evidence:${field}`);
  }
  return excerpts;
}

function numericClaimsSupported(value, excerpts) {
  const evidenceKeys = new Set(extractNumericClaims(excerpts.join(' ')).map(numericClaimKey).filter(Boolean));
  return extractNumericClaims(value).every((claim) => {
    const key = numericClaimKey(claim);
    return Boolean(key) && evidenceKeys.has(key);
  });
}

function actorHasInstitutionalNameShape(value, source) {
  const actionLead = /^(?:Build|Deliver|Expand|Improve|Make|Protect|Secure|Support)\b/i;
  const strongInstitutionMarker = /\b(?:Administration|Agency|Association|Authority|Commission|Company|Corp\.?|Corporation|Council|Department|Foundation|Group|Holdings|Inc\.?|Institute|Interconnection|Laboratory|Labs|LLC|Ministry|Office|Systems|Technologies|University|Utility)\b/i;
  if (actionLead.test(value) && !strongInstitutionMarker.test(value)) return false;
  if (/^[A-Z][A-Z0-9&.-]{1,15}$/.test(value)) return true;
  if (/^[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)+$/.test(value)) return true;
  if (strongInstitutionMarker.test(value)) return true;
  if (extractNamedCompanies(source).some((candidate) => candidate.toLowerCase() === value.toLowerCase())) return true;
  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length === 1 && /^[A-Z][a-z][A-Za-z0-9-]*$/.test(value)) {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\s+(?:announced|filed|plans|reported|said|signed|will)\\b`).test(source);
  }
  return tokens.length >= 2 && tokens.length <= 8 && tokens.every((token) => (
    /^(?:and|of|the)$/i.test(token)
    || /^[A-Z][A-Za-z0-9&.-]*$/.test(token)
  ));
}

function hasCompleteActorMention(value, source) {
  const lowerSource = source.toLowerCase();
  const lowerValue = value.toLowerCase();
  const allowedFollowingRoles = new Set(['CEO', 'CFO', 'COO', 'CTO', 'Chair', 'Director', 'President']);
  const allowedPrecedingWords = new Set(['The']);
  let offset = 0;
  while (offset <= source.length - value.length) {
    const index = lowerSource.indexOf(lowerValue, offset);
    if (index < 0) return false;
    const end = index + value.length;
    const previous = source[index - 1] || '';
    const next = source[end] || '';
    const tokenBoundaries = !/[A-Za-z0-9]/.test(previous) && !/[A-Za-z0-9]/.test(next);
    const beforeToken = source.slice(0, index).match(/([A-Z][A-Za-z0-9&.-]*)\s+$/)?.[1] || '';
    const afterToken = source.slice(end).match(/^\s+([A-Z][A-Za-z0-9&.-]*)/)?.[1] || '';
    const completeStart = !beforeToken || allowedPrecedingWords.has(beforeToken);
    const completeEnd = !afterToken || allowedFollowingRoles.has(afterToken);
    if (tokenBoundaries && completeStart && completeEnd) return true;
    offset = index + 1;
  }
  return false;
}

function looksLikeNamedActor(value, source) {
  return Boolean(
    value
    && value.length <= 160
    && actorHasInstitutionalNameShape(value, source)
    && hasCompleteActorMention(value, source)
  );
}

function isCompleteSourceSentence(value, source) {
  const sentence = cleanText(value);
  if (!/[.!?]$/.test(sentence)) return false;
  const index = source.indexOf(sentence);
  if (index < 0) return false;
  const before = source.slice(0, index);
  const after = source.slice(index + sentence.length);
  const startsAtBoundary = index === 0 || /[.!?]\s+$/.test(before);
  const endsAtBoundary = after.length === 0 || /^\s+[A-Z0-9]/.test(after);
  return startsAtBoundary && endsAtBoundary;
}

export function emptyExpertInsight() {
  return {
    concrete_facts: [],
    named_companies: [],
    infrastructure_layer: '',
    bottleneck_type: '',
    who_gains_leverage: '',
    who_takes_execution_risk: '',
    timing_dependency: '',
    counterargument: '',
    next_observable_signal: '',
    expert_insight_complete: false,
    expert_insight_missing_fields: ['concrete_facts', 'named_companies', 'infrastructure_layer', ...REQUIRED_TEXT_FIELDS],
  };
}

export function validateSourceExpertInsight(payload, sourceText = '') {
  const source = cleanText(sourceText);
  if (source.length < 120) throw sourceInsightError('source_text_insufficient');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw sourceInsightError('payload_not_object');

  const keys = Object.keys(payload).sort();
  const expectedKeys = [...SOURCE_EXPERT_INSIGHT_FIELDS, 'source_evidence'].sort();
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    throw sourceInsightError('payload_keys');
  }
  if (!payload.source_evidence || typeof payload.source_evidence !== 'object' || Array.isArray(payload.source_evidence)) {
    throw sourceInsightError('evidence_not_object');
  }
  const evidenceKeys = Object.keys(payload.source_evidence).sort();
  const expectedEvidenceKeys = [...SOURCE_EXPERT_INSIGHT_FIELDS].sort();
  if (evidenceKeys.length !== expectedEvidenceKeys.length || evidenceKeys.some((key, index) => key !== expectedEvidenceKeys[index])) {
    throw sourceInsightError('evidence_keys');
  }

  const facts = Array.isArray(payload.concrete_facts) && payload.concrete_facts.every((value) => typeof value === 'string')
    ? payload.concrete_facts.map(cleanText)
    : [];
  if (facts.length === 0 || facts.length > 5 || facts.some((fact) => fact.length < 20 || !isCompleteSourceSentence(fact, source))) {
    throw sourceInsightError('concrete_facts_not_source_sentences');
  }
  const actors = Array.isArray(payload.named_actors) && payload.named_actors.every((value) => typeof value === 'string')
    ? unique(payload.named_actors.map(cleanText))
    : [];
  if (actors.length === 0 || actors.length > 8 || actors.some((actor) => !looksLikeNamedActor(actor, source))) {
    throw sourceInsightError('named_actors');
  }
  if (typeof payload.infrastructure_layer !== 'string' || !INFRASTRUCTURE_LAYERS.includes(payload.infrastructure_layer)) {
    throw sourceInsightError('infrastructure_layer');
  }
  for (const field of REQUIRED_TEXT_FIELDS) {
    if (typeof payload[field] !== 'string') throw sourceInsightError(`text_field:${field}`);
    if (field === 'bottleneck_type') {
      if (!cleanText(payload[field])) throw sourceInsightError(`text_field:${field}`);
    } else if (!hasSpecificField(payload[field])) {
      throw sourceInsightError(`text_field:${field}`);
    }
  }

  const normalizedEvidence = {};
  for (const field of SOURCE_EXPERT_INSIGHT_FIELDS) {
    const excerpts = exactSourceExcerptList(payload.source_evidence[field], source, field);
    normalizedEvidence[field] = excerpts;
    const values = field === 'concrete_facts'
      ? facts
      : field === 'named_actors'
        ? actors
        : [cleanText(payload[field])];
    if (field === 'named_actors' && values.some((actor) => !excerpts.some((excerpt) => excerpt.toLowerCase().includes(actor.toLowerCase())))) {
      throw sourceInsightError('named_actor_evidence');
    }
    if (values.some((value) => !numericClaimsSupported(value, excerpts))) {
      throw sourceInsightError(`unsupported_numeric:${field}`);
    }
  }

  return {
    concrete_facts: facts,
    named_companies: actors,
    infrastructure_layer: payload.infrastructure_layer,
    ...Object.fromEntries(REQUIRED_TEXT_FIELDS.map((field) => [field, cleanText(payload[field])])),
    source_evidence: normalizedEvidence,
    source_grounded: true,
    expert_insight_complete: true,
    expert_insight_missing_fields: [],
  };
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

const COVERAGE_STOP_WORDS = new Set('a an and are as at be because been but by can could did do does for from has have if in into is it its may more not of on or that the their them then this those to was were what when which who will with without would'.split(' '));

function coverageToken(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/(?:ing|ed|es|s)$/i, '');
}

function coverageTokens(value = '', exclusions = new Set()) {
  return cleanText(value).match(/[A-Za-z][A-Za-z0-9-]{2,}/g)
    ?.map(coverageToken)
    .filter((token) => token && !COVERAGE_STOP_WORDS.has(token) && !exclusions.has(token)) || [];
}

function hasNegativeConstruction(value = '') {
  return /\b(?:not|no|never|neither|nor|cannot|can't|won't|doesn't|don't|didn't|isn't|aren't|wasn't|weren't|without|lack(?:s|ed|ing)?|fail(?:s|ed|ing)?\s+to|insufficient|absent|rather than)\b/i.test(value);
}

function groundedFieldCovered(body = '', field = '', exclusions = new Set()) {
  const fieldTokens = [...new Set(coverageTokens(field, exclusions))];
  if (fieldTokens.length < 3) return false;
  const fieldNumericClaims = extractNumericClaims(field);
  const fieldNumericKeys = fieldNumericClaims.map(numericClaimKey).filter(Boolean);
  if (fieldNumericKeys.length !== fieldNumericClaims.length) return false;
  const fieldIsNegative = hasNegativeConstruction(field);
  const fieldBigrams = new Set(fieldTokens.slice(0, -1).map((token, index) => `${token} ${fieldTokens[index + 1]}`));
  const units = cleanText(body).split(/(?<=[.!?])\s+|\n+/).map(cleanText).filter(Boolean);
  return units.some((unit) => {
    if (fieldIsNegative !== hasNegativeConstruction(unit)) return false;
    const unitNumericKeys = new Set(extractNumericClaims(unit).map(numericClaimKey).filter(Boolean));
    if (!fieldNumericKeys.every((key) => unitNumericKeys.has(key))) return false;
    const unitTokens = coverageTokens(unit, exclusions);
    const unitSet = new Set(unitTokens);
    const overlap = fieldTokens.filter((token) => unitSet.has(token)).length;
    const ratio = overlap / Math.min(fieldTokens.length, 10);
    const unitBigrams = new Set(unitTokens.slice(0, -1).map((token, index) => `${token} ${unitTokens[index + 1]}`));
    const sharedBigram = [...fieldBigrams].some((bigram) => unitBigrams.has(bigram));
    return overlap >= 3 && ratio >= 0.4 && (overlap >= 5 || sharedBigram);
  });
}

function actorAcronym(value = '') {
  const ignored = new Set(['and', 'of', 'the']);
  return value.split(/\s+/)
    .map((token) => token.replace(/[^A-Za-z0-9]/g, ''))
    .filter((token) => token && !ignored.has(token.toLowerCase()))
    .map((token) => token[0])
    .join('')
    .toUpperCase();
}

function groundedActorCovered(body = '', actors = []) {
  const text = cleanText(body);
  return actors.some((actor) => {
    if (text.toLowerCase().includes(cleanText(actor).toLowerCase())) return true;
    const acronym = actorAcronym(actor);
    return acronym.length >= 3 && new RegExp(`\\b${acronym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text);
  });
}

function groundedFactCovered(body = '', facts = [], exclusions = new Set()) {
  const bodyNumericKeys = new Set(extractNumericClaims(body).map(numericClaimKey).filter(Boolean));
  return facts.some((fact) => {
    const numericSupported = extractNumericClaims(fact).every((claim) => {
      const key = numericClaimKey(claim);
      return Boolean(key) && bodyNumericKeys.has(key);
    });
    return numericSupported && groundedFieldCovered(body, fact, exclusions);
  });
}

export function expertInsightUsageScore(body = '', insight = {}) {
  const text = cleanText(body).toLowerCase();
  if (!text) return 0;

  if (insight.source_grounded === true) {
    const actors = Array.isArray(insight.named_companies) ? insight.named_companies.filter(Boolean) : [];
    const exclusions = new Set([
      ...actors.flatMap((actor) => coverageTokens(actor)),
      ...coverageTokens(insight.infrastructure_layer || ''),
    ]);
    const checks = [
      groundedFactCovered(body, insight.concrete_facts || [], exclusions),
      groundedActorCovered(body, actors),
      groundedFieldCovered(body, insight.bottleneck_type, exclusions),
      Boolean(insight.infrastructure_layer && text.includes(insight.infrastructure_layer.toLowerCase())),
      groundedFieldCovered(body, insight.who_gains_leverage, exclusions),
      groundedFieldCovered(body, insight.who_takes_execution_risk, exclusions),
      groundedFieldCovered(body, insight.timing_dependency, exclusions),
      groundedFieldCovered(body, insight.counterargument, exclusions),
      groundedFieldCovered(body, insight.next_observable_signal, exclusions),
    ];
    return checks.filter(Boolean).length / checks.length;
  }

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
