export const BLOG_ARCHETYPES = [
  {
    id: 'operator-field-note',
    name: 'Operator Field Note',
    headings: ['Where The Constraint Shows Up', 'Operational Read', 'Who Carries The Risk', 'What Would Change The Read', 'Signals To Track', 'Bottom Line'],
  },
  {
    id: 'investor-memo',
    name: 'Investor Memo',
    headings: ['Why Capital Is Moving', 'Control Points', 'Margin And Execution Exposure', 'The Bear Case', 'Metrics To Track', 'Bottom Line'],
  },
  {
    id: 'technical-explainer',
    name: 'Technical Explainer',
    headings: ['System Context', 'Architecture Implication', 'Deployment Constraints', 'What Is Not Proven', 'Signals To Track', 'Bottom Line'],
  },
  {
    id: 'market-map',
    name: 'Market Map',
    headings: ['The Map Behind The Item', 'Who Controls What', 'Supply And Demand Edges', 'Where The Map Can Mislead', 'Signals To Track', 'Bottom Line'],
  },
  {
    id: 'policy-local-risk-note',
    name: 'Policy / Local Risk Note',
    headings: ['Local Decision Point', 'Infrastructure Exposure', 'Stakeholder Positions', 'What Could Break The Thesis', 'Signals To Track', 'Bottom Line'],
  },
  {
    id: 'skeptics-read',
    name: "Skeptic's Read",
    headings: ['What The Story Does Prove', 'What It Does Not Prove', 'Infrastructure Read-Through', 'Countercase', 'Signals To Track', 'Bottom Line'],
  },
  {
    id: 'board-level-briefing',
    name: 'Board-Level Briefing',
    headings: ['Board Read', 'Why Timing Matters', 'Commercial Exposure', 'Risk Boundary', 'Signals To Track', 'Bottom Line'],
  },
  {
    id: 'blog-analysis-essay',
    name: 'Blog Analysis Essay',
    headings: ['The Real Shape Of The Story', 'Infrastructure Context', 'Commercial Meaning', 'The Limitation', 'Signals To Track', 'Bottom Line'],
  },
  {
    id: 'supply-chain-fault-line',
    name: 'Supply Chain Fault Line',
    headings: ['Supply Chain Pressure', 'Capacity Translation', 'Buyer Exposure', 'Counterpressure', 'Signals To Track', 'Bottom Line'],
  },
  {
    id: 'power-market-signal',
    name: 'Power Market Signal',
    headings: ['Market Mechanism', 'Operator Leverage', 'Cost And Reliability Risk', 'Where Volatility Bites', 'Signals To Track', 'Bottom Line'],
  },
  {
    id: 'memory-economics-brief',
    name: 'Memory Economics Brief',
    headings: ['Memory As A Cost Line', 'Platform Implication', 'Procurement Exposure', 'What Could Offset It', 'Signals To Track', 'Bottom Line'],
  },
  {
    id: 'platform-resilience-note',
    name: 'Platform Resilience Note',
    headings: ['Platform Readiness', 'Operational Dependency', 'Enterprise Buyer Impact', 'What Is Still Missing', 'Signals To Track', 'Bottom Line'],
  },
];

function archetypeHint(article = {}) {
  const text = [article.title, article.category, article.public_routing?.editorial_lens, article.infrastructure_layer, article.summary].filter(Boolean).join(' ').toLowerCase();
  if (/power|grid|utility|ppa|electricity/.test(text)) return 'power-market-signal';
  if (/memory|hbm/.test(text)) return 'memory-economics-brief';
  if (/openshift|platform|backup|disaster recovery|storage/.test(text)) return 'platform-resilience-note';
  if (/roundup|market map|land and expand/.test(text)) return 'market-map';
  if (/policy|permit|siting|moratorium|zoning|county/.test(text)) return 'policy-local-risk-note';
  if (/funding|financing|capital|stake|acquisition|investor|deal/.test(text)) return 'investor-memo';
  if (/semiconductor|supply|equipment|chip/.test(text)) return 'supply-chain-fault-line';
  return '';
}

export function archetypeDistribution(items = []) {
  const counts = new Map();
  for (const item of items) {
    const archetype = typeof item === 'string' ? item : item.blog_metadata?.archetype || item.archetype;
    if (!archetype) continue;
    counts.set(archetype, (counts.get(archetype) || 0) + 1);
  }
  return counts;
}

export function selectBlogArchetype(article = {}, options = {}) {
  const recent = options.recent || [];
  const counts = archetypeDistribution(recent);
  const hintedId = archetypeHint(article);
  const hinted = BLOG_ARCHETYPES.find((archetype) => archetype.id === hintedId);
  if (hinted && (counts.get(hinted.name) || 0) < 2) return hinted;
  const offset = Number(options.index || 0);
  for (let i = 0; i < BLOG_ARCHETYPES.length; i += 1) {
    const archetype = BLOG_ARCHETYPES[(offset + i) % BLOG_ARCHETYPES.length];
    if ((counts.get(archetype.name) || 0) < 2) return archetype;
  }
  return BLOG_ARCHETYPES[offset % BLOG_ARCHETYPES.length];
}
