import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCompanyIndex } from '../scripts/lib/company-entity-index.mjs';

test('company index maps published articles to named company pages', () => {
  const articleText = 'NVIDIA data center infrastructure planning depends on verified server, power, storage, and capacity milestones. '.repeat(16);
  const pages = buildCompanyIndex([{
    id: 'a',
    title: 'NVIDIA data center signal',
    tags: ['nvidia'],
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
  assert.ok(pages.find((page) => page.slug === 'nvidia').items.length >= 1);
});
