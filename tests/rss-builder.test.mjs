import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRssItems } from '../scripts/lib/rss-builder.mjs';

test('rss builder excludes archived internal items', () => {
  const articleText = 'Published data center infrastructure analysis connects verified source evidence to power, storage, and capacity milestones. '.repeat(16);
  const items = buildRssItems([
    {
      id: 'a',
      title: 'Published analysis',
      publishedAt: '2026-05-20T00:00:00Z',
      articlePagePublished: true,
      homepagePublished: true,
      archiveOnly: false,
      noindex: false,
      seo_noindex: false,
      public_status: 'published',
      publishing_route: 'Featured Analysis',
      public_routing: { visibility: 'core' },
      extraction_quality_score: 0.95,
      infrastructure_relevance_score: 0.9,
      articleText,
      expertLensFull: { finalArticleBody: articleText },
      deck: 'Clean public deck.',
    },
    { id: 'b', title: 'Archived', publishedAt: '2026-05-20T00:00:00Z', articlePagePublished: false, archiveOnly: true, public_status: 'archive_only_noindex', deck: 'Hidden.' },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].link, '/news/a/');
});
