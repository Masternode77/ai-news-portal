export const HOMEPAGE_BOTTLENECK_AXES = [
  'capacity',
  'power',
  'capital',
  'supply-chain',
  'risk',
];

function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function textFor(article = {}) {
  return [
    article.bottleneck_type,
    article.primary_category,
    article.category,
    article.secondary_category,
    article.infrastructure_layer,
    article.public_routing?.laneTitle,
    article.public_routing?.story_archetype,
    article.title,
    article.deck,
    article.summary,
    ...(Array.isArray(article.tags) ? article.tags : []),
  ].map(compact).filter(Boolean).join(' ');
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function explicitAxis(value = '') {
  const normalized = compact(value).replace(/_/g, '-');
  if (HOMEPAGE_BOTTLENECK_AXES.includes(normalized)) return normalized;
  if (/^(power-grid|grid|energy|utility)$/.test(normalized)) return 'power';
  if (/^(data-center|data-centers|cloud-capacity|compute|silicon|cooling)$/.test(normalized)) return 'capacity';
  if (/^(capital-markets|finance|deal-watch)$/.test(normalized)) return 'capital';
  if (/^(supplier|equipment|procurement)$/.test(normalized)) return 'supply-chain';
  if (/^(policy|siting|regulation|security)$/.test(normalized)) return 'risk';
  return '';
}

export function inferBottleneckAxis(article = {}) {
  const title = compact(article.title);
  if (/\b(security|ban|bans|moratorium|permit|permitting|regulation|regulatory|policy|freeze|lawsuit|compliance)\b/.test(title)) {
    return 'risk';
  }
  if (/\b(supply chain|supplier|procurement|lead time|transformer|switchgear|busbar|equipment delivery)\b/.test(title)) {
    return 'supply-chain';
  }

  const explicit = explicitAxis(article.primary_category)
    || explicitAxis(article.infrastructure_layer)
    || explicitAxis(article.bottleneck_type);
  if (explicit) return explicit;

  const text = textFor(article);
  if (/\b(capital|capex|funding|finance|financing|investor|reit|ipo|deal|lease|acquisition|underwrite|valuation)\b/.test(text)) {
    return 'capital';
  }
  if (/\b(supply|supplier|supply-chain|equipment|transformer|switchgear|substation|construction|lead time|backlog|procurement|delivery)\b/.test(text)) {
    return 'supply-chain';
  }
  if (/\b(risk|policy|permit|permitting|siting|zoning|regulation|regulatory|exposure|security|compliance|delay|challenge)\b/.test(text)) {
    return 'risk';
  }
  if (/\b(power|grid|utility|interconnection|energy|energization|nuclear|battery|gw|mw)\b/.test(text)) {
    return 'power';
  }
  if (/\b(capacity|data center|datacenter|campus|colocation|hyperscale|cloud|rack|compute|gpu|accelerator|silicon|cooling)\b/.test(text)) {
    return 'capacity';
  }

  const scores = {
    capacity: Math.max(numeric(article.cloud_capacity_relevance), numeric(article.data_center_relevance), numeric(article.semiconductor_relevance)),
    power: numeric(article.power_grid_relevance),
    capital: numeric(article.capital_markets_relevance),
    'supply-chain': numeric(article.supply_chain_relevance),
    risk: Math.max(numeric(article.policy_relevance), numeric(article.security_relevance), numeric(article.risk_relevance)),
  };
  return HOMEPAGE_BOTTLENECK_AXES.reduce((winner, axis) => (scores[axis] > scores[winner] ? axis : winner), 'capacity');
}

export function orderByFirstViewportAxisDiversity(items = [], options = {}) {
  const firstViewportCount = Math.max(1, Number(options.firstViewportCount || HOMEPAGE_BOTTLENECK_AXES.length));
  const candidateCount = Math.max(
    firstViewportCount,
    Math.min(items.length, Number(options.candidateCount || items.length)),
  );
  const candidates = items.slice(0, candidateCount);
  const usedIndexes = new Set();
  const selected = [];
  const firstItem = items[0];

  if (firstItem) {
    selected.push(firstItem);
    usedIndexes.add(0);
  }

  const firstAxis = firstItem ? inferBottleneckAxis(firstItem) : '';
  const orderedAxes = [
    firstAxis,
    ...HOMEPAGE_BOTTLENECK_AXES.filter((axis) => axis !== firstAxis),
  ].filter(Boolean);

  for (const axis of orderedAxes) {
    if (selected.length >= firstViewportCount) break;
    if (axis === firstAxis && selected.length) continue;
    const index = candidates.findIndex((item, candidateIndex) => !usedIndexes.has(candidateIndex) && inferBottleneckAxis(item) === axis);
    if (index < 0) continue;
    selected.push(items[index]);
    usedIndexes.add(index);
  }

  for (let index = 0; index < items.length; index += 1) {
    if (usedIndexes.has(index)) continue;
    selected.push(items[index]);
  }

  return selected;
}
