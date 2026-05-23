import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BANNED_PHRASES } from './banned-phrases.mjs';
import { nearDuplicatePhraseMatches } from './near-duplicate-phrase-detector.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FORBIDDEN_PUBLIC_PHRASES_PATH = path.join(ROOT, 'config/forbiddenPublicPhrases.yml');

function parseSimpleYamlList(raw = '', key = '') {
  const lines = String(raw || '').split(/\r?\n/);
  const values = [];
  let inList = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === `${key}:`) {
      inList = true;
      continue;
    }
    if (inList && /^[a-zA-Z_][\w-]*:\s*$/.test(trimmed)) break;
    if (!inList) continue;
    const match = line.match(/^\s*-\s*["']?(.+?)["']?\s*$/);
    if (match?.[1]) values.push(match[1].trim());
  }
  return values;
}

export function loadForbiddenPublicTemplatePhrases() {
  let publicPhrases = [];
  try {
    publicPhrases = parseSimpleYamlList(
      fs.readFileSync(FORBIDDEN_PUBLIC_PHRASES_PATH, 'utf8'),
      'forbidden_public_phrases'
    );
  } catch {
    publicPhrases = [];
  }
  return [...new Set([...BANNED_PHRASES, ...publicPhrases])].filter(Boolean);
}

export const PUBLIC_TEMPLATE_PHRASES = loadForbiddenPublicTemplatePhrases();

function normalizeForExact(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function publicTemplatePhraseMatches(text = '', phrases = PUBLIC_TEMPLATE_PHRASES) {
  const normalized = normalizeForExact(text);
  const exact = phrases
    .filter((phrase) => normalizeForExact(phrase) && normalized.includes(normalizeForExact(phrase)))
    .map((phrase) => ({ phrase, method: 'exact', score: 1 }));
  const near = nearDuplicatePhraseMatches(text, phrases)
    .filter((match) => !exact.some((item) => item.phrase === match.phrase));
  return [...exact, ...near];
}

export function guardPublicTemplatePhrases(text = '', options = {}) {
  const matches = publicTemplatePhraseMatches(text, options.phrases || PUBLIC_TEMPLATE_PHRASES);
  return {
    ok: matches.length === 0,
    matches,
    reasons: matches.map((match) => `public_template_phrase:${match.phrase}`),
  };
}

export function hasPublicTemplatePhrase(text = '') {
  return !guardPublicTemplatePhrases(text).ok;
}
