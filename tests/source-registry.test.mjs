import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeRegistryFeeds,
  loadSourceRegistry,
  requestedSourceCoverage,
  sourceUsageDecision,
  REQUESTED_SOURCE_IDS,
} from '../scripts/lib/source-registry.mjs';

test('source registry contains all requested restoration sources', async () => {
  const sources = await loadSourceRegistry();
  const coverage = requestedSourceCoverage(sources);
  assert.equal(coverage.length, REQUESTED_SOURCE_IDS.length);
  assert.equal(coverage.every((entry) => entry.present), true);
  assert.ok(sources.length >= REQUESTED_SOURCE_IDS.length);
});

test('source registry records explicit fail-closed text and image rights metadata', async () => {
  // Given: the production source registry.
  const sources = await loadSourceRegistry();

  // When: every source rights record is inspected.
  const incomplete = sources.filter((source) => {
    return !Object.hasOwn(source, 'text_use_basis')
      || !Object.hasOwn(source, 'image_use_basis')
      || !Object.hasOwn(source, 'terms_url')
      || !Object.hasOwn(source, 'reviewed_at')
      || typeof source.allow_text_use !== 'boolean'
      || typeof source.allow_image_reuse !== 'boolean';
  });

  // Then: no source relies on an implied permission and publisher images remain denied.
  assert.deepEqual(incomplete, []);
  assert.equal(sources.every((source) => source.allow_image_reuse === false), true);
});

test('source rights deny missing and expired image authorization', () => {
  // Given: one missing source and one source whose legal review is stale.
  const sources = [{
    id: 'expired-fixture',
    name: 'Expired Fixture',
    domain: 'expired.example',
    text_use_basis: 'licensed',
    image_use_basis: 'licensed',
    terms_url: 'https://expired.example/terms',
    reviewed_at: '2024-01-01',
    allow_text_use: true,
    allow_image_reuse: true,
  }];

  // When: image reuse is evaluated after the review window.
  const missing = sourceUsageDecision({ source: 'Unknown Source' }, sources, 'image', new Date('2026-08-09T00:00:00Z'));
  const expired = sourceUsageDecision({ sourceUrl: 'https://expired.example/story' }, sources, 'image', new Date('2026-08-09T00:00:00Z'));

  // Then: both decisions fail closed with the public reason and a diagnostic detail.
  assert.equal(missing.authorized, false);
  assert.equal(missing.reason, 'image_reuse_not_authorized');
  assert.equal(missing.detail, 'source_not_registered');
  assert.equal(expired.authorized, false);
  assert.equal(expired.reason, 'image_reuse_not_authorized');
  assert.equal(expired.detail, 'rights_review_expired');
});

test('active registry feeds require current explicit text authorization', () => {
  // Given: one current approved source and one otherwise identical denied source.
  const sources = [
    {
      id: 'approved-text',
      name: 'Approved Text',
      domain: 'approved.example',
      feed: 'https://approved.example/feed',
      status: 'active_feed',
      text_use_basis: 'licensed',
      image_use_basis: 'unreviewed',
      terms_url: 'https://approved.example/terms',
      reviewed_at: '2026-08-01',
      allow_text_use: true,
      allow_image_reuse: false,
    },
    {
      id: 'denied-text',
      name: 'Denied Text',
      domain: 'denied.example',
      feed: 'https://denied.example/feed',
      status: 'active_feed',
      text_use_basis: 'unreviewed',
      image_use_basis: 'unreviewed',
      terms_url: '',
      reviewed_at: '',
      allow_text_use: false,
      allow_image_reuse: false,
    },
  ];

  // When: feed candidates are selected at a fixed review date.
  const feeds = activeRegistryFeeds(sources, new Date('2026-08-09T00:00:00Z'));

  // Then: only the explicitly authorized source is usable.
  assert.deepEqual(feeds.map((feed) => feed.url), ['https://approved.example/feed']);
});
