import { sourceTaxonomyItems, taxonomySlugify } from './taxonomy-page-builder.mjs';

export const DEFAULT_REGIONS = ['US', 'Europe', 'APAC', 'Middle East', 'Global'];

export function regionForArticle(article = {}) {
  return article.region || article.evidence_pack?.regions?.[0] || 'Global';
}

export function buildRegionIndex(items = []) {
  const sourceItems = sourceTaxonomyItems(items);
  const names = [...new Set([...DEFAULT_REGIONS, ...sourceItems.map(regionForArticle)])];
  return names.map((name) => ({
    slug: taxonomySlugify(name),
    name,
    items: sourceItems.filter((article) => regionForArticle(article).toLowerCase() === name.toLowerCase()),
  }));
}
