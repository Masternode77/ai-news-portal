import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyWorkbookResponse, isWorkbookResponse, selectPublishedWorkbook, workbookCandidates } from '../scripts/lib/eia860m-discovery.mjs';

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

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const july = 'https://www.eia.gov/electricity/data/eia860m/xls/july_generator2026.xlsx';

test('responses are classified as workbook, unpublished placeholder, untrusted origin or invalid', () => {
  assert.equal(classifyWorkbookResponse({ ok: true, finalUrl: july, contentType: XLSX, head: zip }), 'workbook');
  assert.equal(isWorkbookResponse({ ok: true, finalUrl: july, contentType: XLSX, head: zip }), true);
  assert.equal(classifyWorkbookResponse({ ok: true, finalUrl: 'https://www.eia.gov/electricity/', contentType: 'text/html; charset=UTF-8', head: html }), 'unpublished');
  assert.equal(classifyWorkbookResponse({ ok: true, finalUrl: 'https://cdn.example.net/xls/july_generator2026.xlsx', contentType: XLSX, head: zip }), 'untrusted');
  assert.equal(classifyWorkbookResponse({ ok: true, finalUrl: 'http://www.eia.gov/electricity/data/eia860m/xls/july_generator2026.xlsx', contentType: XLSX, head: zip }), 'untrusted');
  assert.equal(classifyWorkbookResponse({ ok: true, finalUrl: july, contentType: 'text/html', head: html }), 'invalid');
  assert.equal(classifyWorkbookResponse({ ok: true, finalUrl: july, contentType: XLSX, head: html }), 'invalid');
  assert.equal(classifyWorkbookResponse({ ok: false, finalUrl: july, contentType: XLSX, head: zip }), 'invalid');
  assert.equal(classifyWorkbookResponse({ ok: true, finalUrl: 'not a url', contentType: XLSX, head: zip }), 'invalid');
});

test('selection fails closed on an off-origin redirect or a malformed response at a workbook URL', async () => {
  const candidates = workbookCandidates(landing, { now, previousAsOf: '2026-06' });
  await assert.rejects(
    () => selectPublishedWorkbook(candidates, async () => ({ ok: true, finalUrl: 'https://cdn.example.net/xls/august_generator2026.xlsx', contentType: XLSX, head: zip })),
    /Untrusted workbook URL/,
  );
  await assert.rejects(
    () => selectPublishedWorkbook(candidates, async (candidate) => ({ ok: true, finalUrl: `https://www.eia.gov${candidate.path}`, contentType: 'text/html', head: html })),
    /Workbook response invalid/,
  );
});

test('selection skips the unpublished newest listing and returns the newest real edition', async () => {
  const candidates = workbookCandidates(landing, { now, previousAsOf: '2026-06' });
  const fetched = [];
  const published = await selectPublishedWorkbook(candidates, async (candidate) => {
    fetched.push(candidate.date);
    if (candidate.date === '2026-08') return { ok: true, finalUrl: 'https://www.eia.gov/electricity/', contentType: 'text/html; charset=UTF-8', head: html };
    return { ok: true, finalUrl: `https://www.eia.gov${candidate.path}`, contentType: XLSX, head: zip };
  });
  assert.deepEqual(fetched, ['2026-08', '2026-07']);
  assert.equal(published.candidate.date, '2026-07');
});

test('selection reports nothing published when every newer listing is a placeholder', async () => {
  const candidates = workbookCandidates(landing, { now, previousAsOf: '2026-07' });
  const published = await selectPublishedWorkbook(candidates, async () => ({ ok: true, finalUrl: 'https://www.eia.gov/electricity/', contentType: 'text/html', head: html }));
  assert.equal(published, null);
});
