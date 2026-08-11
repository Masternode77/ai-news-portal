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
import { loadSourceRegistry, sourceUsageDecision } from './source-registry.mjs';
import {
  fetchSourceImage,
  sourceImageHostsFor,
} from './source-image-fetcher.mjs';

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
const SOURCE_DERIVED_PROVIDER_RE = /\b(?:source-image|source-canonical|origin-canonical)\b/i;

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

function itemLooksSourceDerived(item = {}) {
  return SOURCE_DERIVED_PROVIDER_RE.test(imageProviderText(item))
    || localArticleImageExists(item.sourceImage);
}

async function imageReuseAuthorization(item = {}, options = {}) {
  const sources = Object.hasOwn(options, 'sources') ? options.sources : await loadSourceRegistry();
  const decision = sourceUsageDecision(item, sources, 'image', options.now || new Date());
  return {
    ...decision,
    imageHosts: sourceImageHostsFor(sources, decision.sourceId),
  };
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

async function writeMissingVariants(missing = [], source) {
  await Promise.all(missing.map(async (entry) => {
    const variant = ARTICLE_IMAGE_VARIANTS[entry.key] || ARTICLE_IMAGE_VARIANTS.hero;
    await fs.mkdir(path.dirname(entry.filePath), { recursive: true });
    await sharp(source)
      .resize(variant.width, variant.height, { fit: 'cover', position: 'attention' })
      .webp({ quality: 88 })
      .toFile(entry.filePath);
  }));
}

async function fetchRemoteSourceImage(url = '', authorization = {}, options = {}) {
  try {
    return await fetchSourceImage(url, {
      ...options.sourceImageFetchOptions,
      allowedHosts: authorization.imageHosts,
    });
  } catch (error) {
    return { error: error?.code || 'source_image_fetch_failed' };
  }
}

export async function ensureCanonicalArticleImageSet(item = {}, options = {}) {
  const publicDir = options.publicDir || path.join(process.cwd(), 'public');
  const paths = canonicalArticleImagePaths(item, { extension: 'webp', legacyExtension: 'webp' });
  const candidates = canonicalImageTargets(paths, publicDir);
  const missing = options.overwrite === true ? [...candidates] : [];

  if (options.overwrite !== true) {
    for (const candidate of candidates) {
      if (!(await fileExists(candidate.filePath))) {
        missing.push(candidate);
      }
    }
  }

  let sourceAuthorization;
  if (itemLooksSourceDerived(item)) {
    sourceAuthorization = await imageReuseAuthorization(item, options);
    if (!sourceAuthorization.authorized) {
      return {
        changed: 0,
        skipped: true,
        authorizedSource: false,
        reason: sourceAuthorization.reason,
        authorizationDetail: sourceAuthorization.detail,
        sourceId: sourceAuthorization.sourceId,
        paths,
      };
    }
  }

  if (!missing.length) {
    return {
      changed: 0,
      skipped: false,
      authorizedSource: false,
      paths,
    };
  }

  const sourceFile = localSourceImageFileFor(item);
  if (await fileExists(sourceFile)) {
    await writeMissingVariants(missing, sourceFile);
    return {
      changed: missing.length,
      skipped: false,
      authorizedSource: sourceAuthorization?.authorized === true,
      paths,
    };
  }

  const remote = remoteSourceImageFor(item);
  if (remote.invalid) {
    return { changed: 0, skipped: true, authorizedSource: false, reason: 'invalid_source_image_url', paths };
  }
  if (!remote.url) {
    return { changed: 0, skipped: true, authorizedSource: false, reason: 'missing_local_source_image', paths };
  }
  if (PIPELINE_OFFLINE) {
    return { changed: 0, skipped: true, authorizedSource: false, reason: 'pipeline_offline', paths };
  }

  const authorization = sourceAuthorization || await imageReuseAuthorization(item, options);
  if (!authorization.authorized) {
    return {
      changed: 0,
      skipped: true,
      authorizedSource: false,
      reason: authorization.reason,
      authorizationDetail: authorization.detail,
      sourceId: authorization.sourceId,
      paths,
    };
  }

  const fetched = await fetchRemoteSourceImage(remote.url, authorization, options);
  if (fetched.error) {
    return { changed: 0, skipped: true, authorizedSource: false, reason: fetched.error, paths };
  }

  try {
    await writeMissingVariants(missing, fetched.bytes);
    return { changed: missing.length, skipped: false, authorizedSource: true, paths };
  } catch {
    return { changed: 0, skipped: true, authorizedSource: false, reason: 'invalid_source_image', paths };
  }
}
