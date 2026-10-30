import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { TRANSIENT_STATUSES, UpstreamError, diagnose, isTransientError, statusError, withRetry } from '../scripts/lib/upstream-retry.mjs';

const known = new Set(['Demand fetch failed', 'Capacity discovery failed', 'Workbook unavailable', 'Workbook too large']);
const timeout = () => new DOMException('The operation was aborted due to timeout', 'TimeoutError');

function recorder() {
  const delays = [];
  return { delays, sleep: async (ms) => { delays.push(ms); } };
}

test('timeouts, network failures, transient statuses and challenge pages are retried; definitive failures are not', () => {
  assert.equal(isTransientError(timeout()), true);
  assert.equal(isTransientError(new TypeError('fetch failed')), true);
  assert.equal(isTransientError(new TypeError('terminated')), true);
  for (const status of TRANSIENT_STATUSES) assert.equal(isTransientError(new UpstreamError('x', { status, transient: true })), true);
  assert.equal(isTransientError(new UpstreamError('Capacity discovery failed', { transient: true })), true);
  assert.equal(isTransientError(new UpstreamError('Workbook unavailable', { status: 404 })), false);
  assert.equal(isTransientError(new Error('Workbook too large')), false);
  assert.equal(isTransientError(new Error('Untrusted workbook URL')), false);
  assert.equal(isTransientError(new SyntaxError('Unexpected end of JSON input')), false);
  assert.equal(isTransientError(new TypeError("Cannot read properties of undefined (reading 'records')")), false);
});

test('a transient failure is retried with backoff until an attempt succeeds', async () => {
  const { delays, sleep } = recorder();
  const failures = [timeout(), new UpstreamError('Demand fetch failed', { status: 503, transient: true })];
  let calls = 0;
  const value = await withRetry(async (attempt) => {
    calls += 1;
    assert.equal(attempt, calls);
    if (failures.length) throw failures.shift();
    return 'payload';
  }, { sleep });
  assert.equal(value, 'payload');
  assert.equal(calls, 3);
  assert.deepEqual(delays, [5000, 15000]);
});

test('a definitive failure is not retried and keeps its message', async () => {
  const { delays, sleep } = recorder();
  let calls = 0;
  await assert.rejects(
    () => withRetry(async () => { calls += 1; throw new Error('Workbook too large'); }, { sleep }),
    (error) => error.message === 'Workbook too large' && error.attempts === undefined,
  );
  assert.equal(calls, 1);
  assert.deepEqual(delays, []);
});

test('exhausted retries rethrow the last error with the attempt count', async () => {
  const { delays, sleep } = recorder();
  let calls = 0;
  const error = await withRetry(async () => { calls += 1; throw timeout(); }, { attempts: 3, sleep }).catch((caught) => caught);
  assert.equal(calls, 3);
  assert.equal(error.name, 'TimeoutError');
  assert.equal(error.attempts, 3);
  assert.deepEqual(delays, [5000, 15000]);
  assert.equal(diagnose(error, known), 'Upstream request timed out after 3 attempts');
});

test('diagnostics name the reason, status and attempts but never an upstream URL or body', () => {
  const stalled = timeout();
  assert.equal(diagnose(stalled, known), 'Upstream request timed out');
  assert.equal(diagnose(Object.assign(new UpstreamError('Demand fetch failed', { status: 503, transient: true }), { attempts: 3 }), known), 'Demand fetch failed (HTTP 503) after 3 attempts');
  assert.equal(diagnose(new UpstreamError('Workbook unavailable', { status: 404 }), known), 'Workbook unavailable (HTTP 404)');
  assert.equal(diagnose(new Error('Workbook too large'), known), 'Workbook too large');
  assert.equal(diagnose(new TypeError('fetch failed'), known), 'Upstream connection failed');
  assert.equal(diagnose(Object.assign(new Error('connect ECONNREFUSED https://api.eia.gov/?api_key=secret'), { code: 'ECONN<REFUSED>' }), known), 'operation failed (ECONNREFUSED)');
  assert.equal(diagnose(new RangeError('https://api.eia.gov/?api_key=secret'), known), 'operation failed (RangeError)');
});

test('real fetch: a 503 and a stalled response are retried, a 404 fails at once', async (t) => {
  const plan = { '/flaky': ['503', 'stall', 'ok'], '/missing': ['404', 'ok'] };
  const hits = { '/flaky': 0, '/missing': 0 };
  const server = http.createServer((request, response) => {
    const step = plan[request.url][hits[request.url]++];
    if (step === 'stall') return;
    if (step === 'ok') { response.writeHead(200, { 'content-type': 'application/json' }); response.end('{"ok":true}'); return; }
    response.writeHead(Number(step), { 'content-type': 'text/html' });
    response.end('<html>upstream error page</html>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const read = (path) => withRetry(async () => {
    const response = await fetch(origin + path, { signal: AbortSignal.timeout(250) });
    if (!response.ok) throw await statusError(response, 'Demand fetch failed');
    return response.json();
  }, { sleep: async () => {} });

  assert.deepEqual(await read('/flaky'), { ok: true });
  assert.equal(hits['/flaky'], 3);

  const error = await read('/missing').catch((caught) => caught);
  assert.equal(hits['/missing'], 1);
  assert.equal(diagnose(error, known), 'Demand fetch failed (HTTP 404)');
});
