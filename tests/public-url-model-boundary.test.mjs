import assert from 'node:assert/strict';
import test from 'node:test';
import { getRssString } from '@astrojs/rss';
import { buildHomepageFeed as buildHomepageFeedRaw } from '../scripts/lib/homepage-feed-builder.mjs';
import { buildRssItems as buildRssItemsRaw, rssMetadata } from '../scripts/lib/rss-builder.mjs';
import { authorizePublicTestRecords, CANONICAL_ADMIN_BODY, CANONICAL_ADMIN_SOURCE } from './fixtures/admin-publication-integrity.mjs';

function buildHomepageFeed(items = [], options = {}) {
  const authorized = authorizePublicTestRecords(items);
  return buildHomepageFeedRaw(authorized.records, { ...options, ...authorized.options });
}

function buildRssItems(items = []) {
  const authorized = authorizePublicTestRecords(items);
  return buildRssItemsRaw(authorized.records, authorized.options);
}

const sourceText = 'A utility interconnection filing changes data center campus energization, grid capacity, transformer delivery, and cloud capacity planning for AI operators. '.repeat(12);

function publicSourceRecord(overrides = {}) {
  return {
    id: 'source-signal',
    title: 'Utility interconnection changes AI campus timing',
    source: 'Utility Dispatch',
    sourceUrl: 'https://example.com/source-signal',
    publishedAt: '2026-08-01T00:00:00.000Z',
    primary_category: 'Power & Grid',
    infrastructure_layer: 'power',
    public_content_tier: 'signal_card',
    homepagePublished: true,
    archiveOnly: false,
    public_status: 'published',
    public_routing: { visibility: 'adjacent' },
    extraction_quality_score: 0.95,
    infrastructure_relevance_score: 0.9,
    articleText: sourceText,
    rawText: sourceText,
    summary: 'A utility filing changes data center campus energization and grid capacity planning.',
    deck: 'A utility interconnection filing changes data center campus energization, grid capacity, and transformer delivery timing for operators.',
    ...overrides,
  };
}

test('public URL model preserves valid HTTP(S) source-only links', () => {
  // Given: valid HTTP and HTTPS source-only public records.
  const records = [
    publicSourceRecord({ id: 'https-source', sourceUrl: 'https://example.com/https-source' }),
    publicSourceRecord({ id: 'http-source', sourceUrl: 'http://example.com/http-source' }),
  ];

  // When: homepage and RSS public models are built.
  const homepage = buildHomepageFeed(records, { limit: 2, minimumVisible: 0 });
  const rss = buildRssItems(records);

  // Then: valid external source links retain their original public destinations.
  assert.deepEqual(homepage.items.map((entry) => entry.publicSignal.read_source).sort(), [
    'http://example.com/http-source',
    'https://example.com/https-source',
  ]);
  assert.deepEqual(rss.map((entry) => entry.link).sort(), [
    'http://example.com/http-source',
    'https://example.com/https-source',
  ]);
});

test('public URL model never exposes unsafe external source URLs to homepage or RSS consumers', () => {
  // Given: persisted source-only records with executable, ambiguous, credential-bearing, or control-character URLs.
  const unsafeUrls = [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '//attacker.example/source',
    'https://user:secret@example.com/source',
    'https://example.com/source\nnext',
  ];
  const records = unsafeUrls.map((sourceUrl, index) => publicSourceRecord({ id: `unsafe-source-${index}`, sourceUrl }));

  // When: the public card model and RSS items are built.
  const homepage = buildHomepageFeed(records, { limit: unsafeUrls.length, minimumVisible: 0 });
  const rss = buildRssItems(records);
  const homepageLinks = homepage.items.map((entry) => entry.publicSignal.view_detail || entry.publicSignal.read_source);

  // Then: featured, ticker/card-image inputs, and feed links cannot retain any raw unsafe source URL.
  assert.deepEqual(homepageLinks, []);
  assert.equal(homepage.featured, null);
  assert.deepEqual(rss.map((entry) => entry.link), []);
});

test('RSS emits only strict canonical internal article paths', () => {
  // Given: article-page records with a canonical id and malformed traversal, scheme, protocol-relative, and control-character ids.
  const records = [
    publicSourceRecord({ id: 'watch_sig_4aac0298fca786fa', articlePagePublished: true, public_content_tier: 'longform_analysis', public_routing: { visibility: 'core' }, articleText: CANONICAL_ADMIN_SOURCE, expertLensFull: { finalArticleBody: CANONICAL_ADMIN_BODY } }),
    publicSourceRecord({ id: '../admin', articlePagePublished: true, public_content_tier: 'longform_analysis', public_routing: { visibility: 'core' }, articleText: CANONICAL_ADMIN_SOURCE, expertLensFull: { finalArticleBody: CANONICAL_ADMIN_BODY } }),
    publicSourceRecord({ id: 'javascript:alert(1)', articlePagePublished: true, public_content_tier: 'longform_analysis', public_routing: { visibility: 'core' }, articleText: CANONICAL_ADMIN_SOURCE, expertLensFull: { finalArticleBody: CANONICAL_ADMIN_BODY } }),
    publicSourceRecord({ id: '//attacker.example', articlePagePublished: true, public_content_tier: 'longform_analysis', public_routing: { visibility: 'core' }, articleText: CANONICAL_ADMIN_SOURCE, expertLensFull: { finalArticleBody: CANONICAL_ADMIN_BODY } }),
    publicSourceRecord({ id: 'watch_sig_unsafe\nnext', articlePagePublished: true, public_content_tier: 'longform_analysis', public_routing: { visibility: 'core' }, articleText: CANONICAL_ADMIN_SOURCE, expertLensFull: { finalArticleBody: CANONICAL_ADMIN_BODY } }),
  ];

  // When: RSS items are built from those records.
  const rss = buildRssItems(records);

  // Then: only the canonical internal article path is eligible for an RSS link or guid.
  assert.deepEqual(rss.map((entry) => entry.link), ['/news/watch_sig_4aac0298fca786fa/']);
});

test('rendered RSS fixture contains no unsafe link or guid fallback', async () => {
  // Given: persisted source-only records with unsafe external URLs.
  const records = [
    publicSourceRecord({ id: 'unsafe-js', sourceUrl: 'javascript:alert(1)' }),
    publicSourceRecord({ id: 'unsafe-data', sourceUrl: 'data:text/html,<script>alert(1)</script>' }),
  ];

  // When: the real RSS renderer receives the public model.
  const xml = await getRssString({ ...rssMetadata(), items: buildRssItems(records) });

  // Then: neither link nor guid output can contain a raw unsafe URL.
  assert.doesNotMatch(xml, /javascript:|data:text\/html|<script>/i);
});
