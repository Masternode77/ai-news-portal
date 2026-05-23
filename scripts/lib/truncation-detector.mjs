const INCOMPLETE_TERMINALS = new Set([
  'b',
  'c',
  'd',
  'clo',
  'clou',
  'fuelin',
  'hundreds o',
  'te',
  'th',
  'pla',
  'platfor',
  'positionin',
  'operatin',
  'plannin',
  'financin',
  'deploymen',
  'procuremen',
  'infrastructur',
  'semiconducto',
  'capacit',
  'availabilit',
  'readines',
]);
const SAFE_ABBREVIATIONS = new Set(['u.s', 'u.k', 'e.g', 'i.e', 'inc', 'co', 'ltd', 'corp', 'mr', 'ms', 'dr']);

function normalizeText(text = '') {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

export function detectTruncationArtifacts(text = '', options = {}) {
  const normalized = normalizeText(text);
  const artifacts = [];
  if (!normalized) {
    return { ok: true, artifacts };
  }

  if (/(?:^|\s)(?:clo|[b-d])\.(?:\s|$)/i.test(normalized)) {
    artifacts.push('single_letter_or_clo_sentence_fragment');
  }

  if (/(?:^|\s)(?:fuelin|hundreds\s+o)\.(?:\s|$)/i.test(normalized)) {
    artifacts.push('known_clipped_sentence_fragment');
  }

  if (/(?:^|\s)[a-z]\.(?:\s|$)/.test(normalized)) {
    artifacts.push('single_lowercase_letter_sentence_fragment');
  }

  if (!options.allowEllipsis && /(?:…|\.{3})/.test(normalized)) {
    artifacts.push('ellipsis_truncation_artifact');
  }

  const sentenceLike = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  for (const sentence of sentenceLike) {
    const terminal = sentence.match(/\b([A-Za-z](?:[A-Za-z]|\s){0,16})\.(?:"|')?$/)?.[1]?.toLowerCase();
    if (!terminal) continue;
    const safe = SAFE_ABBREVIATIONS.has(terminal.replace(/\.$/, ''));
    if (!safe && INCOMPLETE_TERMINALS.has(terminal)) {
      artifacts.push(`incomplete_terminal:${terminal}`);
    }
  }

  const lastToken = normalized.match(/\b([A-Za-z]{1,16})\.?$/)?.[1]?.toLowerCase();
  if (
    lastToken &&
    INCOMPLETE_TERMINALS.has(lastToken) &&
    !SAFE_ABBREVIATIONS.has(lastToken)
  ) {
    artifacts.push(`truncated_final_token:${lastToken}`);
  }

  return {
    ok: artifacts.length === 0,
    artifacts: [...new Set(artifacts)],
  };
}

export function sentenceCompletionScore(text = '') {
  const normalized = normalizeText(text);
  if (!normalized) return 0;
  const fragments = detectTruncationArtifacts(normalized, { allowEllipsis: true });
  const sentences = normalized.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
  const complete = sentences.filter((sentence) => /[.!?]["')\]]?$/.test(sentence)).length;
  const terminal = /[.!?]["')\]]?$/.test(normalized) ? 1 : 0;
  const base = sentences.length ? complete / sentences.length : terminal;
  const penalty = fragments.artifacts.length ? Math.min(0.5, fragments.artifacts.length * 0.18) : 0;
  return Number(Math.max(0, Math.min(1, base * 0.85 + terminal * 0.15 - penalty)).toFixed(3));
}

export function hasTruncationArtifacts(text = '', options = {}) {
  return !detectTruncationArtifacts(text, options).ok;
}

export function isTruncatedEvidence(value = '') {
  const text = normalizeText(value);
  if (!text) return true;
  if (text.length < 80) return true;
  return hasTruncationArtifacts(text);
}
