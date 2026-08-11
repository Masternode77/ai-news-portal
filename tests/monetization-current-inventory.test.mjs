import assert from 'node:assert/strict';
import test from 'node:test';
import { currentPublicDetailInventory } from '../src/lib/monetization-inventory.mjs';
import { isPublicLongformArticle } from '../scripts/lib/public-surface-eligibility.mjs';
import { isPublicProductFit } from '../scripts/lib/public-product-fit.mjs';
import {
  authorizedAdminSourceRegistry,
  canonicalAdminArticle,
} from './fixtures/admin-publication-integrity.mjs';

const NOW = '2026-08-10T00:00:00.000Z';

function inventoryFor(article, sourceRegistry = authorizedAdminSourceRegistry()) {
  return currentPublicDetailInventory([article], { sourceRegistry, now: NOW });
}

function routeInventoryFor(articles, sourceRegistry = authorizedAdminSourceRegistry()) {
  const seenIds = new Set();
  return articles.filter((article) => {
    if (!isPublicLongformArticle(article, { sourceRegistry, now: NOW })) return false;
    if (seenIds.has(article.id)) return false;
    seenIds.add(article.id);
    return true;
  });
}

test('current inventory rejects a stale snapshot after source rights revocation', () => {
  const article = {
    ...canonicalAdminArticle({ published: true }),
    publication_integrity: { ok: true },
  };

  assert.deepEqual(inventoryFor(article, authorizedAdminSourceRegistry({ allow_text_use: false })), []);
});

test('current inventory rejects expired text rights reviews', () => {
  const article = canonicalAdminArticle({ published: true });

  assert.deepEqual(inventoryFor(article, authorizedAdminSourceRegistry({ reviewed_at: '2025-01-01T00:00:00.000Z' })), []);
});

test('current inventory rejects a product-fit failure', () => {
  const article = {
    ...canonicalAdminArticle({ published: true }),
    title: 'Celebrity skincare launch wins beauty award',
    summary: 'A celebrity skincare launch won a beauty award.',
    articleText: 'A celebrity skincare launch won a beauty award.',
    source_evidence_text: 'A celebrity skincare launch won a beauty award.',
  };

  assert.equal(isPublicProductFit(article), false);
  assert.deepEqual(inventoryFor(article), []);
});

test('current inventory rejects a malformed extraction artifact', () => {
  const article = {
    ...canonicalAdminArticle({ published: true }),
    extraction_artifact: { source_url: 'not-a-url' },
  };

  assert.deepEqual(inventoryFor(article), []);
});

test('current inventory fails closed when the source registry configuration is malformed', () => {
  const article = canonicalAdminArticle({ published: true });

  assert.deepEqual(currentPublicDetailInventory([article], { sourceRegistry: {}, now: NOW }), []);
});

test('current inventory matches current detail-route eligibility and de-duplicates a valid authorized record', () => {
  const article = canonicalAdminArticle({ published: true });
  const duplicate = { ...article, title: 'Duplicate canonical record' };
  const sourceRegistry = authorizedAdminSourceRegistry();
  const expected = routeInventoryFor([article, duplicate], sourceRegistry);
  const actual = currentPublicDetailInventory([article, duplicate], { sourceRegistry, now: NOW });

  assert.equal(expected.length, 1);
  assert.deepEqual(actual.map((item) => item.id), expected.map((item) => item.id));
});
