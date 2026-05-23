import { compact, hash } from './autonomous-desk-utils.mjs';

export function signalKeyFor(item = {}) {
  const layer = compact(item.infrastructure_layer || 'ai-infrastructure').toLowerCase();
  const region = compact(item.original?.region || item.region || 'global').toLowerCase();
  const companies = (item.companies || []).slice(0, 2).map((name) => name.toLowerCase()).join('-');
  const titleTokens = compact(item.title)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 3)
    .slice(0, 7)
    .join('-');
  return hash([layer, region, companies, titleTokens].join('|'));
}

export function mergeSignalItems(items = []) {
  const groups = new Map();
  for (const item of items) {
    const key = signalKeyFor(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}
