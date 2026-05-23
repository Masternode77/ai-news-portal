import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreSignalCluster } from '../scripts/lib/signal-scoring-engine.mjs';

test('signal scoring rewards specific infrastructure evidence', () => {
  const scored = scoreSignalCluster({
    cluster_title: 'Utility queue pressure hits data center power delivery',
    cluster_topic: 'power grid',
    primary_infrastructure_layer: 'power',
    last_seen_at: '2026-05-20T04:00:00Z',
    extracted_facts: ['A utility queue changed.', 'A data center project was delayed.', 'The change affects power.', 'Operators need new dates.'],
    numeric_claims: [{ raw: '300 MW' }],
    source_count: 2,
    representative_source: { relevance_score: 0.9, extraction_quality: 0.95 },
  }, { now: '2026-05-20T05:00:00Z' });
  assert.ok(scored.score >= 82);
  assert.equal(scored.dimensions.numeric_specificity, 5);
});
