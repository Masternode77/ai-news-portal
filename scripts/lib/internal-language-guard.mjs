import fs from 'node:fs';
import { projectConfigPath } from './project-root.mjs';

const DEFAULT_PHRASE_PATH = projectConfigPath(import.meta.url, 'editorial/internal-public-banned-phrases.json');

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
const AUDIT_ONLY_SANITIZER_PHRASES = new Set(['blueprint']);
const ACCESSIBILITY_TEXT_ATTRIBUTES = ['alt', 'aria-label', 'aria-description', 'title'];
const STRUCTURAL_TAG_PATTERN = /<\/?(?:article|aside|blockquote|br|dd|details|dialog|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*(?:>|$)/gi;

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function phrasePattern(phrase = '', flags = 'i') {
  const escaped = escapeRegExp(phrase).replace(/\s+/g, '\\s+');
  const standaloneWord = /^[A-Za-z0-9_]+$/.test(phrase);
  return new RegExp(standaloneWord ? `\\b${escaped}\\b` : escaped, flags);
}

function decodeHtmlEntities(value = '') {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function accessibilityAttributeText(markup = '') {
  const values = [];
  const tagPattern = /<[a-z][\s\S]*?(?:>|$)/gi;
  for (const tagMatch of String(markup || '').matchAll(tagPattern)) {
    const tag = tagMatch[0];
    for (const attribute of ACCESSIBILITY_TEXT_ATTRIBUTES) {
      const pattern = new RegExp(`(?:^|\\s)${escapeRegExp(attribute)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'gi');
      for (const valueMatch of tag.matchAll(pattern)) {
        const value = valueMatch[1] || valueMatch[2] || valueMatch[3] || '';
        if (value) values.push(value);
      }
    }
  }
  return values.join(' ');
}

export function extractReaderVisibleText(markup = '') {
  const readerMarkup = String(markup || '')
    .replace(/^---[\s\S]*?---/, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  const attributeText = accessibilityAttributeText(readerMarkup);
  const bodyText = readerMarkup
    .replace(STRUCTURAL_TAG_PATTERN, ' . ')
    .replace(/<[^>]*(?:>|$)/g, ' ');
  return decodeHtmlEntities(`${attributeText} ${bodyText}`)
    .replace(/\s+/g, ' ')
    .trim();
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
    text = text.replace(phrasePattern(needle, 'gi'), replacement);
  }
  const phrases = loadInternalPublicBannedPhrases();
  for (const phrase of phrases) {
    if (!phrase) continue;
    if (AUDIT_ONLY_SANITIZER_PHRASES.has(String(phrase).toLowerCase())) continue;
    text = text.replace(phrasePattern(phrase, 'gi'), '');
  }
  return text.replace(/\s+/g, ' ').trim() || 'No new stories yet.';
}

export function hasInternalPublicLanguage(value = '', options = {}) {
  return findInternalLanguageHits([
    {
      path: options.path || '/',
      surface: options.surface || 'public-copy',
      text: String(value || ''),
    },
  ], options).length > 0;
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
      if (phrasePattern(phrase).test(text)) {
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
