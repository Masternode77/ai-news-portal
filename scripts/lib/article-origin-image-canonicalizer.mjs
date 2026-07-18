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
import {
  fetchWithTimeout,
  SUPPORTED_RASTER_MIME_TYPES,
  validateRasterImageBytes,
} from './image-providers/shared.mjs';
import {
  ensureSafePublicOutputTarget,
  readBoundedRegularFile,
  writeSafePublicFile,
} from './safe-public-file.mjs';

const MAX_SOURCE_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_SOURCE_IMAGE_PIXELS = 40_000_000;

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

const PLACEHOLDER_PROVIDER_RE = /\b(?:local-placeholder|local-svg|category-fallback)\b/i;

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

function imageProviderText(item = {}) {
  return [
    item.generatedImageProvider,
    item.imageProvider,
    item.image_source_provider,
    item.generatedImageModel,
    item.imageModel,
    item.imageStatus,
    item.image_status,
  ].map(clean).filter(Boolean).join(' ');
}

function itemLooksPlaceholder(item = {}) {
  return PLACEHOLDER_PROVIDER_RE.test(imageProviderText(item));
}

function localSourceImageFileFor(item = {}) {
  if (itemLooksPlaceholder(item)) return '';
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

function canonicalImageTargets(paths = {}, publicDir = '') {
  const variantTargets = Object.entries(ARTICLE_IMAGE_VARIANTS).map(([key]) => {
    const publicPath = paths[`${key}Image`];
    return {
      key,
      publicPath,
      filePath: path.join(publicDir, publicPath.replace(/^\//, '')),
    };
  });

  return [
    ...variantTargets,
    {
      key: 'legacy',
      publicPath: paths.legacyImage,
      filePath: path.join(publicDir, paths.legacyImage.replace(/^\//, '')),
    },
  ];
}

async function writeMissingVariants(missing = [], source, publicDir, options = {}) {
  const staged = [];
  for (const entry of missing) {
    const variant = ARTICLE_IMAGE_VARIANTS[entry.key] || ARTICLE_IMAGE_VARIANTS.hero;
    const outputPath = await ensureSafePublicOutputTarget(publicDir, entry.filePath);
    const output = await sharp(source, {
      failOn: 'error',
      limitInputPixels: MAX_SOURCE_IMAGE_PIXELS,
      animated: false,
      sequentialRead: true,
    })
      .rotate()
      .resize(variant.width, variant.height, { fit: 'cover', position: 'attention' })
      .webp({ quality: 88 })
      .toBuffer();
    let backup = null;
    try {
      const stats = await fs.lstat(outputPath);
      if (stats.isSymbolicLink() || !stats.isFile()) throw new Error('Image output must be a regular file');
      backup = await readBoundedRegularFile(outputPath, {
        maxBytes: MAX_SOURCE_IMAGE_BYTES,
        expectedStats: stats,
      });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    staged.push({ outputPath, output, backup });
  }

  const writePublicFile = options.writePublicFile || writeSafePublicFile;
  const applied = [];
  try {
    for (const entry of staged) {
      await writePublicFile(publicDir, entry.outputPath, entry.output);
      applied.push(entry);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const entry of [...applied].reverse()) {
      try {
        if (entry.backup === null) {
          await fs.rm(await ensureSafePublicOutputTarget(publicDir, entry.outputPath), { force: true });
        }
        else await writeSafePublicFile(publicDir, entry.outputPath, entry.backup);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError.message);
      }
    }
    if (rollbackErrors.length) error.message = `${error.message}; rollback failed: ${rollbackErrors.join(', ')}`;
    throw error;
  }
}

async function readLocalSourceImage(filePath = '') {
  return readBoundedRegularFile(filePath, { maxBytes: MAX_SOURCE_IMAGE_BYTES });
}

async function fetchRemoteSourceImage(url = '') {
  const response = await fetchWithTimeout(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; ComputeCurrentBot/1.0)',
    },
    safeFetch: {
      allowedMimeTypes: SUPPORTED_RASTER_MIME_TYPES,
      maxRedirects: 3,
      maxCompressedBytes: MAX_SOURCE_IMAGE_BYTES,
      maxDecompressedBytes: MAX_SOURCE_IMAGE_BYTES,
    },
  }, 20000);

  if (!response.ok) {
    return { error: 'source_image_fetch_failed' };
  }

  const contentType = response.headers.get('content-type') || '';
  const bytes = Buffer.from(await response.arrayBuffer());
  return { bytes, contentType };
}

async function writeRemoteSourceVariants(remote, missing, publicDir, paths, options = {}) {
  if (remote.invalid) {
    return { changed: 0, skipped: true, reason: 'invalid_source_image_url', paths };
  }
  if (!remote.url) {
    return { changed: 0, skipped: true, reason: 'missing_local_source_image', paths };
  }
  if (PIPELINE_OFFLINE) {
    return { changed: 0, skipped: true, reason: 'pipeline_offline', paths };
  }

  const fetchSource = options.fetchRemoteSourceImage || fetchRemoteSourceImage;
  const fetched = await fetchSource(remote.url).catch(() => ({ error: 'source_image_fetch_failed' }));
  if (fetched.error || !fetched.bytes) {
    return { changed: 0, skipped: true, reason: fetched.error || 'source_image_fetch_failed', paths };
  }

  let validated;
  try {
    validated = await validateRasterImageBytes(fetched.bytes, fetched.contentType || '', {
      maxBytes: MAX_SOURCE_IMAGE_BYTES,
      maxPixels: MAX_SOURCE_IMAGE_PIXELS,
    });
  } catch {
    return { changed: 0, skipped: true, reason: 'invalid_source_image', paths };
  }
  await writeMissingVariants(missing, validated.bytes, publicDir, options);
  return { changed: missing.length, skipped: false, paths };
}

export async function ensureCanonicalArticleImageSet(item = {}, options = {}) {
  const publicDir = options.publicDir || path.join(process.cwd(), 'public');
  const paths = canonicalArticleImagePaths(item, { extension: 'webp', legacyExtension: 'webp' });
  const candidates = canonicalImageTargets(paths, publicDir);
  const missing = options.overwrite === true ? [...candidates] : [];

  try {
    await Promise.all(candidates.map((candidate) => ensureSafePublicOutputTarget(publicDir, candidate.filePath)));
  } catch {
    return { changed: 0, skipped: true, reason: 'unsafe_image_output_path', paths };
  }

  if (options.overwrite !== true) {
    for (const candidate of candidates) {
      if (!(await fileExists(candidate.filePath))) {
        missing.push(candidate);
      }
    }
  }

  if (!missing.length) {
    return { changed: 0, skipped: false, paths };
  }

  const remote = remoteSourceImageFor(item);
  if (options.overwrite === true && (remote.url || remote.invalid)) {
    return writeRemoteSourceVariants(remote, missing, publicDir, paths, options);
  }

  const sourceFile = localSourceImageFileFor(item);
  if (await fileExists(sourceFile)) {
    const bytes = await readLocalSourceImage(sourceFile);
    let validated;
    try {
      validated = await validateRasterImageBytes(bytes, '', {
        maxBytes: MAX_SOURCE_IMAGE_BYTES,
        maxPixels: MAX_SOURCE_IMAGE_PIXELS,
      });
    } catch {
      return { changed: 0, skipped: true, reason: 'invalid_local_source_image', paths };
    }
    await writeMissingVariants(missing, validated.bytes, publicDir, options);
    return { changed: missing.length, skipped: false, paths };
  }

  return writeRemoteSourceVariants(remote, missing, publicDir, paths, options);
}
