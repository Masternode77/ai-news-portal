import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { ensureCanonicalArticleImageSet } from '../scripts/lib/article-origin-image-canonicalizer.mjs';
import {
  fetchSourceImage,
  SourceImageFetchError,
} from '../scripts/lib/source-image-fetcher.mjs';

const AUTHORIZED_SOURCES = [{
  id: 'authorized-fixture',
  name: 'Authorized Fixture',
  domain: 'authorized.example',
  image_hosts: 'cdn.authorized.example',
  text_use_basis: 'licensed',
  image_use_basis: 'licensed',
  terms_url: 'https://authorized.example/terms',
  reviewed_at: '2026-08-01',
  allow_text_use: true,
  allow_image_reuse: true,
}];

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

function fakeResponse(status, headers = {}, chunks = []) {
  let discarded = false;
  let destroyed = false;
  return {
    status,
    headers,
    body: (async function* body() {
      for (const chunk of chunks) yield Buffer.from(chunk);
    }()),
    discard() { discarded = true; },
    destroy() { destroyed = true; },
    state() { return { discarded, destroyed }; },
  };
}

async function rejectionCode(promise) {
  return assert.rejects(promise, (error) => error instanceof SourceImageFetchError && Boolean(error.code));
}

test('authorized publisher metadata-service source image is rejected before fetch', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'source-image-ssrf-red-'));
  const publicDir = path.join(root, 'public');
  const png = await sharp({
    create: { width: 8, height: 8, channels: 4, background: '#225588' },
  }).png().toBuffer();
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response(png, {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': String(png.length) },
    });
  };

  try {
    const result = await ensureCanonicalArticleImageSet({
      id: 'metadata-service-source-image',
      title: 'Authorized publisher cannot choose an internal image target',
      source: 'Authorized Fixture',
      sourceRegistryId: 'authorized-fixture',
      sourceUrl: 'https://authorized.example/story',
      sourceImage: 'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
    }, {
      publicDir,
      sources: AUTHORIZED_SOURCES,
      now: new Date('2026-08-09T00:00:00Z'),
    });

    assert.deepEqual(calls, []);
    assert.equal(result.reason, 'unsafe_source_image_url');
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('private, loopback, link-local, reserved, and encoded IP targets never reach request', async () => {
  const cases = [
    'https://127.0.0.1/source.png',
    'https://0.0.0.0/source.png',
    'https://255.255.255.255/source.png',
    'https://2130706433/source.png',
    'https://0x7f000001/source.png',
    'https://0177.0.0.1/source.png',
    'https://10.0.0.8/source.png',
    'https://169.254.169.254/source.png',
    'https://192.0.2.1/source.png',
    'https://[::1]/source.png',
    'https://[::ffff:127.0.0.1]/source.png',
    'https://[fc00::1]/source.png',
    'https://[fe80::1]/source.png',
    'https://[ff02::1]/source.png',
  ];

  for (const url of cases) {
    let requests = 0;
    const hostname = new URL(url).hostname.replace(/^\[|\]$/g, '');
    await assert.rejects(fetchSourceImage(url, {
      allowedHosts: [hostname],
      request: async () => { requests += 1; },
    }), (error) => error.code === 'unsafe_source_image_url' && error.detail === 'non_public_address', url);
    assert.equal(requests, 0, url);
  }
});

test('localhost and DNS names resolving to private addresses never reach request', async () => {
  for (const [hostname, address] of [
    ['localhost', '127.0.0.1'],
    ['cdn.authorized.example', '10.1.2.3'],
    ['cdn-v6.authorized.example', 'fd00::1234'],
  ]) {
    let requests = 0;
    await assert.rejects(fetchSourceImage(`https://${hostname}/source.png`, {
      allowedHosts: [hostname],
      resolveHost: async () => [{ address, family: address.includes(':') ? 6 : 4 }],
      request: async () => { requests += 1; },
    }), (error) => error.code === 'unsafe_source_image_url' && error.detail === 'non_public_address');
    assert.equal(requests, 0);
  }
});

test('redirect targets are re-authorized and private redirect destinations are not requested', async () => {
  const calls = [];
  const redirectResponse = fakeResponse(302, { location: 'https://169.254.169.254/latest/meta-data/' });
  await assert.rejects(fetchSourceImage('https://cdn.authorized.example/source.png', {
    allowedHosts: ['cdn.authorized.example', '169.254.169.254'],
    resolveHost: async () => PUBLIC_ADDRESS,
    request: async ({ target, address }) => {
      calls.push({ url: target.href, address });
      return redirectResponse;
    },
  }), (error) => error.code === 'unsafe_source_image_url' && error.detail === 'non_public_address');
  assert.deepEqual(calls, [{
    url: 'https://cdn.authorized.example/source.png',
    address: '93.184.216.34',
  }]);
  assert.equal(redirectResponse.state().destroyed, true);
  assert.equal(redirectResponse.state().discarded, false);
});

test('source image redirects stop at the configured hop limit', async () => {
  let requests = 0;
  await assert.rejects(fetchSourceImage('https://cdn.authorized.example/source.png', {
    allowedHosts: ['cdn.authorized.example'],
    resolveHost: async () => PUBLIC_ADDRESS,
    maxRedirects: 1,
    request: async () => {
      requests += 1;
      return fakeResponse(302, { location: '/next.png' });
    },
  }), (error) => error.code === 'source_image_redirect_limit');
  assert.equal(requests, 2);
});

test('authorized public image flow pins the validated address and returns bounded bytes', async () => {
  const calls = [];
  const result = await fetchSourceImage('https://cdn.authorized.example/source.png', {
    allowedHosts: ['cdn.authorized.example'],
    resolveHost: async () => PUBLIC_ADDRESS,
    request: async ({ target, address, family }) => {
      calls.push({ url: target.href, address, family });
      return fakeResponse(200, {
        'content-type': 'image/png',
        'content-length': '4',
      }, ['safe']);
    },
  });

  assert.equal(result.bytes.toString(), 'safe');
  assert.deepEqual(calls, [{
    url: 'https://cdn.authorized.example/source.png',
    address: '93.184.216.34',
    family: 4,
  }]);
});

test('candidate-v8 special IPv6 literals DNS answers and redirects never reach source-image requests', async () => {
  for (const address of CANDIDATE_V8_BLOCKED_IPV6) {
    const literalUrl = `https://[${address}]/source.png`;
    const literalHost = new URL(literalUrl).hostname.replace(/^\[|\]$/g, '');
    let literalRequests = 0;
    await assert.rejects(fetchSourceImage(literalUrl, {
      allowedHosts: [literalHost],
      request: async () => { literalRequests += 1; },
    }), (error) => error.code === 'unsafe_source_image_url' && error.detail === 'non_public_address', address);
    assert.equal(literalRequests, 0, `literal ${address}`);

    let dnsRequests = 0;
    await assert.rejects(fetchSourceImage('https://cdn.authorized.example/source.png', {
      allowedHosts: ['cdn.authorized.example'],
      resolveHost: async () => [{ address, family: 6 }],
      request: async () => { dnsRequests += 1; },
    }), (error) => error.code === 'unsafe_source_image_url' && error.detail === 'non_public_address', address);
    assert.equal(dnsRequests, 0, `DNS ${address}`);

    const redirect = fakeResponse(302, { location: literalUrl });
    let redirectRequests = 0;
    await assert.rejects(fetchSourceImage('https://cdn.authorized.example/source.png', {
      allowedHosts: ['cdn.authorized.example', literalHost],
      resolveHost: async (hostname) => hostname === 'cdn.authorized.example'
        ? PUBLIC_ADDRESS
        : [{ address, family: 6 }],
      request: async () => { redirectRequests += 1; return redirect; },
    }), (error) => error.code === 'unsafe_source_image_url' && error.detail === 'non_public_address', address);
    assert.equal(redirectRequests, 1, `redirect ${address}`);
    assert.equal(redirect.state().destroyed, true, `redirect cancellation ${address}`);
  }

  let mixedAnswerRequests = 0;
  await assert.rejects(fetchSourceImage('https://cdn.authorized.example/source.png', {
    allowedHosts: ['cdn.authorized.example'],
    resolveHost: async () => [...PUBLIC_IPV6_ADDRESS, { address: '3fff::1', family: 6 }],
    request: async () => { mixedAnswerRequests += 1; },
  }), (error) => error.code === 'unsafe_source_image_url' && error.detail === 'non_public_address');
  assert.equal(mixedAnswerRequests, 0, 'mixed public and reserved DNS answers');
});

test('candidate-v8 true public IPv6 source-image control remains pinned and bounded', async () => {
  const calls = [];
  const result = await fetchSourceImage('https://cdn.authorized.example/source.png', {
    allowedHosts: ['cdn.authorized.example'],
    resolveHost: async () => PUBLIC_IPV6_ADDRESS,
    request: async ({ address, family }) => {
      calls.push({ address, family });
      return fakeResponse(200, { 'content-type': 'image/png', 'content-length': '4' }, ['safe']);
    },
  });

  assert.equal(result.bytes.toString(), 'safe');
  assert.deepEqual(calls, [{ address: '2606:4700:4700::1111', family: 6 }]);
});

test('source image response requires a supported MIME type and declared bounded length', async () => {
  const scenarios = [
    [{ 'content-length': '4' }, 'source_image_not_image'],
    [{ 'content-type': 'text/html', 'content-length': '4' }, 'source_image_not_image'],
    [{ 'content-type': 'image/png' }, 'source_image_size_unknown'],
    [{ 'content-type': 'image/png', 'content-length': '5' }, 'source_image_too_large'],
  ];

  for (const [headers, code] of scenarios) {
    const response = fakeResponse(200, headers, ['safe']);
    await assert.rejects(fetchSourceImage('https://cdn.authorized.example/source.png', {
      allowedHosts: ['cdn.authorized.example'],
      resolveHost: async () => PUBLIC_ADDRESS,
      request: async () => response,
      maxBytes: 4,
    }), (error) => error.code === code);
    assert.equal(response.state().destroyed, true);
    assert.equal(response.state().discarded, false);
  }
});

test('streamed source image body cannot exceed the byte ceiling after a small declaration', async () => {
  const response = fakeResponse(200, {
    'content-type': 'image/png',
    'content-length': '4',
  }, ['1234', '5']);
  await assert.rejects(fetchSourceImage('https://cdn.authorized.example/source.png', {
    allowedHosts: ['cdn.authorized.example'],
    resolveHost: async () => PUBLIC_ADDRESS,
    request: async () => response,
    maxBytes: 4,
  }), (error) => error.code === 'source_image_too_large');
  assert.equal(response.state().destroyed, true);
});

test('source image request is aborted at the configured timeout', async () => {
  await assert.rejects(fetchSourceImage('https://cdn.authorized.example/source.png', {
    allowedHosts: ['cdn.authorized.example'],
    resolveHost: async () => PUBLIC_ADDRESS,
    timeoutMs: 5,
    request: ({ signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }),
  }), (error) => error.code === 'source_image_fetch_timeout');
});

test('credentials, nonstandard ports, HTTP, and non-allowlisted hosts fail before DNS or request', async () => {
  const cases = [
    'http://cdn.authorized.example/source.png',
    'https://user:password@cdn.authorized.example/source.png',
    'https://cdn.authorized.example:8443/source.png',
    'https://other.example/source.png',
  ];
  for (const url of cases) {
    let resolutions = 0;
    let requests = 0;
    await rejectionCode(fetchSourceImage(url, {
      allowedHosts: ['cdn.authorized.example'],
      resolveHost: async () => { resolutions += 1; return PUBLIC_ADDRESS; },
      request: async () => { requests += 1; },
    }));
    assert.equal(resolutions, 0, url);
    assert.equal(requests, 0, url);
  }
});
