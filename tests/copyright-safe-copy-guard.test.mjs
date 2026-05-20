import assert from 'node:assert/strict';
import test from 'node:test';
import { copyrightSafeCopyGuard } from '../scripts/lib/copyright-safe-copy-guard.mjs';

test('copyright guard blocks close paragraph overlap with source text', () => {
  const paragraph = 'This exact paragraph should not appear unchanged in generated public analysis because it would be too close to the source material.';
  const result = copyrightSafeCopyGuard({ generatedText: paragraph, sourceText: paragraph });
  assert.equal(result.ok, false);
});
