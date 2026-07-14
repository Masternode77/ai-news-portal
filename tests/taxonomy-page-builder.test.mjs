import assert from 'node:assert/strict';
import test from 'node:test';
import {
  archivePages,
  buildCategoryPages,
  buildTaxonomyListingFeed,
} from '../scripts/lib/taxonomy-page-builder.mjs';
import { generateLongformAnalysis } from '../scripts/lib/longform-engine.mjs';
import { buildTaxonomyProjection } from '../scripts/lib/taxonomy-projection.mjs';
import { dedupeFeedItems } from '../scripts/lib/homepage-feed-builder.mjs';
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };

test('taxonomy builder exposes only public indexable analyses', () => {
  const articleText = 'Power and grid infrastructure analysis connects verified source evidence to capacity and delivery milestones. '.repeat(16);
  const publicArticle = generateLongformAnalysis({
    id: 'a',
    title: 'Grid milestones shape AI capacity delivery',
    source: 'Infrastructure Filing',
    sourceUrl: 'https://example.com/grid-milestones',
    articlePagePublished: true,
    homepagePublished: true,
    archiveOnly: false,
    noindex: false,
    seo_noindex: false,
    public_status: 'published',
    primary_category: 'Power & Grid',
    public_routing: { visibility: 'core' },
    extraction_quality_score: 0.95,
    infrastructure_relevance_score: 0.9,
    articleText,
    rawText: articleText,
  });
  Object.assign(publicArticle, {
    source_fidelity: { ok: true },
    claim_fidelity: { ok: true, unsupportedClaims: [] },
    seo_fidelity: { ok: true },
  });
  const hiddenArticle = { id: 'b', articlePagePublished: false, archiveOnly: true, noindex: true, public_status: 'archive_only_noindex', primary_category: 'Power & Grid' };
  const categories = buildCategoryPages([publicArticle, hiddenArticle]);
  assert.equal(categories.find((category) => category.slug === 'power-grid').items.length, 1);
  assert.equal(archivePages([publicArticle, hiddenArticle])[0].total, 1);
});

test('taxonomy listing feed preserves every projected public member regardless of age', () => {
  const sourceText = 'A utility filing confirms the data center power agreement and its substation delivery date.';
  const article = {
    id: 'older-grid-analysis',
    title: 'Older grid analysis remains in taxonomy coverage',
    source: 'Utility Filing',
    sourceUrl: 'https://example.com/older-grid-analysis',
    publishedAt: '2025-01-01T00:00:00.000Z',
    analysisPublishedAt: '2025-01-02T00:00:00.000Z',
    cleaned_source_text: sourceText,
    contentText: sourceText,
    articleText: sourceText.repeat(20),
    deck: sourceText,
    public_presentation: { deck: sourceText, why_it_matters: '' },
    public_status: 'published',
    public_content_tier: 'longform_analysis',
    homepagePublished: true,
    articlePagePublished: true,
    archiveOnly: false,
    noindex: false,
    seo_noindex: false,
    primary_category: 'Power & Grid',
    public_routing: { visibility: 'core' },
    extraction_quality_score: 0.95,
    infrastructure_relevance_score: 0.9,
    source_fidelity: { ok: true },
    claim_fidelity: { ok: true, unsupportedClaims: [] },
    seo_fidelity: { ok: true },
  };
  const projected = buildCategoryPages([article]).find((page) => page.slug === 'power-grid');
  const feed = buildTaxonomyListingFeed(projected.items);

  assert.deepEqual(feed.items.map((item) => item.id), projected.items.map((item) => item.id));
});

test('current taxonomy projection cannot lose members during canonical rendering dedupe', () => {
  const projection = buildTaxonomyProjection([...latestNews, ...archivedNews]);

  for (const [group, pages] of [
    ['category', projection.categories],
    ['company', projection.companies],
    ['region', projection.regions],
  ]) {
    for (const page of pages) {
      assert.deepEqual(
        dedupeFeedItems(page.items).map((item) => item.id),
        page.items.map((item) => item.id),
        `${group}:${page.slug}`,
      );
    }
  }
});
