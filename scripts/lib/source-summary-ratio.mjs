import { splitSentences } from './autonomous-desk-utils.mjs';

function tokens(text = '') {
  return String(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((token) => token.length > 3);
}

export function sourceSummaryRatio(articleText = '', sourceText = '') {
  const diagnostics = sourceSummaryDiagnostics(articleText, sourceText);
  return {
    source_summary_ratio: diagnostics.source_summary_ratio,
    reasons: diagnostics.reasons,
  };
}

export function sourceSummaryDiagnostics(articleText = '', sourceText = '') {
  const sourceTokens = new Set(tokens(sourceText));
  const sentences = splitSentences(articleText);
  if (!sentences.length || !sourceTokens.size) {
    return {
      source_summary_ratio: 0.22,
      reasons: [],
      sentence_count: sentences.length,
      source_like_count: 0,
      allowed_source_like_count: Math.floor(sentences.length * 0.35),
      excess_source_like_count: 0,
      sentences: [],
    };
  }
  const measured = sentences.map((sentence) => {
    const words = tokens(sentence);
    const overlap = words.filter((word) => sourceTokens.has(word)).length / Math.max(words.length, 1);
    const attribution_trigger = /\baccording to|reported|said\b/i.test(sentence);
    return {
      sentence,
      overlap: Number(overlap.toFixed(3)),
      attribution_trigger,
      source_like: overlap > 0.58 || attribution_trigger,
    };
  });
  const sourceLike = measured.filter((entry) => entry.source_like).length;
  const allowed = Math.floor(sentences.length * 0.35);
  const ratio = sourceLike / sentences.length;
  return {
    source_summary_ratio: Number(ratio.toFixed(3)),
    reasons: ratio <= 0.35 ? [] : ['source_summary_ratio_above_35_percent'],
    sentence_count: sentences.length,
    source_like_count: sourceLike,
    allowed_source_like_count: allowed,
    excess_source_like_count: Math.max(0, sourceLike - allowed),
    sentences: measured,
  };
}
