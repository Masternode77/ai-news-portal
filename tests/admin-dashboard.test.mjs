import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAdminArticleListUrl,
  buildAdminDashboardModel,
  filterAdminArticleRows,
} from '../scripts/lib/admin-dashboard-model.mjs';

const fixtureArticles = [
  {
    id: 'published-good',
    title: 'GPU campus clears power queue',
    source: 'GridWire',
    category: 'Power Grid',
    publishedAt: '2026-05-20T10:00:00.000Z',
    homepagePublished: true,
    infrastructure_relevance_score: 0.91,
    extraction_qa: { extraction_quality_score: 0.94 },
    generatedImage: '/generated/published-good.svg',
    generatedImageProvider: 'image2',
    generatedAt: '2026-05-20T10:05:00.000Z',
  },
  {
    id: 'draft-missing-image',
    title: 'Draft cooling item',
    source: 'Thermal Desk',
    category: 'Cooling',
    draft: true,
    public_status: 'draft',
    publishedAt: '2026-05-18T10:00:00.000Z',
    infrastructure_relevance_score: 0.74,
    extraction_qa: { extraction_quality_score: 0.88 },
    updatedAt: '2026-05-21T10:00:00.000Z',
  },
  {
    id: 'hidden-low-relevance',
    title: 'Consumer chatbot funding roundup',
    source: 'Newswire',
    category: 'AI Apps',
    noindex: true,
    publishedAt: '2026-05-17T10:00:00.000Z',
    infrastructure_relevance_score: 0.24,
    public_copy_stale: true,
    extraction_qa: { extraction_quality_score: 0.81 },
  },
  {
    id: 'failed-extraction',
    title: 'Substation transformer procurement stalls',
    source: 'GridWire',
    category: 'Power Grid',
    publishedAt: '2026-05-16T10:00:00.000Z',
    articlePagePublished: true,
    infrastructure_relevance_score: 0.82,
    extraction_qa: {
      extraction_quality_score: 0.31,
      extraction_failure_reason: 'source_text_incomplete',
    },
    generatedImage: '/generated/failed-extraction.svg',
  },
  {
    id: 'regen-needed',
    title: 'GPU cloud contract repriced',
    source: 'Capacity Ledger',
    category: 'Cloud Capacity',
    publishedAt: '2026-05-22T10:00:00.000Z',
    articlePagePublished: true,
    infrastructure_relevance_score: 0.87,
    extraction_qa: { extraction_quality_score: 0.9 },
    generatedImage: '/generated/regen-needed.svg',
    generatedImageProvider: 'image2',
    generatedAt: '2026-05-22T10:05:00.000Z',
    stale_generation: true,
    updatedAt: '2026-05-22T12:00:00.000Z',
  },
];

const fixtureCycles = [
  {
    cycle_id: 'cycle-test-1',
    cycle_started_at: '2026-05-22T09:00:00.000Z',
    status: 'completed',
    published_analyses: ['regen-needed'],
    held_signals: ['draft-missing-image'],
    rejected_signals: ['hidden-low-relevance'],
    audit_summary: { published_count: 1, held_count: 1, rejected_count: 1 },
  },
];

const fixtureClaims = [
  { claim_id: 'claim-1', claim_text: 'Capacity doubled', verification_status: 'unsupported', confidence: 0.2 },
];

const fixtureSourceHealth = [
  { source_id: 'gridwire', source_name: 'GridWire', status: 'fresh', item_count: 2 },
  { source_id: 'wire', source_name: 'Newswire', status: 'stale', item_count: 1 },
];

test('admin dashboard model produces fixture-backed counts and review queues', () => {
  const model = buildAdminDashboardModel({
    latestNews: fixtureArticles.slice(0, 2),
    archivedNews: fixtureArticles.slice(2),
    editorialCycles: fixtureCycles,
    claimLedger: fixtureClaims,
    sourceHealth: fixtureSourceHealth,
  });

  assert.deepEqual(model.counts, {
    total: 5,
    published: 3,
    drafts: 1,
    hidden: 1,
    failedExtraction: 1,
    missingImage: 2,
    lowRelevance: 1,
    regenerationNeeded: 2,
    latestGenerated: 2,
    latestEdited: 2,
  });

  assert.deepEqual(model.reviewQueues.failedExtraction.items.map((item) => item.id), ['failed-extraction']);
  assert.deepEqual(model.reviewQueues.lowRelevance.items.map((item) => item.id), ['hidden-low-relevance']);
  assert.deepEqual(model.reviewQueues.missingImage.items.map((item) => item.id), ['draft-missing-image', 'hidden-low-relevance']);
  assert.deepEqual(model.reviewQueues.regenerationNeeded.items.map((item) => item.id), ['regen-needed', 'hidden-low-relevance']);
});

test('admin article filters are deterministic and URL-addressable', () => {
  const model = buildAdminDashboardModel({ latestNews: fixtureArticles, archivedNews: [] });
  const filtered = filterAdminArticleRows(model.articles, {
    q: 'grid',
    status: 'missing-image',
    category: 'Power Grid',
    source: 'GridWire',
  });

  assert.deepEqual(filtered.map((item) => item.id), []);
  assert.equal(
    buildAdminArticleListUrl({ q: 'grid', status: 'missing-image', category: 'Power Grid', source: 'GridWire' }),
    '/admin/dashboard/?q=grid&status=missing-image&category=Power+Grid&source=GridWire',
  );

  const powerRows = filterAdminArticleRows(model.articles, { q: 'grid', category: 'Power Grid', source: 'GridWire' });
  assert.deepEqual(powerRows.map((item) => item.id), ['published-good', 'failed-extraction']);
});

test('admin dashboard model exposes private logs only through the private model surface', () => {
  const model = buildAdminDashboardModel({
    latestNews: fixtureArticles,
    archivedNews: [],
    editorialCycles: fixtureCycles,
    claimLedger: fixtureClaims,
    sourceHealth: fixtureSourceHealth,
  });

  assert.equal(model.logs.generation[0].id, 'cycle-test-1');
  assert.equal(model.logs.publish[0].articleIds[0], 'regen-needed');
  assert.deepEqual(model.logs.image.map((entry) => entry.articleId), ['regen-needed', 'published-good']);
  assert.equal(model.logs.audit.unsupportedClaims, 1);
  assert.equal(model.logs.audit.staleSources, 1);
});
