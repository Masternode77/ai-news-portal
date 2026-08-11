import assert from 'node:assert/strict';
import test from 'node:test';
import { unsupportedClaimGuard } from '../scripts/lib/unsupported-claim-guard.mjs';

test('unsupported claim guard accepts repeated use of a verified number with equivalent units', () => {
  const article = Array.from({ length: 8 }, (_, index) => `Paragraph ${index + 1} says the 200 MW capacity claim changes planning.`).join(' ');
  const result = unsupportedClaimGuard(article, [{
    numeric_value: 200,
    unit: 'megawatts',
    verification_status: 'verified_primary',
    source_url: 'https://example.com/source',
    source_quote_or_summary: 'The filing specifies 200 MW of capacity.',
  }]);
  assert.equal(result.ok, true);
});

test('unsupported claim guard rejects malformed verified numeric ledger entries', () => {
  // Given: public copy contains a numeric claim and the ledger labels an unparsed value verified.
  const body = 'The campus requires 200 MW before commissioning can begin.';
  const ledger = [{ numeric_value: '200', unit: '', verification_status: 'verified_primary' }];

  // When: the final numeric-claim guard validates the body and ledger.
  const result = unsupportedClaimGuard(body, ledger);

  // Then: malformed provenance cannot authorize the numeric claim.
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('malformed_verified_numeric_claim_records:1'));
});

test('unsupported claim guard accepts a short nonnumeric claim without an arbitrary sentence minimum', () => {
  // Given: concise public copy with no numeric claims.
  const body = 'Utility interconnection timing remains the controlling campus milestone.';

  // When: the unsupported numeric-claim guard runs.
  const result = unsupportedClaimGuard(body, []);

  // Then: length policy is left to the detail-quality boundary.
  assert.equal(result.ok, true);
  assert.deepEqual(result.reasons, []);
});
