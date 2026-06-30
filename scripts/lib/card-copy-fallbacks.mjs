import { normalizeProperNouns } from './proper-noun-normalizer.mjs';

const DECK_BY_ANGLE = {
  cooling: 'puts thermal design and rack-density assumptions back into the capacity plan for AI facilities',
  grid: 'shows where grid access, interconnection timing, and substation readiness can decide AI campus schedules',
  power: 'ties AI buildout timing to power procurement, utility capacity, and energy-contract risk',
  silicon: 'gives buyers a sharper read on accelerator supply, memory bandwidth, and performance-per-watt planning',
  cloud: 'tracks how cloud and platform capacity is shifting as enterprise AI demand moves into production workloads',
  policy: 'turns permitting, siting, or regulatory timing into a material constraint for AI infrastructure delivery',
  capital: 'shows which AI infrastructure bets still attract financing when construction and power risks are visible',
  capacity: 'marks where data center commitments are becoming real capacity decisions rather than demand forecasts',
  operations: 'changes how operators sequence procurement, supplier commitments, and AI infrastructure delivery risk',
};

const TAKEAWAYS_BY_ANGLE = {
  cooling: [
    'changes how operators size cooling capacity, rack density, and data center fit-out risk',
    'puts AI infrastructure planning closer to thermal limits, facility design, and customer ramp timing',
    'gives capacity teams a source-specific read on heat rejection, rack density, and site utilization',
  ],
  grid: [
    'changes how data center developers price interconnection timing, substation work, and campus readiness',
    'puts AI infrastructure planning closer to utility queues, grid upgrades, and commissioning schedules',
    'shows operators whether power delivery can keep pace with AI campus construction',
  ],
  power: [
    'changes how operators line up power procurement, campus energization, and capacity commitments',
    'puts AI infrastructure planning closer to utility capacity, energy contracts, and commissioning risk',
    'gives buyers a sharper read on where power availability can delay usable AI capacity',
  ],
  silicon: [
    'changes how buyers model accelerator supply, memory bandwidth, and AI infrastructure refresh timing',
    'gives operators another supplier signal for GPU availability, capacity-per-watt, and procurement timing',
    'puts AI infrastructure planning closer to chip allocation, buyer queues, and cloud margin pressure',
  ],
  cloud: [
    'changes how platform teams reserve cloud capacity, storage, and production AI headroom',
    'puts AI infrastructure planning closer to enterprise workload placement, resilience, and platform bottlenecks',
    'gives buyers a source-specific read on whether cloud supply can absorb production AI demand',
  ],
  policy: [
    'changes how developers price permitting, siting exposure, and data center delivery timing',
    'puts AI infrastructure planning closer to regulatory calendars, community risk, and campus approvals',
    'gives operators a clearer read on which projects can move through policy and siting constraints',
  ],
  capital: [
    'changes how investors underwrite data center capital, power exposure, and construction timing',
    'puts AI infrastructure planning closer to financing terms, lease risk, and developer execution capacity',
    'gives operators a source-specific read on which AI infrastructure projects can still attract capital',
  ],
  capacity: [
    'changes how operators translate data center commitments into procurement, power, and tenant timing',
    'puts AI infrastructure planning closer to live capacity decisions, supplier allocation, and campus sequencing',
    'shows buyers where AI demand is becoming usable data center capacity',
  ],
  operations: [
    'changes how operators sequence procurement, supplier commitments, and AI infrastructure delivery risk',
    'puts AI infrastructure planning closer to build schedules, buyer commitments, and cost assumptions',
    'gives capacity teams a source-specific read on which operating constraint could move first',
  ],
};

const TERMINAL_CUES = [
  'supplier allocation',
  'rack planning',
  'buyer queues',
  'refresh cycles',
  'margin pressure',
  'power budgets',
  'campus sequencing',
  'commissioning risk',
  'lease timing',
  'platform headroom',
  'capital exposure',
  'policy calendars',
  'memory bandwidth',
  'thermal envelopes',
  'substation work',
  'utility queues',
  'developer risk',
  'tenant commitments',
  'cloud reserves',
  'procurement timing',
  'construction milestones',
  'operating costs',
  'interconnection dates',
  'customer ramps',
];

const FOCUS_QUALIFIERS = [
  'near-term',
  'contracted',
  'energized',
  'supplier',
  'buyer',
  'facility',
  'platform',
  'campus',
  'cloud',
  'capital',
  'policy',
  'thermal',
  'memory',
  'power',
  'delivery',
  'commissioning',
  'resilience',
  'utilization',
  'procurement',
  'operating',
  'interconnection',
  'construction',
  'workload',
  'margin',
];

const FOCUS_NOUNS = [
  'checkpoint',
  'watchpoint',
  'constraint',
  'milestone',
  'model',
  'window',
  'test',
  'read',
  'case',
  'signal',
  'dependency',
  'exposure',
];

function compact(value = '') {
  return normalizeProperNouns(String(value || '').replace(/\s+/g, ' ').trim());
}

function sentence(value = '') {
  const text = compact(value);
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function stableIndex(key = '', size = 1) {
  if (size <= 1) return 0;
  let hash = 2166136261;
  for (const char of String(key)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash % size;
}

function cueFor(article = {}, angle = 'operations') {
  const key = [
    article.id,
    article.sourceUrl,
    article.url,
    article.title,
    article.source,
    angle,
  ].filter(Boolean).join('|');
  return TERMINAL_CUES[stableIndex(key, TERMINAL_CUES.length)];
}

function sourceForTerminal(article = {}) {
  const source = compact(article.source || '').replace(/[^\w\s-]/g, ' ');
  return source.split(/\s+/).filter(Boolean).slice(0, 3).join(' ') || 'operator';
}

function focusFor(article = {}, angle = 'operations', variant = 'deck') {
  const key = [
    article.id,
    article.sourceUrl,
    article.url,
    article.title,
    article.source,
    angle,
    variant,
    'focus',
  ].filter(Boolean).join('|');
  const qualifier = FOCUS_QUALIFIERS[stableIndex(key, FOCUS_QUALIFIERS.length)];
  const noun = FOCUS_NOUNS[stableIndex(`${key}|noun`, FOCUS_NOUNS.length)];
  return `${sourceForTerminal(article)} ${qualifier} ${noun}`;
}

function titleAnchorForTerminal(article = {}) {
  const title = compact(article.title || '')
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !/^(the|a|an|and|or|to|for|of|in|on|with|as|at|from|by|is|are|be|this|that)$/i.test(word));
  return title.slice(-3).join(' ') || 'source item';
}

function articleContext(article = {}) {
  return compact([
    article.title,
    article.source,
    article.primary_category,
    article.category,
    article.infrastructure_layer,
    article.summary,
    article.snippet,
    ...(Array.isArray(article.tags) ? article.tags : []),
  ].filter(Boolean).join(' ')).toLowerCase();
}

export function angleFor(article = {}) {
  const text = articleContext(article);
  if (/cooling|liquid|thermal|chiller|heat rejection|rack density/.test(text)) return 'cooling';
  if (/grid|interconnection|transmission|substation|ercot|queue/.test(text)) return 'grid';
  if (/power|utility|energy|nuclear|battery|mw|gw|load growth/.test(text)) return 'power';
  if (/chip|gpu|semiconductor|silicon|hbm|memory|accelerator|epyc|lpddr|socamm|arm/.test(text)) return 'silicon';
  if (/cloud|aws|azure|google cloud|platform|openshift|kubernetes|storage|backup|resilience|inference/.test(text)) return 'cloud';
  if (/policy|siting|regulation|permit|tariff|legislation|zoning/.test(text)) return 'policy';
  if (/capital|deal|reit|ipo|funding|finance|lease|acquisition|investor|valuation/.test(text)) return 'capital';
  if (/data center|datacenter|campus|hyperscale|colocation|facility|capacity|rack/.test(text)) return 'capacity';
  return 'operations';
}

export function deckForAngle(angle = 'operations', titleContext = 'This update', article = {}) {
  const cue = cueFor(article, angle);
  const focus = focusFor(article, angle, 'deck');
  const titleAnchor = titleAnchorForTerminal(article);
  const deck = DECK_BY_ANGLE[angle] || DECK_BY_ANGLE.operations;
  return sentence(`${titleContext || 'This update'} ${deck}; the practical checkpoint is ${cue} for the ${focus} on ${titleAnchor}`);
}

export function whyForFallback(article = {}, context = {}) {
  const angle = context.angle || angleFor(article);
  const subject = context.subject || 'This update';
  const cue = cueFor(article, angle);
  const takeaways = TAKEAWAYS_BY_ANGLE[angle] || TAKEAWAYS_BY_ANGLE.operations;
  const key = [
    article.id,
    article.sourceUrl,
    article.url,
    article.title,
    article.source,
    angle,
    context.layer,
  ].filter(Boolean).join('|');
  const takeaway = takeaways[stableIndex(key, takeaways.length)];
  const focus = focusFor(article, angle, 'why');
  const titleAnchor = titleAnchorForTerminal(article);
  return sentence(`${subject} ${takeaway}; the exposed dependency is ${cue} for the ${focus} on ${titleAnchor}`);
}
