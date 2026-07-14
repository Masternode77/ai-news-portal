import fs from 'node:fs';
import { bannedPhraseMatches } from './banned-phrases.mjs';
import { hasMalformedProperNouns, malformedProperNouns, normalizeProperNouns } from './proper-noun-normalizer.mjs';
import { projectConfigPath } from './project-root.mjs';
import { detectTruncationArtifacts } from './truncation-detector.mjs';

const FORBIDDEN_PUBLIC_PHRASES_PATH = projectConfigPath(import.meta.url, 'forbiddenPublicPhrases.yml');

function parseSimpleYamlList(raw = '', key = '') {
  const lines = String(raw || '').split(/\r?\n/);
  const values = [];
  let inList = false;
  for (const line of lines) {
    if (new RegExp(`^${key}:\\s*$`).test(line.trim())) {
      inList = true;
      continue;
    }
    if (!inList) continue;
    const match = line.match(/^\s*-\s*["']?(.+?)["']?\s*$/);
    if (match) values.push(match[1]);
  }
  return values;
}

export function loadForbiddenPublicPhrases() {
  try {
    return parseSimpleYamlList(
      fs.readFileSync(FORBIDDEN_PUBLIC_PHRASES_PATH, 'utf8'),
      'forbidden_public_phrases'
    );
  } catch {
    return [];
  }
}

export const FORBIDDEN_PUBLIC_PHRASES = loadForbiddenPublicPhrases();

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function phrasePattern(phrase = '') {
  const escaped = escapeRegExp(phrase)
    .replace(/\\\[source\\\]/gi, '[^.]{2,80}')
    .replace(/\\ /g, '\\s+');
  return new RegExp(escaped, 'i');
}

export function forbiddenPublicPhraseMatches(text = '') {
  const haystack = String(text || '');
  return FORBIDDEN_PUBLIC_PHRASES.filter((phrase) => phrasePattern(phrase).test(haystack));
}

export function hasForbiddenPublicPhrase(text = '') {
  return forbiddenPublicPhraseMatches(text).length > 0;
}

export function firstWords(text = '', count = 8) {
  return String(text || '')
    .toLowerCase()
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .replace(/[^a-z0-9가-힣\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, count)
    .join(' ');
}

export function duplicateFirstWordPrefixes(items = [], count = 8) {
  const seen = new Map();
  const duplicates = [];
  for (const item of items) {
    const candidate = typeof item === 'string' ? item : item?.text || item?.deck || '';
    const prefix = firstWords(candidate, count);
    if (!prefix) continue;
    if (seen.has(prefix)) {
      duplicates.push({ prefix, first: seen.get(prefix), second: item });
    } else {
      seen.set(prefix, item);
    }
  }
  return duplicates;
}

export function repeatedParagraphFingerprints(pages = []) {
  const seen = new Map();
  const repeats = [];
  for (const page of pages) {
    for (const paragraph of page.paragraphs || []) {
      const fingerprint = firstWords(paragraph, 999);
      if (fingerprint.length < 80) continue;
      if (seen.has(fingerprint)) {
        repeats.push({ fingerprint, first: seen.get(fingerprint), second: page });
      } else {
        seen.set(fingerprint, page);
      }
    }
  }
  return repeats;
}

export function guardPublicCopy(value = '', options = {}) {
  const original = String(value || '').replace(/\s+/g, ' ').trim();
  const malformed = malformedProperNouns(original);
  const normalized = normalizeProperNouns(original);
  const forbidden = forbiddenPublicPhraseMatches(normalized);
  const banned = bannedPhraseMatches(normalized);
  const truncation = detectTruncationArtifacts(normalized, { allowEllipsis: options.allowEllipsis === true });
  const reasons = [];
  if (forbidden.length) reasons.push(...forbidden.map((phrase) => `forbidden_phrase:${phrase}`));
  if (Object.keys(banned).length) reasons.push(...Object.keys(banned).map((phrase) => `banned_phrase:${phrase}`));
  if (!truncation.ok) reasons.push(...truncation.artifacts);
  if (hasMalformedProperNouns(original)) reasons.push(...malformed.map((item) => `proper_noun:${item.observed}->${item.expected}`));
  return {
    ok: reasons.length === 0,
    text: normalized,
    forbidden,
    banned,
    truncation,
    malformed_proper_nouns: malformed,
    reasons,
  };
}
