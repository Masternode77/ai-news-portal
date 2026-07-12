import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { del, get, put } from '@vercel/blob';
import sharp from 'sharp';
import { AdminStorageError } from './admin-storage-contract.mjs';

const MAX_INPUT_BYTES = 3 * 1024 * 1024;
const MAX_INPUT_PIXELS = 24_000_000;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function hasExpectedMagic(buffer, contentType) {
  if (contentType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (contentType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === 'image/webp') return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

function safeSegment(value, fallback = 'article') {
  return String(value || fallback).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || fallback;
}

export async function normalizeAdminImage({ buffer, contentType }) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_INPUT_BYTES) {
    throw new AdminStorageError('image must be between 1 byte and 3 MB', 'invalid_media_size');
  }
  if (!ACCEPTED_TYPES.has(contentType) || !hasExpectedMagic(buffer, contentType)) {
    throw new AdminStorageError('image MIME type or signature is invalid', 'invalid_media_type');
  }
  try {
    const result = await sharp(buffer, { failOn: 'warning', limitInputPixels: MAX_INPUT_PIXELS, sequentialRead: true })
      .rotate()
      .resize({ width: 2400, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 84, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return {
      buffer: result.data,
      contentType: 'image/webp',
      width: result.info.width,
      height: result.info.height,
      byteSize: result.info.size,
      checksum: crypto.createHash('sha256').update(result.data).digest('hex'),
    };
  } catch (error) {
    if (error instanceof AdminStorageError) throw error;
    throw new AdminStorageError('image could not be decoded safely', 'invalid_media_image');
  }
}

export function createAdminMediaStorage({
  provider = process.env.ADMIN_MEDIA_PROVIDER || ((process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV) ? 'vercel-blob' : 'local'),
  directory = path.resolve('.cache/admin-media'),
  token = process.env.BLOB_READ_WRITE_TOKEN,
  blobClient = { del, get, put },
} = {}) {
  if ((process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV) && provider !== 'vercel-blob') {
    throw new AdminStorageError('production media storage must use object storage', 'production_media_storage_required');
  }
  if (provider === 'vercel-blob' && !token) throw new AdminStorageError('BLOB_READ_WRITE_TOKEN is required', 'blob_token_required');

  return {
    provider,
    async saveImage({ articleId, buffer, contentType }) {
      const normalized = await normalizeAdminImage({ buffer, contentType });
      const fileName = `${safeSegment(articleId)}/${crypto.randomUUID()}.webp`;
      if (provider === 'vercel-blob') {
        const blob = await blobClient.put(`admin-media/${fileName}`, normalized.buffer, {
          access: 'private', addRandomSuffix: false, contentType: normalized.contentType, token,
        });
        return { ...normalized, objectKey: blob.pathname };
      }
      const destination = path.join(directory, fileName);
      await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      await fs.writeFile(destination, normalized.buffer, { mode: 0o600 });
      return { ...normalized, objectKey: fileName };
    },
    async read(objectKey) {
      if (provider === 'vercel-blob') {
        const result = await blobClient.get(objectKey, { access: 'private', token, useCache: false });
        if (!result?.stream) {
          const error = new Error('media_not_found');
          error.code = 'ENOENT';
          throw error;
        }
        return Buffer.from(await new Response(result.stream).arrayBuffer());
      }
      const resolved = path.resolve(directory, objectKey);
      if (!resolved.startsWith(`${path.resolve(directory)}${path.sep}`)) throw new AdminStorageError('invalid media object key', 'invalid_media_key');
      return fs.readFile(resolved);
    },
    async remove(record) {
      if (provider === 'vercel-blob') {
        await blobClient.del(record.objectKey, { token });
        return;
      }
      const resolved = path.resolve(directory, record.objectKey);
      if (resolved.startsWith(`${path.resolve(directory)}${path.sep}`)) await fs.rm(resolved, { force: true });
    },
    async publishImage(objectKey) {
      if (provider !== 'vercel-blob') throw new AdminStorageError('local media cannot be promoted to a public deployment', 'public_media_storage_required');
      const source = await blobClient.get(objectKey, { access: 'private', token, useCache: false });
      if (!source?.stream) throw new AdminStorageError('private media object was not found', 'invalid_media_key');
      const buffer = Buffer.from(await new Response(source.stream).arrayBuffer());
      const publicKey = `published-admin-media/${safeSegment(path.basename(objectKey, path.extname(objectKey))) || crypto.randomUUID()}.webp`;
      const published = await blobClient.put(publicKey, buffer, {
        access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'image/webp', token,
      });
      return published.url;
    },
  };
}
