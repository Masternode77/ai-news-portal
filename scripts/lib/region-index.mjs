import { publicTaxonomyItems, taxonomySlugify } from './taxonomy-page-builder.mjs';

export const DEFAULT_REGIONS = ['US', 'Europe', 'APAC', 'Middle East', 'Global'];

export function regionForArticle(article = {}) {
  return article.region || article.evidence_pack?.regions?.[0] || 'Global';
}

export function buildRegionIndex(items = []) {
  const publicItems = publicTaxonomyItems(items);
  const names = [...new Set([...DEFAULT_REGIONS, ...publicItems.map(regionForArticle)])];
  return names.map((name) => ({
    slug: taxonomySlugify(name),
    name,
    items: publicItems.filter((article) => regionForArticle(article).toLowerCase() === name.toLowerCase()),
  }));
}
