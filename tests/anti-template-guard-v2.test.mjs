import assert from 'node:assert/strict';
import test from 'node:test';
import { antiTemplateGuardV2 } from '../scripts/lib/anti-template-guard-v2.mjs';

test('anti-template guard blocks banned autonomous desk phrases', () => {
  const result = antiTemplateGuardV2('Commercially, this is worth a local Compute Current read.');
  assert.equal(result.ok, false);
  assert.ok(result.matches.includes('Commercially,'));
});
