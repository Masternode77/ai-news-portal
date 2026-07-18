import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import sharp from 'sharp';
import {
  isPublicIpAddress,
  readLimitedResponseBody,
  redirectedRequestOptions,
  resolveSafeHttpTarget,
  safeHttpFetch,
  validateRedirectTarget,
} from '../scripts/lib/safe-http-fetch.mjs';
import { ensureCanonicalArticleImageSet } from '../scripts/lib/article-origin-image-canonicalizer.mjs';
import { localArticleImagePath } from '../scripts/lib/article-image-surface.mjs';
import { fetchArticleExtraction } from '../scripts/lib/source-fetch.mjs';
import {
  safeGeneratedImageId,
  validateRasterImageBytes,
} from '../scripts/lib/image-providers/shared.mjs';
import {
  isSecureChatGptRuntimeEndpoint,
  runtimeImageRequestHeaders,
} from '../scripts/lib/image-providers/chatgpt-oauth-runtime.mjs';
import {
  writeArticleImageSetFromBytes,
  writeFallbackArticleImageSet,
} from '../scripts/lib/image-store.mjs';

test('outbound URL policy rejects non-public IPv4 and IPv6 destinations', async () => {
  for (const address of [
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    'ff02::1',
    '2001::1',
    '2001:db8::1',
    '2002::1',
    '3fff::1',
    'fec0::1',
  ]) {
    assert.equal(isPublicIpAddress(address), false, address);
  }

  assert.equal(isPublicIpAddress('8.8.8.8'), true);
  assert.equal(isPublicIpAddress('2606:4700:4700::1111'), true);

  await assert.rejects(
    resolveSafeHttpTarget('https://source.example/article', {
      lookup: async () => [
        { address: '8.8.8.8', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ],
    }),
    /non-public/i,
  );
});

test('outbound URL policy permits only HTTP(S) and blocks HTTPS downgrade redirects', async () => {
  await assert.rejects(safeHttpFetch('file:///etc/passwd'), /http/i);
  await assert.rejects(safeHttpFetch('http://127.0.0.1/private'), /non-public/i);
  await assert.rejects(safeHttpFetch('http://[::1]/private'), /non-public/i);

  assert.throws(
    () => validateRedirectTarget('https://source.example/start', 'http://source.example/next'),
    /downgrade/i,
  );
  assert.equal(
    validateRedirectTarget('https://source.example/start', '/next').href,
    'https://source.example/next',
  );
  assert.equal(
    validateRedirectTarget(
      'https://news.source.example/start',
      'https://source.example/next',
      { allowedDomains: ['source.example'] },
    ).href,
    'https://source.example/next',
  );
  assert.throws(
    () => validateRedirectTarget(
      'https://source.example/start',
      'https://unregistered.example/next',
      { allowedDomains: ['source.example'] },
    ),
    /registered domain/i,
  );
});

test('cross-origin redirects strip credentials and POST redirect bodies', () => {
  const options = redirectedRequestOptions(302, {
    method: 'POST',
    body: 'secret payload',
    headers: {
      Authorization: 'Bearer secret',
      Cookie: 'session=secret',
      'Proxy-Authorization': 'Basic secret',
      'Content-Type': 'application/json',
      'X-Trace': 'safe',
    },
  }, new URL('https://source.example/start'), new URL('https://cdn.example/image'));

  assert.equal(options.method, 'GET');
  assert.equal(options.body, undefined);
  assert.deepEqual(options.headers, { 'x-trace': 'safe' });
});

test('ChatGPT runtime credentials are scoped to the configured runtime origin', () => {
  assert.equal(isSecureChatGptRuntimeEndpoint('https://runtime.example/v1/images'), true);
  assert.equal(isSecureChatGptRuntimeEndpoint('http://runtime.example/v1/images'), false);
  assert.equal(isSecureChatGptRuntimeEndpoint('https://user:pass@runtime.example/v1/images'), false);
  assert.deepEqual(
    runtimeImageRequestHeaders(
      'https://runtime.example/v1/images',
      'https://runtime.example/v1/files/image.png',
      'runtime-secret',
    ),
    { Authorization: 'Bearer runtime-secret' },
  );
  assert.deepEqual(
    runtimeImageRequestHeaders(
      'http://runtime.example/v1/images',
      'http://runtime.example/v1/files/image.png',
      'runtime-secret',
    ),
    {},
  );
  assert.deepEqual(
    runtimeImageRequestHeaders(
      'https://runtime.example/v1/images',
      'https://cdn.example/image.png',
      'runtime-secret',
    ),
    {},
  );
  assert.deepEqual(
    runtimeImageRequestHeaders(
      'https://runtime.example/v1/images',
      'not-a-url',
      'runtime-secret',
    ),
    {},
  );
});

test('safe fetch applies injected DNS policy before opening a request', async () => {
  let lookups = 0;
  await assert.rejects(
    safeHttpFetch('https://source.example/article', {
      lookup: async () => {
        lookups += 1;
        return [{ address: '127.0.0.1', family: 4 }];
      },
    }),
    /non-public/i,
  );
  assert.equal(lookups, 1);
});

test('article extraction fails closed to feed text for an unsafe source URL', async () => {
  const fallbackSnippet = 'A utility queue delayed a named data center interconnection by twelve months.';
  const result = await fetchArticleExtraction({
    url: 'http://169.254.169.254/latest/meta-data/',
    title: 'Utility queue delays data center interconnection',
    fallbackSnippet,
  });

  assert.equal(result.articleText, fallbackSnippet);
  assert.equal(result.extractionQa.extraction_failure_reason, 'unsafe_source_url');
  assert.equal(result.extractionQa.extraction_quality_score, 0);
});

test('article extraction rejects sources outside its reconciliation registry boundary', async () => {
  const fallbackSnippet = 'Untrusted fallback text must not qualify as extracted evidence.';
  const result = await fetchArticleExtraction({
    url: 'https://unregistered.example/story',
    title: 'Unregistered redirect target',
    fallbackSnippet,
    allowedDomains: ['registered.example'],
  });

  assert.equal(result.articleText, fallbackSnippet);
  assert.equal(result.extractionQa.extraction_failure_reason, 'unsafe_source_url');
  assert.equal(result.extractionQa.extraction_quality_score, 0);
});

test('response reader caps compressed and decompressed bytes', async () => {
  await assert.rejects(
    readLimitedResponseBody(Readable.from([Buffer.alloc(9)]), {
      maxCompressedBytes: 8,
      maxDecompressedBytes: 16,
    }),
    /compressed response/i,
  );

  const compressed = gzipSync(Buffer.alloc(2048, 65));
  await assert.rejects(
    readLimitedResponseBody(Readable.from([compressed]), {
      contentEncoding: 'gzip',
      maxCompressedBytes: compressed.length + 1,
      maxDecompressedBytes: 128,
    }),
    /decompressed response/i,
  );
});

test('raster validation enforces MIME, magic bytes, decode, and pixel limits', async () => {
  const png = await sharp({
    create: {
      width: 64,
      height: 36,
      channels: 4,
      background: { r: 24, g: 86, b: 180, alpha: 1 },
    },
  }).png().toBuffer();

  const validated = await validateRasterImageBytes(png, 'image/png');
  assert.equal(validated.metadata.width, 64);
  assert.equal(validated.metadata.height, 36);

  await assert.rejects(validateRasterImageBytes(png, 'text/html'), /mime/i);
  await assert.rejects(validateRasterImageBytes(png, 'image/jpeg'), /magic/i);
  await assert.rejects(
    validateRasterImageBytes(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml'),
    /mime/i,
  );
  await assert.rejects(
    validateRasterImageBytes(png, 'image/png', { maxPixels: 100 }),
    /pixel/i,
  );
  assert.equal(safeGeneratedImageId({ id: 'valid-image_01' }), 'valid-image_01');
  assert.throws(() => safeGeneratedImageId({ id: '../../escape' }), /image id/i);
});

test('generated image bytes are decoded and re-encoded as a bounded WebP', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'compute-current-media-write-'));
  const previousCwd = process.cwd();
  const png = await sharp({
    create: {
      width: 80,
      height: 45,
      channels: 4,
      background: { r: 14, g: 114, b: 96, alpha: 1 },
    },
  }).png().toBuffer();

  try {
    process.chdir(root);
    const moduleUrl = new URL('../scripts/lib/image-providers/shared.mjs', import.meta.url);
    moduleUrl.searchParams.set('cwd', String(Date.now()));
    const { writeImageBytes } = await import(moduleUrl.href);
    const publicPath = await writeImageBytes({ id: 'security-reencode-fixture' }, png, 'image/png');
    const outputPath = path.join(root, 'public', publicPath.replace(/^\//, ''));
    const metadata = await sharp(outputPath).metadata();

    assert.equal(publicPath, '/generated/security-reencode-fixture.webp');
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, 80);
    assert.equal(metadata.height, 45);

    await fs.rm(path.join(root, 'public', 'generated'), { recursive: true, force: true });
    await fs.mkdir(path.join(root, 'outside'), { recursive: true });
    await fs.symlink(path.join(root, 'outside'), path.join(root, 'public', 'generated'));
    await assert.rejects(
      writeImageBytes({ id: 'symlink-escape-fixture' }, png, 'image/png'),
      /symbolic links|inside public/i,
    );
  } finally {
    process.chdir(previousCwd);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('local article image paths cannot escape public through traversal or symlinks', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'compute-current-media-path-'));
  const publicDir = path.join(root, 'public');
  const outsideDir = path.join(root, 'outside');
  const previousCwd = process.cwd();

  try {
    await fs.mkdir(path.join(publicDir, 'generated'), { recursive: true });
    await fs.mkdir(outsideDir, { recursive: true });
    await fs.writeFile(path.join(publicDir, 'generated', 'valid.webp'), 'valid');
    await fs.writeFile(path.join(outsideDir, 'secret.webp'), 'secret');
    await fs.symlink(outsideDir, path.join(publicDir, 'linked'));
    process.chdir(root);

    assert.equal(localArticleImagePath('/../../etc/passwd'), '');
    assert.equal(localArticleImagePath('/linked/secret.webp'), '');
    assert.equal(
      localArticleImagePath('/generated/valid.webp'),
      await fs.realpath(path.join(publicDir, 'generated', 'valid.webp')),
    );
  } finally {
    process.chdir(previousCwd);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('canonical article variants refuse a symlinked output directory', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'compute-current-canonical-path-'));
  const publicDir = path.join(root, 'public');
  const outsideDir = path.join(root, 'outside');
  const previousCwd = process.cwd();

  try {
    await fs.mkdir(path.join(publicDir, 'generated'), { recursive: true });
    await fs.mkdir(outsideDir, { recursive: true });
    await fs.symlink(outsideDir, path.join(publicDir, 'generated', 'articles'));
    process.chdir(root);

    const result = await ensureCanonicalArticleImageSet({
      id: 'symlink-output-fixture',
      title: 'Grid capacity changes delivery timing',
    }, { publicDir });

    assert.equal(result.changed, 0);
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'unsafe_image_output_path');
    assert.deepEqual(await fs.readdir(outsideDir), []);
  } finally {
    process.chdir(previousCwd);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Image2 fallback variants refuse a symlinked output directory', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'compute-current-fallback-path-'));
  const publicDir = path.join(root, 'public');
  const outsideDir = path.join(root, 'outside');

  try {
    await fs.mkdir(path.join(publicDir, 'generated'), { recursive: true });
    await fs.mkdir(outsideDir, { recursive: true });
    await fs.symlink(outsideDir, path.join(publicDir, 'generated', 'articles'));

    await assert.rejects(
      writeFallbackArticleImageSet({
        id: 'fallback-symlink-fixture',
        title: 'Power delivery timing changes',
      }, {}, { publicDir }),
      /symbolic links/i,
    );
    assert.deepEqual(await fs.readdir(outsideDir), []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Image2 byte variants reject undecodable provider payloads before writing', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'compute-current-image2-bytes-'));
  try {
    await assert.rejects(
      writeArticleImageSetFromBytes({
        id: 'invalid-provider-bytes',
        title: 'Invalid provider payload',
      }, Buffer.from('<html>not an image</html>'), {}, { publicDir: path.join(root, 'public') }),
      /magic bytes/i,
    );
    await assert.rejects(fs.access(path.join(root, 'public', 'generated')), /ENOENT/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
