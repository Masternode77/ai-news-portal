function normalize(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/&amp;/g, ' and ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value = '') {
  return normalize(value).split(/\s+/).filter(Boolean);
}

function orderedCoverage(haystackTokens = [], phraseTokens = []) {
  let cursor = 0;
  let matched = 0;
  for (const token of haystackTokens) {
    if (token === phraseTokens[cursor]) {
      cursor += 1;
      matched += 1;
      if (cursor >= phraseTokens.length) break;
    }
  }
  return phraseTokens.length ? matched / phraseTokens.length : 0;
}

function windowTokenSets(haystackTokens = [], size = 8) {
  const windows = [];
  const width = Math.max(3, size);
  for (let i = 0; i <= haystackTokens.length - Math.min(width, haystackTokens.length); i += 1) {
    windows.push(haystackTokens.slice(i, i + width));
  }
  return windows.length ? windows : [haystackTokens];
}

function jaccard(a = [], b = []) {
  const left = new Set(a);
  const right = new Set(b);
  const union = new Set([...left, ...right]);
  if (!union.size) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return intersection / union.size;
}

export function nearDuplicatePhraseMatches(text = '', phrases = [], options = {}) {
  const normalizedText = normalize(text);
  const haystackTokens = tokens(normalizedText);
  const threshold = Number(options.threshold || 0.82);
  const matches = [];

  for (const phrase of phrases) {
    const normalizedPhrase = normalize(phrase);
    if (!normalizedPhrase) continue;
    if (normalizedText.includes(normalizedPhrase)) {
      matches.push({ phrase, method: 'exact_normalized', score: 1 });
      continue;
    }

    const phraseTokens = tokens(normalizedPhrase);
    if (phraseTokens.length < 4) continue;
    const windows = windowTokenSets(haystackTokens, Math.ceil(phraseTokens.length * 1.35));
    const bestWindowScore = Math.max(...windows.map((window) => jaccard(window, phraseTokens)), 0);
    const score = bestWindowScore;
    if (score >= threshold) {
      matches.push({ phrase, method: 'near_duplicate', score: Number(score.toFixed(3)) });
    }
  }

  return matches;
}

export function hasNearDuplicatePhrase(text = '', phrases = [], options = {}) {
  return nearDuplicatePhraseMatches(text, phrases, options).length > 0;
}
