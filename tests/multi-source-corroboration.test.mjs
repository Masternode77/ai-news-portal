import test from 'node:test';
import assert from 'node:assert/strict';
import { findCorroboratingSources } from '../scripts/lib/multi-source-corroboration.mjs';

test('finds corroborating sources by title overlap', () => {
  const matches = findCorroboratingSources(
    { id: 'a', title: 'Data center power capacity constraints in Texas' },
    [
      { id: 'b', title: 'Texas data center power capacity queue grows' },
      { id: 'c', title: 'Consumer laptop review' },
    ]
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 'b');
});
