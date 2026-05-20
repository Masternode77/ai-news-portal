import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyNumericClaim } from '../scripts/lib/numeric-claim-verifier.mjs';

test('numeric verifier marks sourced numeric claims as primary verified', () => {
  const verification = verifyNumericClaim({ numeric_value: 300, source_url: 'https://example.com' }, {
    representative_source: { cleaned_text: 'The project totals 300 MW.' },
  });
  assert.equal(verification.verification_status, 'verified_primary');
});
