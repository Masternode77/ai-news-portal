import { buildArchiveFeed, publicArchiveEligible } from './archive-feed-builder.mjs';

export const CATEGORY_PAGES = [
  ['power-grid', 'Power & Grid'],
  ['data-centers', 'Data Centers'],
  ['cloud-capacity', 'Cloud Capacity'],
  ['semiconductors', 'Semiconductors'],
  ['cooling', 'Cooling'],
  ['capital-markets', 'Capital Markets'],
  ['regulation', 'Regulation'],
  ['supply-chain', 'Supply Chain'],
  ['ai-infrastructure', 'AI Infrastructure'],
];

function slugify(value = '') {
  return String(value).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function publicTaxonomyItems(items = []) {
  return items.filter(publicArchiveEligible);
}

export function buildTaxonomyListingFeed(items = []) {
  return buildArchiveFeed(items, {
    page: 1,
    pageSize: Math.max(1, items.length),
  });
}

export function categoryForArticle(article = {}) {
  const text = [article.primary_category, article.category, article.infrastructure_layer, ...(article.tags || [])].join(' ').toLowerCase();
  if (/power|grid|energy|utility/.test(text)) return 'power-grid';
  if (/data center|colocation|facility|campus/.test(text)) return 'data-centers';
  if (/cloud|hyperscaler|region/.test(text)) return 'cloud-capacity';
  if (/semiconductor|chip|gpu|hbm|memory|accelerator/.test(text)) return 'semiconductors';
  if (/cooling|thermal/.test(text)) return 'cooling';
  if (/capital|finance|reit|deal|ipo/.test(text)) return 'capital-markets';
  if (/policy|regulation|permit|siting|zoning/.test(text)) return 'regulation';
  if (/supply|supplier|equipment|construction/.test(text)) return 'supply-chain';
  return 'ai-infrastructure';
}

export function buildCategoryPages(items = []) {
  const publicItems = publicTaxonomyItems(items);
  return CATEGORY_PAGES.map(([slug, title]) => ({
    slug,
    title,
    items: publicItems.filter((article) => categoryForArticle(article) === slug),
  }));
}

export function archivePages(items = [], pageSize = 24) {
  const publicItems = publicTaxonomyItems(items).sort((a, b) => new Date(b.analysisPublishedAt || b.publishedAt || 0) - new Date(a.analysisPublishedAt || a.publishedAt || 0));
  const pages = [];
  for (let i = 0; i < publicItems.length; i += pageSize) {
    pages.push({ page: Math.floor(i / pageSize) + 1, items: publicItems.slice(i, i + pageSize), total: publicItems.length });
  }
  return pages.length ? pages : [{ page: 1, items: [], total: 0 }];
}

export { slugify as taxonomySlugify };
