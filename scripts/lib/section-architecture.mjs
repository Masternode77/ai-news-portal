import { archetypeById, routeStoryArchetype } from './story-archetype-router.mjs';

const SECTION_VARIANTS = {
  'supply-chain-fault-line': [
    ['Supply Signal', 'Constraint Path', 'Buyer Exposure', 'Procurement Metric'],
    ['What Changed', 'Where Supply Tightens', 'Who Has Leverage', 'What To Watch'],
  ],
  'platform-resilience-note': [
    ['Platform Move', 'Resilience Read', 'Enterprise Exposure', 'Proof Point'],
    ['What Changed', 'Why Platform Teams Care', 'Operating Risk', 'Metric To Watch'],
  ],
  'memory-economics-brief': [
    ['Cost Signal', 'Below The Accelerator Layer', 'Buyer Exposure', 'Planning Metric'],
    ['Memory Move', 'Virtualization Impact', 'Procurement Risk', 'Watch Metric'],
  ],
  'local-siting-risk': [
    ['Local Move', 'Approval Risk', 'Who Is Exposed', 'Decision Point'],
    ['Site Signal', 'Community And Utility Risk', 'Developer Exposure', 'Next Filing'],
  ],
  'power-market-signal': [
    ['Power-Market Move', 'Operating Lever', 'Grid Exposure', 'Metric To Watch'],
    ['What Changed', 'Energy Procurement Read', 'Volatility Risk', 'Next Market Test'],
  ],
  'investor-deal-read': [
    ['Deal Signal', 'Contract Quality', 'Operating Dependency', 'Investor Test'],
    ['Capital Move', 'Demand Evidence', 'Execution Risk', 'Milestone To Watch'],
  ],
  'cloud-product-read': [
    ['Product Move', 'Architecture Impact', 'Buyer Dependency', 'Adoption Signal'],
    ['Cloud Update', 'Platform Implication', 'Migration Risk', 'Usage Metric'],
  ],
  'technical-teardown': [
    ['System Change', 'Bottleneck', 'Engineering Tradeoff', 'Validation Metric'],
    ['Technical Signal', 'Failure Domain', 'Operator Exposure', 'Benchmark To Watch'],
  ],
  'policy-risk-note': [
    ['Policy Move', 'Infrastructure Exposure', 'Who Benefits', 'Watch Item'],
    ['Regulatory Signal', 'Market Access Risk', 'Stakeholder Impact', 'Next Decision'],
  ],
  'market-map': [
    ['The Map', 'Control Points', 'Who Is Exposed', 'Signals To Separate'],
    ['Market Pieces', 'Land Power Capital Chips', 'Demand Test', 'What To Split Out'],
  ],
  'procurement-watch': [
    ['Procurement Signal', 'Supplier Leverage', 'Buyer Exposure', 'Delivery Metric'],
    ['Vendor Move', 'Qualification Risk', 'Capacity Exposure', 'Delivery Proof'],
  ],
  'capacity-constraint-note': [
    ['Capacity Signal', 'Constraint Chain', 'Operating Exposure', 'Next Checkpoint'],
    ['What Changed', 'Where Capacity Binds', 'Who Is Exposed', 'Planning Metric'],
  ],
  'operator-field-note': [
    ['Field Signal', 'Operating Friction', 'Stakeholder Impact', 'Next Check'],
    ['Operator Read', 'Execution Detail', 'Exposure', 'Proof Point'],
  ],
  'architecture-shift': [
    ['Architecture Move', 'Design Implication', 'Migration Risk', 'Adoption Metric'],
    ['Stack Change', 'System Design Read', 'Buyer Exposure', 'Validation Point'],
  ],
  'adjacent-signal': [
    ['Why It Is Adjacent', 'Possible Infrastructure Link', 'Boundary', 'Watch Condition'],
  ],
};

function stableIndex(value = '', modulo = 1) {
  let hash = 0;
  for (const char of String(value || '')) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return modulo ? hash % modulo : 0;
}

export function sectionArchitectureFor(article = {}, archetypeInput = null) {
  const archetype = typeof archetypeInput === 'string'
    ? archetypeById(archetypeInput)
    : archetypeInput || routeStoryArchetype(article);
  const variants = SECTION_VARIANTS[archetype.id] || [archetype.allowedSections || []];
  const selected = variants[stableIndex(`${article.id || ''}|${article.title || ''}|${archetype.id}`, variants.length)] || variants[0];
  return {
    archetype,
    headings: selected,
    heading_sequence_key: selected.join(' > '),
  };
}
