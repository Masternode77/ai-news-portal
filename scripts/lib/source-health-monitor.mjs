import { dateMs } from './autonomous-desk-utils.mjs';

export function sourceHealthFromItems(source = {}, items = [], now = new Date()) {
  const relevant = items.filter((item) => item.source === source.name || String(item.url || item.sourceUrl || '').includes(source.domain));
  const latest = Math.max(0, ...relevant.map((item) => dateMs(item.publishedAt || item.fetchedAt)));
  const ageHours = latest ? (new Date(now).getTime() - latest) / 36e5 : Infinity;
  let status = source.status || 'active';
  if (!relevant.length) status = 'stale';
  if (ageHours > 72) status = 'stale';
  if (source.status === 'blocked' || source.status === 'paywalled' || source.status === 'extraction_failed') status = source.status;
  return {
    source_id: source.id,
    source_name: source.name,
    domain: source.domain,
    status,
    latest_item_at: latest ? new Date(latest).toISOString() : null,
    item_count: relevant.length,
    stale: status === 'stale',
  };
}

export function buildSourceHealthReport(sources = [], items = [], now = new Date()) {
  return sources.map((source) => sourceHealthFromItems(source, items, now));
}
