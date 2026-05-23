const ARCHETYPES = [
  {
    id: 'power_grid_constraint',
    name: 'Power/Grid Constraint',
    pattern: /\b(power|grid|utility|ppa|energy|interconnection|substation)\b/i,
    headings: ['The grid bottleneck', 'What changed', 'Why planning calendars are slipping', 'Utility and operator leverage', 'Cost and schedule exposure', 'Counterargument', 'What to watch', 'Bottom line'],
  },
  {
    id: 'capital_formation',
    name: 'Capital Formation / REIT / Deal Memo',
    pattern: /\b(reit|ipo|finance|capital|debt|equity|acquisition|lease|funding)\b/i,
    headings: ['Deal snapshot', 'What investors are underwriting', 'Demand quality versus delivery risk', 'Lease and customer concentration', 'Development and power exposure', 'What would change the thesis', 'Bottom line'],
  },
  {
    id: 'siting_risk',
    name: 'Data Center Campus / Siting Risk',
    pattern: /\b(campus|site|zoning|moratorium|permit|county|construction|siting)\b/i,
    headings: ['The local decision', 'Why siting is becoming capacity control', 'Power and community constraints', 'Who gains leverage', 'Who absorbs delay', 'Precedent risk', 'What to watch', 'Bottom line'],
  },
  {
    id: 'semiconductor_systems',
    name: 'Semiconductor / Memory / Systems',
    pattern: /\b(semiconductor|chip|hbm|memory|gpu|accelerator|networking|server)\b/i,
    headings: ['The technical claim', 'Why the bottleneck exists', 'Stack-level implication', 'Buyer and OEM exposure', 'Supply chain friction', 'Counterargument', 'What to watch', 'Bottom line'],
  },
  {
    id: 'cloud_platform',
    name: 'Cloud Region / Sovereign Cloud / Enterprise Platform',
    pattern: /\b(cloud|region|kubernetes|openshift|storage|backup|platform|sovereign)\b/i,
    headings: ['Why the platform move matters', 'What changed', 'Enterprise buyer implication', 'Capacity or resiliency link', 'Competitive positioning', 'Limitation', 'Watch metrics', 'Bottom line'],
  },
  {
    id: 'market_map',
    name: 'Market Map',
    pattern: /\b(roundup|land and expand|market map|multiple|nvidia.*microsoft|cerebras.*core scientific)\b/i,
    headings: ['The map, not the headline', 'Land', 'Power', 'Capital', 'Chips and systems', 'Demand signal', 'Winners and exposed parties', 'What to watch', 'Bottom line'],
  },
  {
    id: 'skeptics_read',
    name: "Skeptic's Read",
    pattern: /\b(app|tool|software|consumer|generic|ai)\b/i,
    headings: ['What the headline says', 'What it does not prove', 'The actual infrastructure link', 'Missing evidence', 'Why it may still matter', 'Bottom line'],
  },
];

export function routeEditorialArchetypeV2(cluster = {}, options = {}) {
  const text = [cluster.cluster_title, cluster.cluster_topic, cluster.primary_infrastructure_layer, ...(cluster.companies || [])].join(' ');
  const recent = options.recent || [];
  const counts = new Map(recent.map((item) => [item.archetype_id || item.editorial_archetype_id, 0]));
  for (const item of recent) counts.set(item.archetype_id || item.editorial_archetype_id, (counts.get(item.archetype_id || item.editorial_archetype_id) || 0) + 1);
  const matched = ARCHETYPES.find((archetype) => archetype.pattern.test(text) && (counts.get(archetype.id) || 0) < 2)
    || ARCHETYPES.find((archetype) => (counts.get(archetype.id) || 0) < 2)
    || ARCHETYPES[0];
  return matched;
}

export { ARCHETYPES as EDITORIAL_ARCHETYPES_V2 };
