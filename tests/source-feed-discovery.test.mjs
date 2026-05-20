import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverSourceFeed } from '../scripts/lib/source-feed-discovery.mjs';

test('discovers declared RSS feed without scraping aggressively', async () => {
  const fetcher = async (url) => ({
    ok: true,
    status: 200,
    async text() {
      assert.equal(url, 'https://example.com/feed/');
      return '<rss><channel><item><title>Data center power</title></item></channel></rss>';
    },
  });
  const result = await discoverSourceFeed({ domain: 'example.com', feed: 'https://example.com/feed/' }, { fetcher });
  assert.equal(result.status, 'active_feed');
  assert.equal(result.discoveredUrl, 'https://example.com/feed/');
});
