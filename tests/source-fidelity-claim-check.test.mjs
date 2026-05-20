import test from 'node:test';
import assert from 'node:assert/strict';
import { checkClaimsAgainstEvidence } from '../scripts/lib/source-fidelity-claim-check.mjs';

test('claim checker accepts bodies anchored in evidence terms', () => {
  const result = checkClaimsAgainstEvidence(
    'Data center power capacity remains the central operating risk for buyers. Grid interconnection timing shapes procurement.',
    { evidenceText: 'data center power capacity grid interconnection procurement timing' }
  );
  assert.equal(result.ok, true);
});
