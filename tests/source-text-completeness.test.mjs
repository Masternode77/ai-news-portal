import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSourceTextCompleteness } from '../scripts/lib/source-text-completeness.mjs';

test('blocks source evidence that is too short for a full article', () => {
  const result = analyzeSourceTextCompleteness({ articleText: 'Short source fragment.' });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('source_evidence_length_below_500'));
});

test('blocks truncated source evidence even with enough characters', () => {
  const result = analyzeSourceTextCompleteness({
    articleText: `${'Power-market evidence '.repeat(20)}ends with clo.`,
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some((reason) => reason.includes('fragment') || reason.includes('clo')));
});
