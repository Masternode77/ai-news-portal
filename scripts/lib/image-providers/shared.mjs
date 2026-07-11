import path from 'node:path';
import sharp from 'sharp';
import { safeHttpFetch } from '../safe-http-fetch.mjs';
import {
  ensureSafePublicDirectory,
  publicFilePath,
  writeSafePublicFile,
} from '../safe-public-file.mjs';

export const GENERATED_OUT_DIR = path.join(process.cwd(), 'public/generated');
export const SUPPORTED_RASTER_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
];

const DEFAULT_MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_IMAGE_PIXELS = 40_000_000;
const DEFAULT_MAX_IMAGE_DIMENSION = 12_000;

export function buildImagePrompt(item) {
  return (
    item.imagePrompt ||
    `Editorial enterprise technology illustration about ${item.title}. Context: ${item.articleText || item.summary || item.snippet || item.title}. No logos. No text. 16:9.`
  );
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const { safeFetch = {}, ...requestOptions } = options;
  return safeHttpFetch(url, {
    ...requestOptions,
    ...safeFetch,
    timeoutMs,
  });
}

export async function ensureGeneratedOutDir() {
  const publicRoot = path.resolve(process.cwd(), 'public');
  return ensureSafePublicDirectory(publicRoot, GENERATED_OUT_DIR);
}

export function extensionFromMime(mime = 'image/png') {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('avif')) return 'avif';
  return 'png';
}

function normalizedMime(mime = '') {
  const value = String(mime || '').split(';')[0].trim().toLowerCase();
  return value === 'image/jpg' ? 'image/jpeg' : value;
}

function detectedRasterMime(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.toString('ascii', 0, 6))) {
    return 'image/gif';
  }
  if (buffer.length >= 16 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brands = buffer.toString('ascii', 8, Math.min(buffer.length, 64));
    if (/avif|avis/.test(brands)) return 'image/avif';
  }
  return '';
}

export function safeGeneratedImageId(item = {}) {
  const value = String(item?.id || '').trim();
  if (!value || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) {
    throw new Error('Generated image id must contain only letters, numbers, underscores, or hyphens');
  }
  return value;
}

export async function validateRasterImageBytes(bytes, mime = '', options = {}) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  const maxBytes = options.maxBytes || DEFAULT_MAX_IMAGE_BYTES;
  const maxPixels = options.maxPixels || DEFAULT_MAX_IMAGE_PIXELS;
  const maxDimension = options.maxDimension || DEFAULT_MAX_IMAGE_DIMENSION;
  if (!buffer.length || buffer.length > maxBytes) {
    throw new Error(`Image byte limit exceeded (${maxBytes})`);
  }

  const declaredMime = normalizedMime(mime);
  if (declaredMime && !SUPPORTED_RASTER_MIME_TYPES.includes(declaredMime)) {
    throw new Error(`Unsupported image MIME type: ${declaredMime}`);
  }
  const detectedMime = detectedRasterMime(buffer);
  if (!detectedMime) throw new Error('Image magic bytes are unsupported');
  if (declaredMime && declaredMime !== detectedMime) {
    throw new Error(`Image magic bytes do not match declared MIME type ${declaredMime}`);
  }

  let metadata;
  try {
    metadata = await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: maxPixels,
      animated: false,
      sequentialRead: true,
    }).metadata();
  } catch (error) {
    throw new Error(`Image decode failed: ${error.message}`);
  }

  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  const pages = Number(metadata.pages || 1);
  if (!width || !height || width > maxDimension || height > maxDimension || width * height * pages > maxPixels) {
    throw new Error(`Image pixel limit exceeded (${maxPixels})`);
  }
  if (pages > 1) throw new Error('Animated or multi-page images are not supported');
  return { bytes: buffer, mime: detectedMime, metadata: { ...metadata, width, height, pages } };
}

export async function writeImageBytes(item, bytes, mime = 'image/png') {
  await ensureGeneratedOutDir();
  const id = safeGeneratedImageId(item);
  const validated = await validateRasterImageBytes(bytes, mime);
  const filename = `${id}.webp`;
  const outPath = publicFilePath(path.resolve(process.cwd(), 'public'), `/generated/${filename}`);
  const output = await sharp(validated.bytes, {
    failOn: 'error',
    limitInputPixels: DEFAULT_MAX_IMAGE_PIXELS,
    animated: false,
    sequentialRead: true,
  })
    .rotate()
    .webp({ quality: 90 })
    .toBuffer();
  await writeSafePublicFile(path.resolve(process.cwd(), 'public'), outPath, output);
  return `/generated/${filename}`;
}

export async function writeBase64Image(item, data, mime = 'image/png') {
  return writeImageBytes(item, Buffer.from(data, 'base64'), mime);
}

export async function writeFetchedImage(item, url, headers = {}) {
  const response = await fetchWithTimeout(url, {
    headers,
    safeFetch: {
      allowedMimeTypes: SUPPORTED_RASTER_MIME_TYPES,
      maxCompressedBytes: DEFAULT_MAX_IMAGE_BYTES,
      maxDecompressedBytes: DEFAULT_MAX_IMAGE_BYTES,
      maxRedirects: 3,
    },
  }, 20000);
  if (!response.ok) {
    throw new Error(`Generated image fetch failed: ${response.status}`);
  }

  const mime = response.headers.get('content-type') || '';
  const bytes = Buffer.from(await response.arrayBuffer());
  return writeImageBytes(item, bytes, mime);
}
