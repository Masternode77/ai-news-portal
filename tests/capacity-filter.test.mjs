import assert from 'node:assert/strict';
import test from 'node:test';
import { filterCapacityGroups, summarizeCapacityGroups } from '../src/lib/capacity-filter.mjs';

const groups = [
  { year: 2026, state: 'AZ', units: 2, netSummerMW: 125.4 },
  { year: 2026, state: 'TX', units: 3, netSummerMW: 200 },
  { year: 2027, state: 'TX', units: 4, netSummerMW: 310.05 },
  { year: 2027, state: 'VA', units: 1, netSummerMW: 25 },
  { year: null, state: 'VA', units: 2, netSummerMW: 9.96 },
];

test('capacity filters combine planned year and state selections', () => {
  assert.deepEqual(filterCapacityGroups(groups, { year: '2026', state: 'TX' }), [groups[1]]);
  assert.deepEqual(filterCapacityGroups(groups, { year: '2027' }), [groups[2], groups[3]]);
  assert.deepEqual(filterCapacityGroups(groups, { state: 'va' }), [groups[3], groups[4]]);
  assert.deepEqual(filterCapacityGroups(groups), groups);
});

test('capacity filters return an empty collection when no row matches both selections', () => {
  assert.deepEqual(filterCapacityGroups(groups, { year: '2026', state: 'VA' }), []);
});

test('capacity summaries report visible rows, units and rounded net summer capacity', () => {
  assert.deepEqual(summarizeCapacityGroups(filterCapacityGroups(groups, { year: '2027' })), {
    rows: 2,
    units: 5,
    netSummerMW: 335.1,
  });
  assert.deepEqual(summarizeCapacityGroups([]), { rows: 0, units: 0, netSummerMW: 0 });
});
