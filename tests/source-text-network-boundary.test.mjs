import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchNewsPoolResult } from '../scripts/lib/fetch-feeds.mjs';
import { fetchArticleExtraction } from '../scripts/lib/source-fetch.mjs';

const NOW = new Date('2026-08-10T00:00:00.000Z');
const SOURCE = {
  id: 'authorized-test',
  name: 'Authorized Test',
  domain: 'authorized.example',
  feed: 'https://authorized.example/feed.xml',
  status: 'active_feed',
  text_use_basis: 'licensed',
  terms_url: 'https://authorized.example/terms',
  reviewed_at: '2026-08-01',
  allow_text_use: true,
};

const PUBLIC_ADDRESS = [{ address: '93.184.216.34', family: 4 }];
const PUBLIC_IPV6_ADDRESS = [{ address: '2606:4700:4700::1111', family: 6 }];
const CANDIDATE_V8_BLOCKED_IPV6 = [
  '::',
  '::1',
  '::ffff:8.8.8.8',
  '64:ff9b::808:808',
  '64:ff9b:1::1',
  '100::1',
  '100:0:0:1::1',
  '2000::1',
  '2001::1',
  '2001:1::1',
  '2001:2::1',
  '2001:3::1',
  '2001:4:112::1',
  '2001:10::1',
  '3fff::1',
  '2001:20::1',
  '2001:30::1',
  '2002:c000:204::1',
  '2001:db8::1',
  '2620:4f:8000::1',
  '2d00::1',
  '3000::1',
  '3ffe::1',
  '5f00::1',
  'fc00::1',
  'fe80::1',
  'ff02::1',
];

function response(status, headers = {}, chunks = []) {
  let destroyed = false;
  let cancelled = false;
  return {
    status,
    headers,
    body: {
      async *[Symbol.asyncIterator]() {
        try {
          for (const chunk of chunks) yield Buffer.from(chunk);
        } finally {
          cancelled = true;
        }
      },
    },
    destroy() { destroyed = true; },
    state() { return { cancelled, destroyed }; },
  };
}

function neverEndingResponse(headers = {}) {
  let destroyed = false;
  let cancelled = false;
  let settle;
  const body = {
    next: () => new Promise((resolve) => { settle = resolve; }),
    return: async () => {
      cancelled = true;
      settle?.({ done: true });
      return { done: true };
    },
    [Symbol.asyncIterator]() { return this; },
  };
  return {
    status: 200,
    headers,
    body,
    destroy() { destroyed = true; },
    state() { return { cancelled, destroyed }; },
  };
}

function extractionOptions(overrides = {}) {
  return {
    sourceRegistryId: SOURCE.id,
    sources: [SOURCE],
    now: NOW,
    fallbackSnippet: 'Safe feed snippet.',
    networkOptions: {
      resolveHost: async () => PUBLIC_ADDRESS,
      ...overrides,
    },
  };
}

test('authorized feed cannot admit a metadata-service article URL', async () => {
  // Given: valid source rights but a publisher-controlled off-domain item link.
  const result = await fetchNewsPoolResult({
    sources: [SOURCE],
    now: NOW,
    fetchFeed: async (feed) => [{
      id: 'metadata-item',
      source: feed.source,
      sourceRegistryId: feed.sourceRegistryId,
      url: 'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
      title: 'Unsafe item',
      publishedAt: NOW.toISOString(),
    }],
  });

  // Then: the item never enters the acquired pool.
  assert.deepEqual(result.items, []);
  assert.equal(result.status, 'authorized_sources_empty');
});

test('direct article extraction rejects metadata-service URL before fetch', async () => {
  // Given: an authorized source identity and a recording generic fetch stub.
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response('<html><article><p>metadata</p></article></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
  };

  try {
    const result = await fetchArticleExtraction({
      url: 'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
      sourceRegistryId: 'authorized-test',
      sources: [SOURCE],
      now: NOW,
      fallbackSnippet: 'Safe feed snippet.',
    });

    // Then: extraction falls back without any transport call.
    assert.deepEqual(calls, []);
    assert.equal(result.extractionQa.extraction_failure_reason, 'unsafe_source_text_url');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('authorized public article extraction pins DNS and accepts bounded HTML', async () => {
  // Given: a current source and an injected public endpoint.
  const html = '<html><article><p>The operator described accelerator capacity, power delivery, networking, customer timing, and deployment constraints in enough detail for infrastructure review.</p></article></html>';
  const calls = [];

  // When: extraction fetches the exact registered article host.
  const result = await fetchArticleExtraction({
    url: 'https://authorized.example/story',
    title: 'Authorized infrastructure story',
    ...extractionOptions({
      request: async ({ target, address, family }) => {
        calls.push({ target: target.href, address, family });
        return response(200, { 'content-type': 'text/html' }, [html]);
      },
    }),
  });

  // Then: the transport receives only the validated public address.
  assert.deepEqual(calls, [{ target: 'https://authorized.example/story', address: '93.184.216.34', family: 4 }]);
  assert.equal(result.extractionQa.extraction_failure_reason || '', '');
  assert.match(result.articleText, /accelerator capacity/);
});

test('candidate-v8 special IPv6 literals DNS answers and redirects never reach authorized-source-text requests', async () => {
  for (const address of CANDIDATE_V8_BLOCKED_IPV6) {
    const literalUrl = `https://[${address}]/story`;
    const literalHost = new URL(literalUrl).hostname.replace(/^\[|\]$/g, '');
    let literalRequests = 0;
    const literal = await fetchArticleExtraction({
      url: literalUrl,
      sourceRegistryId: 'literal-source',
      sources: [{ ...SOURCE, id: 'literal-source', domain: literalHost }],
      now: NOW,
      fallbackSnippet: 'Safe fallback.',
      networkOptions: { request: async () => { literalRequests += 1; } },
    });
    assert.equal(literalRequests, 0, `literal ${address}`);
    assert.equal(literal.extractionQa.extraction_failure_reason, 'unsafe_source_text_url', `literal ${address}`);

    let dnsRequests = 0;
    const dns = await fetchArticleExtraction({
      url: 'https://authorized.example/story',
      ...extractionOptions({
        resolveHost: async () => [{ address, family: 6 }],
        request: async () => { dnsRequests += 1; },
      }),
    });
    assert.equal(dnsRequests, 0, `DNS ${address}`);
    assert.equal(dns.extractionQa.extraction_failure_reason, 'unsafe_source_text_url', `DNS ${address}`);

    const redirect = response(302, { location: literalUrl });
    let redirectRequests = 0;
    const redirected = await fetchArticleExtraction({
      url: 'https://authorized.example/story',
      sourceRegistryId: SOURCE.id,
      sources: [{ ...SOURCE, article_hosts: literalHost }],
      now: NOW,
      fallbackSnippet: 'Safe fallback.',
      networkOptions: {
        resolveHost: async (hostname) => hostname === 'authorized.example'
          ? PUBLIC_ADDRESS
          : [{ address, family: 6 }],
        request: async () => { redirectRequests += 1; return redirect; },
      },
    });
    assert.equal(redirectRequests, 1, `redirect ${address}`);
    assert.equal(redirect.state().destroyed, true, `redirect cancellation ${address}`);
    assert.equal(redirected.extractionQa.extraction_failure_reason, 'unsafe_source_text_url', `redirect ${address}`);
  }

  let mixedAnswerRequests = 0;
  const mixedAnswer = await fetchArticleExtraction({
    url: 'https://authorized.example/story',
    ...extractionOptions({
      resolveHost: async () => [...PUBLIC_IPV6_ADDRESS, { address: '3fff::1', family: 6 }],
      request: async () => { mixedAnswerRequests += 1; },
    }),
  });
  assert.equal(mixedAnswerRequests, 0, 'mixed public and reserved DNS answers');
  assert.equal(mixedAnswer.extractionQa.extraction_failure_reason, 'unsafe_source_text_url');
});

test('candidate-v8 true public IPv6 authorized-source-text control remains pinned and bounded', async () => {
  const html = '<html><article><p>Public IPv6 delivery preserves bounded infrastructure extraction for operator review.</p></article></html>';
  const calls = [];
  const result = await fetchArticleExtraction({
    url: 'https://authorized.example/story',
    ...extractionOptions({
      resolveHost: async () => PUBLIC_IPV6_ADDRESS,
      request: async ({ address, family }) => {
        calls.push({ address, family });
        return response(200, { 'content-type': 'text/html' }, [html]);
      },
    }),
  });

  assert.deepEqual(calls, [{ address: '2606:4700:4700::1111', family: 6 }]);
  assert.equal(result.extractionQa.extraction_failure_reason || '', '');
});

test('private and encoded source-text IP literals never reach request', async () => {
  const urls = [
    'https://127.0.0.1/story',
    'https://2130706433/story',
    'https://0x7f000001/story',
    'https://169.254.169.254/story',
    'https://10.0.0.1/story',
    'https://[::1]/story',
    'https://[::ffff:127.0.0.1]/story',
    'https://[fc00::1]/story',
  ];
  for (const url of urls) {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
    let requests = 0;
    const result = await fetchArticleExtraction({
      url,
      sourceRegistryId: 'literal-source',
      sources: [{ ...SOURCE, id: 'literal-source', domain: host }],
      now: NOW,
      networkOptions: { request: async () => { requests += 1; } },
      fallbackSnippet: 'Safe fallback.',
    });
    assert.equal(requests, 0, url);
    assert.equal(result.extractionQa.extraction_failure_reason, 'unsafe_source_text_url', url);
  }
});

test('private DNS result and off-domain article fail before request', async () => {
  let dnsRequests = 0;
  const privateDns = await fetchArticleExtraction({
    url: 'https://authorized.example/story',
    ...extractionOptions({
      resolveHost: async () => [{ address: '10.2.3.4', family: 4 }],
      request: async () => { dnsRequests += 1; },
    }),
  });
  let crossDomainResolutions = 0;
  const crossDomain = await fetchArticleExtraction({
    url: 'https://other.example/story',
    ...extractionOptions({
      resolveHost: async () => { crossDomainResolutions += 1; return PUBLIC_ADDRESS; },
    }),
  });

  assert.equal(dnsRequests, 0);
  assert.equal(privateDns.extractionQa.extraction_failure_reason, 'unsafe_source_text_url');
  assert.equal(crossDomainResolutions, 0);
  assert.equal(crossDomain.extractionQa.extraction_failure_reason, 'unsafe_source_text_url');
});

test('public article redirect to private target is cancelled before private request', async () => {
  const first = response(302, { location: 'https://169.254.169.254/metadata' });
  let requests = 0;
  const result = await fetchArticleExtraction({
    url: 'https://authorized.example/story',
    sourceRegistryId: SOURCE.id,
    sources: [{ ...SOURCE, article_hosts: '169.254.169.254' }],
    now: NOW,
    fallbackSnippet: 'Safe fallback.',
    networkOptions: {
      resolveHost: async () => PUBLIC_ADDRESS,
      request: async () => { requests += 1; return first; },
    },
  });

  assert.equal(requests, 1);
  assert.equal(first.state().destroyed, true);
  assert.equal(result.extractionQa.extraction_failure_reason, 'unsafe_source_text_url');
});

test('article text rejects MIME and declared or streamed oversize bodies with cancellation', async () => {
  const cases = [
    [response(503, { 'content-type': 'text/html' }, ['error']), {}, 'remote_fetch_failed'],
    [response(200, {}, ['html']), {}, 'remote_content_type_rejected'],
    [response(200, { 'content-type': 'application/octet-stream' }, ['html']), {}, 'remote_content_type_rejected'],
    [response(200, { 'content-type': 'text/html', 'content-length': '5' }, ['12345']), { maxBytes: 4 }, 'remote_too_large'],
    [response(200, { 'content-type': 'text/html' }, ['1234', '5']), { maxBytes: 4 }, 'remote_too_large'],
  ];
  for (const [sourceResponse, limits, code] of cases) {
    const result = await fetchArticleExtraction({
      url: 'https://authorized.example/story',
      ...extractionOptions({ request: async () => sourceResponse, ...limits }),
    });
    assert.equal(sourceResponse.state().destroyed, true);
    assert.equal(result.extractionQa.extraction_failure_reason, code);
  }
});

test('article text timeout cancels a never-ending body and its response handle', async () => {
  const sourceResponse = neverEndingResponse({ 'content-type': 'text/html' });
  const result = await fetchArticleExtraction({
    url: 'https://authorized.example/story',
    timeoutMs: 5,
    ...extractionOptions({ request: async () => sourceResponse }),
  });

  assert.equal(result.extractionQa.extraction_failure_reason, 'remote_fetch_timeout');
  assert.deepEqual(sourceResponse.state(), { cancelled: true, destroyed: true });
});
