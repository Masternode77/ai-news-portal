import { compact, hash, titleTextFor } from './autonomous-desk-utils.mjs';

export function normalizedTitleKey(value = '') {
  return compact(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(the|a|an|to|for|and|with|from|by|on|of|in|at|as)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function dedupeHashFor(item = {}) {
  return hash([normalizedTitleKey(titleTextFor(item)).slice(0, 96), item.source || '', item.publishedAt || ''].join('|'));
}

export function contentHashFor(item = {}) {
  return hash([item.url || item.sourceUrl || '', item.title || '', item.contentText || item.articleText || item.summary || item.snippet || ''].join('|'));
}

export function dedupeSourceItems(items = []) {
  const seenUrl = new Set();
  const seenTitle = new Set();
  const out = [];
  for (const item of items) {
    const urlKey = String(item.url || item.sourceUrl || '').replace(/#.*$/, '');
    const titleKey = normalizedTitleKey(item.title);
    if (urlKey && seenUrl.has(urlKey)) continue;
    if (titleKey && seenTitle.has(titleKey)) continue;
    if (urlKey) seenUrl.add(urlKey);
    if (titleKey) seenTitle.add(titleKey);
    out.push({ ...item, content_hash: contentHashFor(item), dedupe_hash: dedupeHashFor(item) });
  }
  return out;
}
