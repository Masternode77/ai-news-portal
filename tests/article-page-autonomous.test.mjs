import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { relatedArticlesFor } from '../scripts/lib/related-articles.mjs';

test('article page exposes reader-safe evidence without internal quality panels', () => {
  const page = fs.readFileSync('src/pages/news/[id].astro', 'utf8');
  assert.doesNotMatch(page, /ArticleEvidenceBox/);
  assert.doesNotMatch(page, /ClaimVerificationNote/);
  assert.doesNotMatch(page, /InternalQualityPanel/);
  assert.doesNotMatch(page, /Backfilled Analysis/);
  assert.match(page, /buildArticleReadingModel/);
  assert.match(page, /ArticleSourceFacts/);
  assert.match(page, /ArticleWatchMetrics/);
  assert.match(page, /ArticleBottomLine/);
  assert.match(page, /ArticleActions/);
});

test('related articles prefer same category and adjacent infrastructure without duplicates', () => {
  const current = {
    id: 'current',
    category: 'Power & Grid',
    primary_category: 'Power & Grid',
    infrastructure_layer: 'power',
    publishedAt: '2026-05-20T00:00:00.000Z',
  };
  const items = [
    current,
    { id: 'same-new', title: 'Same newer', category: 'Power & Grid', infrastructure_layer: 'power', publishedAt: '2026-05-30T00:00:00.000Z' },
    { id: 'same-old', title: 'Same older', category: 'Power & Grid', infrastructure_layer: 'power', publishedAt: '2026-05-10T00:00:00.000Z' },
    { id: 'adjacent', title: 'Adjacent layer', category: 'Data Centers', infrastructure_layer: 'power', publishedAt: '2026-05-29T00:00:00.000Z' },
    { id: 'far', title: 'Far item', category: 'Semiconductors', infrastructure_layer: 'silicon', publishedAt: '2026-05-31T00:00:00.000Z' },
    { id: 'same-new', title: 'Duplicate same newer', category: 'Power & Grid', infrastructure_layer: 'power', publishedAt: '2026-05-30T00:00:00.000Z' },
  ];

  const related = relatedArticlesFor(current, items, { limit: 3 });

  assert.deepEqual(related.map((article) => article.id), ['same-new', 'same-old', 'adjacent']);
  assert.equal(new Set(related.map((article) => article.id)).size, related.length);
  assert.ok(!related.some((article) => article.id === current.id));
});
