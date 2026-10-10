import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import authoredColumns from '../src/data/authored-columns.json' with { type: 'json' };
import taxonomyPages from '../src/data/taxonomy-pages.json' with { type: 'json' };
import { buildHomepageFeed } from '../scripts/lib/homepage-feed-builder.mjs';
import { isPublicProductFit } from '../scripts/lib/public-product-fit.mjs';
import { currentSourceTextAuthorization } from '../scripts/lib/source-text-publication-authorization.mjs';
import { buildPublicPublicationCatalog } from '../scripts/lib/public-publication-catalog.mjs';

function sourceTaxonomyEligible(article = {}) {
  return Boolean(article?.id && article.archiveOnly !== true);
}

function uniqueIds(items = []) {
  return new Set(items.map((article) => article.id).filter(Boolean));
}

test('taxonomy source artifact exactly mirrors canonical non-archive-only source records', () => {
  // Given: the canonical source inventory and its checked-in source taxonomy artifact.
  const sourceIds = uniqueIds([...latestNews, ...archivedNews].filter(sourceTaxonomyEligible));
  const generatedIds = (taxonomyPages.archive || [])
    .flatMap((page) => page.items || [])
    .map((article) => article.id);
  const taxonomyIds = new Set(generatedIds);

  // When: source-layer inventory IDs are compared with taxonomy IDs.
  // Then: the artifact has no duplicate, omitted, or stale source records.
  assert.equal(generatedIds.length, taxonomyIds.size);
  assert.deepEqual([...taxonomyIds].sort(), [...sourceIds].sort());
});

test('public taxonomy rendering applies current product-fit and source-rights eligibility', () => {
  // Given: source-inventory taxonomy pages, which are intentionally broader than public rendering.
  const sourceItems = (taxonomyPages.categories || [])
    .flatMap((page) => page.items || []);
  const rendered = (taxonomyPages.categories || [])
    .flatMap((page) => buildHomepageFeed(page.items || [], { limit: 50, minimumVisible: 0 }).items);
  const unauthorizedIds = uniqueIds(sourceItems.filter((article) => (
    !currentSourceTextAuthorization(article, article.extraction_artifact).ok
  )));
  const productFitRejectedIds = uniqueIds(sourceItems.filter((article) => !isPublicProductFit(article)));

  // When: category pages apply the shared reader-facing feed builder.
  // Then: every rendered record passes both public eligibility layers; zero records is valid in rights-review safe mode.
  assert.deepEqual(rendered.map((article) => article.id).filter((id) => unauthorizedIds.has(id)), []);
  assert.deepEqual(rendered.map((article) => article.id).filter((id) => productFitRejectedIds.has(id)), []);
  for (const article of rendered) {
    assert.equal(isPublicProductFit(article), true, `${article.id} must pass public product-fit eligibility`);
    assert.equal(currentSourceTextAuthorization(article, article.extraction_artifact).ok, true, `${article.id} must have current source-text authorization`);
  }
});

test('taxonomy report separates internal source partitions from rights-safe public routes', () => {
  // Given: the checked-in source artifact and its current public-route report.
  const sourceIds = uniqueIds([...latestNews, ...archivedNews].filter(sourceTaxonomyEligible));
  const report = fs.readFileSync(new URL('../docs/taxonomy-pages-report.md', import.meta.url), 'utf8');
  const catalog = buildPublicPublicationCatalog({ articles: [...latestNews, ...archivedNews], columns: authoredColumns });
  const activeCategories = new Set(catalog.map((item) => item.categorySlug));
  const activeRegions = new Set(catalog.map((item) => item.regionSlug));
  const renderedTaxonomyRouteCount = (taxonomyPages.categories || []).filter((page) => activeCategories.has(page.slug)).length
    + (taxonomyPages.regions || []).filter((page) => activeRegions.has(page.slug)).length
    + (taxonomyPages.companies || []).filter((page) => buildHomepageFeed(page.items || [], { limit: 50, minimumVisible: 0 }).items.length > 0).length;

  // When: source inventory and reader-facing route facts are reported.
  // Then: internal partition counts cannot be mistaken for public route counts.
  assert.match(report, new RegExp(`Source artifact archive partitions: ${taxonomyPages.archive.length}`));
  assert.match(report, new RegExp(`Source artifact records: ${sourceIds.size}`));
  assert.ok(report.includes(`Public archive route: \`/archive/\` (${catalog.length} rendered eligible records)`));
  assert.match(report, new RegExp(`Taxonomy detail routes with rendered eligible records: ${renderedTaxonomyRouteCount}`));
  assert.doesNotMatch(report, /^Archive pages:/m);
});
