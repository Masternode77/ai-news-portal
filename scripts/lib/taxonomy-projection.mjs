import { syncTaxonomyArticleImagesById } from './article-image-surface.mjs';
import { buildCompanyIndex } from './company-entity-index.mjs';
import { dedupeFeedItems } from './homepage-feed-builder.mjs';
import { buildRegionIndex } from './region-index.mjs';
import { archivePages, buildCategoryPages, publicTaxonomyItems } from './taxonomy-page-builder.mjs';

export function taxonomyGeneratedAt(items = []) {
  const timestamps = items
    .flatMap((item) => [item.updatedAt, item.analysisPublishedAt, item.publishedAt])
    .map((value) => new Date(value || 0).getTime())
    .filter(Number.isFinite);
  return new Date(timestamps.length ? Math.max(...timestamps) : 0).toISOString();
}

export function buildTaxonomyProjection(items = []) {
  const canonicalItems = dedupeFeedItems(publicTaxonomyItems(items));
  return syncTaxonomyArticleImagesById({
    generatedAt: taxonomyGeneratedAt(items),
    categories: buildCategoryPages(canonicalItems),
    companies: buildCompanyIndex(canonicalItems),
    regions: buildRegionIndex(canonicalItems),
    archive: archivePages(canonicalItems),
  }, items).updated;
}
