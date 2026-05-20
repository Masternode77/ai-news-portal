import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClaimLedger } from '../scripts/lib/claim-ledger.mjs';

test('claim ledger records numeric claims for published analysis candidates', () => {
  const result = buildClaimLedger({
    cluster_id: 'sig_test',
    representative_source: {
      title: 'Battery portfolio reaches 300 MW',
      cleaned_text: 'Green Capital and Prime Capital are developing a 300 MW battery storage portfolio for data center power flexibility.',
      source_url: 'https://example.com/story',
      source_name: 'Example Source',
      source_published_at: '2026-05-20T00:00:00Z',
    },
  }, 'article_test');
  assert.ok(result.claims.some((claim) => claim.numeric_value === 300));
  assert.equal(result.summary.unsupported_claim_count, 0);
});
