import assert from 'node:assert/strict';
import test from 'node:test';
import { isWorkbookResponse, selectPublishedWorkbook, workbookCandidates } from '../scripts/lib/eia860m-discovery.mjs';

const landing = `
<a href="/electricity/data/eia860m/archive/xls/april_generator2026.xlsx">XLS</a>
<a href="/electricity/data/eia860m/xls/july_generator2026.xlsx">XLS</a>
<a href="/electricity/data/eia860m/archive/xls/august_generator2026.xlsx">XLS</a>
<a href="/electricity/data/eia860m/archive/xls/september_generator2026.xlsx">XLS</a>
<a href="/electricity/data/eia860m/xls/october_generator2026.xlsx">XLS</a>
<a href="/electricity/data/eia860m/xls/december_generator2026.xlsx">XLS</a>
<a href="/electricity/data/eia860m/xls/july_generator2026.xlsx">duplicate</a>
`;
const now = new Date('2026-09-08T00:00:00Z');
const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const html = Buffer.from('<!DOCTYPE html><html>');

test('discovery lists only editions newer than the committed snapshot and older than the current month', () => {
  const candidates = workbookCandidates(landing, { now, previousAsOf: '2026-06' });
  assert.deepEqual(candidates.map((c) => c.date), ['2026-08', '2026-07']);
  assert.deepEqual(workbookCandidates(landing, { now, previousAsOf: '2026-07' }).map((c) => c.date), ['2026-08']);
  assert.deepEqual(workbookCandidates(landing, { now, previousAsOf: '2026-08' }), []);
});

test('a redirect to an HTML page is not a workbook, a same-origin xlsx with a ZIP signature is', () => {
  assert.equal(isWorkbookResponse({ ok: true, finalUrl: 'https://www.eia.gov/electricity/', contentType: 'text/html; charset=UTF-8', head: html }), false);
  assert.equal(isWorkbookResponse({ ok: true, finalUrl: 'https://www.eia.gov/electricity/data/eia860m/xls/august_generator2026.xlsx', contentType: 'text/html', head: html }), false);
  assert.equal(isWorkbookResponse({ ok: true, finalUrl: 'https://www.eia.gov/electricity/data/eia860m/xls/july_generator2026.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', head: html }), false);
  assert.equal(isWorkbookResponse({ ok: false, finalUrl: 'https://www.eia.gov/electricity/data/eia860m/xls/july_generator2026.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', head: zip }), false);
  assert.equal(isWorkbookResponse({ ok: true, finalUrl: 'https://www.eia.gov/electricity/data/eia860m/xls/july_generator2026.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', head: zip }), true);
});

test('selection skips the unpublished newest listing and returns the newest real edition', async () => {
  const candidates = workbookCandidates(landing, { now, previousAsOf: '2026-06' });
  const fetched = [];
  const published = await selectPublishedWorkbook(candidates, async (candidate) => {
    fetched.push(candidate.date);
    if (candidate.date === '2026-08') return { ok: true, finalUrl: 'https://www.eia.gov/electricity/', contentType: 'text/html; charset=UTF-8', head: html };
    return { ok: true, finalUrl: `https://www.eia.gov${candidate.path}`, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', head: zip };
  });
  assert.deepEqual(fetched, ['2026-08', '2026-07']);
  assert.equal(published.candidate.date, '2026-07');
});

test('selection reports nothing published when every newer listing is a placeholder', async () => {
  const candidates = workbookCandidates(landing, { now, previousAsOf: '2026-07' });
  const published = await selectPublishedWorkbook(candidates, async () => ({ ok: true, finalUrl: 'https://www.eia.gov/electricity/', contentType: 'text/html', head: html }));
  assert.equal(published, null);
});
