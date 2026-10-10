import { buildArchiveFeed } from './archive-feed-builder.mjs';
import { buildColumnCards, publishedColumns } from './column-surface.mjs';
import { safeHttpUrl } from './normalize.mjs';
import { shouldNoindexPublicArticle } from './seo-quality-policy.mjs';

function plainText(value = '') {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function dateMs(value = '') {
  const stamp = new Date(String(value || '')).getTime();
  return Number.isFinite(stamp) ? stamp : 0;
}

export function publicationCategorySlug(value = '') {
  const text = String(value || '').toLowerCase();
  if (/power|grid|energy|utility/.test(text)) return 'power-grid';
  if (/data center|colocation|facility|campus/.test(text)) return 'data-centers';
  if (/cloud|hyperscaler|region/.test(text)) return 'cloud-capacity';
  if (/semiconductor|silicon|chip|gpu|hbm|memory|accelerator|systems/.test(text)) return 'semiconductors';
  if (/cooling|thermal/.test(text)) return 'cooling';
  if (/capital|finance|reit|deal|ipo/.test(text)) return 'capital-markets';
  if (/policy|regulation|permit|siting|zoning/.test(text)) return 'regulation';
  if (/supply|supplier|equipment|construction/.test(text)) return 'supply-chain';
  return 'ai-infrastructure';
}

export function publicationRegionSlug(value = '') {
  return String(value || 'Global').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'global';
}

function articleType(signal = {}) {
  if (signal.view_detail) return 'Analysis';
  if (/signal/i.test(signal.signal_label || signal.label || '')) return 'Signal';
  return 'Brief';
}

function articlePublication(entry = {}) {
  const signal = entry.publicSignal || {};
  const date = signal.date || entry.analysisPublishedAt || entry.publishedAt || entry.updatedAt || '';
  const category = plainText(signal.category || signal.editorial_lens || entry.primary_category || entry.category || 'AI Infrastructure');
  const source = plainText(signal.source || entry.source || entry.source_name || 'Public source');
  const href = signal.view_detail || safeHttpUrl(signal.read_source) || '';
  return {
    id: String(entry.id),
    kind: 'article',
    type: articleType(signal),
    title: plainText(signal.title || entry.title),
    deck: plainText(signal.deck || entry.deck || entry.summary),
    whyItMatters: plainText(signal.why_it_matters || entry.why_it_matters),
    category,
    categorySlug: publicationCategorySlug(category),
    source,
    date,
    href,
    sourceHref: safeHttpUrl(signal.read_source || entry.sourceUrl || entry.url),
    image: signal.image || '/generated/fallbacks/ai-infrastructure.svg',
    imageAlt: signal.image_alt || `${plainText(signal.title || entry.title)} editorial visual`,
    region: plainText(entry.region || entry.evidence_pack?.regions?.[0] || 'Global'),
    regionSlug: publicationRegionSlug(entry.region || entry.evidence_pack?.regions?.[0] || 'Global'),
    tags: Array.isArray(entry.tags) ? entry.tags.map(plainText).filter(Boolean) : [],
  };
}

function columnPublications(columns = []) {
  const cardById = new Map(buildColumnCards(columns).map((card) => [card.id, card]));
  return publishedColumns(columns).flatMap((column) => {
    const card = cardById.get(column.id);
    if (!card) return [];
    const source = plainText(column.sources?.[0]?.name || 'The Current');
    const region = plainText(column.region || column.evidence_pack?.regions?.[0] || 'Global');
    return [{
      id: String(column.id),
      kind: 'column',
      type: 'Column',
      title: card.title,
      deck: card.deck,
      whyItMatters: card.thesis,
      category: card.category,
      categorySlug: publicationCategorySlug(card.category),
      source,
      date: card.date,
      href: card.href,
      sourceHref: safeHttpUrl(column.sources?.[0]?.url),
      image: card.image,
      imageAlt: card.imageAlt,
      region,
      regionSlug: publicationRegionSlug(region),
      tags: Array.isArray(column.tags) ? column.tags.map(plainText).filter(Boolean) : [],
    }];
  });
}

export function buildPublicPublicationCatalog({ articles = [], columns = [] } = {}, options = {}) {
  const articleFeed = buildArchiveFeed(articles, {
    ...options,
    page: 1,
    pageSize: Math.max(articles.length, 1),
  });
  const seen = new Set();
  return [
    ...articleFeed.items.filter((item) => !shouldNoindexPublicArticle(item, options)).map(articlePublication),
    ...columnPublications(columns),
  ]
    .filter((item) => item.id && item.title && item.href)
    .sort((a, b) => dateMs(b.date) - dateMs(a.date))
    .filter((item) => {
      const key = `${item.kind}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizedDateBoundary(value = '', endOfDay = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const stamp = Date.parse(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isFinite(stamp) ? stamp : null;
}

export function filterPublications(catalog = [], filters = {}) {
  const query = plainText(filters.query).toLowerCase();
  const category = plainText(filters.category).toLowerCase();
  const type = plainText(filters.type).toLowerCase();
  const source = plainText(filters.source).toLowerCase();
  const region = plainText(filters.region).toLowerCase();
  const fromMs = normalizedDateBoundary(filters.dateFrom);
  const toMs = normalizedDateBoundary(filters.dateTo, true);
  const pageSize = Math.min(50, Math.max(1, Number(filters.pageSize) || 18));
  const matches = catalog.filter((item) => {
    const itemDate = dateMs(item.date);
    const haystack = [item.title, item.deck, item.whyItMatters, item.category, item.source, item.region, ...(item.tags || [])]
      .join(' ')
      .toLowerCase();
    return (!query || query.split(/\s+/).every((term) => haystack.includes(term)))
      && (!category || item.categorySlug === category)
      && (!type || item.type.toLowerCase() === type)
      && (!source || item.source.toLowerCase() === source)
      && (!region || item.regionSlug === region)
      && (fromMs === null || itemDate >= fromMs)
      && (toMs === null || itemDate <= toMs);
  });
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const page = Math.min(pageCount, Math.max(1, Number(filters.page) || 1));
  return {
    items: matches.slice((page - 1) * pageSize, page * pageSize),
    total: matches.length,
    page,
    pageSize,
    pageCount,
  };
}

export function publicationFacets(catalog = []) {
  const unique = (field) => [...new Set(catalog.map((item) => item[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return {
    categories: [...new Map(catalog.map((item) => [item.categorySlug, item.category])).entries()]
      .map(([slug, label]) => ({ slug, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    types: unique('type'),
    sources: unique('source'),
    regions: [...new Map(catalog.map((item) => [item.regionSlug, item.region])).entries()]
      .map(([slug, label]) => ({ slug, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}
