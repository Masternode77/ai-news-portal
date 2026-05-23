import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_PHRASE_PATH = path.join(ROOT, 'config/editorial/internal-public-banned-phrases.json');

const REPLACEMENTS = new Map([
  ['Find published anaylsis', 'Search the archive'],
  ['Find published analysis', 'Search the archive'],
  ['Cycle status completed_no_qualifying_signals', 'No new stories yet.'],
  ['completed_no_qualifying_signals', 'No new stories yet.'],
  ['No qualifying signals', 'No new stories yet.'],
  ['no qualifying signals', 'No new stories yet.'],
  ['Latest qualifying signal', 'Latest stories'],
  ['Latest published analysis', 'Latest analysis'],
  ['Signals being monitored', 'Latest analysis'],
  ['Published deskwork', 'Recent analysis'],
]);

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function loadInternalPublicBannedPhrases(filePath = DEFAULT_PHRASE_PATH) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function isAdminPublicPath(publicPath = '') {
  const normalized = `/${String(publicPath).replace(/^\/+/, '')}`;
  return normalized.startsWith('/admin/')
    || normalized === '/admin'
    || normalized.startsWith('/api/admin/')
    || normalized.startsWith('/dashboard/');
}

export function sanitizePublicCopy(value = '') {
  let text = String(value || '');
  for (const [needle, replacement] of REPLACEMENTS) {
    text = text.replace(new RegExp(escapeRegExp(needle), 'gi'), replacement);
  }
  const phrases = loadInternalPublicBannedPhrases();
  for (const phrase of phrases) {
    if (!phrase) continue;
    const pattern = new RegExp(escapeRegExp(phrase), 'gi');
    text = text.replace(pattern, '');
  }
  return text.replace(/\s+/g, ' ').trim() || 'No new stories yet.';
}

export function findInternalLanguageHits(records = [], options = {}) {
  const phrases = options.phrases || loadInternalPublicBannedPhrases(options.phrasePath);
  const hits = [];
  for (const record of records) {
    const publicPath = record.path || record.file || '';
    if (isAdminPublicPath(publicPath)) continue;
    const text = String(record.text || '');
    for (const phrase of phrases) {
      if (!phrase) continue;
      const pattern = new RegExp(escapeRegExp(phrase), 'i');
      if (pattern.test(text)) {
        hits.push({
          path: publicPath,
          surface: record.surface || 'public',
          phrase,
        });
      }
    }
  }
  return hits;
}
