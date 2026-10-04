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

test('an unpunctuated headline stays out of the first body claim and keeps every body slot', () => {
  const body = Array.from({ length: 8 }, (_, index) => `Sentence ${index + 1} reports that the operator added ${index + 10} MW of contracted data center capacity this quarter.`).join(' ');
  const result = buildClaimLedger({
    cluster_id: 'sig_headline',
    representative_source: {
      title: 'Trade data consistent with $3B of chips routed through Malaysia',
      cleaned_text: `Between April 2024 and June 2025, China recorded $3.8 billion of server imports from Malaysia. ${body}`,
      source_url: 'https://example.com/headline',
      source_name: 'Example Source',
      source_published_at: '2026-10-01T00:00:00Z',
    },
  }, 'article_headline');
  const texts = result.claims.map((claim) => claim.claim_text);
  assert.ok(texts.some((text) => text.startsWith('Between April 2024 and June 2025, China recorded $3.8 billion')), 'the first body sentence is its own claim');
  assert.ok(!texts.some((text) => /Malaysia Between April/.test(text)), 'the headline is not glued to the body');
  assert.ok(result.claims.some((claim) => claim.numeric_value === 16), 'the eighth body sentence still yields its claim alongside the headline');
});
