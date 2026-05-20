import { normalizeProperNouns } from './proper-noun-normalizer.mjs';

export const STORY_ARCHETYPES_V2 = [
  {
    id: 'supply-chain-fault-line',
    name: 'Supply Chain Fault Line',
    publicLabel: 'Core Signal',
    editorialLens: 'Supply Chain Risk',
    openingStyle: 'constraint-led',
    allowedSections: ['What changed', 'Where the constraint sits', 'Who has leverage', 'What to watch'],
    forbiddenPhrases: ['turns component availability into a delivery test after'],
    requiredEvidenceFields: ['protagonist', 'concrete_event', 'infrastructure_layer', 'watch_metric'],
    whenToUse: 'Chip, memory, server, packaging, supply allocation, and procurement constraints.',
    exampleGoodDeck: 'HBM allocation is becoming a deployment variable for accelerator buyers.',
    exampleBadDeck: 'Semiconductor Engineering turns component availability into a delivery test after...',
  },
  {
    id: 'platform-resilience-note',
    name: 'Platform Resilience Note',
    publicLabel: 'Core Signal',
    editorialLens: 'Platform Resilience',
    openingStyle: 'operator-led',
    allowedSections: ['The platform move', 'Why operators care', 'Who is exposed', 'Proof point'],
    forbiddenPhrases: ['raises a practical capacity question after'],
    requiredEvidenceFields: ['protagonist', 'concrete_event', 'evidence_anchor', 'watch_metric'],
    whenToUse: 'Enterprise platform, storage, backup, disaster recovery, Kubernetes, and hybrid cloud readiness.',
    exampleGoodDeck: 'NetApp’s OpenShift update turns backup and DR into a platform-readiness issue for enterprise AI workloads.',
    exampleBadDeck: 'StorageReview raises a practical capacity question after...',
  },
  {
    id: 'memory-economics-brief',
    name: 'Memory Economics Brief',
    publicLabel: 'Stack Shift',
    editorialLens: 'Memory Economics',
    openingStyle: 'cost-curve-led',
    allowedSections: ['The cost signal', 'Below the accelerator layer', 'Buyer exposure', 'Planning metric'],
    forbiddenPhrases: ['raises a practical capacity question after'],
    requiredEvidenceFields: ['protagonist', 'concrete_event', 'infrastructure_layer', 'watch_metric'],
    whenToUse: 'DRAM, HBM, virtualization density, VM economics, and memory-driven platform planning.',
    exampleGoodDeck: 'AI memory pricing is starting to hit virtualization planning, not just GPU procurement.',
    exampleBadDeck: 'ServeTheHome raises a practical capacity question after...',
  },
  {
    id: 'local-siting-risk',
    name: 'Local Siting Risk',
    publicLabel: 'Policy Risk',
    editorialLens: 'Local Siting Risk',
    openingStyle: 'place-led',
    allowedSections: ['The local move', 'Approval risk', 'Who carries exposure', 'Decision point'],
    forbiddenPhrases: ['belongs on the board only if'],
    requiredEvidenceFields: ['concrete_event', 'infrastructure_layer', 'watch_metric'],
    whenToUse: 'Permitting, land use, community resistance, utility coordination, and siting approvals.',
    exampleGoodDeck: 'A county siting delay can matter more than announced demand when the grid queue is already tight.',
    exampleBadDeck: 'The project belongs on the board only if...',
  },
  {
    id: 'power-market-signal',
    name: 'Power Market Signal',
    publicLabel: 'Core Signal',
    editorialLens: 'Power Market Signal',
    openingStyle: 'market-mechanism-led',
    allowedSections: ['The power-market move', 'Operating lever', 'Exposure', 'Metric to watch'],
    forbiddenPhrases: ['puts grid timing back into the operating plan after'],
    requiredEvidenceFields: ['protagonist', 'concrete_event', 'infrastructure_layer', 'watch_metric'],
    whenToUse: 'Power trading, grid access, energy procurement, VPP participation, PPAs, and utility constraints.',
    exampleGoodDeck: 'China’s spot power trading experiment gives large data centers a new operating lever.',
    exampleBadDeck: 'Bloomberg Technology puts grid timing back into the operating plan after...',
  },
  {
    id: 'investor-deal-read',
    name: 'Investor Deal Read',
    publicLabel: 'Investor Signal',
    editorialLens: 'Contract Quality',
    openingStyle: 'capital-led',
    allowedSections: ['The deal signal', 'Contract quality', 'Operating dependency', 'Investor test'],
    forbiddenPhrases: ['should read it through'],
    requiredEvidenceFields: ['protagonist', 'concrete_event', 'watch_metric'],
    whenToUse: 'Financing, acquisitions, debt, equity, valuation, project finance, and customer-backed capital formation.',
    exampleGoodDeck: 'A financing round matters only where customer demand, power, and delivery milestones line up.',
    exampleBadDeck: 'Investors should read it through...',
  },
  {
    id: 'cloud-product-read',
    name: 'Cloud Product Read',
    publicLabel: 'Stack Shift',
    editorialLens: 'Cloud Product Read',
    openingStyle: 'product-led',
    allowedSections: ['The product move', 'Architecture impact', 'Buyer dependency', 'Adoption signal'],
    forbiddenPhrases: ['after [source] reported'],
    requiredEvidenceFields: ['protagonist', 'concrete_event', 'infrastructure_layer'],
    whenToUse: 'Cloud services, regions, AI instances, managed databases, platform APIs, and workload migration.',
    exampleGoodDeck: 'A managed database update matters if it changes how AI workloads consume cloud capacity.',
    exampleBadDeck: 'After Google Cloud Blog reported...',
  },
  {
    id: 'technical-teardown',
    name: 'Technical Teardown',
    publicLabel: 'Stack Shift',
    editorialLens: 'Technical Bottleneck',
    openingStyle: 'system-led',
    allowedSections: ['The system change', 'Bottleneck', 'Engineering tradeoff', 'Validation metric'],
    forbiddenPhrases: ['the useful follow-up is'],
    requiredEvidenceFields: ['concrete_event', 'infrastructure_layer', 'watch_metric'],
    whenToUse: 'Hardware, networking, storage, cooling, accelerator systems, and architecture-level constraints.',
    exampleGoodDeck: 'A storage fabric limit changes cluster planning before it shows up in GPU utilization.',
    exampleBadDeck: 'The useful follow-up is...',
  },
  {
    id: 'policy-risk-note',
    name: 'Policy Risk Note',
    publicLabel: 'Policy Risk',
    editorialLens: 'Regulatory Exposure',
    openingStyle: 'policy-led',
    allowedSections: ['The policy move', 'Infrastructure exposure', 'Who benefits', 'Watch item'],
    forbiddenPhrases: ['should read it through'],
    requiredEvidenceFields: ['concrete_event', 'infrastructure_layer', 'watch_metric'],
    whenToUse: 'Regulation, energy policy, tariffs, market access, safety policy, permitting, and siting rules.',
    exampleGoodDeck: 'A grid-cost complaint changes the risk allocation for data center load growth.',
    exampleBadDeck: 'Operators should read it through...',
  },
  {
    id: 'market-map',
    name: 'Market Map',
    publicLabel: 'Deep Dive',
    editorialLens: 'Market Map',
    openingStyle: 'map-led',
    allowedSections: ['The map', 'Control points', 'Who is exposed', 'Signals to separate'],
    forbiddenPhrases: ['single forced capacity thesis'],
    requiredEvidenceFields: ['protagonist', 'concrete_event', 'evidence_anchor'],
    whenToUse: 'Roundups with multiple actors where the useful product is a map of land, power, chips, capital, and demand.',
    exampleGoodDeck: 'A data center roundup should be treated as a market map, not forced into a single capacity thesis.',
    exampleBadDeck: 'Every item points to the same generic bottleneck.',
  },
  {
    id: 'procurement-watch',
    name: 'Procurement Watch',
    publicLabel: 'Operator Alert',
    editorialLens: 'Procurement Risk',
    openingStyle: 'buyer-led',
    allowedSections: ['The procurement signal', 'Supplier leverage', 'Buyer exposure', 'Delivery metric'],
    forbiddenPhrases: ['confirms timing, site readiness, buyer commitment, or operating impact'],
    requiredEvidenceFields: ['concrete_event', 'watch_metric'],
    whenToUse: 'Supplier capacity, delivery schedules, vendor leverage, component qualification, and equipment queues.',
    exampleGoodDeck: 'Procurement teams need delivery evidence before treating the update as usable capacity.',
    exampleBadDeck: 'The next disclosure confirms timing, site readiness, buyer commitment, or operating impact.',
  },
  {
    id: 'capacity-constraint-note',
    name: 'Capacity Constraint Note',
    publicLabel: 'Operator Alert',
    editorialLens: 'Capacity Constraint',
    openingStyle: 'constraint-led',
    allowedSections: ['The capacity signal', 'Constraint chain', 'Operating exposure', 'Next checkpoint'],
    forbiddenPhrases: ['raises a practical capacity question after'],
    requiredEvidenceFields: ['concrete_event', 'infrastructure_layer', 'watch_metric'],
    whenToUse: 'Capacity queues, deployment readiness, facility constraints, cloud supply, and power/cooling bottlenecks.',
    exampleGoodDeck: 'A capacity claim is only useful once power, equipment, and workload timing are visible.',
    exampleBadDeck: 'The source raises a practical capacity question after...',
  },
  {
    id: 'operator-field-note',
    name: 'Operator Field Note',
    publicLabel: 'Operator Alert',
    editorialLens: 'Operating Readiness',
    openingStyle: 'field-led',
    allowedSections: ['Field signal', 'Operating friction', 'Stakeholder impact', 'Next check'],
    forbiddenPhrases: ['still has to show that the reported change can survive real deployment'],
    requiredEvidenceFields: ['concrete_event', 'watch_metric'],
    whenToUse: 'Practical data center, platform, utility, and enterprise operating issues.',
    exampleGoodDeck: 'The update matters where it changes day-two operating work, not announcement volume.',
    exampleBadDeck: 'The company still has to show that the reported change can survive real deployment.',
  },
  {
    id: 'architecture-shift',
    name: 'Architecture Shift',
    publicLabel: 'Stack Shift',
    editorialLens: 'Architecture Shift',
    openingStyle: 'architecture-led',
    allowedSections: ['Architecture move', 'Design implication', 'Migration risk', 'Adoption metric'],
    forbiddenPhrases: ['the useful follow-up is'],
    requiredEvidenceFields: ['concrete_event', 'infrastructure_layer', 'watch_metric'],
    whenToUse: 'System design, interconnect, storage, platform, networking, and workload architecture changes.',
    exampleGoodDeck: 'The architecture signal is whether the platform changes where data and compute have to sit.',
    exampleBadDeck: 'The useful follow-up is the next...',
  },
  {
    id: 'adjacent-signal',
    name: 'Adjacent Signal',
    publicLabel: 'Adjacent Signal',
    editorialLens: 'Adjacent Watchlist',
    openingStyle: 'watchlist-led',
    allowedSections: ['Why it is adjacent', 'Infrastructure link', 'Boundary', 'Watch condition'],
    forbiddenPhrases: ['should read it through'],
    requiredEvidenceFields: ['protagonist', 'concrete_event'],
    whenToUse: 'AI business, app, model, or software stories that may touch infrastructure later but do not yet clear the core bar.',
    exampleGoodDeck: 'A legal AI rollout belongs on the adjacent watchlist unless it changes enterprise platform deployment.',
    exampleBadDeck: 'A legal AI rollout is an infrastructure signal because it uses AI.',
  },
  {
    id: 'archive-only',
    name: 'Archive Only',
    publicLabel: 'Adjacent Signal',
    editorialLens: 'Archive Only',
    openingStyle: 'none',
    allowedSections: [],
    forbiddenPhrases: [],
    requiredEvidenceFields: [],
    whenToUse: 'Stories outside the Compute Current product boundary.',
    exampleGoodDeck: 'Archive the item when it does not name an infrastructure layer.',
    exampleBadDeck: 'Force the item into Technical Bottlenecks.',
  },
];

export function archetypeById(id = '') {
  return STORY_ARCHETYPES_V2.find((item) => item.id === id) || STORY_ARCHETYPES_V2[0];
}

function textBundle(article = {}) {
  return normalizeProperNouns([
    article.title,
    article.source,
    article.summary,
    article.snippet,
    article.articleText,
    article.contentText,
    article.primary_category,
    article.secondary_category,
    article.infrastructure_layer,
    article.article_type,
    article.region,
    ...(article.tags || []),
  ].filter(Boolean).map((value) => String(value).slice(0, 2200)).join(' ')).toLowerCase();
}

export function routeStoryArchetype(article = {}) {
  const text = textBundle(article);

  if (/(dinosaur|fossil|stegosaurus|skeleton)/i.test(text)) return archetypeById('archive-only');
  if (/(sports ai|football|sūmersports|sumersports|paul tudor jones)/i.test(text)) return archetypeById('adjacent-signal');
  if (/(legal industry|legal professionals|law firm|lawyer|claude chatbot)/i.test(text) && !/(cloud|platform|infrastructure|deployment|data center|storage|network|compute)/i.test(text)) {
    return archetypeById('adjacent-signal');
  }
  if (/(land and expand|roundup|week in review|market map|nvidia, iren|coatue|switch|core scientific)/i.test(text)) return archetypeById('market-map');
  if (/(spot power|power trading|virtual power plant|electricity spot|grid|utility|ppa|interconnection)/i.test(text)) return archetypeById('power-market-signal');
  if (/(netapp|openshift|red hat)/i.test(text)) return archetypeById('platform-resilience-note');
  if (/(memory pricing|dram|hbm|proxmox|kvm|hyper-v|nutanix|xcp-ng|virtualization|vm density)/i.test(text)) return archetypeById('memory-economics-brief');
  if (/(backup|disaster recovery|kubernetes|hybrid cloud|data management)/i.test(text)) return archetypeById('platform-resilience-note');
  if (/(funding|financing|debt|equity|valuation|ipo|acquisition|m&a|joint venture|capital)/i.test(text)) return archetypeById('investor-deal-read');
  if (/(permit|siting|zoning|regulation|policy|approval|ratepayer|market access|tariff)/i.test(text)) return archetypeById('policy-risk-note');
  if (/(gpu|accelerator|semiconductor|chip|server|network|ethernet|infiniband|storage|ssd|nvme|cooling|thermal)/i.test(text)) return archetypeById('technical-teardown');
  if (/(cloud|availability zone|region|instance|managed database|platform api)/i.test(text)) return archetypeById('cloud-product-read');
  if (/(capacity|facility|data center|datacenter|campus|deployment|construction)/i.test(text)) return archetypeById('capacity-constraint-note');
  return archetypeById('operator-field-note');
}
