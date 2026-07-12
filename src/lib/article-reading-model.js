const INTERNAL_PUBLIC_TERMS = /\b(?:admin|audit|blog metadata|count|debug|extraction|fidelity|forbidden phrase|internal|noindex|publishable|qa|quality gate|relevance score|routing decision|score|threshold|unsupported claim)\b/i;
const MAX_ITEM_LENGTH = 260;
const MAX_LIMITATION_LENGTH = 320;
const VERIFIED_CLAIM_STATUSES = new Set([
  'verified_primary',
  'verified_secondary',
  'verified_multi_source',
]);

function compactText(value = '') {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&rsquo;|&#8217;/gi, "'")
    .replace(/&lsquo;|&#8216;/gi, "'")
    .replace(/&rdquo;|&#8221;/gi, '"')
    .replace(/&ldquo;|&#8220;/gi, '"')
    .replace(/&euro;/gi, '€')
    .replace(/\s+/g, ' ')
    .trim();
}

function sentenceText(value = '', maxLength = MAX_ITEM_LENGTH) {
  const clean = compactText(value);
  if (!clean || INTERNAL_PUBLIC_TERMS.test(clean) || /\b\d+\s*(?:\/|out of)\s*\d+\b/i.test(clean)) return '';
  return clean.length > maxLength ? '' : clean;
}

function safeList(values = [], limit = 3, maxLength = MAX_ITEM_LENGTH) {
  const source = Array.isArray(values) ? values : [values];
  const seen = new Set();
  const result = [];

  for (const value of source) {
    const clean = sentenceText(value, maxLength);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
    if (result.length >= limit) break;
  }

  return result;
}

function firstSafe(values = [], maxLength = MAX_LIMITATION_LENGTH) {
  return safeList(values, 1, maxLength)[0] || '';
}

function verifiedClaims(article = {}) {
  const ledger = Array.isArray(article.claim_ledger) ? article.claim_ledger : [];
  return ledger
    .filter((claim) => VERIFIED_CLAIM_STATUSES.has(String(claim?.verification_status || '').toLowerCase()))
    .map((claim) => claim.claim_text || claim.article_sentence || claim.source_quote_or_summary);
}

function evidencePack(article = {}) {
  return article.evidence_pack || article.evidence || article.expertLensFull?.evidenceBox || {};
}

function watchItemsFromBody(article = {}) {
  const body = compactText(String(article.expertLensFull?.finalArticleBody || '')
    .replace(/\r/g, '')
    .replace(/(?:^|\n)#{0,3}\s*The Evidence To Watch\s*(?:\n|$)/i, '\n__WATCH__\n'));
  const section = body.split('__WATCH__')[1] || '';
  if (!section) return [];
  return section
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .filter((sentence) => /\b(?:checkpoint|filing|should|whether|clarify|look for|watch|reported)\b/i.test(sentence));
}

export function buildArticleReadingModel(article = {}, publicPresentation = article.public_presentation || {}) {
  const evidence = evidencePack(article);
  const facts = safeList([
    ...(evidence.verified_facts || []),
    ...(evidence.verifiedFacts || []),
    ...(evidence.facts || []),
    ...(article.source_fidelity?.anchored_facts || []),
    ...verifiedClaims(article),
  ], 4);

  const presentationItems = safeList([
    publicPresentation.deck,
    publicPresentation.why_it_matters,
    article.deck,
    article.why_it_matters,
  ], 2);

  const articleSummaryItems = safeList([
    ...(article.executiveSummary || []),
    ...(article.expertLensFull?.atAGlance || []),
  ], 3);

  const executiveSummary = safeList([
    ...presentationItems,
    article.expertLensShort,
    ...articleSummaryItems,
    ...facts,
  ], 3);

  const watchItems = safeList([
    ...(article.expertLensFull?.watchMetrics || []),
    ...(article.expertLensFull?.whatWouldChangeOurView || []),
    ...(evidence.watch_metrics || []),
    ...(evidence.watchMetrics || []),
    ...(evidence.what_would_change_our_view || []),
    ...watchItemsFromBody(article),
  ], 3);

  const evidenceLimitation = firstSafe([
    evidence.sourceLimitations,
    evidence.source_limitations,
    ...(evidence.uncertainty || []),
    ...(evidence.counterarguments || []),
    evidence.counterargument,
    article.editorial_thesis?.counterargument,
    ...facts.filter((fact) => /\b(?:not named|not disclosed|does not|do not|did not|has not|forward-looking|cannot)\b/i.test(fact)),
  ]);

  const bottomLine = firstSafe([
    article.editorial_thesis?.bottom_line,
    article.expertLensFull?.bottomLine,
    article.bottomLine,
    article.expertLensShort,
  ]);

  return {
    executiveSummary,
    sourceFacts: facts,
    evidenceLimitation,
    watchItems,
    bottomLine,
  };
}

export const articleReadingModelInternals = {
  compactText,
  sentenceText,
  safeList,
};
