import assert from 'node:assert/strict';
import test from 'node:test';
import { generateEditorialThesis } from '../scripts/lib/editorial-thesis-generator.mjs';

test('editorial thesis is specific to the evidence pack control point', () => {
  const thesis = generateEditorialThesis({}, {
    named_entities: ['Green Capital'],
    infrastructure_layer: 'power',
    verified_facts: ['Green Capital is developing a 300 MW battery portfolio.'],
  });
  assert.match(thesis.thesis_sentence, /Green Capital/);
  assert.match(thesis.bottleneck_or_control_point, /time-to-power/);
  assert.ok(thesis.counterargument);
});
