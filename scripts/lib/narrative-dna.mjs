import {
  BANNED_PHRASES,
  bannedPhraseMatches,
  hookStartsWithBlockedPhrase,
  hasBannedPhrase,
} from './banned-phrases.mjs';
import { sanitizeGeneratedText, truncate, unique } from './normalize.mjs';

export const GENERATION_VERSION = 'narrative_dna_v1';

export const BRIEF_LABELS = [
  'Operator Note',
  'Investor Read',
  'Policy Signal',
  'Technical Read',
  'Supply Chain Watch',
  'Field Note',
  'Market Structure',
  'Deployment Risk',
  "Skeptic's Read",
  'Capacity Implication',
];

export const STORY_ARCHETYPES = [
  {
    id: 'board-memo',
    name: 'Board Memo',
    signals: ['capital', 'investor', 'strategy', 'governance'],
    headings: ['Decision Context', 'Board-Level Exposure', 'Next Proof Point'],
  },
  {
    id: 'operator-field-note',
    name: 'Operator Field Note',
    signals: ['operator', 'facility', 'deployment', 'site'],
    headings: ['Field Signal', 'Execution Friction', 'Operating Watch'],
  },
  {
    id: 'investor-deal-read',
    name: 'Investor Deal Read',
    signals: ['funding', 'financing', 'debt', 'equity', 'acquisition', 'valuation'],
    headings: ['Deal Signal', 'Contract Quality', 'Capital Risk'],
  },
  {
    id: 'technical-teardown',
    name: 'Technical Teardown',
    signals: ['technical', 'architecture', 'network', 'cooling', 'chip', 'gpu'],
    headings: ['Architecture Signal', 'System Constraint', 'Engineering Watch'],
  },
  {
    id: 'supply-chain-fault-line',
    name: 'Supply Chain Fault Line',
    signals: ['supply', 'lead time', 'procurement', 'shortage', 'memory', 'hbm'],
    headings: ['Supply Signal', 'Constraint Path', 'Procurement Watch'],
  },
  {
    id: 'policy-risk-flash',
    name: 'Policy Risk Flash',
    signals: ['policy', 'regulation', 'approval', 'permit', 'tariff'],
    headings: ['Policy Move', 'Exposure Map', 'Regulatory Watch'],
  },
  {
    id: 'local-resistance-watch',
    name: 'Local Resistance Watch',
    signals: ['local', 'community', 'zoning', 'siting', 'moratorium'],
    headings: ['Local Signal', 'Siting Constraint', 'Approval Risk'],
  },
  {
    id: 'capital-allocation-memo',
    name: 'Capital Allocation Memo',
    signals: ['capex', 'capital expenditure', 'budget', 'bond', 'project finance'],
    headings: ['Capital Signal', 'Allocation Tradeoff', 'Financing Watch'],
  },
  {
    id: 'stack-shift-explainer',
    name: 'Stack Shift Explainer',
    signals: ['platform', 'cloud', 'software', 'stack', 'kubernetes'],
    headings: ['Stack Shift', 'Buyer Impact', 'Platform Watch'],
  },
  {
    id: 'procurement-watch',
    name: 'Procurement Watch',
    signals: ['procurement', 'supplier', 'vendor', 'equipment', 'server'],
    headings: ['Procurement Signal', 'Vendor Leverage', 'Delivery Watch'],
  },
  {
    id: 'skeptics-take',
    name: "Skeptic's Take",
    signals: ['claim', 'target', 'plan', 'announced', 'ambition'],
    headings: ['Claim', 'What Still Has To Prove Out', 'Watch Item'],
  },
  {
    id: 'second-order-effect',
    name: 'Second-Order Effect',
    signals: ['indirect', 'ecosystem', 'knock-on', 'spillover'],
    headings: ['First Move', 'Second-Order Effect', 'Monitor'],
  },
  {
    id: 'what-breaks-first',
    name: 'What Breaks First',
    signals: ['bottleneck', 'constraint', 'delay', 'risk', 'queue'],
    headings: ['Stress Point', 'Likely Failure Mode', 'Next Check'],
  },
  {
    id: 'winner-loser-map',
    name: 'Winner / Loser Map',
    signals: ['benefit', 'exposed', 'leverage', 'competition'],
    headings: ['Who Gains', 'Who Gets Squeezed', 'Market Watch'],
  },
  {
    id: 'timeline-risk-note',
    name: 'Timeline Risk Note',
    signals: ['timeline', 'schedule', 'delivery', 'milestone', 'construction'],
    headings: ['Timing Signal', 'Schedule Risk', 'Milestone To Watch'],
  },
  {
    id: 'architecture-implication',
    name: 'Architecture Implication',
    signals: ['architecture', 'fabric', 'interconnect', 'memory', 'inference'],
    headings: ['Architecture Move', 'Design Implication', 'Adoption Watch'],
  },
];

function clean(value = '') {
  return sanitizeGeneratedText(String(value || '').replace(/\s+/g, ' ').trim());
}

function cleanBlock(value = '') {
  return sanitizeGeneratedText(String(value || ''))
    .split(/\n{2,}/)
    .map((part) => part.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

function textBundle(article = {}) {
  return [
    article.title,
    article.source,
    article.summary,
    article.snippet,
    article.articleText,
    article.category,
    article.primary_category,
    article.secondary_category,
    article.infrastructure_layer,
    article.article_type,
    article.region,
    ...(article.tags || []),
  ].filter(Boolean).join(' ');
}

function firstUseful(values = [], fallback = '') {
  return values.map(clean).find((value) => value && value.length >= 3) || fallback;
}

function sourceSpecificSignal(values = [], fallback = '') {
  return values
    .map(clean)
    .map((value) => value.replace(/^watch\s+/i, ''))
    .find((value) =>
      value &&
      value.length >= 8 &&
      !/customer commitments,\s*infrastructure readiness/i.test(value) &&
      !/power,\s*cooling,\s*silicon supply,\s*or permitting/i.test(value) &&
      !/next disclosed milestone,\s*customer commitment,\s*or deployment date/i.test(value)
    ) || fallback;
}

function selectArchetype(article = {}) {
  const haystack = textBundle(article).toLowerCase();
  const explicit = String(article.story_archetype || article.narrative_dna?.story_archetype || '').toLowerCase();
  const byExplicit = STORY_ARCHETYPES.find((item) => item.name.toLowerCase() === explicit || item.id === explicit);
  if (byExplicit) return byExplicit;

  let best = STORY_ARCHETYPES[0];
  let bestScore = -1;
  for (const archetype of STORY_ARCHETYPES) {
    const score = archetype.signals.filter((signal) => haystack.includes(signal)).length;
    if (score > bestScore) {
      best = archetype;
      bestScore = score;
    }
  }
  return best;
}

function chooseBriefLabel(article = {}, dna = {}) {
  const haystack = textBundle(article).toLowerCase();
  if (/(policy|permit|regulation|approval|zoning|tariff)/.test(haystack)) return 'Policy Signal';
  if (/(funding|financing|debt|equity|bond|valuation|acquisition|capex)/.test(haystack)) return 'Investor Read';
  if (/(cooling|gpu|chip|network|architecture|fabric|memory|hbm|technical)/.test(haystack)) return 'Technical Read';
  if (/(supply|procurement|lead time|vendor|supplier|shortage)/.test(haystack)) return 'Supply Chain Watch';
  if (/(power|grid|facility|campus|operator|deployment|interconnection)/.test(haystack)) return 'Operator Note';
  if (/(risk|delay|queue|constraint|bottleneck)/.test(haystack)) return 'Deployment Risk';
  if (/market|pricing|competition|structure/.test(haystack)) return 'Market Structure';
  if (dna.counterpoint) return "Skeptic's Read";
  return 'Capacity Implication';
}

function inferReaderRole(article = {}) {
  const stakeholders = article.affected_stakeholders || [];
  return firstUseful(stakeholders, 'infrastructure operators');
}

function inferTimeHorizon(article = {}) {
  const haystack = textBundle(article).toLowerCase();
  if (/(today|now|immediate|outage|pause|blocked|approval|deadline)/.test(haystack)) return 'near term';
  if (/(quarter|months|construction|delivery|procurement|deployment)/.test(haystack)) return 'next few quarters';
  if (/(2030|decade|roadmap|nuclear|transmission|campus)/.test(haystack)) return 'multi-year buildout';
  return 'next planning cycle';
}

function inferHookStyle(article = {}, archetype = STORY_ARCHETYPES[0]) {
  const haystack = textBundle(article).toLowerCase();
  if (/(risk|delay|blocked|constraint|bottleneck)/.test(haystack)) return 'constraint-first';
  if (/(funding|financing|deal|acquisition|capital)/.test(haystack)) return 'capital-first';
  if (/(technical|architecture|chip|gpu|cooling|network)/.test(haystack)) return 'system-first';
  if (/(policy|permit|regulation|zoning)/.test(haystack)) return 'risk-first';
  return archetype.id === 'skeptics-take' ? 'skeptical' : 'source-first';
}

function stableIndex(value = '', modulo = 1) {
  const text = String(value || '');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33 + text.charCodeAt(index)) >>> 0;
  }
  return modulo ? hash % modulo : 0;
}

export function extractNarrativeDNA(article = {}) {
  const insight = article.expert_insight || article.expertInsight || {};
  const companies = Array.isArray(insight.named_companies) ? insight.named_companies.filter(Boolean) : [];
  const facts = Array.isArray(insight.concrete_facts) ? insight.concrete_facts.filter(Boolean) : [];
  const archetype = selectArchetype(article);
  const protagonist = firstUseful([
    companies[0],
    article.source,
    clean(article.title || '').split(/\s+(?:to|adds|expands|launches|faces|targets|plans)\s+/i)[0],
  ], article.source || 'The source');
  const antagonist = firstUseful([
    insight.bottleneck_type,
    article.bottleneck_type,
    article.secondary_category,
    article.infrastructure_layer,
  ], 'execution risk');
  const evidenceAnchor = firstUseful([
    facts[0],
    article.summary,
    article.snippet,
    article.articleText,
    article.title,
  ], article.title || 'the reported change');
  const counterpoint = firstUseful([
    insight.counterargument,
    article.counterargument,
  ], `${protagonist} still has to show that the reported change can survive real deployment, financing, or operating constraints.`);
  const nextSignal = sourceSpecificSignal([
    insight.next_observable_signal,
    article.next_observable_signal,
    article.expertLensFull?.watchNext,
  ], `the next ${protagonist} disclosure that confirms timing, site readiness, buyer commitment, or operating impact`);

  const dna = {
    protagonist,
    antagonist_or_constraint: antagonist,
    core_tension: `${protagonist} has to turn ${clean(evidenceAnchor).toLowerCase()} into a usable infrastructure outcome despite ${clean(antagonist).toLowerCase()}.`,
    reader_role: inferReaderRole(article),
    infrastructure_layer: article.infrastructure_layer || insight.infrastructure_layer || 'AI infrastructure',
    time_horizon: inferTimeHorizon(article),
    story_archetype: archetype.name,
    story_archetype_id: archetype.id,
    hook_style: inferHookStyle(article, archetype),
    evidence_anchor: truncate(evidenceAnchor, 360),
    counterpoint: truncate(counterpoint, 280),
    next_observable_signal: truncate(nextSignal, 240),
    brief_label: chooseBriefLabel(article, { counterpoint }),
    headings: archetype.headings,
  };

  return dna;
}

function sentence(value = '') {
  const cleaned = clean(value).replace(/[.]+$/, '');
  return cleaned ? `${cleaned}.` : '';
}

function layerVerb(layer = '') {
  const lower = String(layer || '').toLowerCase();
  if (lower.includes('power')) return 'puts grid timing back into the operating plan';
  if (lower.includes('cooling')) return 'moves thermal design from engineering detail to deployment risk';
  if (lower.includes('silicon') || lower.includes('compute')) return 'turns component availability into a delivery test';
  if (lower.includes('capital')) return 'asks whether financing can keep pace with build obligations';
  if (lower.includes('policy')) return 'moves the constraint into approvals and market access';
  return 'raises a practical capacity question';
}

export function buildNarrativeHook(article = {}, dna = extractNarrativeDNA(article), recentHooks = []) {
  const candidates = [
    `${dna.protagonist} ${layerVerb(dna.infrastructure_layer)} after ${clean(dna.evidence_anchor).toLowerCase()}`,
    `${dna.evidence_anchor} That gives ${dna.reader_role} a ${dna.time_horizon} test around ${dna.antagonist_or_constraint}.`,
    `${dna.protagonist} is no longer just announcing a move; the harder proof is ${dna.next_observable_signal}.`,
    `${dna.infrastructure_layer} is the useful lens on ${article.title || 'this report'} because ${dna.antagonist_or_constraint} decides how quickly the plan becomes usable capacity.`,
  ].map((item) => truncate(sentence(item), 260));

  const recentStarts = new Set(
    recentHooks.map((hook) => clean(hook).split(/\s+/).slice(0, 12).join(' ').toLowerCase())
  );

  for (const candidate of candidates) {
    const start = clean(candidate).split(/\s+/).slice(0, 12).join(' ').toLowerCase();
    if (!candidate || hookStartsWithBlockedPhrase(candidate) || hasBannedPhrase(candidate) || recentStarts.has(start)) continue;
    return candidate;
  }

  return `${dna.protagonist} gives ${dna.reader_role} a fresh ${dna.infrastructure_layer.toLowerCase()} signal to verify against ${dna.next_observable_signal}.`;
}

export function buildDynamicBrief(article = {}, dna = extractNarrativeDNA(article)) {
  const lines = [
    sentence(dna.evidence_anchor),
    sentence(`${dna.reader_role} should read it through ${dna.antagonist_or_constraint}, ${dna.time_horizon} execution, and the ${dna.infrastructure_layer} layer`),
    sentence(`The useful follow-up is ${dna.next_observable_signal}`),
  ].map((line) => truncate(line, 220)).filter(Boolean);

  return {
    label: dna.brief_label,
    lines,
  };
}

function bodyParagraphs(article = {}, dna = extractNarrativeDNA(article), recentHooks = []) {
  const hook = buildNarrativeHook(article, dna, recentHooks);
  const brief = buildDynamicBrief(article, dna);
  const insight = article.expert_insight || article.expertInsight || {};
  const companies = Array.isArray(insight.named_companies) ? insight.named_companies.filter(Boolean).slice(0, 3) : [];
  const facts = Array.isArray(insight.concrete_facts) ? insight.concrete_facts.filter(Boolean).slice(0, 2) : [];
  const factLine = [
    companies.length ? `Named companies: ${companies.join(', ')}` : '',
    facts.length ? `Source facts: ${facts.join(' ')}` : '',
  ].filter(Boolean).join('. ');
  const riskLine = [
    insight.bottleneck_type ? `Bottleneck type: ${String(insight.bottleneck_type).replace(/_/g, ' ')}` : '',
    insight.who_gains_leverage ? `Leverage moves toward ${insight.who_gains_leverage}` : '',
    insight.who_takes_execution_risk ? `Execution risk sits with ${insight.who_takes_execution_risk}` : '',
    insight.timing_dependency ? `Timing depends on ${insight.timing_dependency}` : '',
  ].filter(Boolean).join('. ');
  const seed = stableIndex(`${article.id || ''}|${article.title || ''}|${dna.story_archetype}`, 4);
  const actorLine = [
    `${dna.protagonist} is the actor named by the source; ${dna.antagonist_or_constraint} is the limiting condition that decides whether the update becomes usable capacity`,
    `${dna.evidence_anchor} For ${dna.reader_role}, the practical read is the effect on ${dna.infrastructure_layer} planning over the ${dna.time_horizon} window`,
    `${dna.story_archetype} is the right frame because the source points to ${dna.antagonist_or_constraint}, not just another broad AI demand claim`,
    `${dna.protagonist} now gives ${dna.reader_role} a source-backed signal to test against the ${dna.infrastructure_layer} layer`,
  ][seed];
  const exposureLine = [
    `${dna.reader_role} are exposed if ${dna.antagonist_or_constraint} slows procurement, deployment sequencing, or operating readiness`,
    `Leverage shifts only if the reported move survives the counterpoint: ${dna.counterpoint}`,
    `The useful distinction is between announcement value and operating value; ${dna.counterpoint}`,
    `The constraint gives the story its shape because ${dna.reader_role} cannot treat ${dna.infrastructure_layer} as abstract capacity`,
  ][seed];
  const watchLine = [
    `The next observable signal is ${dna.next_observable_signal}`,
    `Judge the story by ${dna.next_observable_signal}, not by the size of the announced ambition`,
    `The follow-up that matters is ${dna.next_observable_signal} within the ${dna.time_horizon} window`,
    `${dna.protagonist}'s next proof point is ${dna.next_observable_signal}`,
  ][seed];

  return [
    hook,
    `${dna.headings[0]}\n\n${sentence(actorLine)} ${sentence(factLine || dna.evidence_anchor)}`,
    `${dna.headings[1]}\n\n${sentence(exposureLine)} ${sentence(riskLine || dna.counterpoint)}`,
    `${brief.label}\n\n${brief.lines.join(' ')}`,
    `${dna.headings[2]}\n\n${sentence(watchLine)} ${sentence(`${article.title || dna.protagonist} belongs on the board only if that proof point changes decisions for ${dna.reader_role} in ${article.region || 'the affected market'}`)}`,
  ];
}

export function buildNarrativeArticleBody(article = {}, options = {}) {
  const dna = options.narrativeDNA || extractNarrativeDNA(article);
  const paragraphs = bodyParagraphs(article, dna, options.recentHooks || [])
    .map((paragraph) => cleanBlock(paragraph))
    .filter(Boolean);
  let body = paragraphs.join('\n\n');

  if (body.length < 900) {
    body = [
      body,
      sentence(`${article.source || 'The source'} gives enough detail to track the decision, but not enough to declare which side captures the economics`),
    ].join('\n\n');
  }

  const matches = bannedPhraseMatches(body);
  if (Object.keys(matches).length) {
    for (const phrase of BANNED_PHRASES) {
      body = body.replace(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
    }
  }

  return body.replace(/\n{3,}/g, '\n\n').trim();
}

export function buildNarrativeLensFields(article = {}, options = {}) {
  const dna = extractNarrativeDNA(article);
  const brief = buildDynamicBrief(article, dna);
  const hook = buildNarrativeHook(article, dna, options.recentHooks || []);
  const body = buildNarrativeArticleBody(article, { narrativeDNA: dna, recentHooks: options.recentHooks || [] });

  return {
    generation_version: GENERATION_VERSION,
    narrative_dna: dna,
    dynamicBriefLabel: brief.label,
    executiveSummary: brief.lines,
    thesis: truncate(hook, 160),
    whatHappened: truncate(sentence(dna.evidence_anchor), 500),
    whyThisMatters: truncate(sentence(dna.core_tension), 500),
    marketMissing: truncate(sentence(dna.counterpoint), 500),
    investors: truncate(sentence(`${dna.reader_role} should test whether ${dna.next_observable_signal} confirms the operating case`), 500),
    operators: truncate(sentence(`${dna.infrastructure_layer} teams need to resolve ${dna.antagonist_or_constraint} within the ${dna.time_horizon} window`), 500),
    hyperscalers: truncate(sentence(`Cloud buyers should track whether the plan changes supplier dependence, regional timing, or deployment sequencing`), 500),
    watchNext: truncate(sentence(dna.next_observable_signal), 500),
    finalHeadline: truncate(article.title || hook, 120),
    metaDescription: truncate(hook, 170),
    finalArticleBody: body,
  };
}
