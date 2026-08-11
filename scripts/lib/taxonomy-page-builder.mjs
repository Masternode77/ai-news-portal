import { publicArchiveEligible } from './archive-feed-builder.mjs';

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

// Taxonomy artifacts preserve the canonical source inventory. Reader-facing
// routes apply publicTaxonomyItems through the shared feed builder at render
// time, so a rights-review safe mode can correctly render no records without
// making the source artifact incomplete.
export function sourceTaxonomyItems(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || item.archiveOnly === true || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
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
  const sourceItems = sourceTaxonomyItems(items);
  return CATEGORY_PAGES.map(([slug, title]) => ({
    slug,
    title,
    items: sourceItems.filter((article) => categoryForArticle(article) === slug),
  }));
}

export function archivePages(items = [], pageSize = 24) {
  const sourceItems = sourceTaxonomyItems(items).sort((a, b) => new Date(b.analysisPublishedAt || b.publishedAt || 0) - new Date(a.analysisPublishedAt || a.publishedAt || 0));
  const pages = [];
  for (let i = 0; i < sourceItems.length; i += pageSize) {
    pages.push({ page: Math.floor(i / pageSize) + 1, items: sourceItems.slice(i, i + pageSize), total: sourceItems.length });
  }
  return pages.length ? pages : [{ page: 1, items: [], total: 0 }];
}

export { slugify as taxonomySlugify };
