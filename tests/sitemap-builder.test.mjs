import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSitemapEntries as buildSitemapEntriesRaw, sitemapXml } from '../scripts/lib/sitemap-builder.mjs';
import { authorizePublicTestRecords, CANONICAL_ADMIN_BODY, CANONICAL_ADMIN_SOURCE } from './fixtures/admin-publication-integrity.mjs';

function buildSitemapEntries(items = []) {
  const authorized = authorizePublicTestRecords(items);
  return buildSitemapEntriesRaw(authorized.records, authorized.options);
}

test('sitemap builder includes article and taxonomy pages while excluding archive-only records', () => {
  const articleText = CANONICAL_ADMIN_SOURCE;
  const entries = buildSitemapEntries([
    {
      id: 'a',
      articlePagePublished: true,
      homepagePublished: true,
      archiveOnly: false,
      public_status: 'published',
      public_content_tier: 'longform_analysis',
      noindex: false,
      seo_noindex: false,
      public_routing: { visibility: 'core' },
      extraction_quality_score: 0.95,
      infrastructure_relevance_score: 0.9,
      category: 'Power & Grid',
      articleText,
      expertLensFull: { finalArticleBody: CANONICAL_ADMIN_BODY },
      updatedAt: '2026-05-20T00:00:00Z',
    },
    { id: 'b', articlePagePublished: false, archiveOnly: true, public_status: 'archive_only_noindex', noindex: true },
  ]);
  const articleEntry = entries.find((entry) => entry.loc === '/news/a/');
  assert.ok(articleEntry);
  assert.equal(articleEntry.image, '/generated/fallbacks/power-grid.svg');
  assert.equal(entries.some((entry) => entry.loc === '/news/b/'), false);
  for (const loc of ['/about/', '/methodology/', '/editorial-policy/', '/ai-disclosure/', '/archive/', '/contact/']) {
    assert.ok(entries.some((entry) => entry.loc === loc), `expected static public page ${loc}`);
  }
  for (const loc of ['/subscribe/', '/pricing/', '/sample/', '/briefing/']) {
    assert.equal(entries.some((entry) => entry.loc === loc), false, `expected legacy conversion page ${loc} to stay out of sitemap`);
  }
  const xml = sitemapXml(entries);
  assert.match(xml, /<urlset/);
  assert.match(xml, /<image:image>/);
  assert.doesNotMatch(xml, /\/admin\//);
});

test('sitemap excludes legacy records without explicit article page publication', () => {
  // Given: a legacy record looks public but has no explicit articlePagePublished decision.
  const legacy = {
    id: 'legacy-undefined-publication',
    public_status: 'published',
    archiveOnly: false,
    noindex: false,
    seo_noindex: false,
    updatedAt: '2026-08-09T00:00:00.000Z',
  };

  // When: sitemap entries are built.
  const entries = buildSitemapEntries([legacy]);

  // Then: undefined publication state fails closed.
  assert.equal(entries.some((entry) => entry.loc === '/news/legacy-undefined-publication/'), false);
});

test('sitemap omits unstable static timestamps while retaining dated article changes', () => {
  // Given: identical source data with one article that has a meaningful content timestamp.
  const article = {
    id: 'dated-article',
    articlePagePublished: true,
    archiveOnly: false,
    public_status: 'published',
    public_content_tier: 'longform_analysis',
    noindex: false,
    seo_noindex: false,
    public_routing: { visibility: 'core' },
    extraction_quality_score: 0.95,
    infrastructure_relevance_score: 0.9,
    articleText: CANONICAL_ADMIN_SOURCE,
    expertLensFull: { finalArticleBody: CANONICAL_ADMIN_BODY },
    updatedAt: '2026-05-20T00:00:00.000Z',
  };

  // When: the builder is called repeatedly for the same source state.
  const first = buildSitemapEntries([article]);
  const second = buildSitemapEntries([article]);
  const staticEntry = first.find((entry) => entry.loc === '/about/');
  const taxonomyEntry = first.find((entry) => entry.loc === '/category/power-grid/');
  const articleEntry = first.find((entry) => entry.loc === '/news/dated-article/');

  // Then: only an actual content change supplies a lastmod, so XML stays byte-stable across builds.
  assert.equal(staticEntry?.lastmod, undefined);
  assert.equal(taxonomyEntry?.lastmod, undefined);
  assert.equal(articleEntry?.lastmod, article.updatedAt);
  assert.equal(sitemapXml(first), sitemapXml(second));
});
