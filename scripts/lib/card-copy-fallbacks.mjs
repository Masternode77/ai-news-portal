import { normalizeProperNouns } from './proper-noun-normalizer.mjs';
import { detectTruncationArtifacts } from './truncation-detector.mjs';

function compact(value = '') {
  return normalizeProperNouns(String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim());
}

function sentence(value = '') {
  const text = compact(value).replace(/\s+([,.;:!?])/g, '$1');
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

const PROTECTED_PERIOD = '\uE000';

function withProtectedAbbreviations(value = '') {
  return String(value || '')
    .replace(/\b(?:[A-Za-z]\.){2,}(?=\s+(?:[a-z(]|Department\b|Secretary\b))/g, (match) => match.replaceAll('.', PROTECTED_PERIOD))
    .replace(/\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St)\.(?=\s+[A-Z])/gi, (match) => match.replace('.', PROTECTED_PERIOD));
}

function restoreProtectedPeriods(value = '') {
  return String(value || '').replaceAll(PROTECTED_PERIOD, '.');
}

function abbreviationFragment(value = '') {
  return /\b(?:[A-Za-z]\.){2,}$/.test(compact(value));
}

function completeSentences(value = '') {
  const text = compact(value);
  if (!text || !detectTruncationArtifacts(text).ok) return [];
  const matches = withProtectedAbbreviations(text).match(/[^.!?]+[.!?](?=\s|$)/g) || [];
  return matches.map(restoreProtectedPeriods).map(sentence).filter((value) => value && !abbreviationFragment(value));
}

function openingClause(value = '') {
  const text = compact(value);
  if (!text || !detectTruncationArtifacts(text).ok) return '';
  const protectedText = withProtectedAbbreviations(text);
  const first = (protectedText.match(/[^.!?]+[.!?](?=\s|$)/) || [protectedText])[0];
  const candidate = sentence(restoreProtectedPeriods(first.split(/[,;]/)[0]));
  return abbreviationFragment(candidate) ? '' : candidate;
}

function contentTokens(value = '') {
  return new Set(normalizedKey(value).split(/\s+/).filter((token) => token.length >= 4));
}

function stripLeadingTitle(value = '', title = '') {
  const text = compact(value);
  const prefix = compact(title).replace(/[.!?]+$/g, '');
  if (!prefix || !text.toLowerCase().startsWith(`${prefix.toLowerCase()} `)) return text;
  return text.slice(prefix.length).trim();
}

function materiallyRepeats(value = '', excluded = '') {
  const valueKey = normalizedKey(value);
  const excludedKey = normalizedKey(excluded);
  if (!valueKey || !excludedKey) return false;
  if (valueKey === excludedKey || valueKey.includes(excludedKey) || excludedKey.includes(valueKey)) return true;
  const valueTokens = contentTokens(value);
  const excludedTokens = contentTokens(excluded);
  if (!valueTokens.size || !excludedTokens.size) return false;
  let shared = 0;
  for (const token of valueTokens) if (excludedTokens.has(token)) shared += 1;
  return shared / Math.min(valueTokens.size, excludedTokens.size) >= 0.7;
}

function sharesStoryAnchor(value = '', title = '') {
  const valueTokens = contentTokens(value);
  for (const token of contentTokens(title)) {
    if (valueTokens.has(token)) return true;
  }
  return false;
}

function evidenceCandidates(article = {}) {
  const facts = article.expert_insight?.concrete_facts
    || article.expertInsight?.concrete_facts
    || article.evidence_pack?.concreteFacts
    || [];
  const exactSource = article.extraction_artifact?.cleaned_extracted_text
    || article.cleaned_source_text
    || article.source_evidence_text
    || article.articleText
    || article.contentText
    || '';
  const summary = compact(article.summary);
  const sourceCandidates = [
    ...completeSentences(article.snippet),
    ...completeSentences(exactSource).slice(0, 8),
    ...facts.map(compact),
    openingClause(exactSource),
  ].map((value) => stripLeadingTitle(value, article.title));
  const anchored = sourceCandidates.filter((value) => sharesStoryAnchor(value, article.title));
  const candidates = summary
    ? [summary, ...anchored]
    : (anchored.length ? anchored : sourceCandidates);
  const seen = new Set();
  return candidates.filter((value) => value
    && value.length >= 30
    && value.length <= 280
    && !abbreviationFragment(value)
    && detectTruncationArtifacts(value).ok)
    .filter((value) => {
      const key = normalizedKey(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizedKey(value = '') {
  return compact(value).toLowerCase().replace(/[^a-z0-9가-힣]+/g, ' ').trim();
}

function groundedFallback(article = {}, { exclude = '', title = '', emptyWhenMissing = false, qualifyAbstract = false } = {}) {
  const candidate = evidenceCandidates(article)
    .find((value) => !materiallyRepeats(value, exclude));
  if (candidate) {
    const completed = sentence(candidate);
    if (qualifyAbstract && /^arxiv$/i.test(compact(article.source)) && /^(?:we|our|this (?:paper|work)|in this (?:paper|work))\b/i.test(completed)) {
      return `From the abstract: ${completed}`;
    }
    return completed;
  }
  if (emptyWhenMissing) return '';
  const source = compact(article.source || 'The source');
  const subject = compact(title || article.title || 'the reported update').replace(/[.!?]+$/g, '');
  return sentence(`${source} reports the source item titled “${subject}”`);
}

// Routing and tests use this classifier. Public fallback prose no longer
// derives claims or implications from the selected angle.
export function angleFor(article = {}) {
  const text = compact([
    article.title,
    article.summary,
    article.snippet,
    article.primary_category,
    article.category,
    article.infrastructure_layer,
    ...(Array.isArray(article.tags) ? article.tags : []),
  ].filter(Boolean).join(' ')).toLowerCase();
  if (/cooling|liquid|thermal|chiller|heat rejection|rack density/.test(text)) return 'cooling';
  if (/grid|interconnection|transmission|substation|ercot|queue/.test(text)) return 'grid';
  if (/power|utility|energy|nuclear|battery|mw|gw|load growth/.test(text)) return 'power';
  if (/chip|gpu|semiconductor|silicon|hbm|memory|accelerator|epyc|lpddr|socamm|arm/.test(text)) return 'silicon';
  if (/cloud|aws|azure|google cloud|platform|openshift|kubernetes|storage|backup|resilience|inference/.test(text)) return 'cloud';
  if (/policy|siting|regulation|permit|tariff|legislation|zoning/.test(text)) return 'policy';
  if (/capital|deal|reit|ipo|funding|finance|lease|acquisition|investor|valuation/.test(text)) return 'capital';
  if (/data center|datacenter|campus|hyperscale|colocation|facility|capacity|rack/.test(text)) return 'capacity';
  return 'operations';
}

export function deckForAngle(_angle = 'operations', titleContext = 'This update', article = {}) {
  return groundedFallback(article, { title: titleContext });
}

export function whyForFallback(article = {}, context = {}) {
  return groundedFallback(article, {
    exclude: context.deck,
    title: context.subject || article.title,
    emptyWhenMissing: true,
    qualifyAbstract: true,
  });
}
