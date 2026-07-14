import { hasInternalPublicLanguage, sanitizePublicCopy } from './internal-language-guard.mjs';
import { hasSourceBackedCardProductFit } from './card-copy-product-fit.mjs';
import { guardPublicCopy } from './copy-quality-guard.mjs';
import { normalizeProperNouns } from './proper-noun-normalizer.mjs';
import { guardPublicTemplatePhrases } from './public-template-phrase-guard.mjs';
import { SOURCE_EXCERPT_FIELDS, stripGeneratedSourceScaffolding } from './source-evidence-integrity.mjs';

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
const SOURCE_BOILERPLATE = /\b(?:all rights reserved|copyright|privacy policy|terms of use|gift this article|take our survey|want more .{0,80} stories|the post .{0,160} appeared first on|connects to .{0,100} decisions tracked by Compute Current|names .{0,100} as relevant actors or entities)\b/i;
const SOURCE_PERIOD_SENTINEL = '\uE000';

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

function sentence(value = '') {
  const text = compact(value);
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function decodeNumericEntity(value = '', radix = 10) {
  const codePoint = Number.parseInt(value, radix);
  if (
    !Number.isInteger(codePoint)
    || codePoint < 0
    || codePoint > 0x10ffff
    || (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) {
    return ' ';
  }
  return String.fromCodePoint(codePoint);
}

function decodeSourceEntities(value = '') {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => decodeNumericEntity(hex, 16))
    .replace(/&#(\d+);/g, (_, decimal) => decodeNumericEntity(decimal, 10))
    .replace(/&(nbsp|ensp|emsp);/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&(apos|rsquo|lsquo);/gi, "'")
    .replace(/&(rdquo|ldquo);/gi, '"')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&hellip;/gi, '…')
    .replace(/\s+/g, ' ')
    .replace(/^TL;DR\s*/i, '')
    .trim();
}

function clipSourceSentence(value = '', maxLength = 260) {
  const text = compact(value);
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, maxLength - 1).replace(/\s+\S*$/g, '').replace(/[,;:\s]+$/g, '');
  return clipped ? `${clipped}…` : '';
}

function sourceSentences(value = '') {
  const protectedText = decodeSourceEntities(value)
    .replace(/\b(?:[A-Za-z]\.){2,}/g, (match) => match.replaceAll('.', SOURCE_PERIOD_SENTINEL))
    .replace(/\b(?:Co|Corp|Inc|Ltd|LLC|Dr|Mr|Ms|Mrs|Prof|St|No)\./gi, (match) => (
      `${match.slice(0, -1)}${SOURCE_PERIOD_SENTINEL}`
    ));
  return protectedText
    .split(/(?<=[.!?])\s+/)
    .map((sentenceValue) => sentenceValue.replaceAll(SOURCE_PERIOD_SENTINEL, '.').trim())
    .filter(Boolean);
}

function normalizedComparison(value = '') {
  return compact(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function isSourceAttributionScaffolding(value = '', article = {}) {
  const decoded = decodeSourceEntities(value);
  const match = decoded.match(/^[^.!?]{1,120}\breported:\s*(.+)$/i);
  if (!match) return false;
  const reportedKey = normalizedComparison(match[1]);
  const titleKey = normalizedComparison(article.title);
  return Boolean(titleKey && (reportedKey === titleKey || reportedKey === `${titleKey} source`));
}

function safeSourceSentence(value = '', article = {}) {
  const candidate = clipSourceSentence(value);
  if (candidate.length < 45 || SOURCE_BOILERPLATE.test(candidate)) return '';
  const candidateKey = normalizedComparison(candidate);
  const titleKey = normalizedComparison(article.title);
  if (titleKey && (candidateKey === titleKey || candidateKey === `${titleKey} source`)) return '';
  if (/^[a-z]/.test(candidate)) return '';
  if (isSourceAttributionScaffolding(candidate, article)) return '';
  if (hasInternalPublicLanguage(candidate)) return '';
  if (!guardPublicTemplatePhrases(candidate).ok) return '';
  const guarded = guardPublicCopy(candidate, { allowEllipsis: true });
  return guarded.ok ? sentence(guarded.text).replace(/…\.$/, '…') : '';
}

export function sourceCardExcerpt(article = {}) {
  for (const field of SOURCE_EXCERPT_FIELDS) {
    const sourceText = stripGeneratedSourceScaffolding(article[field], article).text;
    for (const candidate of sourceSentences(sourceText)) {
      const safe = safeSourceSentence(candidate, article);
      if (safe) return safe;
    }
  }
  return '';
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
  const guardedPersisted = guardPublicCopy(cleanPersisted, { allowEllipsis: true });
  if (
    isLongformAnalysis(article)
    && cleanPersisted
    && cleanPersisted.length >= 60
    && !INTERNAL_CARD_PATTERNS.some((pattern) => pattern.test(cleanPersisted))
    && !hasInternalPublicLanguage(cleanPersisted)
    && guardedPersisted.ok
    && guardPublicTemplatePhrases(cleanPersisted).ok
  ) {
    return sentence(cleanPersisted).slice(0, 260);
  }
  return sourceCardExcerpt(article);
}

function whyFor(article = {}) {
  const persisted = article.public_presentation?.why_it_matters || article.publicSignal?.why_it_matters || article.why_it_matters || article.evidence_pack?.operatingImplication;
  const cleanPersisted = cleanWhyItMatters(persisted || '');
  const guardedPersisted = guardPublicCopy(cleanPersisted, { allowEllipsis: true });
  if (
    isLongformAnalysis(article)
    && cleanPersisted
    && cleanPersisted.length >= 30
    && !INTERNAL_CARD_PATTERNS.some((pattern) => pattern.test(cleanPersisted))
    && !hasInternalPublicLanguage(cleanPersisted)
    && guardedPersisted.ok
    && guardPublicTemplatePhrases(cleanPersisted).ok
  ) {
    return sentence(cleanPersisted).slice(0, 220);
  }
  return '';
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
  if (!guardPublicTemplatePhrases(text).ok) reasons.push('public_template_phrase');
  if (!/\b(power|grid|utility|data cent(?:er|re)s?|campus|cloud|capacity|cooling|rack|chip|gpu|hbm|memory|capital|deal|policy|siting|interconnection|operator|buyer|supplier|platform|semiconductor|foundry|fab|wafer|fiber|network|storage|energization|substation|\d+\s?nm|\d+(?:\.\d+)?\s?(?:mw|gw|tbps))\b/i.test(text)) {
    reasons.push('missing_concrete_infrastructure_noun');
  }
  if (article && !hasSourceBackedCardProductFit(article)) reasons.push('unsupported_product_fit');
  return {
    ok: reasons.length === 0,
    reasons,
  };
}
