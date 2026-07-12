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

test('allows consecutive initials without treating them as clipped single letters', () => {
  const result = detectTruncationArtifacts('TSMC CEO C.C. Wei says capacity will remain constrained.');
  assert.equal(result.ok, true);
});
