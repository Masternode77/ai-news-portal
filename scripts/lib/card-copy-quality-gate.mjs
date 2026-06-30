import { hasInternalPublicLanguage, sanitizePublicCopy } from './internal-language-guard.mjs';
import { angleFor, deckForAngle, whyForFallback } from './card-copy-fallbacks.mjs';
import { hasSourceBackedCardProductFit } from './card-copy-product-fit.mjs';
import { normalizeProperNouns } from './proper-noun-normalizer.mjs';

const INTERNAL_CARD_PATTERNS = [
  /^Compute Current is keeping/i,
  /^This remains short because/i,
  /^The item did not qualify/i,
  /^The source evidence/i,
  /^Readers can use this to test/i,
  /\b(qualify|qualification|threshold|relevance score|urgency score|extraction|routing decision|publish decision|noindex)\b/i,
  /\b(watchlist|pending clearer execution evidence|limited to source-backed facts|before it becomes a full Compute Current analysis|needs verified)\b/i,
  /\b(concrete read|may alter AI capacity planning|compact[-\s]+signal)\b/i,
];

const WHY_IT_MATTERS_LABEL = /^Why it\s+matters:\s*/i;

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

function isLongformAnalysis(article = {}) {
  const tier = String(article.public_content_tier || article.type || '').toLowerCase().replace(/\s+/g, '_');
  return tier === 'longform_analysis';
}

function cleanWhyItMatters(value = '') {
  return sanitizePublicCopy(value || '').replace(WHY_IT_MATTERS_LABEL, '');
}

function titleFor(article = {}) {
  const rawTitle = compact(article.expertLensFull?.finalHeadline || article.title || 'Untitled item');
  const title = sanitizePublicCopy(rawTitle);
  const displayTitle = safeDisplayTitle(article, title, rawTitle);
  const match = displayTitle.match(/^([^:]{2,60}):\s+(.+)$/);
  if (!match) return displayTitle;
  const prefix = match[1].trim();
  const rest = match[2].trim();
  const firstPrefixWord = prefix.split(/\s+/)[0]?.toLowerCase();
  if (firstPrefixWord && rest.toLowerCase().startsWith(firstPrefixWord)) return rest;
  return displayTitle;
}

function safeDisplayTitle(article = {}, title = '', rawTitle = title) {
  if (!hasInternalPublicLanguage(title) && !hasInternalPublicLanguage(rawTitle)) return title;
  const candidates = [
    `${actorFor(article)} ${layerFor(article)} update`,
    `${layerFor(article)} update`,
  ].map(compact);
  return candidates.find((candidate) => candidate && !hasInternalPublicLanguage(candidate) && !INTERNAL_CARD_PATTERNS.some((pattern) => pattern.test(candidate))) || '';
}

function clipped(value = '', max = 96) {
  const text = compact(value).replace(/[,;:!?.\s]+$/g, '');
  if (text.length <= max) return text;
  const shortened = text.slice(0, max).replace(/\s+\S*$/g, '').replace(/[,;:!?.\s]+$/g, '');
  return shortened || text.slice(0, max).replace(/[,;:!?.\s]+$/g, '');
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

function whySubjectFor(article = {}) {
  const title = clipped(titleFor(article).replace(/\s+[|—-]\s+.*$/, ''), 76);
  const source = clipped(article.source || '', 34);
  if (source && title && !title.toLowerCase().includes(source.toLowerCase())) {
    return clipped(`The ${source} update on ${title}`, 96);
  }
  return title || clipped(`${actorFor(article)} ${layerFor(article)} update`, 96);
}

function deckFor(article = {}) {
  const persisted = article.public_presentation?.deck || article.deck || article.expertLensFull?.metaDescription || article.summary || article.snippet;
  const cleanPersisted = sanitizePublicCopy(persisted || '');
  if (
    isLongformAnalysis(article)
    && cleanPersisted
    && cleanPersisted.length >= 60
    && !INTERNAL_CARD_PATTERNS.some((pattern) => pattern.test(cleanPersisted))
    && !hasInternalPublicLanguage(cleanPersisted)
  ) {
    return sentence(cleanPersisted).slice(0, 260);
  }
  const actor = actorFor(article);
  const layer = layerFor(article);
  const title = titleFor(article);
  const titleContext = clipped(title.replace(/\s+[|—-]\s+.*$/, ''), 96);
  return deckForAngle(angleFor(article), titleContext || actor || layer, article);
}

function whyFor(article = {}) {
  const persisted = article.public_presentation?.why_it_matters || article.publicSignal?.why_it_matters || article.why_it_matters || article.evidence_pack?.operatingImplication;
  const cleanPersisted = cleanWhyItMatters(persisted || '');
  if (
    isLongformAnalysis(article)
    && cleanPersisted
    && cleanPersisted.length >= 30
    && !INTERNAL_CARD_PATTERNS.some((pattern) => pattern.test(cleanPersisted))
    && !hasInternalPublicLanguage(cleanPersisted)
  ) {
    return sentence(cleanPersisted).slice(0, 220);
  }
  const layer = layerFor(article);
  return whyForFallback(article, {
    angle: angleFor(article),
    layer,
    subject: whySubjectFor(article),
  });
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

export function cardCopyQualityResult(copy = {}, article = undefined) {
  const reasons = [];
  const text = [copy.title, copy.deck, copy.why_it_matters, copy.label, copy.cta].filter(Boolean).join(' ');
  const lines = [copy.deck, copy.why_it_matters].filter(Boolean);
  if (!copy.title || String(copy.title).length < 8) reasons.push('missing_title');
  if (/^AI infrastructure update\.?$/i.test(compact(copy.title || ''))) reasons.push('generic_title');
  if (!copy.deck || String(copy.deck).length < 45) reasons.push('deck_too_thin');
  if (WHY_IT_MATTERS_LABEL.test(compact(copy.why_it_matters || ''))) reasons.push('why_it_matters_label_prefix');
  if (INTERNAL_CARD_PATTERNS.some((pattern) => pattern.test(text)) || lines.some((line) => INTERNAL_CARD_PATTERNS.some((pattern) => pattern.test(line)))) {
    reasons.push('internal_qualification_language');
  }
  if (hasInternalPublicLanguage(text)) reasons.push('internal_public_language');
  if (!/\b(power|grid|utility|data center|campus|cloud|capacity|cooling|rack|chip|gpu|hbm|memory|capital|deal|policy|siting|interconnection|operator|buyer|supplier|platform)\b/i.test(text)) {
    reasons.push('missing_concrete_infrastructure_noun');
  }
  if (article && !hasSourceBackedCardProductFit(article)) reasons.push('unsupported_product_fit');
  return {
    ok: reasons.length === 0,
    reasons,
  };
}
