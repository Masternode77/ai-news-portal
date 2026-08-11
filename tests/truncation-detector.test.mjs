import test from 'node:test';
import assert from 'node:assert/strict';
import { detectTruncationArtifacts, hasTruncationArtifacts } from '../scripts/lib/truncation-detector.mjs';

test('detects visible incomplete sentence fragments', () => {
  assert.equal(hasTruncationArtifacts('The platform spans on-premises and clo.'), true);
  assert.equal(hasTruncationArtifacts('Memory pressure, swap activity, b.'), true);
  assert.equal(hasTruncationArtifacts('The company is increasingly positionin.'), true);
  assert.equal(hasTruncationArtifacts('The operator warned about fuelin.'), true);
  assert.equal(hasTruncationArtifacts('Hundreds o.'), true);
});

test('allows normal complete copy', () => {
  const result = detectTruncationArtifacts('NetApp connects backup and DR to OpenShift platform readiness.');
  assert.equal(result.ok, true);
});

test('allows uppercase financing round labels while rejecting lowercase clipped fragments', () => {
  assert.equal(hasTruncationArtifacts('Etched closed a $300 million Series C.'), false);
  assert.equal(hasTruncationArtifacts('Memory pressure ended at c.'), true);
  assert.equal(hasTruncationArtifacts('Capacity planning ended at d.'), true);
  assert.equal(hasTruncationArtifacts('The platform spans on-premises and clo.'), true);
});
