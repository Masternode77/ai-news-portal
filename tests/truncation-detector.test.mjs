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

test('a single letter closing an abbreviation or unit is not a clipped word', () => {
  for (const text of [
    'The order directs PJM Interconnection, L.L.C. to keep the units available.',
    'Plants Schahfer and F.B. Culley stay online through the summer peak.',
    'New capacity raised North American export capacity there to 2.2 Bcf/d.',
    'The expansion brought total pipeline capacity to 250,000 b/d.',
  ]) {
    assert.deepEqual(detectTruncationArtifacts(text).artifacts, [], text);
  }
});

test('clipped words still fail after the abbreviation fix', () => {
  assert.ok(detectTruncationArtifacts('Grid demand keeps rising as hyperscalers expand the c.').artifacts.length > 0);
  assert.ok(detectTruncationArtifacts('Capacity planning remains clo.').artifacts.length > 0);
  assert.ok(detectTruncationArtifacts('Operators expect more infrastructur.').artifacts.includes('incomplete_terminal:infrastructur'));
});
