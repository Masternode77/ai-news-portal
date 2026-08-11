import assert from 'node:assert/strict';
import test from 'node:test';
import * as feedAcquisition from '../scripts/lib/fetch-feeds.mjs';

const NOW = new Date('2026-08-10T00:00:00.000Z');

function source(overrides = {}) {
  return {
    id: 'source-fixture',
    name: 'Source Fixture',
    domain: 'source.example',
    feed: 'https://source.example/feed',
    status: 'active_feed',
    text_use_basis: 'licensed',
    terms_url: 'https://source.example/terms',
    reviewed_at: '2026-08-01',
    allow_text_use: true,
    ...overrides,
  };
}

function fetchedItem(feed) {
  return [{
    id: `${feed.source}-item`,
    source: feed.source,
    sourceRegistryId: feed.sourceRegistryId,
    url: 'https://source.example/story',
    title: `${feed.source} story`,
    publishedAt: '2026-08-10T00:00:00.000Z',
  }];
}

test('denied expired and incomplete text sources make zero feed calls', async () => {
  // Given: every configured feed lacks current explicit text rights.
  const sources = [
    source({ id: 'denied', allow_text_use: false }),
    source({ id: 'expired', reviewed_at: '2024-01-01' }),
    source({ id: 'missing-rights', terms_url: '' }),
  ];
  let calls = 0;

  // When: production feed acquisition runs against the registry inventory.
  const pool = await feedAcquisition.fetchNewsPool({
    sources,
    now: NOW,
    fetchFeed: async (feed) => { calls += 1; return fetchedItem(feed); },
  });

  // Then: rights denial prevents network dispatch and ingestion.
  assert.equal(calls, 0);
  assert.deepEqual(pool, []);
});

test('one current authorized text source may fetch and enter the pool', async () => {
  // Given: one explicitly authorized registry source and one denied source.
  const sources = [source({ id: 'authorized', name: 'Authorized Source' }), source({ id: 'denied', allow_text_use: false })];
  const calls = [];

  // When: acquisition runs with a wire-level feed fake.
  const pool = await feedAcquisition.fetchNewsPool({
    sources,
    now: NOW,
    fetchFeed: async (feed) => { calls.push(feed.url); return fetchedItem(feed); },
  });

  // Then: only the authorized feed is dispatched and retained.
  assert.deepEqual(calls, ['https://source.example/feed']);
  assert.equal(pool.length, 1);
  assert.equal(pool[0].sourceRegistryId, 'authorized');
});

test('acquisition result distinguishes empty authorization from transient fetch failure', async () => {
  // Given: an observable production acquisition boundary is required.
  assert.equal(typeof feedAcquisition.fetchNewsPoolResult, 'function');

  // When: no source is authorized versus one authorized source fails.
  const noAuthorization = await feedAcquisition.fetchNewsPoolResult({
    sources: [source({ allow_text_use: false })],
    now: NOW,
    fetchFeed: async () => { throw new Error('must not run'); },
  });
  const transientFailure = await feedAcquisition.fetchNewsPoolResult({
    sources: [source()],
    now: NOW,
    fetchFeed: async () => { throw new Error('temporary upstream failure'); },
  });

  // Then: both fail closed with distinct machine-readable states.
  assert.equal(noAuthorization.status, 'no_authorized_sources');
  assert.equal(transientFailure.status, 'transient_fetch_failure');
  assert.deepEqual(noAuthorization.items, []);
  assert.deepEqual(transientFailure.items, []);
});
