export const ARTICLE_PAGE_QUALITY_THRESHOLD = Number(
  process.env.ARTICLE_PAGE_QUALITY_THRESHOLD || 0.8
);

function clampScore(score) {
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

function significantWords(text = '') {
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'with',
    'from',
    'that',
    'this',
    'into',
    'over',
    'about',
    'after',
    'before',
    'will',
    'are',
    'was',
    'were',
    'has',
    'have',
    'its',
    'their',
    'they',
    'you',
    'your',
    'our',
    'new',
    'news',
  ]);

  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9가-힣]+/i)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !stopWords.has(word));
}

function booleanFromPatterns(text = '', patterns = []) {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

function countPatternChars(text = '', patterns = []) {
  return patterns.reduce((total, pattern) => {
    pattern.lastIndex = 0;
    const matches = [...text.matchAll(pattern)];
    return total + matches.reduce((sum, match) => sum + (match[0]?.length || 0), 0);
  }, 0);
}

function titleBodySimilarity(title = '', body = '') {
  const titleWords = [...new Set(significantWords(title))];
  if (!titleWords.length) return 0;
  const bodyWords = new Set(significantWords(body));
  const overlap = titleWords.filter((word) => bodyWords.has(word)).length;
  return Number((overlap / titleWords.length).toFixed(2));
}

function sentenceCompletionScore(text = '') {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return 0;

  const candidates = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (!candidates.length) return /[.!?]["')\]]?$/.test(normalized) ? 0.5 : 0;

  const complete = candidates.filter((sentence) => /[.!?]["')\]]?$/.test(sentence));
  const terminalBonus = /[.!?]["')\]]?$/.test(normalized) ? 0.15 : 0;
  const enoughSentences = candidates.length >= 3 ? 0.1 : 0;
  return clampScore((complete.length / candidates.length) * 0.75 + terminalBonus + enoughSentences);
}

const BOILERPLATE_PATTERNS = [
  /\bcookie(?:s)?\b/gi,
  /\bsubscribe\b/gi,
  /\badvertisement\b/gi,
  /\bsponsored\b/gi,
  /\bprivacy policy\b/gi,
  /\bterms of use\b/gi,
  /\ball rights reserved\b/gi,
  /\bsite feedback\b/gi,
  /\btake our survey\b/gi,
  /\bsign up\b/gi,
  /\bnewsletter\b/gi,
  /\bmost popular\b/gi,
  /\brelated articles?\b/gi,
  /\bshare this article\b/gi,
];

const COPYRIGHT_PATTERNS = [
  /\bcopyright\b/i,
  /\u00a9/i,
  /\ball rights reserved\b/i,
  /\bregistered office\b/i,
  /\bowned and operated by\b/i,
];

const NAV_OR_CTA_PATTERNS = [
  /\bsubscribe\b/i,
  /\bsign up\b/i,
  /\bjoin our newsletter\b/i,
  /\bread more\b/i,
  /\bmost popular\b/i,
  /\brelated articles?\b/i,
  /\bcontact us\b/i,
  /\bsite feedback\b/i,
  /\btake our survey\b/i,
  /\blinkedin\b/i,
  /\bfacebook\b/i,
  /\bemail link\b/i,
  /\bgift this article\b/i,
];

function buildExtractionReasons(metrics, threshold) {
  const reasons = [];
  if (metrics.extraction_quality_score < threshold) {
    reasons.push(`extraction_quality_score ${metrics.extraction_quality_score.toFixed(2)} below ${threshold.toFixed(2)}`);
  }
  if (metrics.content_length < 650) reasons.push(`content_length ${metrics.content_length} below 650`);
  if (metrics.boilerplate_ratio >= 0.18) reasons.push(`boilerplate_ratio ${metrics.boilerplate_ratio.toFixed(2)} high`);
  if (metrics.title_body_similarity < 0.18) reasons.push(`title_body_similarity ${metrics.title_body_similarity.toFixed(2)} low`);
  if (metrics.copyright_footer_detected) reasons.push('copyright_footer_detected');
  if (metrics.nav_or_cta_detected && metrics.boilerplate_ratio >= 0.08) reasons.push('nav_or_cta_detected');
  if (metrics.sentence_completion_score < 0.65) {
    reasons.push(`sentence_completion_score ${metrics.sentence_completion_score.toFixed(2)} low`);
  }
  if (metrics.extraction_failure_reason) reasons.push(`extraction_failure_reason ${metrics.extraction_failure_reason}`);
  return reasons;
}

export function analyzeExtractionQuality({
  title = '',
  articleText = '',
  fallbackSnippet = '',
  sourceUrl = '',
  sourceDomainAdapter = 'generic',
  rawText = '',
  extractionFailureReason = '',
} = {}) {
  const text = String(articleText || '').trim();
  const snippet = String(fallbackSnippet || '').trim();
  const raw = String(rawText || text).trim();
  const words = text.split(/\s+/).filter(Boolean);
  const uniqueWords = new Set(words.map((word) => word.toLowerCase().replace(/[^a-z0-9가-힣]/gi, '')));
  const hasMeaningfulExtraction = text && text !== snippet && text.length > snippet.length + 80;
  const boilerplateChars = countPatternChars(raw, BOILERPLATE_PATTERNS);
  const boilerplateRatio = raw.length ? clampScore(boilerplateChars / raw.length) : 0;
  const titleSimilarity = titleBodySimilarity(title, text);
  const completionScore = sentenceCompletionScore(text);
  const copyrightFooterDetected = booleanFromPatterns(raw, COPYRIGHT_PATTERNS);
  const navOrCtaDetected = booleanFromPatterns(raw, NAV_OR_CTA_PATTERNS);
  const hasSpecificAdapter = sourceDomainAdapter && sourceDomainAdapter !== 'generic';

  let score = 0;
  if (text.length >= 1600) score += 0.28;
  else if (text.length >= 1200) score += 0.24;
  else if (text.length >= 900) score += 0.2;
  else if (text.length >= 650) score += 0.14;
  else if (text.length >= 400) score += 0.08;
  else if (text.length >= 220) score += 0.04;

  if (words.length >= 230) score += 0.16;
  else if (words.length >= 170) score += 0.13;
  else if (words.length >= 120) score += 0.1;
  else if (words.length >= 80) score += 0.06;

  if (hasMeaningfulExtraction) score += 0.14;
  if (uniqueWords.size >= 120) score += 0.1;
  else if (uniqueWords.size >= 90) score += 0.08;
  else if (uniqueWords.size >= 55) score += 0.04;

  score += Math.max(0, 1 - boilerplateRatio) * 0.14;
  score += completionScore * 0.12;
  if (titleSimilarity >= 0.55) score += 0.08;
  else if (titleSimilarity >= 0.35) score += 0.06;
  else if (titleSimilarity >= 0.18) score += 0.03;
  if (hasSpecificAdapter) score += 0.08;
  else if (sourceUrl) score += 0.04;
  if (sourceUrl) score += 0.04;

  if (boilerplateRatio >= 0.18) score -= 0.16;
  else if (boilerplateRatio >= 0.1) score -= 0.08;
  if (copyrightFooterDetected) score -= 0.16;
  if (navOrCtaDetected && boilerplateRatio >= 0.08) score -= 0.08;
  if (!hasMeaningfulExtraction) score -= 0.18;
  if (extractionFailureReason) score -= 0.25;

  const extractionQualityScore = clampScore(score);
  const metrics = {
    content_length: text.length,
    boilerplate_ratio: boilerplateRatio,
    title_body_similarity: titleSimilarity,
    copyright_footer_detected: copyrightFooterDetected,
    nav_or_cta_detected: navOrCtaDetected,
    sentence_completion_score: completionScore,
    source_domain_adapter: sourceDomainAdapter || 'generic',
    extraction_quality_score: extractionQualityScore,
    extraction_failure_reason: extractionFailureReason || null,
  };

  return {
    ...metrics,
    extraction_quality_reasons: buildExtractionReasons(metrics, ARTICLE_PAGE_QUALITY_THRESHOLD),
  };
}

export function scoreExtractionQuality(options = {}) {
  return analyzeExtractionQuality(options).extraction_quality_score;
}

export function qualityGateReason(article = {}, threshold = ARTICLE_PAGE_QUALITY_THRESHOLD) {
  const score = Number(article.extraction_quality_score ?? 0);
  if (score >= threshold) return null;

  const textLength = String(article.articleText || '').length;
  const qaReasons = Array.isArray(article.extraction_qa?.extraction_quality_reasons)
    ? article.extraction_qa.extraction_quality_reasons
    : [];
  return [
    `extraction_quality_score ${score.toFixed(2)} below ${threshold.toFixed(2)}`,
    `articleText length=${textLength}`,
    ...qaReasons.filter((reason) => !reason.startsWith('extraction_quality_score')),
  ].join('; ');
}

export function splitByArticleQualityGate(articles = [], threshold = ARTICLE_PAGE_QUALITY_THRESHOLD) {
  const publishable = [];
  const blocked = [];

  for (const article of articles) {
    const reason = qualityGateReason(article, threshold);
    if (reason) {
      blocked.push({
        ...article,
        articlePagePublished: false,
        qualityGateBlocked: true,
        qualityGateReason: reason,
        qualityGateBlockedAt: new Date().toISOString(),
      });
    } else {
      publishable.push(article);
    }
  }

  return { publishable, blocked };
}
