import assert from 'node:assert/strict';
import test from 'node:test';
import * as pipeline from '../scripts/pipeline.mjs';

const NOW = new Date('2026-08-10T00:00:00.000Z');

function authorizedSource() {
  return {
    id: 'authorized',
    name: 'Authorized Source',
    domain: 'authorized.example',
    feed: 'https://authorized.example/feed',
    status: 'active_feed',
    text_use_basis: 'licensed',
    terms_url: 'https://authorized.example/terms',
    reviewed_at: '2026-08-01',
    allow_text_use: true,
  };
}

test('cached and legacy fallback pools retain only currently authorized text sources', () => {
  // Given: cache records mix an authorized source with denied and unregistered text.
  assert.equal(typeof pipeline.authorizedTextFallbackPool, 'function');
  const records = [
    { id: 'allowed', sourceRegistryId: 'authorized', source: 'Authorized Source', url: 'https://authorized.example/story', title: 'Allowed' },
    { id: 'denied', sourceRegistryId: 'denied', source: 'Denied Source', url: 'https://denied.example/story', title: 'Denied' },
    { id: 'legacy', source: 'Legacy Source', url: 'https://legacy.example/story', title: 'Legacy' },
    { id: 'spoofed', sourceRegistryId: 'authorized', source: 'Authorized Source', url: 'https://spoofed.example/story', title: 'Spoofed' },
  ];

  // When: fallback candidates cross the production authorization seam.
  const pool = pipeline.authorizedTextFallbackPool(records, [
    authorizedSource(),
    { ...authorizedSource(), id: 'denied', name: 'Denied Source', domain: 'denied.example', allow_text_use: false },
  ], NOW);

  // Then: unauthorized cached and legacy text cannot re-enter acquisition.
  assert.deepEqual(pool.map((item) => item.id), ['allowed']);
});

test('empty authorized inventory cannot silently reuse cached or legacy text', () => {
  // Given: cached text exists but the registry authorizes no text source.
  assert.equal(typeof pipeline.authorizedTextFallbackPool, 'function');
  const records = [{ id: 'legacy', source: 'Legacy Source', url: 'https://legacy.example/story', title: 'Legacy' }];

  // When: fallback authorization is evaluated against an empty inventory.
  const pool = pipeline.authorizedTextFallbackPool(records, [], NOW);

  // Then: the pipeline fails closed with an empty pool.
  assert.deepEqual(pool, []);
});
