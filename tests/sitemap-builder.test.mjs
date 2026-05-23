import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSitemapEntries, sitemapXml } from '../scripts/lib/sitemap-builder.mjs';

test('sitemap builder includes article and taxonomy pages while excluding archive-only records', () => {
  const articleText = 'Published data center infrastructure analysis connects verified source evidence to power, storage, and capacity milestones. '.repeat(16);
  const entries = buildSitemapEntries([
    {
      id: 'a',
      articlePagePublished: true,
      homepagePublished: true,
      archiveOnly: false,
      public_status: 'published',
      noindex: false,
      seo_noindex: false,
      public_routing: { visibility: 'core' },
      extraction_quality_score: 0.95,
      infrastructure_relevance_score: 0.9,
      articleText,
      expertLensFull: { finalArticleBody: articleText },
      updatedAt: '2026-05-20T00:00:00Z',
    },
    { id: 'b', articlePagePublished: false, archiveOnly: true, public_status: 'archive_only_noindex', noindex: true },
  ]);
  assert.ok(entries.some((entry) => entry.loc === '/news/a/'));
  assert.equal(entries.some((entry) => entry.loc === '/news/b/'), false);
  assert.match(sitemapXml(entries), /<urlset/);
});
