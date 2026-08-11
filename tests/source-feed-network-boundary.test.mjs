import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchNewsPoolResult } from '../scripts/lib/fetch-feeds.mjs';

const NOW = new Date('2026-08-10T00:00:00.000Z');
const SOURCE = {
  id: 'authorized-test', name: 'Authorized Test', domain: 'authorized.example',
  feed: 'https://authorized.example/feed.xml', status: 'active_feed',
  text_use_basis: 'licensed', terms_url: 'https://authorized.example/terms',
  reviewed_at: '2026-08-01', allow_text_use: true,
};
const PUBLIC_ADDRESS = [{ address: '93.184.216.34', family: 4 }];

function response(headers, chunks) {
  let destroyed = false;
  return {
    status: 200,
    headers,
    body: (async function* body() { for (const chunk of chunks) yield Buffer.from(chunk); }()),
    destroy() { destroyed = true; },
    destroyed: () => destroyed,
  };
}

test('bounded feed transport parses one authorized public item', async () => {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Authorized Test</title><item><title>Public item</title><link>https://authorized.example/story</link><pubDate>Mon, 10 Aug 2026 00:00:00 GMT</pubDate><description>AI infrastructure capacity update.</description></item></channel></rss>`;
  const result = await fetchNewsPoolResult({
    sources: [SOURCE],
    now: NOW,
    feedNetworkOptions: {
      resolveHost: async () => PUBLIC_ADDRESS,
      request: async ({ address }) => {
        assert.equal(address, '93.184.216.34');
        return response({ 'content-type': 'application/rss+xml' }, [xml]);
      },
    },
  });
  assert.equal(result.status, 'fetched');
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].url, 'https://authorized.example/story');
});

test('feed transport is bounded and preserves transient failure classification', async () => {
  const sourceResponse = response({
    'content-type': 'application/rss+xml',
    'content-length': '5',
  }, ['12345']);
  const result = await fetchNewsPoolResult({
    sources: [SOURCE],
    now: NOW,
    feedNetworkOptions: {
      maxBytes: 4,
      resolveHost: async () => PUBLIC_ADDRESS,
      request: async () => sourceResponse,
    },
  });
  assert.equal(result.status, 'transient_fetch_failure');
  assert.equal(result.failedSourceCount, 1);
  assert.equal(sourceResponse.destroyed(), true);
});
