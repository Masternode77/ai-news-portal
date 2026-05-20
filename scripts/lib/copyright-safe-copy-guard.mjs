import { splitSentences } from './autonomous-desk-utils.mjs';

function normalize(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function shingleSet(text = '') {
  const words = normalize(text).split(/\s+/).filter(Boolean);
  const out = new Set();
  for (let i = 0; i <= words.length - 8; i += 1) out.add(words.slice(i, i + 8).join(' '));
  return out;
}

export function copyrightSafeCopyGuard({ generatedText = '', sourceText = '' } = {}) {
  const source = shingleSet(sourceText);
  const generated = shingleSet(generatedText);
  if (!source.size || !generated.size) return { ok: true, overlap_score: 0, reasons: [] };
  let overlap = 0;
  for (const item of generated) if (source.has(item)) overlap += 1;
  const overlapScore = overlap / generated.size;
  const copiedSentence = splitSentences(generatedText).some((sentence) => sourceText.includes(sentence) && sentence.length > 120);
  const reasons = [];
  if (overlapScore > 0.22) reasons.push('source_overlap_above_threshold');
  if (copiedSentence) reasons.push('copied_source_sentence');
  return {
    ok: reasons.length === 0,
    overlap_score: Number(overlapScore.toFixed(3)),
    reasons,
  };
}
