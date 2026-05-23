import assert from 'node:assert/strict';
import test from 'node:test';
import { writeAutonomousBlogArticle } from '../scripts/lib/autonomous-blog-writer-v1.mjs';

test('autonomous blog writer emits gated analyst copy with a claim ledger', () => {
  const result = writeAutonomousBlogArticle({
    cluster_id: 'sig_writer',
    cluster_title: 'Green Capital and Prime Capital Partner on 300 MW Battery Storage Portfolio in Poland',
    cluster_topic: 'power market signal',
    primary_infrastructure_layer: 'power',
    companies: ['Green Capital', 'Prime Capital'],
    regions: ['Europe'],
    source_count: 1,
    signal_score: 86,
    editorial_route: 'Featured Analysis',
    extracted_facts: [
      'Green Capital and Prime Capital are developing a 300 MW battery storage portfolio in Poland.',
      'Battery storage can give data center operators a power-market flexibility option.',
      'The portfolio creates execution questions around grid interconnection and delivery.',
      'The source connects the project to power availability and AI infrastructure demand.',
    ],
    numeric_claims: [{ raw: '300 MW', numeric_value: 300, unit: 'MW' }],
    representative_source: {
      source_name: 'Example Source',
      source_url: 'https://example.com/green-capital',
      source_published_at: '2026-05-20T00:00:00Z',
      title: 'Green Capital and Prime Capital Partner on 300 MW Battery Storage Portfolio in Poland',
      cleaned_text: 'Green Capital and Prime Capital are developing a 300 MW battery storage portfolio in Poland. Battery storage can give data center operators a power-market flexibility option. The portfolio creates execution questions around grid interconnection and delivery. The source connects the project to power availability and AI infrastructure demand.',
      extraction_quality: 0.95,
      relevance_score: 0.9,
    },
  }, { index: 0, backfilled: true });
  assert.equal(result.ok, true);
  assert.equal(result.article.claim_ledger.some((claim) => claim.numeric_value === 300), true);
  assert.equal(result.article.blog_metadata.forbidden_phrase_count, 0);
});
