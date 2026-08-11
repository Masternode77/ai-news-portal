import assert from 'node:assert/strict';
import test from 'node:test';
import { buildArchiveFeed } from '../scripts/lib/archive-feed-builder.mjs';
import { authorizePublicTestRecords } from './fixtures/admin-publication-integrity.mjs';

test('archive feed excludes hidden/noindex items and uses publication copy', () => {
  const authorized = authorizePublicTestRecords([
    {
      id: 'a',
      title: 'Power queue reshapes data center timing',
      source: 'Utility Dive',
      publishedAt: '2026-05-20T00:00:00Z',
      public_content_tier: 'editorial_brief',
      homepagePublished: true,
      archiveOnly: false,
      summary: 'A utility interconnection queue changes power delivery timing for AI data center capacity.',
      deck: 'A utility queue update changes timing for AI infrastructure capacity.',
    },
    {
      id: 'b',
      title: 'Hidden item',
      publishedAt: '2026-05-20T00:00:00Z',
      archiveOnly: true,
      seo_noindex: true,
    },
  ]);
  const feed = buildArchiveFeed(authorized.records, authorized.options);

  assert.equal(feed.items.length, 1);
  assert.equal(feed.searchLabel, 'Search the archive');
  assert.equal(/Find published anaylsis|Find published analysis|archive only/i.test(JSON.stringify(feed)), false);
});
