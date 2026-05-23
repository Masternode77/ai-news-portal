import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRegionIndex } from '../scripts/lib/region-index.mjs';

test('region index groups published public items', () => {
  const articleText = 'Europe data center infrastructure planning depends on verified power, storage, and capacity milestones. '.repeat(16);
  const regions = buildRegionIndex([{
    id: 'a',
    region: 'Europe',
    articlePagePublished: true,
    homepagePublished: true,
    archiveOnly: false,
    noindex: false,
    seo_noindex: false,
    public_status: 'published',
    extraction_quality_score: 0.95,
    infrastructure_relevance_score: 0.9,
    articleText,
    expertLensFull: { finalArticleBody: articleText },
  }]);
  assert.equal(regions.find((region) => region.slug === 'europe').items.length, 1);
});
