import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertManagedPreviewConfig,
  assertManagedProbeState,
  redactManagedError,
  verifyManagedAdminProbe,
  writeManagedAdminProbe,
} from '../scripts/lib/managed-admin-persistence.mjs';
import {
  createAdminMediaStorage,
  createLocalAdminStorage,
  permanentDeleteConfirmation,
} from '../src/plugins/storage/index.mjs';

test('managed persistence verifier refuses production and missing preview attestations', () => {
  const valid = {
    target: 'preview',
    scope: 'preview',
    vercelEnv: 'preview',
    databaseUrl: 'postgres://example.invalid/preview',
    blobToken: 'test-token',
    mediaProvider: 'vercel-blob',
  };
  assert.deepEqual(assertManagedPreviewConfig(valid), {
    target: 'preview',
    credentialsPresent: { database: true, blob: true },
  });
  assert.throws(() => assertManagedPreviewConfig({ ...valid, target: 'production' }), /target=preview/);
  assert.throws(() => assertManagedPreviewConfig({ ...valid, scope: '' }), /ADMIN_PERSISTENCE_SCOPE=preview/);
  assert.throws(() => assertManagedPreviewConfig({ ...valid, vercelEnv: 'production' }), /VERCEL_ENV=preview/);
  assert.throws(() => assertManagedPreviewConfig({ ...valid, vercelEnv: undefined }), /VERCEL_ENV=preview/);
  assert.throws(() => assertManagedPreviewConfig({ ...valid, databaseUrl: '' }), /DATABASE_URL is required/);
  assert.throws(() => assertManagedPreviewConfig({ ...valid, blobToken: '' }), /BLOB_READ_WRITE_TOKEN is required/);
  assert.throws(() => assertManagedPreviewConfig({ ...valid, mediaProvider: 'local' }), /vercel-blob is required/);
});

test('managed persistence errors redact database credentials and Blob tokens', () => {
  const databaseUrl = 'postgres://owner:secret@example.invalid/preview';
  const blobToken = 'vercel_blob_rw_example_secret';
  const message = redactManagedError(
    new Error(`connection failed for ${databaseUrl} using ${blobToken}`),
    [databaseUrl, blobToken],
  );
  assert.equal(message, 'connection failed for [redacted] using [redacted]');
});

test('managed persistence verifier rejects state that could target non-probe records', () => {
  assert.throws(() => assertManagedProbeState({
    schemaVersion: 1,
    target: 'preview',
    articleId: 'real-editorial-article',
    expectedVersion: 2,
    objectKey: 'admin-media/real-editorial-article/image.webp',
    mediaChecksum: 'a'.repeat(64),
    runId: 'run-1',
  }), /cannot target a non-probe article/);
});

test('managed persistence probe survives fresh adapters and cleans up its records', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'managed-admin-persistence-'));
  const filePath = path.join(directory, 'admin.json');
  const createStorage = () => createLocalAdminStorage({ filePath });
  const objects = new Map();
  const blobClient = {
    async put(key, buffer) {
      objects.set(key, Buffer.from(buffer));
      return { pathname: key, url: `https://blob.example/${key}` };
    },
    async get(key) {
      const buffer = objects.get(key);
      return buffer ? { stream: new Response(buffer).body } : null;
    },
    async del(key) {
      objects.delete(key);
    },
  };
  const createMediaStorage = () => createAdminMediaStorage({
    provider: 'vercel-blob',
    token: 'test-token',
    blobClient,
  });

  try {
    const state = await writeManagedAdminProbe({
      migrate: async () => ({ applied: ['001_admin_storage.sql'], skipped: [] }),
      createStorage,
      createMediaStorage,
      runId: 'write-process',
      deploymentId: 'preview-deployment-a',
      now: () => new Date('2026-07-12T10:00:00.000Z'),
    });
    assertManagedProbeState(state);
    assert.equal((await createStorage().getArticle(state.articleId)).version, 2);

    const receipt = await verifyManagedAdminProbe({
      state,
      createStorage,
      createMediaStorage,
      runId: 'verify-process',
      deploymentId: 'preview-deployment-b',
      now: () => new Date('2026-07-12T10:05:00.000Z'),
    });
    assert.equal(receipt.processRestarted, true);
    assert.equal(receipt.deploymentChanged, true);
    assert.deepEqual(receipt.checks, {
      article: true,
      revisions: true,
      audit: true,
      outbox: true,
      privateBlob: true,
      softDeleteRestore: true,
      cleanup: true,
    });
    assert.equal(await createStorage().getArticle(state.articleId, { includeDeleted: true }), null);
    await assert.rejects(() => createMediaStorage().read(state.objectKey), (error) => error.code === 'ENOENT');

    const failedVerifyState = await writeManagedAdminProbe({
      migrate: async () => ({ applied: [], skipped: ['001_admin_storage.sql'] }),
      createStorage,
      createMediaStorage,
      runId: 'verify-failure-write-process',
    });
    const createStorageWithVerifyCleanupFailure = () => {
      const storage = createStorage();
      storage.permanentlyDeleteArticle = async () => { throw new Error('verify article cleanup failed'); };
      return storage;
    };
    const createMediaStorageWithVerifyFailures = () => ({
      ...createMediaStorage(),
      async read() { throw new Error('verification read failed'); },
      async remove() { throw new Error('verify Blob cleanup failed'); },
    });
    await assert.rejects(() => verifyManagedAdminProbe({
      state: failedVerifyState,
      createStorage: createStorageWithVerifyCleanupFailure,
      createMediaStorage: createMediaStorageWithVerifyFailures,
      runId: 'verify-failure-process',
    }), (error) => error instanceof AggregateError
      && error.errors.length === 3
      && error.errors.some((item) => /verification read failed/.test(item.message))
      && error.errors.some((item) => /verify Blob cleanup failed/.test(item.message))
      && error.errors.some((item) => /verify article cleanup failed/.test(item.message)));
    const failedVerifyArticle = await createStorage().getArticle(failedVerifyState.articleId, { includeDeleted: true });
    await createStorage().permanentlyDeleteArticle(failedVerifyArticle.id, {
      expectedVersion: failedVerifyArticle.version,
      actor: 'test-cleanup',
      confirmation: permanentDeleteConfirmation(failedVerifyArticle.id),
    });
    objects.delete(failedVerifyState.objectKey);

    await assert.rejects(() => writeManagedAdminProbe({
      migrate: async () => ({ applied: [], skipped: ['001_admin_storage.sql'] }),
      createStorage,
      createMediaStorage,
      runId: 'failed-write-process',
      persistState: async () => { throw new Error('state write failed'); },
    }), /state write failed/);
    assert.deepEqual(await createStorage().listArticles({ includeDeleted: true }), []);
    assert.equal(objects.size, 0);

    await assert.rejects(() => writeManagedAdminProbe({
      migrate: async () => ({ applied: [], skipped: ['001_admin_storage.sql'] }),
      createStorage,
      createMediaStorage: () => ({
        ...createMediaStorage(),
        async remove() { throw new Error('Blob cleanup failed'); },
      }),
      runId: 'failed-media-cleanup',
      persistState: async () => { throw new Error('state write failed'); },
    }), (error) => error instanceof AggregateError && /cleanup failed/.test(error.message));
    assert.deepEqual(await createStorage().listArticles({ includeDeleted: true }), []);
    assert.equal(objects.size, 1);
    objects.clear();

    const createStorageWithCleanupFailure = () => {
      const storage = createStorage();
      storage.permanentlyDeleteArticle = async () => { throw new Error('article cleanup failed'); };
      return storage;
    };
    await assert.rejects(() => writeManagedAdminProbe({
      migrate: async () => ({ applied: [], skipped: ['001_admin_storage.sql'] }),
      createStorage: createStorageWithCleanupFailure,
      createMediaStorage,
      runId: 'failed-article-cleanup',
      persistState: async () => { throw new Error('state write failed'); },
    }), (error) => error instanceof AggregateError && /cleanup failed/.test(error.message));
    const [orphaned] = await createStorage().listArticles({ includeDeleted: true });
    assert.ok(orphaned.deletedAt);
    await createStorage().permanentlyDeleteArticle(orphaned.id, {
      expectedVersion: orphaned.version,
      actor: 'test-cleanup',
      confirmation: permanentDeleteConfirmation(orphaned.id),
    });
    assert.deepEqual(await createStorage().listArticles({ includeDeleted: true }), []);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
