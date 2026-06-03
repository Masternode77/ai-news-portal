import assert from 'node:assert/strict';
import test from 'node:test';
import { getRssString } from '@astrojs/rss';
import { buildRssItems, rssMetadata } from '../scripts/lib/rss-builder.mjs';

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
      category: 'Power & Grid',
      articleText,
      expertLensFull: { finalArticleBody: articleText },
      deck: 'Clean public deck.',
    },
    { id: 'b', title: 'Archived', publishedAt: '2026-05-20T00:00:00Z', articlePagePublished: false, archiveOnly: true, public_status: 'archive_only_noindex', deck: 'Hidden.' },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].link, '/news/a/');
  assert.equal(items[0].image, '/generated/fallbacks/power-grid.svg');
  assert.match(items[0].customData, /media:content/);
  assert.doesNotMatch(items[0].customData, /\/admin\//);
});

test('rss metadata binds media namespace when feed items include media content', async () => {
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
      category: 'Power & Grid',
      articleText,
      expertLensFull: { finalArticleBody: articleText },
      deck: 'Clean public deck.',
    },
  ]);

  const xml = await getRssString({
    ...rssMetadata(),
    items,
  });

  assert.match(xml, /<media:content\b/);
  assert.match(xml, /xmlns:media="http:\/\/search\.yahoo\.com\/mrss\/"/);
});
