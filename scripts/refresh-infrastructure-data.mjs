import { readFile, writeFile, rename, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { normalizeDemand, retainedSnapshotWithinTolerance } from './lib/infrastructure-data.mjs';
import { TransientUpstreamError, fetchWithRetry, isTransientError, transientDiagnostic } from './lib/http-retry.mjs';
import { EIA_ORIGIN, listedEditions, selectPublishedWorkbook, workbookCandidates } from './lib/eia860m-discovery.mjs';
const root = new URL('../src/data/grid/', import.meta.url);
async function commit(name, snapshot) {
  const target = new URL(name, root), temporary = new URL(`${name}.tmp`, root);
  await writeFile(temporary, JSON.stringify(snapshot, null, 2) + '\n');
  await rename(temporary, target);
}
const results = [];
const readSnapshot = async (name) => JSON.parse(await readFile(new URL(name, root), 'utf8'));
async function independent(name, { kind, file }, fn) {
  try { results.push({ dataset: name, status: await fn() }); }
  catch (error) {
    // Retries are exhausted. A transient outage is tolerated while the
    // retained snapshot is still recent; past that it fails like any error.
    if (isTransientError(error)) {
      const diagnostic = transientDiagnostic(error);
      let current = false;
      try { current = retainedSnapshotWithinTolerance(kind, (await readSnapshot(file)).asOf); } catch {}
      if (current) {
        results.push({ dataset: name, status: 'deferred; upstream unavailable, previous validated snapshot retained', diagnostic });
        console.log(`::warning title=${name} refresh deferred::${diagnostic}; previous validated snapshot retained`);
        return;
      }
      results.push({ dataset: name, status: 'failed; previous validated snapshot retained but stale', diagnostic }); process.exitCode = 1;
      return;
    }
    // Never log an upstream response body, request URL, or child-process output.
    const known = new Set(['Demand fetch failed','Incomplete balancing authority coverage','Demand snapshot would regress','Capacity discovery failed','No supported EIA workbook','Untrusted workbook URL','Workbook unavailable','Workbook unavailable or oversized','Workbook too large','Workbook response invalid','Workbook edition mismatch','Workbook parse failed']);
    const diagnostic = known.has(error.message) ? error.message : error.code ? `operation failed (${String(error.code).replace(/[^A-Z0-9_]/gi,'')})` : `operation failed (${error.name || 'Error'})`;
    results.push({ dataset: name, status: 'failed; previous validated snapshot retained', diagnostic }); process.exitCode = 1;
  }
}
await independent('EIA-930', { kind: 'demand', file: 'demand.json' }, async () => {
  if (!process.env.EIA_API_KEY) { process.exitCode = 1; return 'unavailable: EIA_API_KEY is not configured'; }
  const url = new URL('https://api.eia.gov/v2/electricity/rto/region-data/data/');
  for (const [k,v] of Object.entries({ api_key: process.env.EIA_API_KEY, frequency:'hourly', 'data[0]':'value', 'facets[type][]':'D', start: new Date(Date.now()-7*86400000).toISOString().slice(0,13), 'sort[0][column]':'period', 'sort[0][direction]':'asc', length:'5000' })) url.searchParams.set(k,v);
  for (const ba of ['ERCO','PJM','AZPS']) url.searchParams.append('facets[respondent][]', ba);
  const payload = await fetchWithRetry(url, { timeoutMs: 45000, read: async (response) => {
    if (!response.ok) throw new Error('Demand fetch failed');
    return response.json();
  } });
  const next = normalizeDemand(payload);
  if (['ERCO','PJM','AZPS'].some(ba => !next.records.some(r => r.respondent === ba))) throw new Error('Incomplete balancing authority coverage');
  const previous = await readSnapshot('demand.json');
  if (next.asOf < previous.asOf) throw new Error('Demand snapshot would regress');
  await commit('demand.json', next); return 'updated';
});
await independent('EIA-860M', { kind: 'capacity', file: 'capacity.json' }, async () => {
  const base = 'https://www.eia.gov/electricity/data/eia860m/';
  const previous = await readSnapshot('capacity.json');
  // A landing page with no recognisable edition links is an error or
  // challenge page, not proof that nothing newer exists. Challenge pages
  // clear on their own, so it is retried and, if it persists, treated as an
  // upstream outage rather than as "nothing newer".
  const html = await fetchWithRetry(base, { timeoutMs: 30000, read: async (landing) => {
    if (!landing.ok) throw new Error('Capacity discovery failed');
    const page = await landing.text();
    if (!listedEditions(page).length) throw new TransientUpstreamError('Capacity discovery failed');
    return page;
  } });
  const candidates = workbookCandidates(html, { previousAsOf: previous.asOf });
  if (!candidates.length) return 'no newer monthly edition';
  const MAX_BYTES = 32000000;
  // EIA lists editions before they exist and answers missing files with an
  // HTML page, so each candidate must prove it is a spreadsheet after
  // redirects: EIA origin, .xlsx path, non-HTML content type, ZIP signature.
  // A placeholder redirect is skipped; an off-origin or malformed response
  // fails the refresh.
  const published = await selectPublishedWorkbook(candidates, async (candidate) => {
    const url = new URL(candidate.path, base);
    if (url.origin !== EIA_ORIGIN) throw new Error('Untrusted workbook URL');
    return fetchWithRetry(url, { timeoutMs: 60000, read: async (response) => {
      if (!response.ok) throw new Error('Workbook unavailable');
      if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Workbook too large');
      const chunks=[]; let size=0;
      for await (const chunk of response.body) { size+=chunk.length; if(size>MAX_BYTES) throw new Error('Workbook too large'); chunks.push(chunk); }
      const bytes = Buffer.concat(chunks);
      return { ok: true, finalUrl: response.url, contentType: response.headers.get('content-type') || '', head: bytes.subarray(0, 4), bytes };
    } });
  });
  if (!published) return `no newer monthly edition (${candidates[0].date} is listed but not published yet)`;
  const { candidate: latest, result } = published;
  const dir = await mkdtemp(join(tmpdir(), 'cc-eia860-'));
  try {
    const workbook = join(dir,'source.xlsx'), output=join(dir,'snapshot.json');
    await writeFile(workbook,result.bytes);
    try {
      execFileSync('python3', [new URL('./parse-eia860m.py',import.meta.url).pathname,workbook,'--source-url',result.finalUrl,'--output',output], { timeout:60000, stdio:'pipe' });
    } catch { throw new Error('Workbook parse failed'); }
    const snapshot=JSON.parse(await readFile(output,'utf8'));
    if(snapshot.asOf !== latest.date) throw new Error('Workbook edition mismatch');
    await commit('capacity.json',snapshot);
  } finally { await rm(dir,{recursive:true,force:true}); }
  return 'updated';
});
console.log(JSON.stringify({ checkedAt:new Date().toISOString(), results },null,2));
