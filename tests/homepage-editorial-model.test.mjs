import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHomepageEditorialModel } from '../scripts/lib/homepage-editorial-model.mjs';

test('homepage editorial model separates latest cycle from backfilled analysis', () => {
  const body = 'Grid operators are weighing a verified 300 MW data center power request against interconnection timing, equipment availability, and local permitting risk. The source identifies the operator, the capacity figure, the affected region, and the procurement decision facing infrastructure buyers. '.repeat(8);
  const article = {
    id: 'a',
    title: 'Verified grid capacity signal for data center operators',
    source: 'Test Source',
    articlePagePublished: true,
    archiveOnly: false,
    seo_noindex: false,
    noindex: false,
    public_status: 'published',
    generation_version: 'autonomous_editorial_desk_v1',
    backfilledAnalysis: true,
    analysisPublishedAt: '2026-05-20T00:00:00Z',
    publishedAt: '2026-05-20T00:00:00Z',
    extraction_quality_score: 0.95,
    infrastructure_relevance_score: 0.88,
    infrastructure_layer: 'power',
    public_routing: {
      visibility: 'core',
      laneKey: 'operator-alerts',
      laneTitle: 'Operator Alerts',
      public_signal_label: 'Core Signal',
      editorial_lens: 'Power Market Signal',
    },
    articleText: body,
    contentText: body,
    fullArticleText: body,
    cleaned_source_text: body,
    expertLensFull: {
      finalHeadline: 'Verified grid capacity signal for data center operators',
      metaDescription: 'A clean power-capacity item for operators.',
      finalArticleBody: body,
    },
  };
  const model = buildHomepageEditorialModel({
    latest: [article],
    cycles: [{ published_analyses: [], status: 'completed_no_qualifying_signals', cycle_completed_at: new Date().toISOString() }],
  });
  assert.equal(model.featuredAnalyses.length, 0);
  assert.equal(model.recentAnalysis.length, 1);
  assert.equal(model.freshness.state, 'cycle_no_publish');
});
