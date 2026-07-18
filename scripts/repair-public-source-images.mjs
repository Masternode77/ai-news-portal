import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARCHIVE_NEWS_PATH,
  LATEST_NEWS_PATH,
} from './lib/constants.mjs';
import { ensureCanonicalArticleImageSet } from './lib/article-origin-image-canonicalizer.mjs';
import { publicSurfaceDecision } from './lib/public-surface-eligibility.mjs';
import {
  ensureSafePublicOutputTarget,
  readBoundedRegularFile,
  writeSafePublicFile,
} from './lib/safe-public-file.mjs';

const MAX_LOCAL_IMAGE_BYTES = 16 * 1024 * 1024;
const SOURCE_CANONICAL_METADATA = {
  generatedImageProvider: 'source-image',
  generatedImageModel: 'origin-canonical',
  imageStatus: 'source-canonical',
};
const IMAGE_VARIANTS = [
  { key: 'hero', metadataField: 'heroImage', pathField: 'heroImage' },
  { key: 'thumbnail', metadataField: 'thumbnailImage', pathField: 'thumbnailImage' },
  { key: 'og', metadataField: 'ogImage', pathField: 'ogImage' },
  { key: 'legacy', metadataField: 'legacyImage', pathField: 'legacyImage' },
];

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function unsafeImageError(message) {
  const error = new Error(message);
  error.code = 'UNSAFE_LOCAL_IMAGE';
  return error;
}

export function publicImageFile(publicDir, publicPath = '') {
  if (!String(publicPath).startsWith('/')) {
    throw new Error(`public image path must be absolute: ${publicPath}`);
  }
  const root = path.resolve(publicDir);
  const target = path.resolve(root, String(publicPath).replace(/^\/+/, ''));
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`public image path escapes public directory: ${publicPath}`);
  }
  return target;
}

export async function readSafePublicImage(publicDir, publicPath = '', options = {}) {
  const maxBytes = options.maxBytes || MAX_LOCAL_IMAGE_BYTES;
  const root = path.resolve(publicDir);
  const target = publicImageFile(root, publicPath);
  const rootStats = await fs.lstat(root);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    throw unsafeImageError('public directory must be a real directory');
  }
  const realRoot = await fs.realpath(root);
  const relative = path.relative(root, target);
  let current = root;
  for (const segment of relative.split(path.sep).slice(0, -1)) {
    current = path.join(current, segment);
    let stats;
    try {
      stats = await fs.lstat(current);
    } catch (error) {
      if (error?.code === 'ENOENT') return { missing: true };
      throw error;
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw unsafeImageError('public image parent must not contain symbolic links');
    }
  }

  let targetStats;
  try {
    targetStats = await fs.lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return { missing: true };
    throw error;
  }
  if (targetStats.isSymbolicLink() || !targetStats.isFile()) {
    throw unsafeImageError('public image must be a regular file and not a symbolic link');
  }
  if (targetStats.size > maxBytes) {
    throw unsafeImageError('public image exceeds the local byte limit');
  }

  const realTarget = await fs.realpath(target);
  const realRelative = path.relative(realRoot, realTarget);
  if (!realRelative || realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw unsafeImageError('public image resolved outside the public directory');
  }

  try {
    await options.beforeOpen?.({ root, target, targetStats });
    return {
      missing: false,
      bytes: await readBoundedRegularFile(target, {
        maxBytes,
        expectedStats: targetStats,
      }),
    };
  } catch (error) {
    if (/identity changed|bounded read|regular file|ELOOP/i.test(`${error?.code || ''} ${error?.message || ''}`)) {
      throw unsafeImageError(error.message);
    }
    throw error;
  }
}

export function isPublicSourceCanonicalArticle(item = {}, options = {}) {
  const publicDecision = options.publicDecision || publicSurfaceDecision;
  return Boolean(
    item.id
      && publicDecision(item).archive
      && item.generatedImageProvider === SOURCE_CANONICAL_METADATA.generatedImageProvider
      && item.generatedImageModel === SOURCE_CANONICAL_METADATA.generatedImageModel
      && item.imageStatus === SOURCE_CANONICAL_METADATA.imageStatus
  );
}

export function selectPublicSourceCanonicalArticles(collections = [], options = {}) {
  const unique = new Map();
  for (const collection of collections) {
    for (const item of collection || []) {
      if (item?.id && !unique.has(item.id)) unique.set(item.id, item);
    }
  }
  return [...unique.values()].filter((item) => isPublicSourceCanonicalArticle(item, options));
}

async function inspectPreparedArticle(item, expectedPaths, options = {}) {
  const variants = [];
  for (const variant of IMAGE_VARIANTS) {
    const expectedPath = expectedPaths[variant.pathField];
    const currentPath = item[variant.metadataField] || '';
    if (currentPath !== expectedPath) {
      variants.push({
        ...variant,
        status: 'metadata-path-mismatch',
        expectedPath,
        currentPath,
      });
      continue;
    }

    try {
      const [expected, current] = await Promise.all([
        readSafePublicImage(options.expectedPublicDir, expectedPath),
        readSafePublicImage(options.currentPublicDir, currentPath),
      ]);
      if (expected.missing) {
        variants.push({ ...variant, status: 'expected-image-unavailable', expectedPath, currentPath });
      } else if (current.missing) {
        variants.push({ ...variant, status: 'missing', expectedPath, currentPath });
      } else {
        const expectedHash = sha256(expected.bytes);
        const currentHash = sha256(current.bytes);
        variants.push({
          ...variant,
          status: expectedHash === currentHash ? 'match' : 'mismatch',
          expectedPath,
          currentPath,
          expectedHash,
          currentHash,
          expectedBytes: expected.bytes.length,
          currentBytes: current.bytes.length,
        });
      }
    } catch (error) {
      variants.push({
        ...variant,
        status: error?.code === 'UNSAFE_LOCAL_IMAGE' ? 'unsafe-local-image' : 'local-image-unavailable',
        expectedPath,
        currentPath,
        reason: error?.code || error?.message,
      });
    }
  }

  const statuses = new Set(variants.map((variant) => variant.status));
  let status = 'match';
  if (statuses.has('metadata-path-mismatch')) status = 'metadata-path-mismatch';
  else if (statuses.has('expected-image-unavailable')) status = 'source-unavailable';
  else if (statuses.has('unsafe-local-image')) status = 'unsafe-local-image';
  else if (statuses.has('local-image-unavailable')) status = 'local-image-unavailable';
  else if (statuses.has('missing')) status = 'missing';
  else if (statuses.has('mismatch')) status = 'mismatch';

  return { id: item.id, title: item.title, status, paths: expectedPaths, variants };
}

async function prepareArticle(item, options = {}) {
  const canonicalize = options.canonicalize || ensureCanonicalArticleImageSet;
  const result = await canonicalize({
    id: item.id,
    title: item.title,
    slug: item.slug,
    sourceImage: item.sourceImage,
  }, {
    publicDir: options.expectedPublicDir,
    overwrite: true,
    fetchRemoteSourceImage: options.fetchRemoteSourceImage,
  });
  if (result.skipped) {
    return {
      id: item.id,
      title: item.title,
      status: 'source-unavailable',
      reason: result.reason || 'source_image_canonicalization_failed',
      variants: [],
    };
  }
  return inspectPreparedArticle(item, result.paths, options);
}

function summarize(results = []) {
  const variants = results.flatMap((item) => item.variants || []);
  return {
    candidates: results.length,
    matches: results.filter((item) => item.status === 'match').length,
    mismatches: results.filter((item) => item.status === 'mismatch').length,
    missing: results.filter((item) => item.status === 'missing').length,
    metadataPathMismatches: results.filter((item) => item.status === 'metadata-path-mismatch').length,
    unavailable: results.filter((item) => (
      item.status === 'source-unavailable'
        || item.status === 'local-image-unavailable'
        || item.status === 'unsafe-local-image'
    )).length,
    variantCandidates: variants.length,
    variantMatches: variants.filter((item) => item.status === 'match').length,
    variantMismatches: variants.filter((item) => item.status === 'mismatch').length,
    variantMissing: variants.filter((item) => item.status === 'missing').length,
  };
}

async function mapWithConcurrency(items, mapper, concurrency = 2) {
  const limit = Math.max(1, Math.min(4, Number(concurrency) || 2));
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function loadCandidates(options = {}) {
  const cwd = options.cwd || process.cwd();
  const readJson = options.readJson || (async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8')));
  const collections = options.collections || await Promise.all([
    readJson(options.latestPath || path.join(cwd, LATEST_NEWS_PATH)),
    readJson(options.archivePath || path.join(cwd, ARCHIVE_NEWS_PATH)),
  ]);
  return selectPublicSourceCanonicalArticles(collections, options);
}

async function prepareAudit(options = {}) {
  const cwd = options.cwd || process.cwd();
  const currentPublicDir = options.publicDir || path.join(cwd, 'public');
  const items = await loadCandidates(options);
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'compute-current-source-audit-'));
  const expectedPublicDir = path.join(tempRoot, 'public');
  await fs.mkdir(expectedPublicDir, { recursive: true });
  try {
    const results = await mapWithConcurrency(items, (item) => prepareArticle(item, {
      ...options,
      currentPublicDir,
      expectedPublicDir,
    }), options.concurrency);
    return { currentPublicDir, expectedPublicDir, items, results, summary: summarize(results), tempRoot };
  } catch (error) {
    await fs.rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

async function inspectPreparedAudit(prepared) {
  const itemById = new Map(prepared.items.map((item) => [item.id, item]));
  const results = await mapWithConcurrency(prepared.results, async (result) => {
    if (!result.paths) return result;
    return inspectPreparedArticle(itemById.get(result.id), result.paths, prepared);
  }, 2);
  return { summary: summarize(results), results };
}

async function promotePreparedVariants(prepared, options = {}) {
  const operations = prepared.results.flatMap((result) => (
    result.variants
      .filter((variant) => variant.status === 'mismatch' || variant.status === 'missing')
      .map((variant) => ({ ...variant, articleId: result.id }))
  ));
  const staged = [];
  for (const operation of operations) {
    const expected = await readSafePublicImage(prepared.expectedPublicDir, operation.expectedPath);
    const current = await readSafePublicImage(prepared.currentPublicDir, operation.currentPath);
    if (expected.missing) throw new Error(`${operation.articleId}:${operation.key}: staged image is missing`);
    staged.push({ ...operation, bytes: expected.bytes, backup: current });
  }

  const forwardWrite = options.writePublicFile || writeSafePublicFile;
  const applied = [];
  const rollback = async () => {
    const rollbackErrors = [];
    for (const operation of [...applied].reverse()) {
      try {
        const target = publicImageFile(prepared.currentPublicDir, operation.currentPath);
        if (operation.backup.missing) {
          await fs.rm(await ensureSafePublicOutputTarget(prepared.currentPublicDir, target), { force: true });
        } else {
          await writeSafePublicFile(prepared.currentPublicDir, target, operation.backup.bytes);
        }
      } catch (error) {
        rollbackErrors.push(`${operation.articleId}:${operation.key}:${error.message}`);
      }
    }
    if (rollbackErrors.length) throw new Error(`rollback failed: ${rollbackErrors.join(', ')}`);
  };
  try {
    for (const operation of staged) {
      const target = publicImageFile(prepared.currentPublicDir, operation.currentPath);
      await forwardWrite(prepared.currentPublicDir, target, operation.bytes, operation);
      applied.push(operation);
    }
  } catch (error) {
    await rollback().catch((rollbackError) => {
      error.message = `${error.message}; ${rollbackError.message}`;
    });
    throw error;
  }
  return {
    repaired: [...new Set(operations.map((operation) => operation.articleId))],
    rollback,
  };
}

export async function auditPublicSourceImages(options = {}) {
  const prepared = await prepareAudit(options);
  try {
    return { summary: prepared.summary, results: prepared.results };
  } finally {
    await fs.rm(prepared.tempRoot, { recursive: true, force: true });
  }
}

export async function repairPublicSourceImages(options = {}) {
  if (options.apply !== true) {
    return { applied: false, before: await auditPublicSourceImages(options) };
  }

  const prepared = await prepareAudit(options);
  try {
    const before = { summary: prepared.summary, results: prepared.results };
    const fatal = prepared.results.filter((item) => !['match', 'mismatch', 'missing'].includes(item.status));
    if (fatal.length) {
      throw new Error(`Cannot apply source-image repair with ${fatal.length} unavailable or invalid candidate(s)`);
    }

    const promotion = await promotePreparedVariants(prepared, options);
    const after = await inspectPreparedAudit(prepared);
    if (after.summary.mismatches
      || after.summary.missing
      || after.summary.metadataPathMismatches
      || after.summary.unavailable) {
      const error = new Error(`Source-image repair did not converge: ${JSON.stringify(after.summary)}`);
      await promotion.rollback().catch((rollbackError) => {
        error.message = `${error.message}; ${rollbackError.message}`;
      });
      throw error;
    }
    return { applied: true, repaired: promotion.repaired, before, after };
  } finally {
    await fs.rm(prepared.tempRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await repairPublicSourceImages({ apply: process.argv.includes('--apply') });
  const summary = result.applied ? result.after.summary : result.before.summary;
  const failures = (result.applied ? result.after.results : result.before.results)
    .filter((item) => item.status !== 'match');
  console.log(JSON.stringify({
    applied: result.applied,
    repaired: result.repaired || [],
    summary,
    failures,
  }, null, 2));
  if (summary.mismatches
    || summary.missing
    || summary.metadataPathMismatches
    || summary.unavailable) process.exitCode = 1;
}
