import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { capacityGroups, csv, normalizeDemand, snapshotAge } from '../scripts/lib/infrastructure-data.mjs';

const demand = JSON.parse(fs.readFileSync('src/data/grid/demand.json', 'utf8'));
const capacity = JSON.parse(fs.readFileSync('src/data/grid/capacity.json', 'utf8'));
const ercot = JSON.parse(fs.readFileSync('src/data/grid/ercot.json', 'utf8'));

function demandPayload(rows) {
  return { response: { data: rows } };
}

function demandRow(overrides = {}) {
  return {
    period: '2026-09-05T01',
    respondent: 'PJM',
    type: 'D',
    'value-units': 'megawatthours',
    value: '123.5',
    ...overrides,
  };
}

test('EIA-930 normalization validates dimensions, sorts records and preserves units', () => {
  const snapshot = normalizeDemand(demandPayload([
    demandRow({ period: '2026-09-05T01', respondent: 'PJM', value: '123.5' }),
    demandRow({ period: '2026-09-05T00', respondent: 'ERCO', value: 0 }),
    demandRow({ period: '2026-09-05T00', respondent: 'AZPS', value: '9' }),
  ]), { retrievedAt: '2026-09-06T00:00:00.000Z' });

  assert.equal(snapshot.dataset, 'EIA-930 hourly balancing-authority demand');
  assert.equal(snapshot.unit, 'MWh');
  assert.equal(snapshot.asOf, '2026-09-05T01:00:00Z');
  assert.equal(snapshot.retrievedAt, '2026-09-06T00:00:00.000Z');
  assert.deepEqual(snapshot.records.map((row) => `${row.period}:${row.respondent}`), [
    '2026-09-05T00:00:00Z:AZPS',
    '2026-09-05T00:00:00Z:ERCO',
    '2026-09-05T01:00:00Z:PJM',
  ]);
});

test('EIA-930 normalization rejects missing, duplicate and invalid observations', () => {
  assert.throws(() => normalizeDemand({}), /no observations/);
  assert.throws(() => normalizeDemand(demandPayload([])), /no observations/);
  assert.throws(() => normalizeDemand(demandPayload([demandRow(), demandRow()])), /Duplicate/);

  for (const invalid of [
    { period: '2026-09-05' },
    { period: '2026-13-40T25' },
    { period: '2026-02-30T00' },
    { respondent: 'UNKNOWN' },
    { type: 'NG' },
    { 'value-units': 'megawatts' },
    { value: null },
    { value: true },
    { period: '2099-01-01T00' },
    { value: '' },
    { value: 'not-a-number' },
    { value: -1 },
  ]) assert.throws(() => normalizeDemand(demandPayload([demandRow(invalid)])), /Unexpected|Invalid/);
});

test('snapshot age labels recent, dated, historical, invalid and future dates', () => {
  const now = new Date('2026-09-06T12:00:00Z');
  assert.deepEqual(snapshotAge('2026-09-05T12:00:00Z', now), { days: 1, label: 'Recent snapshot' });
  assert.deepEqual(snapshotAge('2026-09-01T12:00:00Z', now), { days: 5, label: 'Dated snapshot' });
  assert.deepEqual(snapshotAge('2026-04', now), { days: 158, label: 'Historical snapshot' });
  assert.deepEqual(snapshotAge('invalid', now), { days: null, label: 'Date unavailable' });
  assert.deepEqual(snapshotAge('2026-09-07T00:00:00Z', now), { days: null, label: 'Date unavailable' });
});

test('CSV export quotes fields, escapes quotes and neutralizes spreadsheet formulas', () => {
  const output = csv([['plain', 'a,"b"', '=SUM(A1:A2)', '+1', '-1', '@cmd', '\tformula', '\rformula', null]]);
  assert.equal(output, '"plain","a,""b""","\'=SUM(A1:A2)","\'+1","\'-1","\'@cmd","\'\tformula","\'\rformula",""\r\n');
  assert.ok(output.endsWith('\r\n'));
});

test('capacity aggregation retains missing counts and rounds only the reported aggregate', () => {
  const groups = capacityGroups([
    { year: 2027, state: 'TX', netSummerMW: 10.04 },
    { year: 2027, state: 'TX', netSummerMW: 0.02 },
    { year: 2027, state: 'TX', netSummerMW: null },
    { year: null, state: 'VA', netSummerMW: 5 },
    { year: 2026, state: 'AZ', netSummerMW: 2 },
  ]);
  assert.deepEqual(groups, [
    { year: 2026, state: 'AZ', units: 1, netSummerMW: 2, missing: 0 },
    { year: 2027, state: 'TX', units: 3, netSummerMW: 10.1, missing: 1 },
    { year: null, state: 'VA', units: 1, netSummerMW: 5, missing: 0 },
  ]);
});

test('committed EIA-930 snapshot satisfies stable public-data invariants', () => {
  assert.equal(demand.dataset, 'EIA-930 hourly balancing-authority demand');
  assert.equal(demand.unit, 'MWh');
  assert.match(demand.asOf, /^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/);
  assert.ok(Number.isFinite(Date.parse(demand.retrievedAt)));
  assert.ok(demand.records.length > 0);
  assert.deepEqual([...new Set(demand.records.map((row) => row.respondent))].sort(), ['AZPS', 'ERCO', 'PJM']);
  const keys = demand.records.map((row) => `${row.respondent}:${row.period}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(demand.records, [...demand.records].sort((a, b) => a.period.localeCompare(b.period) || a.respondent.localeCompare(b.respondent)));
  for (const row of demand.records) {
    assert.match(row.period, /^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/);
    assert.ok(Number.isFinite(row.value) && row.value >= 0);
    assert.ok(row.period <= demand.asOf);
  }
  assert.equal(demand.records.at(-1).period, demand.asOf);
});

test('committed EIA-860M snapshot has unique dimensions and internally consistent aggregates', () => {
  assert.equal(capacity.dataset, 'EIA-860M planned generating and storage units');
  assert.equal(capacity.unit, 'MW net summer capacity');
  assert.match(capacity.asOf, /^\d{4}-(?:0[1-9]|1[0-2])$/);
  assert.match(capacity.sha256, /^[a-f0-9]{64}$/);
  assert.ok(capacity.records.length > 0);
  const keys = capacity.records.map((row) => `${row.plantId}:${row.generatorId}`);
  assert.equal(new Set(keys).size, keys.length);
  let missing = 0;
  let rawTotal = 0;
  for (const row of capacity.records) {
    assert.match(row.plantId, /^\d+$/);
    assert.ok(String(row.generatorId).trim());
    assert.match(row.state, /^[A-Z]{2}$/);
    assert.ok(String(row.technology).trim());
    assert.ok(String(row.status).trim());
    assert.ok(row.year === null || (Number.isInteger(row.year) && row.year >= 1900 && row.year <= 2200));
    assert.ok(row.month === null || (Number.isInteger(row.month) && row.month >= 1 && row.month <= 12));
    if (row.netSummerMW === null) missing += 1;
    else {
      assert.ok(Number.isFinite(row.netSummerMW) && row.netSummerMW >= 0);
      rawTotal += row.netSummerMW;
    }
  }
  assert.equal(capacity.missingCapacityCount, missing);
  const groupedTotal = capacityGroups(capacity.records).reduce((sum, row) => sum + row.netSummerMW, 0);
  assert.ok(Math.abs(groupedTotal - rawTotal) < capacityGroups(capacity.records).length * 0.051);
});

test('ERCOT snapshot is explicitly historical, manual and arithmetically consistent', () => {
  assert.equal(ercot.unit, 'GW');
  assert.match(ercot.dataset, /applications/i);
  assert.match(ercot.sourceUrl, /^https:\/\/www\.ercot\.com\/.*\.pdf$/);
  assert.ok(Number.isInteger(ercot.sourcePage) && ercot.sourcePage > 0);
  assert.equal(snapshotAge(ercot.asOf, new Date(ercot.reviewedAt)).label, 'Historical snapshot');
  assert.ok(Date.parse(ercot.reviewedAt) > Date.parse(ercot.asOf));
  assert.ok(ercot.stages.length > 1);
  assert.equal(new Set(ercot.stages.map((row) => row.stage)).size, ercot.stages.length);
  for (const row of ercot.stages) assert.ok(row.stage && Number.isFinite(row.value) && row.value >= 0);
  const stageTotal = ercot.stages.reduce((sum, row) => sum + row.value, 0);
  assert.ok(Math.abs(stageTotal - ercot.total) < 0.000001);
});
