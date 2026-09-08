import { readFile, writeFile, rename, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { normalizeDemand } from './lib/infrastructure-data.mjs';
import { EIA_ORIGIN, listedEditions, selectPublishedWorkbook, workbookCandidates } from './lib/eia860m-discovery.mjs';
const root = new URL('../src/data/grid/', import.meta.url);
async function commit(name, snapshot) {
  const target = new URL(name, root), temporary = new URL(`${name}.tmp`, root);
  await writeFile(temporary, JSON.stringify(snapshot, null, 2) + '\n');
  await rename(temporary, target);
}
const results = [];
async function independent(name, fn) {
  try { results.push({ dataset: name, status: await fn() }); }
  catch (error) {
    // Never log an upstream response body, request URL, or child-process output.
    const known = new Set(['Demand fetch failed','Incomplete balancing authority coverage','Demand snapshot would regress','Capacity discovery failed','No supported EIA workbook','Untrusted workbook URL','Workbook unavailable or oversized','Workbook too large','Workbook response invalid','Workbook edition mismatch','Workbook parse failed']);
    const diagnostic = known.has(error.message) ? error.message : error.code ? `operation failed (${String(error.code).replace(/[^A-Z0-9_]/gi,'')})` : `operation failed (${error.name || 'Error'})`;
    results.push({ dataset: name, status: 'failed; previous validated snapshot retained', diagnostic }); process.exitCode = 1;
  }
}
await independent('EIA-930', async () => {
  if (!process.env.EIA_API_KEY) { process.exitCode = 1; return 'unavailable: EIA_API_KEY is not configured'; }
  const url = new URL('https://api.eia.gov/v2/electricity/rto/region-data/data/');
  for (const [k,v] of Object.entries({ api_key: process.env.EIA_API_KEY, frequency:'hourly', 'data[0]':'value', 'facets[type][]':'D', start: new Date(Date.now()-7*86400000).toISOString().slice(0,13), 'sort[0][column]':'period', 'sort[0][direction]':'asc', length:'5000' })) url.searchParams.set(k,v);
  for (const ba of ['ERCO','PJM','AZPS']) url.searchParams.append('facets[respondent][]', ba);
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error('Demand fetch failed');
  const next = normalizeDemand(await response.json());
  if (['ERCO','PJM','AZPS'].some(ba => !next.records.some(r => r.respondent === ba))) throw new Error('Incomplete balancing authority coverage');
  const previous = JSON.parse(await readFile(new URL('demand.json',root),'utf8'));
  if (next.asOf < previous.asOf) throw new Error('Demand snapshot would regress');
  await commit('demand.json', next); return 'updated';
});
await independent('EIA-860M', async () => {
  const base = 'https://www.eia.gov/electricity/data/eia860m/';
  const landing = await fetch(base, { signal: AbortSignal.timeout(30000) });
  if (!landing.ok) throw new Error('Capacity discovery failed');
  const previous = JSON.parse(await readFile(new URL('capacity.json', root),'utf8'));
  const html = await landing.text();
  // A landing page with no recognisable edition links is an error or
  // challenge page, not proof that nothing newer exists.
  if (!listedEditions(html).length) throw new Error('Capacity discovery failed');
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
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok || Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Workbook unavailable or oversized');
    const chunks=[]; let size=0;
    for await (const chunk of response.body) { size+=chunk.length; if(size>MAX_BYTES) throw new Error('Workbook too large'); chunks.push(chunk); }
    const bytes = Buffer.concat(chunks);
    return { ok: true, finalUrl: response.url, contentType: response.headers.get('content-type') || '', head: bytes.subarray(0, 4), bytes };
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
