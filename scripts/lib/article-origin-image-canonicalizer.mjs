import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  localArticleImageExists,
  localArticleImagePath,
} from './article-image-surface.mjs';
import {
  ARTICLE_IMAGE_VARIANTS,
  canonicalArticleImagePaths,
} from './image-store.mjs';
import { PIPELINE_OFFLINE } from './constants.mjs';
import { fetchWithTimeout } from './image-providers/shared.mjs';

const LOCAL_SOURCE_FIELDS = [
  'heroImage',
  'generatedImage',
  'image',
  'thumbnailImage',
  'ogImage',
];

const REMOTE_SOURCE_FIELDS = [
  'sourceImage',
  'image',
  'imageUrl',
  'image_url',
  'thumbnail',
];

async function fileExists(filePath = '') {
  if (!filePath) return false;
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function clean(value = '') {
  return String(value || '').trim();
}

function isRemoteUrl(value = '') {
  return /^https?:\/\//i.test(clean(value));
}

function localSourceImageFileFor(item = {}) {
  for (const field of LOCAL_SOURCE_FIELDS) {
    const candidate = item[field];
    if (!localArticleImageExists(candidate)) continue;
    const filePath = localArticleImagePath(candidate);
    if (filePath) return filePath;
  }
  return '';
}

function remoteSourceImageFor(item = {}) {
  for (const field of REMOTE_SOURCE_FIELDS) {
    const value = clean(item[field]);
    if (!value) continue;
    if (isRemoteUrl(value)) return { url: value };
    if (field === 'sourceImage' || field === 'imageUrl' || field === 'image_url') {
      return { invalid: true };
    }
  }
  return {};
}

function missingCanonicalVariants(paths = {}, publicDir = '') {
  return Object.entries(ARTICLE_IMAGE_VARIANTS).map(([key]) => {
    const publicPath = paths[`${key}Image`];
    return {
      key,
      publicPath,
      filePath: path.join(publicDir, publicPath.replace(/^\//, '')),
    };
  });
}

async function writeMissingVariants(missing = [], source) {
  await Promise.all(missing.map(async (entry) => {
    const variant = ARTICLE_IMAGE_VARIANTS[entry.key];
    await fs.mkdir(path.dirname(entry.filePath), { recursive: true });
    await sharp(source)
      .resize(variant.width, variant.height, { fit: 'cover', position: 'attention' })
      .webp({ quality: 88 })
      .toFile(entry.filePath);
  }));
}

async function fetchRemoteSourceImage(url = '') {
  const response = await fetchWithTimeout(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; ComputeCurrentBot/1.0)',
    },
  }, 20000);

  if (!response.ok) {
    return { error: 'source_image_fetch_failed' };
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType && !/^image\//i.test(contentType)) {
    return { error: 'source_image_not_image' };
  }

  return { bytes: Buffer.from(await response.arrayBuffer()) };
}

export async function ensureCanonicalArticleImageSet(item = {}, options = {}) {
  const publicDir = options.publicDir || path.join(process.cwd(), 'public');
  const paths = canonicalArticleImagePaths(item, { extension: 'webp', legacyExtension: 'webp' });
  const candidates = missingCanonicalVariants(paths, publicDir);
  const missing = [];

  for (const candidate of candidates) {
    if (!(await fileExists(candidate.filePath))) {
      missing.push(candidate);
    }
  }

  if (!missing.length) {
    return { changed: 0, skipped: false, paths };
  }

  const sourceFile = localSourceImageFileFor(item);
  if (await fileExists(sourceFile)) {
    await writeMissingVariants(missing, sourceFile);
    return { changed: missing.length, skipped: false, paths };
  }

  const remote = remoteSourceImageFor(item);
  if (remote.invalid) {
    return { changed: 0, skipped: true, reason: 'invalid_source_image_url', paths };
  }
  if (!remote.url) {
    return { changed: 0, skipped: true, reason: 'missing_local_source_image', paths };
  }
  if (PIPELINE_OFFLINE) {
    return { changed: 0, skipped: true, reason: 'pipeline_offline', paths };
  }

  const fetched = await fetchRemoteSourceImage(remote.url).catch(() => ({ error: 'source_image_fetch_failed' }));
  if (fetched.error) {
    return { changed: 0, skipped: true, reason: fetched.error, paths };
  }

  try {
    await writeMissingVariants(missing, fetched.bytes);
    return { changed: missing.length, skipped: false, paths };
  } catch {
    return { changed: 0, skipped: true, reason: 'invalid_source_image', paths };
  }
}
