import assert from 'node:assert/strict';
import test from 'node:test';
import { corroborateEvidence, findCorroboratingSources } from '../scripts/lib/multi-source-corroboration.mjs';
import { triangulateEvidence } from '../scripts/lib/evidence-triangulation.mjs';

const primary = {
  id: 'primary',
  title: 'AI data center power planning expands in Ohio',
  source: 'Utility Dive',
  rawText: 'AI data center power planning expands in Ohio. The utility described interconnection reviews, power delivery timing, and load forecasting for large data center customers.',
};

const secondary = {
  id: 'secondary',
  title: 'Ohio data center power planning draws new utility review',
  source: 'Data Center Dynamics',
  rawText: 'Ohio data center power planning draws new utility review. Developers are watching interconnection timing, substation work, and procurement exposure.',
};

test('corroboration finds overlapping infrastructure sources', () => {
  const matches = findCorroboratingSources(primary, [secondary, { id: 'other', title: 'Consumer AI app launch' }]);
  assert.deepEqual(matches.map((item) => item.id), ['secondary']);
});

test('triangulation merges non-duplicate facts', () => {
  const pack = triangulateEvidence(primary, [secondary]);
  assert.equal(pack.ok, true);
  assert.ok(pack.facts.length >= 2);
  assert.ok(pack.corroboratingSources.includes('Data Center Dynamics'));
});
