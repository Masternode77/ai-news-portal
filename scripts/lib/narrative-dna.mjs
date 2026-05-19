import { guardPublicCopy } from './copy-quality-guard.mjs';
import { generateEditorialExcerpt } from './editorial-excerpt-generator.mjs';
import { extractNamedCompanies } from './expert-insight-engine.mjs';
import { normalizeProperNouns } from './proper-noun-normalizer.mjs';
import { routePublicLane } from './public-lane-router.mjs';
import { sectionArchitectureFor } from './section-architecture.mjs';
import { routeStoryArchetype, STORY_ARCHETYPES_V2 } from './story-archetype-router.mjs';
import { detectTruncationArtifacts, isTruncatedEvidence } from './truncation-detector.mjs';
import { sanitizeGeneratedText, unique } from './normalize.mjs';

export const GENERATION_VERSION = 'editorial_surface_v2';
export const BRIEF_LABELS = [
  'Core Signal',
  'Watchlist',
  'Adjacent Signal',
  'Deep Dive',
  'Operator Alert',
  'Investor Signal',
  'Policy Risk',
  'Stack Shift',
];
export const STORY_ARCHETYPES = STORY_ARCHETYPES_V2;

function compact(value = '') {
  return normalizeProperNouns(
    sanitizeGeneratedText(String(value || ''))
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      .trim()
  );
}

function sentence(value = '') {
  const cleaned = compact(value).replace(/[.!?]+$/, '');
  if (!cleaned) return '';
  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}.`;
}

function limitClean(value = '', maxLen = 180) {
  const cleaned = compact(value).replace(/(?:…|\.{3}).*$/g, '');
  if (cleaned.length <= maxLen) return cleaned;
  const clipped = cleaned.slice(0, maxLen).replace(/\s+\S*$/, '').replace(/[,:;/-]+$/, '').trim();
  return clipped || cleaned.slice(0, maxLen).trim();
}

function completeSentenceExcerpt(value = '', maxLen = 260) {
  const cleaned = compact(value).replace(/(?:…|\.{3}).*$/g, '');
  const sentences = cleaned.match(/[^.!?]+[.!?]/g) || [];
  const picked = [];
  let length = 0;
  for (const raw of sentences) {
    const sentenceText = compact(raw);
    if (sentenceText.length < 18) continue;
    if (detectTruncationArtifacts(sentenceText).ok === false) continue;
    if (length && length + sentenceText.length + 1 > maxLen) break;
    if (!length && sentenceText.length > maxLen) continue;
    picked.push(sentenceText);
    length += sentenceText.length + 1;
  }
  return picked.join(' ').trim();
}

function textBundle(article = {}) {
  return compact([
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
  ].filter(Boolean).join(' '));
}

function indefiniteArticle(value = '') {
  return /^[aeiou]/i.test(String(value || '').trim()) ? 'an' : 'a';
}

function firstUseful(values = [], fallback = '') {
  return values
    .map(compact)
    .find((value) => value && value.length >= 3) || fallback;
}

function readerRoles(article = {}) {
  const stakeholders = Array.isArray(article.affected_stakeholders)
    ? article.affected_stakeholders
    : [];
  const roles = stakeholders.map(compact).filter(Boolean).slice(0, 4);
  if (roles.length) return roles;
  const text = textBundle(article).toLowerCase();
  if (/power|grid|utility/.test(text)) return ['Operators', 'Utilities', 'Energy buyers'];
  if (/funding|financing|capital|valuation/.test(text)) return ['Investors', 'Developers', 'Cloud buyers'];
  if (/openshift|kubernetes|storage|backup|virtualization/.test(text)) return ['Platform teams', 'Enterprise IT', 'Cloud architects'];
  return ['Operators', 'Capacity planners'];
}

function timeHorizon(article = {}) {
  const text = textBundle(article).toLowerCase();
  if (/(today|now|first time|spot|outage|blocked|pause|deadline)/.test(text)) return 'near term';
  if (/(quarter|months|delivery|procurement|deployment|backup|pricing)/.test(text)) return 'next few quarters';
  if (/(2030|2027|decade|roadmap|construction|campus|transmission)/.test(text)) return 'multi-year buildout';
  return 'next planning cycle';
}

function concreteEvent(article = {}) {
  const title = compact(article.title || '');
  const summary = compact(article.summary || article.snippet || '');
  const text = textBundle(article);
  if (/NetApp/i.test(text) && /OpenShift/i.test(text)) return 'NetApp expanded OpenShift data management with faster VM backup, DR, and cloud-scale support';
  if (/memory pricing/i.test(text)) return 'AI memory pricing is pushing into virtualization planning across Proxmox, KVM, Hyper-V, Nutanix, and XCP-ng estates';
  if (/spot power trading|electricity spot/i.test(text)) return 'large data centers in China joined electricity spot trading through virtual power plant participation';
  if (/Land and Expand/i.test(text)) return 'a Data Center Frontier roundup grouped NVIDIA, IREN, Coatue, Microsoft, Switch, Cerebras, and Core Scientific into one market view';
  return firstUseful([
    completeSentenceExcerpt(article.articleText, 220),
    completeSentenceExcerpt(article.contentText, 220),
    completeSentenceExcerpt(summary, 220),
    title,
  ], title || 'the source reported a new infrastructure signal');
}

function evidenceAnchor(article = {}) {
  const insight = article.expert_insight || article.expertInsight || {};
  const facts = Array.isArray(insight.concrete_facts) ? insight.concrete_facts : [];
  const candidates = [
    facts[0],
    article.articleText,
    article.contentText,
    article.summary,
    article.snippet,
    article.title,
  ];
  const value = candidates
    .map((candidate) => completeSentenceExcerpt(candidate, 380))
    .find((candidate) => candidate && candidate.length >= 40)
    || firstUseful([article.title], article.title || '');
  return value;
}

function protagonist(article = {}) {
  const insight = article.expert_insight || article.expertInsight || {};
  const named = unique([
    ...(Array.isArray(insight.named_companies) ? insight.named_companies : []),
    ...extractNamedCompanies(textBundle(article)),
  ]).map(compact).filter(Boolean);
  if (named.length) return named[0];
  const title = compact(article.title || '');
  const beforeVerb = title.split(/\s+(?:adds|expands|launches|raises|plans|taps|uses|moves|announces|backs|buys|warns|faces|opens|secures|tests|updates)\s+/i)[0];
  if (beforeVerb && beforeVerb.length <= 72) return beforeVerb;
  return article.source || 'The source';
}

function infrastructureLayer(article = {}, route = routePublicLane(article), archetype = routeStoryArchetype(article)) {
  const layer = compact(article.infrastructure_layer || article.expert_insight?.infrastructure_layer || '');
  if (layer && !/^compute$/i.test(layer)) return layer;
  if (/memory/i.test(archetype.editorialLens)) return 'Memory';
  if (/power/i.test(archetype.editorialLens)) return 'Power';
  if (/platform|resilience/i.test(archetype.editorialLens)) return 'Enterprise Platform Infrastructure';
  if (route.visibility === 'adjacent') return 'Adjacent AI application layer';
  return archetype.editorialLens || 'AI infrastructure';
}

function counterpointFor(article = {}, dnaSeed = {}) {
  const insight = article.expert_insight || article.expertInsight || {};
  const sourceCounter = compact(insight.counterargument || article.counterargument || '');
  if (sourceCounter && !/still has to show|reported change can survive/i.test(sourceCounter)) {
    return limitClean(sourceCounter, 260);
  }
  const layer = dnaSeed.infrastructure_layer || article.infrastructure_layer || 'infrastructure';
  const event = dnaSeed.concrete_event || concreteEvent(article);
  if (/adjacent/i.test(layer)) {
    return 'The source does not yet connect the AI use case to compute, cloud capacity, data center, power, cooling, storage, or network decisions';
  }
  if (/market map/i.test(dnaSeed.editorial_lens || '')) {
    return `${event} should be separated by control point before readers treat the source as one capacity thesis`;
  }
  return `${event} only changes decisions if the ${String(layer).toLowerCase()} evidence is specific enough to affect timing, procurement, or operating plans`;
}

function watchMetricFor(article = {}, route = routePublicLane(article), archetype = routeStoryArchetype(article)) {
  const text = textBundle(article);
  const insight = article.expert_insight || article.expertInsight || {};
  const sourceSignal = compact(insight.next_observable_signal || article.next_observable_signal || '');
  if (
    sourceSignal &&
    !/next .* disclosure|timing, site readiness, buyer commitment|operating impact|execution details/i.test(sourceSignal)
  ) {
    return limitClean(sourceSignal, 220);
  }
  if (/NetApp/i.test(text) && /OpenShift/i.test(text)) return 'restore-time evidence, DR failover validation, and cross-environment OpenShift adoption';
  if (/memory pricing/i.test(text)) return 'VM density, memory cost per host, and swap or performance pressure across enterprise virtualization estates';
  if (/spot power trading|electricity spot|virtual power plant/i.test(text)) return 'spot-market participation, volatility exposure, and predictable energy-cost savings for large data centers';
  if (/Land and Expand/i.test(text)) return 'which named actor controls land, power, capital, chips, or contracted customer demand';
  if (/Chip Industry Week in Review/i.test(text)) return 'HBM availability, export-control impact, packaging capacity, and funded fab or equipment milestones';
  if (/Anthropic/i.test(text) && /legal/i.test(text)) return 'enterprise deployment evidence that changes cloud, security, or platform architecture, not legal-seat adoption alone';
  if (/sports ai|football|S[ūu]merSports|Paul Tudor/i.test(text)) return 'evidence that the product changes infrastructure purchasing rather than sports analytics adoption';
  if (route.visibility === 'adjacent') return 'a concrete infrastructure dependency named by the next source update';
  return `${archetype.editorialLens.toLowerCase()} evidence tied to a named customer, deployment milestone, cost metric, or operating constraint`;
}

function isGenericWatchMetric(value = '') {
  return !value ||
    /next .* disclosure/i.test(value) ||
    /timing, site readiness, buyer commitment/i.test(value) ||
    /operating impact/i.test(value) ||
    /execution details/i.test(value) ||
    /evidence tied to a named customer, deployment milestone, cost metric, or operating constraint/i.test(value) ||
    /concrete infrastructure dependency named by the next source update/i.test(value) ||
    value.length < 24;
}

export function extractNarrativeDNA(article = {}) {
  const route = routePublicLane(article);
  const archetype = routeStoryArchetype(article);
  const event = concreteEvent(article);
  const anchor = evidenceAnchor(article);
  const actor = protagonist(article);
  const layer = infrastructureLayer(article, route, archetype);
  const roles = readerRoles(article);
  const lens = route.editorial_lens || archetype.editorialLens;
  const watchMetric = watchMetricFor(article, route, archetype);
  const seed = {
    concrete_event: event,
    infrastructure_layer: layer,
    editorial_lens: lens,
  };
  const dna = {
    protagonist: actor,
    concrete_event: event,
    core_tension: `${actor} has to translate ${event.toLowerCase()} into ${indefiniteArticle(layer)} ${String(layer).toLowerCase()} decision that survives cost, timing, or operating constraints`,
    infrastructure_layer: layer,
    reader_role: roles,
    decision_relevance: `${roles.slice(0, 2).join(' and ')} can use the item to test ${lens.toLowerCase()} before changing procurement, deployment, or risk assumptions`,
    evidence_anchor: anchor,
    counterpoint: counterpointFor(article, seed),
    watch_metric: watchMetric,
    time_horizon: timeHorizon(article),
    public_signal_label: route.public_signal_label || archetype.publicLabel,
    editorial_lens: lens,
    story_archetype: archetype.name,
    story_archetype_id: archetype.id,
    routing_decision: route.routing_decision,
  };

  const missing = [];
  if (!dna.protagonist || compact(dna.protagonist).length < 2 || !detectTruncationArtifacts(dna.protagonist).ok) {
    missing.push('protagonist');
  }
  for (const key of ['concrete_event', 'core_tension', 'evidence_anchor']) {
    if (!dna[key] || isTruncatedEvidence(dna[key])) missing.push(key);
  }
  if (isGenericWatchMetric(dna.watch_metric)) missing.push('watch_metric');
  const truncation = detectTruncationArtifacts(Object.values(dna).flat().join(' '));
  return {
    ...dna,
    valid_for_full_article: missing.length === 0 && truncation.ok && route.visibility === 'core',
    missing_fields: missing,
    truncation,
  };
}

export function buildNarrativeHook(article = {}, dna = extractNarrativeDNA(article), recentHooks = []) {
  const excerpt = generateEditorialExcerpt(article, { recentDecks: recentHooks });
  return excerpt.deck;
}

export function buildDynamicBrief(article = {}, dna = extractNarrativeDNA(article)) {
  const lines = [
    sentence(dna.concrete_event),
    sentence(dna.decision_relevance),
    sentence(`Watch ${dna.watch_metric}`),
  ]
    .map((line) => limitClean(line, 220))
    .filter(Boolean);
  return {
    label: dna.public_signal_label || 'Core Signal',
    lines,
  };
}

function paragraphForHeading(heading = '', article = {}, dna = extractNarrativeDNA(article)) {
  const roleText = Array.isArray(dna.reader_role) ? dna.reader_role.slice(0, 3).join(', ') : dna.reader_role;
  const lower = heading.toLowerCase();
  if (/map|pieces|signals to separate|split/.test(lower)) {
    return sentence(`${dna.concrete_event} is more useful as a map of control points than as one broad capacity claim`);
  }
  if (/changed|move|signal|product|system|architecture|field|deal|policy|power-market|cost/.test(lower)) {
    return sentence(`${dna.concrete_event} is the source-backed change, with ${dna.protagonist} as the actor readers can track`);
  }
  if (/constraint|bottleneck|resilience|impact|lever|dependency|path|supply|below|design|failure/.test(lower)) {
    return sentence(`${dna.infrastructure_layer} is the operating layer that turns the update into ${dna.editorial_lens.toLowerCase()}, especially for ${roleText}`);
  }
  if (/exposure|risk|who|buyer|stakeholder|capital|quality|leverage/.test(lower)) {
    return sentence(`${dna.counterpoint}; that keeps the public read tied to evidence instead of treating the announcement as finished capacity`);
  }
  if (/watch|metric|proof|checkpoint|validation|test|decision|filing|adoption|delivery|planning/.test(lower)) {
    return sentence(`The watch metric is ${dna.watch_metric} over the ${dna.time_horizon} window`);
  }
  return sentence(dna.decision_relevance);
}

export function buildNarrativeArticleBody(article = {}, options = {}) {
  const dna = options.narrativeDNA || extractNarrativeDNA(article);
  const { headings } = sectionArchitectureFor(article, dna.story_archetype_id);
  const opening = guardPublicCopy(buildNarrativeHook(article, dna, options.recentHooks || [])).text;
  const lines = [opening];
  for (const heading of headings) {
    lines.push(heading);
    lines.push(paragraphForHeading(heading, article, dna));
  }
  const closing = sentence(`The decision checkpoint is whether ${dna.watch_metric} changes ${dna.infrastructure_layer.toLowerCase()} planning enough to alter procurement, deployment, or risk assumptions`);
  lines.push(closing);
  return lines
    .map((line) => guardPublicCopy(line).text)
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildNarrativeLensFields(article = {}, options = {}) {
  const dna = extractNarrativeDNA(article);
  const brief = buildDynamicBrief(article, dna);
  const hook = buildNarrativeHook(article, dna, options.recentHooks || []);
  const body = buildNarrativeArticleBody(article, { narrativeDNA: dna, recentHooks: options.recentHooks || [] });
  const excerpt = generateEditorialExcerpt(article, { recentDecks: options.recentHooks || [] });

  return {
    generation_version: GENERATION_VERSION,
    narrative_dna: dna,
    dynamicBriefLabel: brief.label,
    executiveSummary: brief.lines,
    thesis: limitClean(excerpt.deck || hook, 220),
    whatHappened: limitClean(sentence(dna.concrete_event), 500),
    whyThisMatters: limitClean(excerpt.why_it_matters || sentence(dna.core_tension), 600),
    marketMissing: limitClean(sentence(dna.counterpoint), 500),
    investors: limitClean(sentence(dna.decision_relevance), 500),
    operators: limitClean(sentence(`${dna.infrastructure_layer} teams should track ${dna.watch_metric}`), 500),
    hyperscalers: limitClean(sentence(`Cloud and platform buyers should separate source evidence from generic AI demand before changing deployment plans`), 500),
    watchNext: limitClean(sentence(dna.watch_metric), 500),
    finalHeadline: limitClean(article.title || excerpt.deck || hook, 130),
    metaDescription: limitClean(excerpt.deck || hook, 170),
    finalArticleBody: body,
    deck: excerpt.deck,
    why_it_matters: excerpt.why_it_matters,
  };
}
