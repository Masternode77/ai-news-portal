export const ARTICLE_PAGE_QUALITY_THRESHOLD = Number(
  process.env.ARTICLE_PAGE_QUALITY_THRESHOLD || 0.8
);

function clampScore(score) {
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

export function scoreExtractionQuality({
  articleText = '',
  fallbackSnippet = '',
  sourceUrl = '',
} = {}) {
  const text = String(articleText || '').trim();
  const snippet = String(fallbackSnippet || '').trim();
  const words = text.split(/\s+/).filter(Boolean);
  const uniqueWords = new Set(words.map((word) => word.toLowerCase().replace(/[^a-z0-9가-힣]/gi, '')));
  const hasMeaningfulExtraction = text && text !== snippet && text.length > snippet.length + 80;
  const boilerplateHits = [
    /cookie/i,
    /subscribe/i,
    /advertisement/i,
    /copyright/i,
    /all rights reserved/i,
    /sign up/i,
    /privacy policy/i,
  ].filter((pattern) => pattern.test(text)).length;

  let score = 0;
  if (text.length >= 1200) score += 0.45;
  else if (text.length >= 900) score += 0.36;
  else if (text.length >= 650) score += 0.28;
  else if (text.length >= 400) score += 0.18;
  else if (text.length >= 220) score += 0.1;

  if (words.length >= 180) score += 0.22;
  else if (words.length >= 120) score += 0.16;
  else if (words.length >= 80) score += 0.1;

  if (hasMeaningfulExtraction) score += 0.18;
  if (uniqueWords.size >= 90) score += 0.1;
  else if (uniqueWords.size >= 55) score += 0.06;
  if (sourceUrl) score += 0.05;
  score -= boilerplateHits * 0.08;

  return clampScore(score);
}

export function qualityGateReason(article = {}, threshold = ARTICLE_PAGE_QUALITY_THRESHOLD) {
  const score = Number(article.extraction_quality_score ?? 0);
  if (score >= threshold) return null;

  const textLength = String(article.articleText || '').length;
  return [
    `extraction_quality_score ${score.toFixed(2)} below ${threshold.toFixed(2)}`,
    `articleText length=${textLength}`,
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
