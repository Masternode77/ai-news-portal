import test from 'node:test';
import assert from 'node:assert/strict';
import { homepageQualityResult } from '../scripts/lib/homepage-quality-filter.mjs';
import { routePublicLane } from '../scripts/lib/public-lane-router.mjs';

test('rejects homepage card with old template deck', () => {
  const article = {
    id: 'bad-template',
    title: 'China data centers tap spot power trading',
    infrastructure_relevance_score: 0.9,
    articleText: `${'China spot power trading creates a grid-market operating lever for large data centers. '.repeat(20)}Final sentence complete.`,
    deck: 'The issue is no longer demand alone; it is whether the surrounding infrastructure is ready.',
  };
  const route = routePublicLane(article);
  const result = homepageQualityResult(article, { route, presentation: { deck: article.deck, why_it_matters: 'Grid operators should watch power cost volatility.', reader_impact: [] } });
  assert.equal(result.ok, false);
});

test('accepts source-specific clean homepage deck', () => {
  const article = {
    id: 'good-card',
    title: 'NetApp OpenShift backup update',
    source: 'StorageReview',
    infrastructure_relevance_score: 0.9,
    region: 'Global',
    articleText: `${'NetApp and Red Hat OpenShift backup, storage, and disaster recovery controls matter for enterprise AI platform infrastructure. '.repeat(18)}Final sentence complete.`,
  };
  const result = homepageQualityResult(article);
  assert.equal(result.ok, true);
});
