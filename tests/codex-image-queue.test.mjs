import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalAdminArticle, authorizedAdminSourceRegistry } from './fixtures/admin-publication-integrity.mjs';
import { imageFingerprint } from '../scripts/lib/codex-image-provider.mjs';
import { canonicalArticleImagePaths } from '../scripts/lib/image-store.mjs';
import { inspectCodexImageRegistrations, parseArgs, selectCodexImageJobs } from '../scripts/prepare-codex-images.mjs';

const eligibilityOptions = {
  sourceRegistry: authorizedAdminSourceRegistry(),
  now: '2026-08-10T00:00:00.000Z',
};

function article(id, publishedAt, overrides = {}) {
  return {
    ...canonicalAdminArticle({ published: true }),
    id,
    publishedAt,
    analysisPublishedAt: publishedAt,
    imageStatus: 'queued',
    imageProvider: 'codex',
    ...overrides,
  };
}

test('selects newest eligible published articles, caps the queue, and emits import-safe fingerprints', () => {
  const articles = Array.from({ length: 6 }, (_, index) => article(`queue-${index}`, `2026-08-0${index + 1}T00:00:00.000Z`));
  const jobs = selectCodexImageJobs(articles, {}, { limit: 5, eligibilityOptions });
  assert.deepEqual(jobs.map((job) => job.id), ['queue-5', 'queue-4', 'queue-3', 'queue-2', 'queue-1']);
  assert.equal(jobs[0].fingerprint, imageFingerprint(articles[5]));
  assert.match(jobs[0].prompt, /Utility milestones shape campus commissioning/);
  assert.match(jobs[0].importCommand, new RegExp(`--fingerprint ${jobs[0].fingerprint}$`));
  assert.throws(() => selectCodexImageJobs(articles, {}, { limit: 6, eligibilityOptions }), /1 to 5/);
});

test('CLI arguments are bounded and reject missing or unknown values', () => {
  assert.deepEqual(parseArgs([]), { id: undefined, limit: 1 });
  assert.deepEqual(parseArgs(['--id', 'article_1', '--limit', '5']), { id: 'article_1', limit: 5 });
  assert.throws(() => parseArgs(['--limit']), /requires a value/);
  assert.throws(() => parseArgs(['--unknown', 'value']), /Unknown argument/);
});

test('explicit id remains subject to publication eligibility and preserves approved artwork', () => {
  const queued = article('wanted', '2026-08-02T00:00:00.000Z');
  const draft = { ...article('draft', '2026-08-03T00:00:00.000Z'), articlePagePublished: false };
  const approved = article('approved', '2026-08-04T00:00:00.000Z', {
    imageStatus: 'approved',
    imageProvider: 'editor-approved',
    heroImage: '/uploads/approved.webp',
  });
  assert.deepEqual(selectCodexImageJobs([draft, queued, approved], {}, { id: 'wanted', eligibilityOptions }).map((job) => job.id), ['wanted']);
  assert.deepEqual(selectCodexImageJobs([draft, queued, approved], {}, { id: 'draft', eligibilityOptions }), []);
  assert.deepEqual(selectCodexImageJobs([draft, queued, approved], {}, { id: 'approved', eligibilityOptions }), []);
});

test('local generated fallbacks can be upgraded while valid Codex registrations are skipped', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-image-queue-'));
  const publicDir = path.join(root, 'public');
  const manifestPath = path.join(root, 'manifest.json');
  const local = article('local-fallback', '2026-08-02T00:00:00.000Z', {
    imageStatus: 'generated',
    generatedImageProvider: 'local-generated',
    heroImage: '/generated/articles/local/hero.webp',
  });
  const registeredBase = article('registered', '2026-08-03T00:00:00.000Z');
  const expected = canonicalArticleImagePaths(registeredBase, { extension: 'webp', legacyExtension: 'webp' });
  const registered = {
    ...registeredBase,
    ...expected,
    generatedImage: expected.heroImage,
    generatedImageProvider: 'codex',
    generatedImageModel: '',
    imageProvider: 'codex',
    imageModel: '',
    imageStatus: 'generated',
    imageGeneratedAt: '2026-08-10T00:00:00.000Z',
  };
  const bytes = Buffer.from('registered-image');
  const digest = createHash('sha256').update(bytes).digest('hex');
  const sourcePath = `/generated/codex-inputs/${digest}.webp`;
  await fs.mkdir(path.join(publicDir, 'generated/codex-inputs'), { recursive: true });
  await fs.writeFile(path.join(publicDir, sourcePath.slice(1)), bytes);
  for (const publicPath of [expected.heroImage, expected.thumbnailImage, expected.ogImage]) {
    await fs.mkdir(path.dirname(path.join(publicDir, publicPath.slice(1))), { recursive: true });
    await fs.writeFile(path.join(publicDir, publicPath.slice(1)), bytes);
  }
  await fs.writeFile(manifestPath, JSON.stringify({ version: 1, images: {
    registered: {
      fingerprint: imageFingerprint(registered),
      sha256: digest,
      sourcePath,
      generatedAt: '2026-08-10T00:00:00.000Z',
      provider: 'codex',
      model: '',
    },
  } }));
  try {
    const states = await inspectCodexImageRegistrations([local, registered], { publicDir, manifestPath });
    assert.deepEqual(states.registered, { state: 'valid' });
    assert.deepEqual(selectCodexImageJobs([local, registered], states, { limit: 5, eligibilityOptions }).map((job) => job.id), ['local-fallback']);
    await fs.unlink(path.join(publicDir, expected.ogImage.slice(1)));
    const missingVariant = await inspectCodexImageRegistrations([registered], { publicDir, manifestPath });
    assert.deepEqual(missingVariant.registered, { state: 'recoverable', sourcePath, generatedAt: '2026-08-10T00:00:00.000Z' });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('valid registered source with incomplete article application returns register_existing recovery', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-image-recovery-'));
  const publicDir = path.join(root, 'public');
  const manifestPath = path.join(root, 'manifest.json');
  const target = article('partial-import', '2026-08-03T00:00:00.000Z', {
    imageStatus: 'fallback',
    generatedImageProvider: 'local-generated',
    heroImage: '/generated/articles/old/hero.webp',
  });
  const bytes = Buffer.from('registered-source');
  const digest = createHash('sha256').update(bytes).digest('hex');
  const sourcePath = `/generated/codex-inputs/${digest}.webp`;
  await fs.mkdir(path.join(publicDir, 'generated/codex-inputs'), { recursive: true });
  await fs.writeFile(path.join(publicDir, sourcePath.slice(1)), bytes);
  await fs.writeFile(manifestPath, JSON.stringify({ version: 1, images: {
    'partial-import': {
      fingerprint: imageFingerprint(target), sha256: digest, sourcePath,
      generatedAt: '2026-08-10T00:00:00.000Z', provider: 'codex', model: 'native test model',
    },
  } }));
  try {
    const states = await inspectCodexImageRegistrations([target], { publicDir, manifestPath });
    assert.deepEqual(states[target.id], { state: 'recoverable', sourcePath, generatedAt: '2026-08-10T00:00:00.000Z', model: 'native test model' });
    const [job] = selectCodexImageJobs([target], states, { eligibilityOptions });
    assert.equal(job.action, 'register_existing');
    assert.equal(job.sourcePath, sourcePath);
    assert.equal(job.importArgs[job.importArgs.indexOf('--generated-at') + 1], '2026-08-10T00:00:00.000Z');
    assert.equal(job.prompt, undefined);
    assert.deepEqual(job.importArgs.slice(4, 6), ['--file', `public${sourcePath}`]);
    assert.deepEqual(job.importArgs.slice(-2), ['--model', 'native test model']);
    assert.match(job.importCommand, /--model 'native test model'$/);
    assert.equal(job.fingerprint, imageFingerprint(target));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('stale prompt fingerprints requeue, but missing and tampered registered files fail actionably', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-image-registry-'));
  const publicDir = path.join(root, 'public');
  const manifestPath = path.join(root, 'manifest.json');
  const target = article('target', '2026-08-03T00:00:00.000Z');
  const digest = createHash('sha256').update('expected').digest('hex');
  const entry = {
    fingerprint: imageFingerprint({
      ...target,
      expertLensFull: { ...target.expertLensFull, finalHeadline: 'Earlier article revision' },
    }),
    sha256: digest,
    sourcePath: `/generated/codex-inputs/${digest}.webp`,
    generatedAt: '2026-08-10T00:00:00.000Z',
    provider: 'codex',
  };
  await fs.writeFile(manifestPath, JSON.stringify({ version: 1, images: { target: entry } }));
  try {
    const stale = await inspectCodexImageRegistrations([target], { publicDir, manifestPath });
    assert.deepEqual(stale.target, { state: 'stale' });
    assert.equal(selectCodexImageJobs([target], stale, { eligibilityOptions })[0].reason, 'registered_artwork_is_for_an_earlier_article_revision');

    entry.fingerprint = imageFingerprint(target);
    await fs.writeFile(manifestPath, JSON.stringify({ version: 1, images: { target: entry } }));
    await assert.rejects(inspectCodexImageRegistrations([target], { publicDir, manifestPath }), /file is unavailable.*re-register/s);

    await fs.mkdir(path.join(publicDir, 'generated/codex-inputs'), { recursive: true });
    await fs.writeFile(path.join(publicDir, entry.sourcePath.slice(1)), 'tampered');
    await assert.rejects(inspectCodexImageRegistrations([target], { publicDir, manifestPath }), /hash does not match.*re-register/s);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('registered artwork symlinks cannot escape the public directory', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-image-symlink-'));
  const publicDir = path.join(root, 'public');
  const manifestPath = path.join(root, 'manifest.json');
  const target = article('symlink-target', '2026-08-03T00:00:00.000Z');
  const outside = path.join(root, 'outside.webp');
  const bytes = Buffer.from('outside-image');
  const digest = createHash('sha256').update(bytes).digest('hex');
  const sourcePath = `/generated/codex-inputs/${digest}.webp`;
  await fs.mkdir(path.join(publicDir, 'generated/codex-inputs'), { recursive: true });
  await fs.writeFile(outside, bytes);
  await fs.symlink(outside, path.join(publicDir, sourcePath.slice(1)));
  await fs.writeFile(manifestPath, JSON.stringify({ version: 1, images: {
    'symlink-target': {
      fingerprint: imageFingerprint(target), sha256: digest, sourcePath,
      generatedAt: '2026-08-10T00:00:00.000Z', provider: 'codex',
    },
  } }));
  try {
    await assert.rejects(inspectCodexImageRegistrations([target], { publicDir, manifestPath }), /escapes the public directory/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});


test('an older Codex registration cannot override subsequently approved artwork', () => {
  for (const provider of ['editor-approved', 'manual', 'source-image', 'source-canonical']) {
    const approved = article('approved-later', '2026-08-03T00:00:00.000Z', {
      generatedImageProvider: provider, imageProvider: provider,
      imageStatus: 'approved', heroImage: '/uploads/approved.webp',
    });
    for (const state of ['recoverable', 'stale']) {
      assert.deepEqual(selectCodexImageJobs([approved], { [approved.id]: { state } }, { eligibilityOptions }), []);
    }
  }
});
