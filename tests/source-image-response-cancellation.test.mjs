import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchSourceImage } from '../scripts/lib/source-image-fetcher.mjs';

const PUBLIC_ADDRESS = [{ address: '93.184.216.34', family: 4 }];

function cancellableResponse(status, headers = {}, firstChunk = null) {
  let destroyed = false;
  let cancelled = false;
  let yielded = false;
  let settle;
  const body = {
    next() {
      if (firstChunk !== null && !yielded) {
        yielded = true;
        return Promise.resolve({ value: Buffer.from(firstChunk), done: false });
      }
      return new Promise((resolve) => { settle = resolve; });
    },
    async return() {
      cancelled = true;
      settle?.({ done: true });
      return { done: true };
    },
    [Symbol.asyncIterator]() { return this; },
  };
  return {
    status,
    headers,
    body,
    destroy() { destroyed = true; },
    state() { return { cancelled, destroyed }; },
  };
}

test('every rejected or timed-out image response cancels its never-ending body', async () => {
  const scenarios = [
    [cancellableResponse(302, { location: '/next.png' }), { maxRedirects: 0 }, 'source_image_redirect_limit'],
    [cancellableResponse(503, { 'content-type': 'image/png', 'content-length': '1' }), {}, 'source_image_fetch_failed'],
    [cancellableResponse(200, { 'content-length': '1' }), {}, 'source_image_not_image'],
    [cancellableResponse(200, { 'content-type': 'text/html', 'content-length': '1' }), {}, 'source_image_not_image'],
    [cancellableResponse(200, { 'content-type': 'image/png' }), {}, 'source_image_size_unknown'],
    [cancellableResponse(200, { 'content-type': 'image/png', 'content-length': '5' }), { maxBytes: 4 }, 'source_image_too_large'],
    [cancellableResponse(200, { 'content-type': 'image/png', 'content-length': '4' }, '12345'), { maxBytes: 4 }, 'source_image_too_large'],
    [cancellableResponse(200, { 'content-type': 'image/png', 'content-length': '1' }), { timeoutMs: 5 }, 'source_image_fetch_timeout'],
  ];

  for (const [sourceResponse, overrides, code] of scenarios) {
    await assert.rejects(fetchSourceImage('https://cdn.authorized.example/source.png', {
      allowedHosts: ['cdn.authorized.example'],
      resolveHost: async () => PUBLIC_ADDRESS,
      request: async () => sourceResponse,
      ...overrides,
    }), (error) => error.code === code);
    assert.deepEqual(sourceResponse.state(), { cancelled: true, destroyed: true }, code);
  }
});
