import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCategoryPages, archivePages } from '../scripts/lib/taxonomy-page-builder.mjs';

test('taxonomy builder exposes only public indexable analyses', () => {
  const articleText = 'Power and grid infrastructure analysis connects verified source evidence to capacity and delivery milestones. '.repeat(16);
  const publicArticle = {
    id: 'a',
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
    expertLensFull: { finalArticleBody: articleText },
  };
  const hiddenArticle = { id: 'b', articlePagePublished: false, archiveOnly: true, noindex: true, public_status: 'archive_only_noindex', primary_category: 'Power & Grid' };
  const categories = buildCategoryPages([publicArticle, hiddenArticle]);
  assert.equal(categories.find((category) => category.slug === 'power-grid').items.length, 1);
  assert.equal(archivePages([publicArticle, hiddenArticle])[0].total, 1);
});
