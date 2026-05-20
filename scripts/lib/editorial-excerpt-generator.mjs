import { guardPublicCopy, hasForbiddenPublicPhrase, firstWords } from './copy-quality-guard.mjs';
import { extractNamedCompanies } from './expert-insight-engine.mjs';
import { normalizeProperNouns } from './proper-noun-normalizer.mjs';
import { routePublicLane } from './public-lane-router.mjs';
import { analyzeSourceTextCompleteness } from './source-text-completeness.mjs';
import { routeStoryArchetype } from './story-archetype-router.mjs';
import { detectTruncationArtifacts } from './truncation-detector.mjs';

function compact(value = '') {
  return normalizeProperNouns(String(value || '').replace(/\s+/g, ' ').trim());
}

function textBundle(article = {}) {
  return compact([
    article.title,
    article.summary,
    article.snippet,
    article.articleText,
    article.contentText,
    article.primary_category,
    article.secondary_category,
    article.infrastructure_layer,
    ...(article.tags || []),
  ].filter(Boolean).join(' '));
}

function cleanSentence(value = '') {
  const text = compact(value)
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+…$/g, '')
    .replace(/…$/g, '')
    .trim();
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function stableIndex(value = '', modulo = 1) {
  let hash = 0;
  for (const char of String(value || '')) {
    hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  }
  return modulo ? hash % modulo : 0;
}

function primaryActor(article = {}) {
  const insight = article.expert_insight || article.expertInsight || {};
  const named = [
    ...(Array.isArray(insight.named_companies) ? insight.named_companies : []),
    ...extractNamedCompanies(textBundle(article)),
  ].map(compact).filter(Boolean);
  if (named.length) return named[0];

  const title = compact(article.title || '');
  const beforeVerb = title.split(/\s+(?:adds|expands|launches|raises|plans|taps|uses|moves|announces|backs|buys|warns|faces|opens|secures|tests|updates)\s+/i)[0];
  return beforeVerb && beforeVerb.length <= 70 ? beforeVerb : (article.source || 'The item');
}

function sourcePublicationIsSubject(article = {}) {
  const source = compact(article.source || '').toLowerCase();
  const title = compact(article.title || '').toLowerCase();
  return source && title.includes(source);
}

function hasSourceSpecificOverride(article = {}) {
  const text = textBundle(article);
  return /netapp/i.test(text) && /openshift/i.test(text) ||
    /memory pricing/i.test(text) && /(proxmox|kvm|hyper-v|nutanix|xcp-ng|virtualization)/i.test(text) ||
    /land and expand/i.test(text) || /nvidia, iren/i.test(text.toLowerCase()) ||
    /spot power trading|electricity spot trading|virtual power plant/i.test(text) ||
    /chip industry week in review/i.test(text) ||
    /paul tudor jones|sports ai|sumersports|sūmersports|football/i.test(text) ||
    /anthropic/i.test(text) && /legal/i.test(text) ||
    /dinosaur|fossil|stegosaurus/i.test(text);
}

function sourceQualityProblem(article = {}) {
  const result = analyzeSourceTextCompleteness(article);
  if (result.ok) return false;
  return result.reasons.some((reason) =>
    /boilerplate|navigation|copyright|truncated|source_evidence_length_below_280/.test(reason)
  );
}

function sourceSpecificDeck(article = {}, route = routePublicLane(article), archetype = routeStoryArchetype(article)) {
  const text = textBundle(article);
  const lower = text.toLowerCase();

  if (/netapp/i.test(text) && /openshift/i.test(text)) {
    return 'NetApp’s OpenShift update turns backup and DR into a platform-readiness issue for enterprise AI workloads.';
  }
  if (/memory pricing/i.test(text) && /(proxmox|kvm|hyper-v|nutanix|xcp-ng|virtualization)/i.test(text)) {
    return 'AI memory pricing is starting to hit virtualization planning, not just GPU procurement.';
  }
  if (/land and expand/i.test(text) || /nvidia, iren/i.test(lower)) {
    return 'NVIDIA, IREN, Coatue, Microsoft, Switch, Cerebras, and Core Scientific belong in a market map, not a single forced capacity thesis.';
  }
  if (/spot power trading|electricity spot trading|virtual power plant/i.test(text)) {
    return 'China’s spot power trading experiment gives large data centers a new operating lever, but only if volatility can translate into predictable energy cost.';
  }
  if (/chip industry week in review/i.test(text)) {
    return 'H200 controls, IC funding, and packaging pressure make the chip roundup a supply-chain map rather than a single delivery thesis.';
  }
  if (/paul tudor jones|sports ai|sumersports|sūmersports|football/i.test(text)) {
    return 'SumerSports is an adjacent AI application signal until it changes compute buying, cloud capacity, or enterprise platform architecture.';
  }
  if (/anthropic/i.test(text) && /legal/i.test(text)) {
    return 'Anthropic’s legal AI push belongs on the adjacent watchlist unless enterprise deployment details change platform or cloud demand.';
  }
  if (/dinosaur|fossil|stegosaurus/i.test(text)) {
    return 'The fossil market item sits outside Compute Current’s AI infrastructure coverage boundary.';
  }

  const actor = primaryActor(article);
  const laneTitle = compact(route.laneTitle || 'infrastructure');
  const editorialLens = compact(route.editorial_lens || archetype.editorialLens || 'Infrastructure Signal');
  const layer = compact(article.infrastructure_layer || editorialLens || 'infrastructure');
  const event = compact(article.summary || article.snippet || article.title || '').replace(/[.!?]+$/, '');
  const variants = [
    `${actor} puts ${layer.toLowerCase()} planning in focus as ${event.toLowerCase()}`,
    `${actor} gives ${laneTitle.toLowerCase()} readers a concrete ${layer.toLowerCase()} signal to test against source evidence`,
    `${layer} is the useful lens on ${actor} because the source points to a specific operating decision`,
    `${actor} turns the reported move into a ${editorialLens.toLowerCase()} question for infrastructure buyers`,
  ];
  return cleanSentence(variants[stableIndex(`${article.id || ''}|${article.title || ''}`, variants.length)]);
}

function sourceSpecificWhy(article = {}, route = routePublicLane(article), archetype = routeStoryArchetype(article)) {
  const text = textBundle(article);
  if (/netapp/i.test(text) && /openshift/i.test(text)) {
    return 'Platform teams running OpenShift need restore speed, disaster recovery, and cross-environment management before AI workloads move from pilots into production.';
  }
  if (/memory pricing/i.test(text) && /(proxmox|kvm|hyper-v|nutanix|xcp-ng|virtualization)/i.test(text)) {
    return 'If memory pressure changes VM density across Proxmox, KVM, Hyper-V, Nutanix, and XCP-ng estates, enterprise buyers may face a cost curve that sits below the accelerator layer.';
  }
  if (/land and expand/i.test(text) || /nvidia, iren/i.test(text.toLowerCase())) {
    return 'The useful read is which stakeholder controls land, power, capital, chips, and customer demand, not whether every item points to the same bottleneck.';
  }
  if (/spot power trading|electricity spot trading|virtual power plant/i.test(text)) {
    return 'Operators should watch whether virtual power plant participation becomes a procurement advantage or another exposure to grid-market volatility.';
  }
  if (/chip industry week in review/i.test(text)) {
    return 'A roundup can still be valuable when it separates export controls, funding, equipment supply, and packaging constraints instead of pretending they are one bottleneck.';
  }
  if (/paul tudor jones|sports ai|sumersports|sūmersports|football/i.test(text)) {
    return 'It may matter to AI adoption investors, but it does not yet name a compute, cloud, data center, power, cooling, storage, or network infrastructure decision.';
  }
  if (/anthropic/i.test(text) && /legal/i.test(text)) {
    return 'The infrastructure relevance depends on whether legal-sector adoption changes enterprise platform architecture, cloud demand, security posture, or deployment operations.';
  }

  const actor = primaryActor(article);
  const layer = compact(article.infrastructure_layer || route.editorial_lens || 'infrastructure');
  const stakeholders = Array.isArray(article.affected_stakeholders) && article.affected_stakeholders.length
    ? article.affected_stakeholders.slice(0, 2).join(' and ')
    : 'infrastructure teams';
  const event = compact(article.summary || article.snippet || article.title || 'the reported change');
  return cleanSentence(`${stakeholders} should care because ${actor} links ${event.toLowerCase()} to a ${layer.toLowerCase()} decision that can affect timing, vendor leverage, or operating readiness`);
}

function ensureUniqueDeck(deck = '', article = {}, recentDecks = []) {
  const used = new Set(recentDecks.map((value) => firstWords(value, 8)).filter(Boolean));
  if (!used.has(firstWords(deck, 8))) return deck;
  const route = routePublicLane(article);
  const actor = primaryActor(article);
  const editorialLens = compact(route.editorial_lens || 'Infrastructure Signal');
  const laneTitle = compact(route.laneTitle || 'infrastructure');
  const alternate = cleanSentence(`${editorialLens} is the sharper read on ${actor} because the source names a decision point rather than a generic AI trend`);
  return used.has(firstWords(alternate, 8))
    ? cleanSentence(`${actor} adds a source-specific ${editorialLens.toLowerCase()} signal for ${laneTitle.toLowerCase()} readers`)
    : alternate;
}

export function generateEditorialExcerpt(article = {}, options = {}) {
  const route = options.route || routePublicLane(article);
  const archetype = options.archetype || routeStoryArchetype(article);
  const weakEvidence = sourceQualityProblem(article) && !hasSourceSpecificOverride(article);
  let deck = weakEvidence
    ? cleanSentence(`${primaryActor(article)} stays on the public watchlist until clean source evidence ties it to a concrete infrastructure decision`)
    : sourceSpecificDeck(article, route, archetype);
  let why = weakEvidence
    ? cleanSentence('Compute Current is keeping the card short because the available source text contains clipped, boilerplate, or incomplete evidence that does not support a full infrastructure memo')
    : sourceSpecificWhy(article, route, archetype);

  if (!sourcePublicationIsSubject(article)) {
    const source = compact(article.source || '');
    if (source && deck.toLowerCase().startsWith(`${source.toLowerCase()} `)) {
      deck = deck.replace(new RegExp(`^${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i'), '');
      deck = deck.charAt(0).toUpperCase() + deck.slice(1);
    }
  }

  deck = ensureUniqueDeck(cleanSentence(deck), article, options.recentDecks || []);
  why = cleanSentence(why);

  const deckGuard = guardPublicCopy(deck);
  const whyGuard = guardPublicCopy(why);
  const truncation = detectTruncationArtifacts(`${deck} ${why}`);
  if (!deckGuard.ok || !whyGuard.ok || !truncation.ok || hasForbiddenPublicPhrase(`${deck} ${why}`)) {
    const actor = primaryActor(article);
    const editorialLens = compact(route.editorial_lens || 'Infrastructure Signal');
    const laneTitle = compact(route.laneTitle || 'infrastructure');
    deck = cleanSentence(`${actor} is a ${editorialLens.toLowerCase()} item for ${laneTitle.toLowerCase()} readers, with the infrastructure read limited to source-backed facts`);
    why = cleanSentence(`The public card stays short because the available evidence supports a watchlist signal more than a full infrastructure memo`);
  }

  return {
    deck: normalizeProperNouns(deck),
    why_it_matters: normalizeProperNouns(why),
  };
}
