import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildArticleImagePrompt } from './lib/article-image-prompt.mjs';
import { imageFingerprint } from './lib/codex-image-provider.mjs';
import { canonicalArticleImagePaths } from './lib/image-store.mjs';
import { isPublicLongformArticle } from './lib/public-surface-eligibility.mjs';

const DEFAULT_ARTICLES_PATH = 'src/data/latest-news.json';
const DEFAULT_MANIFEST_PATH = 'config/codex-image-manifest.json';
const SAFE_SOURCE_PATH = /^\/generated\/codex-inputs\/([a-f0-9]{64})\.webp$/;
const SAFE_ARTICLE_ID = /^[A-Za-z0-9_-]+$/;
const NEEDS_IMAGE_STATUSES = new Set(['queued', 'missing', 'missing-image', 'fallback', 'regeneration-needed']);
const PRESERVED_PROVIDERS = new Set(['codex', 'source-image', 'source-canonical', 'editor-approved', 'manual']);

function clean(value = '') {
  return String(value || '').trim();
}

function shellQuote(value = '') {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function articleTime(article = {}) {
  const value = new Date(article.analysisPublishedAt || article.publishedAt || article.updatedAt || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

function needsCodexArtwork(article = {}) {
  const status = clean(article.imageStatus).toLowerCase();
  const provider = clean(article.generatedImageProvider || article.imageProvider).toLowerCase();
  const hasArtwork = Boolean(article.heroImage || article.generatedImage || article.thumbnailImage || article.ogImage);

  if (NEEDS_IMAGE_STATUSES.has(status)) return true;
  if (provider === 'local-generated' || provider === 'local') return true;
  if (PRESERVED_PROVIDERS.has(provider)) return false;
  if (!hasArtwork) return true;
  return status !== 'generated' && status !== 'approved' && status !== 'source-canonical';
}

export function selectCodexImageJobs(articles = [], registrations = {}, options = {}) {
  const limit = options.limit ?? 1;
  if (!Number.isInteger(limit) || limit < 1 || limit > 5) throw new Error('Image queue limit must be an integer from 1 to 5.');
  const requestedId = clean(options.id);
  const eligible = articles
    .filter((article) => !requestedId || article?.id === requestedId)
    .filter((article) => isPublicLongformArticle(article, options.eligibilityOptions))
    .filter((article) => {
      const provider = clean(article.generatedImageProvider || article.imageProvider).toLowerCase();
      return clean(article.imageStatus).toLowerCase() !== 'approved'
        && !(PRESERVED_PROVIDERS.has(provider) && provider !== 'codex');
    })
    .filter((article) => ['stale', 'recoverable'].includes(registrations[article.id]?.state) || needsCodexArtwork(article))
    .sort((left, right) => articleTime(right) - articleTime(left));

  return eligible.flatMap((article) => {
    if (!SAFE_ARTICLE_ID.test(article.id) || ['__proto__', 'constructor', 'prototype'].includes(article.id)) {
      throw new Error(`Article id "${article.id}" is unsafe for the Codex image import command.`);
    }
    const fingerprint = imageFingerprint(article);
    const registration = registrations[article.id] || { state: 'none' };
    if (registration.state === 'valid') return [];
    if (registration.state === 'recoverable') {
      const file = `public${registration.sourcePath}`;
      const timestampArgs = ['--generated-at', registration.generatedAt];
      const modelArgs = registration.model ? ['--model', registration.model] : [];
      const modelCommand = registration.model ? ` --model ${shellQuote(registration.model)}` : '';
      return [{
        action: 'register_existing',
        id: article.id,
        title: article.expertLensFull?.finalHeadline || article.title,
        fingerprint,
        sourcePath: registration.sourcePath,
        generatedAt: registration.generatedAt,
        ...(registration.model ? { model: registration.model } : {}),
        reason: 'registered_source_needs_article_metadata_or_variant_recovery',
        importArgs: ['node', 'scripts/import-codex-image.mjs', '--id', article.id, '--file', file, '--fingerprint', fingerprint, ...timestampArgs, ...modelArgs],
        importCommand: `node scripts/import-codex-image.mjs --id ${article.id} --file ${file} --fingerprint ${fingerprint} --generated-at ${shellQuote(registration.generatedAt)}${modelCommand}`,
      }];
    }
    return [{
      action: 'generate',
      id: article.id,
      title: article.expertLensFull?.finalHeadline || article.title,
      fingerprint,
      prompt: buildArticleImagePrompt(article),
      reason: registration.state === 'stale' ? 'registered_artwork_is_for_an_earlier_article_revision' : 'codex_artwork_needed',
      importArgs: ['node', 'scripts/import-codex-image.mjs', '--id', article.id, '--file', '<generated-image-path>', '--fingerprint', fingerprint],
      importCommand: `node scripts/import-codex-image.mjs --id ${article.id} --file <generated-image-path> --fingerprint ${fingerprint}`,
    }];
  }).slice(0, limit);
}

function manifestError(message) {
  return new Error(`${message} Repair config/codex-image-manifest.json or re-register the affected image with scripts/import-codex-image.mjs.`);
}

async function sha256File(file) {
  const bytes = await fs.readFile(file);
  return createHash('sha256').update(bytes).digest('hex');
}

async function registrationApplied(article, entry, publicDir) {
  const expected = canonicalArticleImagePaths(article, { extension: 'webp', legacyExtension: 'webp' });
  const expectedModel = clean(entry.model);
  const metadataApplied = article.generatedImage === expected.heroImage
    && article.heroImage === expected.heroImage
    && article.thumbnailImage === expected.thumbnailImage
    && article.ogImage === expected.ogImage
    && article.legacyImage === expected.legacyImage
    && article.generatedImageProvider === 'codex'
    && article.imageProvider === 'codex'
    && article.imageStatus === 'generated'
    && article.imageGeneratedAt === entry.generatedAt
    && clean(article.generatedImageModel) === expectedModel
    && clean(article.imageModel) === expectedModel;
  if (!metadataApplied) return false;
  try {
    const realRoot = await fs.realpath(publicDir);
    for (const publicPath of [expected.heroImage, expected.thumbnailImage, expected.ogImage]) {
      const realFile = await fs.realpath(path.resolve(publicDir, publicPath.slice(1)));
      if (realFile !== realRoot && !realFile.startsWith(`${realRoot}${path.sep}`)) return false;
      if (!(await fs.stat(realFile)).isFile()) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function inspectCodexImageRegistrations(articles = [], options = {}) {
  const manifestPath = path.resolve(options.manifestPath || DEFAULT_MANIFEST_PATH);
  const publicDir = path.resolve(options.publicDir || 'public');
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw manifestError(`Codex image manifest cannot be read: ${error.message}`);
  }
  if (manifest?.version !== 1 || !manifest.images || Array.isArray(manifest.images) || typeof manifest.images !== 'object') {
    throw manifestError('Codex image manifest must contain {"version":1,"images":{...}}.');
  }

  const states = {};
  for (const article of articles) {
    const entry = manifest.images[article?.id];
    if (!entry) continue;
    const fingerprint = imageFingerprint(article);
    if (entry.fingerprint !== fingerprint) {
      states[article.id] = { state: 'stale' };
      continue;
    }
    const match = SAFE_SOURCE_PATH.exec(clean(entry.sourcePath));
    if (!match || entry.provider !== 'codex' || entry.sha256 !== match[1] || !Number.isFinite(Date.parse(entry.generatedAt))) {
      throw manifestError(`Registered Codex artwork metadata is invalid for article "${article.id}".`);
    }
    const sourceFile = path.resolve(publicDir, entry.sourcePath.slice(1));
    let digest;
    try {
      const [realRoot, realSource] = await Promise.all([fs.realpath(publicDir), fs.realpath(sourceFile)]);
      if (realSource !== realRoot && !realSource.startsWith(`${realRoot}${path.sep}`)) {
        throw manifestError(`Registered Codex artwork escapes the public directory for article "${article.id}".`);
      }
      digest = await sha256File(realSource);
    } catch (error) {
      if (error.message?.includes('escapes the public directory')) throw error;
      throw manifestError(`Registered Codex artwork file is unavailable for article "${article.id}": ${error.message}`);
    }
    if (digest !== entry.sha256) {
      throw manifestError(`Registered Codex artwork hash does not match for article "${article.id}".`);
    }
    states[article.id] = await registrationApplied(article, entry, publicDir)
      ? { state: 'valid' }
      : { state: 'recoverable', sourcePath: entry.sourcePath, generatedAt: entry.generatedAt, ...(clean(entry.model) ? { model: clean(entry.model) } : {}) };
  }
  return states;
}

export function parseArgs(args) {
  const parsed = { id: undefined, limit: 1 };
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    if (!['--id', '--limit'].includes(flag)) throw new Error(`Unknown argument "${flag}". Usage: node scripts/prepare-codex-images.mjs [--id <article-id>] [--limit <1-5>]`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Argument ${flag} requires a value.`);
    if (flag === '--id') parsed.id = value;
    if (flag === '--limit') parsed.limit = Number(value);
  }
  return parsed;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  const articles = JSON.parse(await fs.readFile(DEFAULT_ARTICLES_PATH, 'utf8'));
  if (!Array.isArray(articles)) throw new Error(`${DEFAULT_ARTICLES_PATH} must contain an array.`);
  if (options.id && !articles.some((article) => article?.id === options.id)) throw new Error(`Article "${options.id}" was not found in ${DEFAULT_ARTICLES_PATH}.`);
  const registrations = await inspectCodexImageRegistrations(articles);
  const jobs = selectCodexImageJobs(articles, registrations, options);
  process.stdout.write(`${JSON.stringify({ jobs }, null, 2)}\n`);
  return jobs;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
