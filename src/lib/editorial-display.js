const TEMPLATE_REPLACEMENTS = [
  [/\bThe strategic significance is not only the announcement itself but how it changes\b/gi, 'The important part is what this could change for'],
  [/\bThis signal matters because it changes\b/gi, 'This matters because it changes'],
  [/\bOperators should read this through\b/gi, 'Operators should focus on'],
  [/\bInvestors should track whether\b/gi, 'For investors, the question is whether'],
  [/\bHyperscalers should focus on whether\b/gi, 'For hyperscalers, watch whether'],
  [/\bwhat the market may be missing\b/gi, 'the overlooked risk'],
  [/\bread-through\b/gi, 'implication'],
];

export function cleanEditorialText(text = '') {
  let cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  for (const [pattern, replacement] of TEMPLATE_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  return cleaned;
}

function splitSentences(text = '') {
  return cleanEditorialText(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function normalizeExecutiveSummary(value) {
  if (Array.isArray(value)) {
    return value.map(cleanEditorialText).filter(Boolean).slice(0, 3);
  }

  if (typeof value === 'string') {
    return value
      .split(/\n+|(?:^|\s)[-•]\s+/)
      .map(cleanEditorialText)
      .filter(Boolean)
      .slice(0, 3);
  }

  return [];
}

export function executiveSummaryLines(article = {}) {
  const lens = article.expertLensFull || {};
  const provided = normalizeExecutiveSummary(lens.executiveSummary || article.executiveSummary);
  if (provided.length >= 3) return provided;

  const candidates = [
    lens.thesis,
    lens.whyThisMatters,
    lens.marketMissing,
    lens.watchNext,
    article.summary,
    article.snippet,
    article.articleText,
    article.contentText,
  ]
    .flatMap((value) => splitSentences(value))
    .filter(Boolean);

  return [...provided, ...candidates]
    .filter((line, index, list) => list.findIndex((item) => item.toLowerCase() === line.toLowerCase()) === index)
    .slice(0, 3);
}

export function displayHeadline(article = {}) {
  return cleanEditorialText(article.expertLensFull?.finalHeadline || article.title || '');
}
