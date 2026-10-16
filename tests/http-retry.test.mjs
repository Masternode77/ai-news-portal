import assert from 'node:assert/strict';
import test from 'node:test';
import { TransientUpstreamError, fetchWithRetry, isRetryableStatus, isTransientError, retryAfterMs, transientDiagnostic } from '../scripts/lib/http-retry.mjs';

function response(status, body = 'ok', headers = {}) {
  return new Response(body, { status, headers });
}

function scripted(steps) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), signal: init.signal });
    const step = steps[Math.min(calls.length, steps.length) - 1];
    if (step instanceof Error) throw step;
    return step();
  };
  return { calls, fetchImpl };
}

const timeout = () => new DOMException('The operation was aborted due to timeout', 'TimeoutError');
const networkFailure = () => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }) });

test('a timed-out attempt is retried with exponential backoff and the next success is returned', async () => {
  const delays = [];
  const { calls, fetchImpl } = scripted([timeout(), networkFailure(), () => response(200, '{"rows":1}')]);
  const value = await fetchWithRetry('https://api.example.test/data', {
    timeoutMs: 1000, baseDelayMs: 100, fetchImpl, sleep: async (ms) => { delays.push(ms); },
    read: (r) => r.json(),
  });
  assert.deepEqual(value, { rows: 1 });
  assert.equal(calls.length, 3);
  assert.deepEqual(delays, [100, 200]);
  assert.ok(calls.every((call) => call.signal instanceof AbortSignal), 'every attempt carries its own timeout signal');
  assert.notEqual(calls[0].signal, calls[1].signal);
});

test('retryable statuses are retried, honour Retry-After up to the cap, and report attempts when exhausted', async () => {
  const delays = [];
  const { calls, fetchImpl } = scripted([() => response(503, 'busy', { 'retry-after': '1' }), () => response(429, 'slow', { 'retry-after': '120' }), () => response(502, 'bad gateway')]);
  await assert.rejects(
    fetchWithRetry('https://api.example.test/data', { timeoutMs: 1000, attempts: 3, maxDelayMs: 5000, fetchImpl, sleep: async (ms) => { delays.push(ms); } }),
    (error) => {
      assert.ok(error instanceof TransientUpstreamError);
      assert.equal(error.status, 502);
      assert.equal(error.attempts, 3);
      assert.equal(transientDiagnostic(error), 'Upstream HTTP 502 after 3 attempts');
      return true;
    },
  );
  assert.equal(calls.length, 3);
  assert.deepEqual(delays, [1000, 5000]);
});

test('integrity failures are not retried', async () => {
  const { calls, fetchImpl } = scripted([() => response(404, 'missing'), () => response(200)]);
  await assert.rejects(
    fetchWithRetry('https://api.example.test/data', {
      timeoutMs: 1000, fetchImpl, sleep: async () => assert.fail('must not back off'),
      read: (r) => { if (!r.ok) throw new Error('Demand fetch failed'); return r.text(); },
    }),
    (error) => error.message === 'Demand fetch failed' && error.attempts === 1,
  );
  assert.equal(calls.length, 1);
});

test('a transient failure raised while reading the body is retried', async () => {
  let reads = 0;
  const { calls, fetchImpl } = scripted([() => response(200, 'challenge'), () => response(200, 'real')]);
  const body = await fetchWithRetry('https://www.example.test/', {
    timeoutMs: 1000, fetchImpl, sleep: async () => {},
    read: async (r) => { const text = await r.text(); reads++; if (text === 'challenge') throw new TransientUpstreamError('Capacity discovery failed'); return text; },
  });
  assert.equal(body, 'real');
  assert.equal(reads, 2);
  assert.equal(calls.length, 2);
});

test('the real timeout signal aborts a stalled request as a transient TimeoutError', async (t) => {
  const fetchImpl = (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  // AbortSignal.timeout() timers are unref'd; keep the event loop alive.
  const keepAlive = setInterval(() => {}, 1000);
  t.after(() => clearInterval(keepAlive));
  await assert.rejects(
    fetchWithRetry('https://api.example.test/slow', { timeoutMs: 20, attempts: 2, fetchImpl, sleep: async () => {} }),
    (error) => {
      assert.equal(error.name, 'TimeoutError');
      assert.ok(isTransientError(error));
      assert.equal(transientDiagnostic(error), 'Upstream request timed out after 2 attempts');
      return true;
    },
  );
});

test('error classification and Retry-After parsing', () => {
  assert.equal(isTransientError(timeout()), true);
  assert.equal(isTransientError(networkFailure()), true);
  assert.equal(isTransientError(new TypeError('terminated')), true);
  assert.equal(isTransientError(Object.assign(new Error('x'), { code: 'EAI_AGAIN' })), true);
  assert.equal(isTransientError(new TypeError('Cannot read properties of undefined')), false);
  assert.equal(isTransientError(new SyntaxError('Unexpected token <')), false);
  assert.equal(isTransientError(new Error('Workbook too large')), false);
  for (const status of [408, 425, 429, 500, 502, 503, 504, 520, 522, 524, 599]) assert.equal(isRetryableStatus(status), true, String(status));
  for (const status of [200, 301, 400, 401, 403, 404, 410, 501, 505, 600]) assert.equal(isRetryableStatus(status), false, String(status));
  assert.equal(retryAfterMs('3'), 3000);
  assert.equal(retryAfterMs(new Date(10_000).toUTCString(), 4_000), 6000);
  assert.equal(retryAfterMs('soon'), undefined);
  assert.equal(retryAfterMs(null), undefined);
});

test('diagnostics never echo the request URL', async () => {
  const secretUrl = 'https://api.example.test/data?api_key=SECRET';
  const { fetchImpl } = scripted([networkFailure()]);
  await assert.rejects(fetchWithRetry(secretUrl, { timeoutMs: 1000, attempts: 1, fetchImpl }), (error) => {
    assert.equal(transientDiagnostic(error), 'Upstream network error after 1 attempts');
    assert.doesNotMatch(transientDiagnostic(error), /SECRET/);
    return true;
  });
});
