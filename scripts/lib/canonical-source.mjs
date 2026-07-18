import { normalizeUrl } from './normalize.mjs';

function clean(value = '') {
  return String(value || '').trim();
}

export function canonicalSourceKey(item = {}) {
  const sourceUrl = clean(
    item.canonicalSourceUrl
      || item.sourceUrl
      || item.url
      || item.link,
  );
  const normalized = normalizeUrl(sourceUrl);
  return normalized ? `url:${normalized}` : `id:${clean(item.id)}`;
}

export function uniqueByCanonicalSource(items = [], options = {}) {
  const isEligible = options.isEligible || (() => true);
  const seenIds = new Set();
  const seenSources = new Set();
  const unique = [];

  for (const item of items) {
    if (!item?.id || seenIds.has(item.id)) continue;
    seenIds.add(item.id);

    if (!isEligible(item)) {
      unique.push(item);
      continue;
    }

    const sourceKey = canonicalSourceKey(item);
    if (seenSources.has(sourceKey)) continue;
    seenSources.add(sourceKey);
    unique.push(item);
  }

  return unique;
}
