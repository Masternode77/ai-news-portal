import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { createAdminMediaStorage, normalizeAdminImage } from '../src/plugins/storage/admin-media-storage.mjs';

test('admin media normalization validates signatures and emits stripped bounded WebP', async () => {
  const png = await sharp({ create: { width: 32, height: 20, channels: 4, background: '#2b8f8b' } }).png().toBuffer();
  const result = await normalizeAdminImage({ buffer: png, contentType: 'image/png' });
  assert.equal(result.contentType, 'image/webp');
  assert.equal(result.width, 32);
  assert.equal(result.height, 20);
  assert.match(result.checksum, /^[a-f0-9]{64}$/);
  assert.equal((await sharp(result.buffer).metadata()).format, 'webp');

  await assert.rejects(
    () => normalizeAdminImage({ buffer: Buffer.from('<svg onload=alert(1)>'), contentType: 'image/png' }),
    (error) => error.code === 'invalid_media_type',
  );
  await assert.rejects(
    () => normalizeAdminImage({ buffer: png, contentType: 'image/svg+xml' }),
    (error) => error.code === 'invalid_media_type',
  );
});

test('local admin media storage persists normalized files outside public source artifacts', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'admin-media-'));
  const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#e0aa3e' } }).png().toBuffer();
  try {
    const storage = createAdminMediaStorage({ provider: 'local', directory });
    const saved = await storage.saveImage({ articleId: '../unsafe/article', buffer: png, contentType: 'image/png' });
    assert.match(saved.objectKey, /^unsafe-article\/[a-f0-9-]+\.webp$/);
    assert.equal(Object.hasOwn(saved, 'url'), false);
    assert.equal((await storage.read(saved.objectKey)).length, saved.byteSize);
    await assert.rejects(() => storage.read('../escape.webp'), (error) => error.code === 'invalid_media_key');
    await storage.remove(saved);
    await assert.rejects(() => storage.read(saved.objectKey), /ENOENT/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('production media storage fails closed without Vercel Blob credentials', () => {
  const previous = { nodeEnv: process.env.NODE_ENV, token: process.env.BLOB_READ_WRITE_TOKEN };
  process.env.NODE_ENV = 'production';
  delete process.env.BLOB_READ_WRITE_TOKEN;
  try {
    assert.throws(() => createAdminMediaStorage(), (error) => error.code === 'blob_token_required');
    assert.throws(() => createAdminMediaStorage({ provider: 'local' }), (error) => error.code === 'production_media_storage_required');
  } finally {
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.token === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN = previous.token;
  }
});

test('production media stays private until the public read model promotes it', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const calls = [];
  const objects = new Map();
  const blobClient = {
    async put(key, buffer, options) {
      calls.push({ method: 'put', key, options });
      objects.set(key, Buffer.from(buffer));
      return { pathname: key, url: `https://blob.example/${key}` };
    },
    async get(key, options) {
      calls.push({ method: 'get', key, options });
      const buffer = objects.get(key);
      return buffer ? { stream: new Response(buffer).body } : null;
    },
    async del(key, options) {
      calls.push({ method: 'del', key, options });
      objects.delete(key);
    },
  };
  try {
    const storage = createAdminMediaStorage({ provider: 'vercel-blob', token: 'test-token', blobClient });
    const png = await sharp({ create: { width: 12, height: 8, channels: 3, background: '#101820' } }).png().toBuffer();
    const saved = await storage.saveImage({ articleId: 'draft-1', buffer: png, contentType: 'image/png' });
    assert.equal(Object.hasOwn(saved, 'url'), false);
    assert.equal(calls.find((call) => call.method === 'put').options.access, 'private');
    assert.equal((await storage.read(saved.objectKey)).subarray(0, 4).toString('ascii'), 'RIFF');

    const publishedUrl = await storage.publishImage(saved.objectKey);
    assert.match(publishedUrl, /^https:\/\/blob\.example\/published-admin-media\//);
    assert.equal(calls.filter((call) => call.method === 'put').at(-1).options.access, 'public');
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
  }
});
