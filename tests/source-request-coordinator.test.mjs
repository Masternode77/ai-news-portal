import assert from 'node:assert/strict';
import test from 'node:test';
import { SourceRequestCoordinator } from '../scripts/lib/source-request-coordinator.mjs';
import { fetchArticleExtraction } from '../scripts/lib/source-fetch.mjs';

function retryable(message = 'temporary') {
  return Object.assign(new Error(message), { code: 'temporary_source_failure', retryable: true });
}

test('source requests retry with bounded exponential backoff', async () => {
  let now = 0;
  const delays = [];
  const coordinator = new SourceRequestCoordinator({
    retries: 2,
    baseDelayMs: 10,
    maxDelayMs: 100,
    minIntervalMs: 0,
    clock: () => now,
    sleep: async (delay) => { delays.push(delay); now += delay; },
  });
  let attempts = 0;
  const result = await coordinator.execute('https://source.example/article', async () => {
    attempts += 1;
    if (attempts < 3) throw retryable();
    return 'ok';
  });
  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [10, 20]);
  assert.deepEqual(coordinator.metrics(), {
    attempts: 3,
    successes: 1,
    failures: 0,
    retries: 2,
    circuitOpenRejections: 0,
    rateLimitWaits: 0,
  });
});

test('source requests enforce per-origin spacing without exposing full URLs', async () => {
  let now = 1_000;
  const delays = [];
  const events = [];
  const coordinator = new SourceRequestCoordinator({
    retries: 0,
    minIntervalMs: 50,
    clock: () => now,
    sleep: async (delay) => { delays.push(delay); now += delay; },
    onEvent: (event) => events.push(event),
  });
  await coordinator.execute('https://source.example/one?secret=value', async () => 'one');
  await coordinator.execute('https://source.example/two', async () => 'two');
  assert.deepEqual(delays, [50]);
  assert.equal(events.some((event) => JSON.stringify(event).includes('secret')), false);
  assert.equal(coordinator.metrics().rateLimitWaits, 1);
});

test('source circuit opens after bounded failures and recovers after cooldown', async () => {
  let now = 0;
  const coordinator = new SourceRequestCoordinator({
    retries: 0,
    minIntervalMs: 0,
    failureThreshold: 2,
    cooldownMs: 100,
    clock: () => now,
    sleep: async (delay) => { now += delay; },
  });
  for (let count = 0; count < 2; count += 1) {
    await assert.rejects(
      () => coordinator.execute('https://source.example/article', async () => { throw retryable(); }),
      /temporary/,
    );
  }
  await assert.rejects(
    () => coordinator.execute('https://source.example/blocked', async () => 'unexpected'),
    (error) => error.code === 'source_circuit_open' && error.retryable === true,
  );
  now = 100;
  assert.equal(await coordinator.execute('https://source.example/recovered', async () => 'recovered'), 'recovered');
  assert.equal(coordinator.metrics().circuitOpenRejections, 1);
});

test('non-retryable source failures stop after one attempt', async () => {
  const coordinator = new SourceRequestCoordinator({ retries: 3, minIntervalMs: 0 });
  let attempts = 0;
  await assert.rejects(
    () => coordinator.execute('https://source.example/article', async () => {
      attempts += 1;
      throw Object.assign(new Error('unsafe URL'), { code: 'unsafe_source_url', retryable: false });
    }),
    /unsafe URL/,
  );
  assert.equal(attempts, 1);
  assert.equal(coordinator.metrics().retries, 0);
});

test('source extraction routes through the coordinator and preserves fail-closed fallback evidence', async () => {
  let requestedUrl = '';
  const coordinator = {
    async execute(url) {
      requestedUrl = url;
      throw Object.assign(new Error('source circuit is temporarily open'), {
        code: 'source_circuit_open',
        retryable: true,
      });
    },
  };
  const result = await fetchArticleExtraction({
    url: 'https://source.example/article',
    title: 'Grid interconnection queue changes',
    fallbackSnippet: 'The source feed reports a change to the grid interconnection queue.',
    coordinator,
  });
  assert.equal(requestedUrl, 'https://source.example/article');
  assert.equal(result.extractionQa.extraction_failure_reason, 'source_circuit_open');
  assert.equal(result.extractionQa.extraction_quality_score < 0.5, true);
});
