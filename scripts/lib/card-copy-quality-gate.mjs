import { sanitizePublicCopy } from './internal-language-guard.mjs';
import { normalizeProperNouns } from './proper-noun-normalizer.mjs';

const INTERNAL_CARD_PATTERNS = [
  /^Compute Current is keeping/i,
  /^This remains short because/i,
  /^The item did not qualify/i,
  /^The source evidence/i,
  /^Readers can use this to test/i,
  /\b(qualify|qualification|threshold|relevance score|urgency score|extraction|routing decision|publish decision|noindex)\b/i,
  /\b(watchlist|pending clearer execution evidence|limited to source-backed facts|before it becomes a full Compute Current analysis|needs verified)\b/i,
  /\b(concrete read|may alter AI capacity planning)\b/i,
];

const LABEL_BY_TIER = {
  longform_analysis: 'Analysis',
  editorial_brief: 'Brief',
  signal_card: 'Signal',
  market_map: 'Market Map',
  technical_note: 'Technical Note',
  policy_watch: 'Policy Watch',
  deal_watch: 'Deal Watch',
};

function compact(value = '') {
  return normalizeProperNouns(String(value || '').replace(/\s+/g, ' ').trim())
    .replace(/^([^:]{3,80}):\s+\1:\s*/i, '$1: ');
}

function titleFor(article = {}) {
  const title = compact(article.expertLensFull?.finalHeadline || article.title || 'Untitled item');
  const match = title.match(/^([^:]{2,60}):\s+(.+)$/);
  if (!match) return title;
  const prefix = match[1].trim();
  const rest = match[2].trim();
  const firstPrefixWord = prefix.split(/\s+/)[0]?.toLowerCase();
  if (firstPrefixWord && rest.toLowerCase().startsWith(firstPrefixWord)) return rest;
  return title;
}

function clipped(value = '', max = 96) {
  const text = compact(value).replace(/[,;:\s]+$/g, '');
  if (text.length <= max) return text;
  const shortened = text.slice(0, max).replace(/\s+\S*$/g, '').replace(/[,;:\s]+$/g, '');
  return shortened || text.slice(0, max).replace(/[,;:\s]+$/g, '');
}

function sentence(value = '') {
  const text = compact(value);
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function labelFor(article = {}) {
  const tier = String(article.public_content_tier || article.blog_route || article.publishing_route || '').toLowerCase().replace(/\s+/g, '_');
  if (/policy|siting|regulation|permit/i.test(`${article.primary_category} ${article.infrastructure_layer}`)) return 'Policy Watch';
  if (/capital|deal|finance|funding|m&a|acquisition|investor/i.test(`${article.primary_category} ${article.infrastructure_layer} ${article.title}`)) return 'Deal Watch';
  if (/market map|roundup/i.test(`${article.title} ${article.blog_metadata?.archetype || ''}`)) return 'Market Map';
  return LABEL_BY_TIER[tier] || (article.articlePagePublished === true ? 'Analysis' : 'Brief');
}

function ctaFor(label, article = {}) {
  if (label === 'Analysis' || article.articlePagePublished === true) return 'Read analysis';
  if (label === 'Signal') return article.sourceUrl || article.url ? 'Source' : 'Read brief';
  return 'Read brief';
}

function actorFor(article = {}) {
  const actor = article.evidence_pack?.namedActors?.[0]
    || article.affected_stakeholders?.[0]
    || article.source
    || 'AI infrastructure operators';
  return compact(actor).replace(/\b\w/g, (char) => char.toUpperCase());
}

function layerFor(article = {}) {
  const layer = article.infrastructure_layer
    || article.primary_category
    || article.category
    || 'AI infrastructure';
  return compact(layer).toLowerCase();
}

function deckFor(article = {}) {
  const persisted = article.public_presentation?.deck || article.deck || article.expertLensFull?.metaDescription || article.summary || article.snippet;
  const cleanPersisted = sanitizePublicCopy(persisted || '');
  if (
    article.public_content_tier === 'longform_analysis'
    && cleanPersisted
    && cleanPersisted.length >= 60
    && !INTERNAL_CARD_PATTERNS.some((pattern) => pattern.test(cleanPersisted))
  ) {
    return sentence(cleanPersisted).slice(0, 260);
  }
  const actor = actorFor(article);
  const layer = layerFor(article);
  const title = titleFor(article);
  const titleContext = clipped(title.replace(/\s+[|—-]\s+.*$/, ''), 96);
  if (/capital|deal|reit|ipo|funding|lease|acquisition|investor/i.test(`${title} ${layer}`)) {
    return sentence(`${titleContext} points to where capital is still willing to underwrite AI infrastructure capacity despite execution risk`);
  }
  if (/data center|campus|hyperscale|colocation|facility|lease/i.test(`${title} ${layer}`)) {
    return sentence(`${titleContext} is a capacity signal for operators tracking where AI demand is turning into real data center commitments`);
  }
  if (/chip|gpu|semiconductor|silicon|hbm|memory|epyc|socamm|lpddr|arm/i.test(`${title} ${layer}`)) {
    return sentence(`${titleContext} matters most for capacity-per-watt planning, supplier leverage, and the timing of AI hardware refresh cycles`);
  }
  if (/cloud|aws|google|platform|openshift|kubernetes|storage|backup|resilience|inference/i.test(`${title} ${layer}`)) {
    return sentence(`${titleContext} gives enterprise infrastructure teams another read on how AI workloads are changing platform, storage, and cloud capacity decisions`);
  }
  if (/power|grid|utility|interconnection|battery|storage|nuclear|ercot|gw|mw/i.test(`${title} ${layer}`)) {
    return sentence(`${titleContext} keeps power availability near the center of AI campus timing, interconnection risk, and buyer commitments`);
  }
  return sentence(`${titleContext || actor || layer} gives infrastructure readers a compact signal on AI capacity planning, supplier timing, or operating risk`);
}

function whyFor(article = {}) {
  const persisted = article.public_presentation?.why_it_matters || article.why_it_matters || article.evidence_pack?.operatingImplication;
  const cleanPersisted = sanitizePublicCopy(persisted || '');
  if (
    article.public_content_tier === 'longform_analysis'
    && cleanPersisted
    && cleanPersisted.length >= 40
    && !INTERNAL_CARD_PATTERNS.some((pattern) => pattern.test(cleanPersisted))
  ) {
    return sentence(cleanPersisted).slice(0, 220);
  }
  const layer = layerFor(article);
  if (/power|grid|utility|interconnection/i.test(layer)) {
    return sentence('Why it matters: grid access is becoming a gating condition for AI buildouts, not a back-office procurement detail');
  }
  if (/semiconductor|silicon|chip|gpu|memory/i.test(layer)) {
    return sentence('Why it matters: chip availability and performance per watt can reset cloud margins, buyer queues, and refresh timing');
  }
  if (/cloud|platform|enterprise|storage/i.test(layer)) {
    return sentence('Why it matters: platform readiness determines how quickly AI demand converts into usable capacity for enterprise buyers');
  }
  return sentence(`Why it matters: ${layer} constraints can change build schedules, buyer commitments, and cost assumptions before demand shows up in revenue`);
}

export function generateCardCopy(article = {}) {
  const label = labelFor(article);
  return {
    label,
    signal_label: label,
    title: titleFor(article),
    deck: deckFor(article),
    why_it_matters: whyFor(article),
    source: compact(article.source || 'Source'),
    date: article.analysisPublishedAt || article.publishedAt || article.updatedAt || '',
    category: compact(article.primary_category || article.category || article.infrastructure_layer || 'AI Infrastructure'),
    cta: ctaFor(label, article),
  };
}

export function cardCopyQualityResult(copy = {}) {
  const reasons = [];
  const text = [copy.title, copy.deck, copy.why_it_matters, copy.label, copy.cta].filter(Boolean).join(' ');
  const lines = [copy.deck, copy.why_it_matters].filter(Boolean);
  if (!copy.title || String(copy.title).length < 8) reasons.push('missing_title');
  if (!copy.deck || String(copy.deck).length < 45) reasons.push('deck_too_thin');
  if (INTERNAL_CARD_PATTERNS.some((pattern) => pattern.test(text)) || lines.some((line) => INTERNAL_CARD_PATTERNS.some((pattern) => pattern.test(line)))) {
    reasons.push('internal_qualification_language');
  }
  if (!/\b(power|grid|utility|data center|campus|cloud|capacity|cooling|rack|chip|gpu|hbm|memory|capital|deal|policy|siting|interconnection|operator|buyer|supplier|platform)\b/i.test(text)) {
    reasons.push('missing_concrete_infrastructure_noun');
  }
  return {
    ok: reasons.length === 0,
    reasons,
  };
}
