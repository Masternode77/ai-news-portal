import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const CONFIG_PATH = path.join(ROOT, 'config/bannedPhrases.yml');

function parseListBlock(text = '', key = '') {
  const lines = text.split(/\r?\n/);
  const values = [];
  let inBlock = false;

  for (const line of lines) {
    if (new RegExp(`^${key}:\\s*$`).test(line.trim())) {
      inBlock = true;
      continue;
    }
    if (inBlock && /^[a-zA-Z_][\w-]*:\s*$/.test(line.trim())) break;
    if (!inBlock) continue;

    const match = line.match(/^\s*-\s*["']?(.+?)["']?\s*$/);
    if (match?.[1]) values.push(match[1].trim());
  }

  return values;
}

export function loadBannedPhraseConfig() {
  const text = fs.readFileSync(CONFIG_PATH, 'utf8');
  const explicitPhrases = parseListBlock(text, 'banned_phrases');
  const legacyPhrases = parseListBlock(text, 'phrases');
  return {
    phrases: [...new Set([...explicitPhrases, ...legacyPhrases])],
    blockedHookStarts: parseListBlock(text, 'blockedHookStarts'),
  };
}

export const BANNED_PHRASES = loadBannedPhraseConfig().phrases;
export const BLOCKED_HOOK_STARTS = loadBannedPhraseConfig().blockedHookStarts;

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function phraseOccurrences(text = '', phrase = '') {
  if (!phrase) return 0;
  const pattern = new RegExp(escapeRegExp(phrase).replace(/\s+/g, '\\s+'), 'gi');
  return (String(text || '').match(pattern) || []).length;
}

export function bannedPhraseMatches(text = '', phrases = BANNED_PHRASES) {
  const matches = {};
  for (const phrase of phrases) {
    const count = phraseOccurrences(text, phrase);
    if (count > 0) matches[phrase] = count;
  }
  return matches;
}

export function hasBannedPhrase(text = '') {
  return Object.keys(bannedPhraseMatches(text)).length > 0;
}

export function hookStartsWithBlockedPhrase(text = '') {
  const normalized = String(text || '').trim().toLowerCase();
  return BLOCKED_HOOK_STARTS.some((start) => normalized.startsWith(start.toLowerCase()));
}

export function assertNoBannedPhrases(text = '', context = 'generated_text') {
  const matches = bannedPhraseMatches(text);
  const entries = Object.entries(matches);
  if (!entries.length) return { ok: true, matches: {} };

  const detail = entries.map(([phrase, count]) => `${phrase} (${count})`).join(', ');
  const error = new Error(`${context} contains banned phrases: ${detail}`);
  error.bannedPhraseMatches = matches;
  throw error;
}
