import { buildProjectedSearchText } from './public-search-projection.js';

export function normalizeSearchText(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function searchTokens(query = '') {
  const normalized = normalizeSearchText(query);
  return normalized ? normalized.split(' ') : [];
}

export function buildPublicSearchRecord(item = {}) {
  const signal = item.publicSignal || item;
  const title = signal.title || '';
  const category = signal.category || '';
  const source = signal.source || '';
  const href = signal.view_detail || signal.read_source || '';
  const searchable = buildProjectedSearchText(item);

  return {
    id: item.id || signal.id || href || title,
    title,
    category,
    source,
    searchText: normalizeSearchText(searchable),
    normalizedCategory: normalizeSearchText(category),
    normalizedSource: normalizeSearchText(source),
  };
}

export function matchesPublicSearchRecord(record = {}, filters = {}) {
  const queryTokens = searchTokens(filters.q || filters.query || '');
  const category = normalizeSearchText(filters.category || '');
  const source = normalizeSearchText(filters.source || '');
  const searchText = record.searchText || '';

  if (category && record.normalizedCategory !== category) return false;
  if (source && record.normalizedSource !== source) return false;
  return queryTokens.every((token) => searchText.includes(token));
}

export function publicSearchFilterOptions(records = []) {
  const categories = new Map();
  const sources = new Map();

  for (const record of records) {
    if (record.normalizedCategory && !categories.has(record.normalizedCategory)) {
      categories.set(record.normalizedCategory, record.category);
    }
    if (record.normalizedSource && !sources.has(record.normalizedSource)) {
      sources.set(record.normalizedSource, record.source);
    }
  }

  return {
    categories: [...categories.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    sources: [...sources.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}
