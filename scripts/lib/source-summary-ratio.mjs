import { splitSentences } from './autonomous-desk-utils.mjs';

function tokens(text = '') {
  return String(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((token) => token.length > 3);
}

export function sourceSummaryRatio(articleText = '', sourceText = '') {
  const sourceTokens = new Set(tokens(sourceText));
  const sentences = splitSentences(articleText);
  if (!sentences.length || !sourceTokens.size) {
    return { source_summary_ratio: 0.22, reasons: [] };
  }
  let sourceLike = 0;
  for (const sentence of sentences) {
    const words = tokens(sentence);
    const overlap = words.filter((word) => sourceTokens.has(word)).length / Math.max(words.length, 1);
    if (overlap > 0.58 || /\baccording to|reported|said\b/i.test(sentence)) sourceLike += 1;
  }
  const ratio = sourceLike / sentences.length;
  return {
    source_summary_ratio: Number(ratio.toFixed(3)),
    reasons: ratio <= 0.35 ? [] : ['source_summary_ratio_above_35_percent'],
  };
}
