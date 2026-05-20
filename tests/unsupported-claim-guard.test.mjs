import assert from 'node:assert/strict';
import test from 'node:test';
import { unsupportedClaimGuard } from '../scripts/lib/unsupported-claim-guard.mjs';

test('unsupported claim guard accepts repeated use of a verified number with equivalent units', () => {
  const article = Array.from({ length: 8 }, (_, index) => `Paragraph ${index + 1} says the 200 MW capacity claim changes planning.`).join(' ');
  const result = unsupportedClaimGuard(article, [{ numeric_value: 200, unit: 'megawatts', verification_status: 'verified_primary' }]);
  assert.equal(result.ok, true);
});
