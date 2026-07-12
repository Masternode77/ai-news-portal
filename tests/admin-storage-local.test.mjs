import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  AdminStorageError,
  createLocalAdminStorage,
  permanentDeleteConfirmation,
} from '../src/plugins/storage/index.mjs';

function idGenerator() {
  let id = 0;
  return () => `storage-id-${++id}`;
}

function localStorage(options = {}) {
  return createLocalAdminStorage({
    storageKey: `test-${Math.random()}`,
    clock: () => new Date('2026-07-12T00:00:00.000Z'),
    idGenerator: idGenerator(),
    ...options,
  });
}

test('local admin storage provides transactional CRUD, revisions, audit, and optimistic concurrency', async () => {
  const storage = localStorage();

  const created = await storage.createArticle({
    id: 'article-1',
    title: 'Transformer queue expands',
    public_status: 'draft',
  }, { actor: 'editor' });
  assert.equal(created.version, 1);
  assert.equal(created.createdAt, '2026-07-12T00:00:00.000Z');

  const updated = await storage.updateArticle('article-1', {
    title: 'Transformer queue tightens',
  }, { expectedVersion: 1, actor: { type: 'user', id: 'editor' } });
  assert.equal(updated.version, 2);
  assert.equal(updated.title, 'Transformer queue tightens');

  await assert.rejects(
    () => storage.updateArticle('article-1', { title: 'Last write wins' }, { actor: 'editor' }),
    (error) => error instanceof AdminStorageError && error.code === 'expected_version_required',
  );

  await assert.rejects(
    () => storage.updateArticle('article-1', { title: 'Stale write' }, { expectedVersion: 1, actor: 'editor' }),
    (error) => error instanceof AdminStorageError && error.code === 'version_conflict',
  );

  const revisions = await storage.listRevisions('article-1');
  assert.deepEqual(revisions.map((revision) => revision.version), [1, 2]);
  assert.deepEqual(revisions.map((revision) => revision.action), ['create', 'update']);

  const audit = await storage.listAuditEntries({ articleId: 'article-1' });
  assert.deepEqual(audit.map((entry) => entry.action), ['create', 'update']);
  audit.push({ action: 'external-mutation' });
  assert.equal((await storage.listAuditEntries({ articleId: 'article-1' })).length, 2);
});

test('local admin storage rejects source, public, and build output paths', () => {
  for (const filePath of ['src/data/admin.json', 'public/admin.json', 'dist/admin.json']) {
    assert.throws(
      () => createLocalAdminStorage({ filePath }),
      (error) => error instanceof AdminStorageError && error.code === 'unsafe_local_storage_path',
    );
  }
});

test('local admin storage rolls back transactional work on failure', async () => {
  const storage = localStorage();
  await storage.createArticle({ id: 'article-1', title: 'Original' }, { actor: 'editor' });

  await assert.rejects(() => storage.transaction(async (tx) => {
    await tx.updateArticle('article-1', { title: 'Rolled back' }, { expectedVersion: 1, actor: 'editor' });
    await tx.createArticle({ id: 'article-2', title: 'Never committed' }, { actor: 'editor' });
    throw new Error('publish hook failed');
  }), /publish hook failed/);

  assert.equal((await storage.getArticle('article-1')).title, 'Original');
  assert.equal(await storage.getArticle('article-2'), null);
  assert.deepEqual((await storage.listAuditEntries()).map((entry) => entry.action), ['create']);
});

test('local admin storage soft deletes, restores, and requires a confirmation boundary for permanent delete', async () => {
  const storage = localStorage();
  await storage.createArticle({ id: 'article-1', title: 'Delete boundary' }, { actor: 'editor' });

  const deleted = await storage.softDeleteArticle('article-1', { expectedVersion: 1, actor: 'editor' });
  assert.equal(deleted.version, 2);
  assert.equal(deleted.deletedAt, '2026-07-12T00:00:00.000Z');
  assert.equal(await storage.getArticle('article-1'), null);
  assert.equal((await storage.getArticle('article-1', { includeDeleted: true })).id, 'article-1');

  const restored = await storage.restoreArticle('article-1', { expectedVersion: 2, actor: 'editor' });
  assert.equal(restored.version, 3);
  assert.equal(restored.deletedAt, null);

  await storage.softDeleteArticle('article-1', { expectedVersion: 3, actor: 'editor' });
  await assert.rejects(
    () => storage.permanentlyDeleteArticle('article-1', { expectedVersion: 4, actor: 'editor', confirmation: 'delete' }),
    (error) => error.code === 'delete_confirmation_required',
  );
  await storage.permanentlyDeleteArticle('article-1', {
    expectedVersion: 4,
    actor: 'editor',
    confirmation: permanentDeleteConfirmation('article-1'),
  });

  assert.equal(await storage.getArticle('article-1', { includeDeleted: true }), null);
  assert.deepEqual((await storage.listAuditEntries()).map((entry) => entry.action), [
    'create',
    'soft-delete',
    'restore',
    'soft-delete',
    'permanent-delete',
  ]);
});

test('local admin storage persists to disk across new adapter instances', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'admin-storage-'));
  const filePath = join(dir, 'storage.json');
  try {
    const first = localStorage({ filePath });
    await first.createArticle({ id: 'article-1', title: 'Persisted article' }, { actor: 'editor' });

    const second = localStorage({ filePath });
    assert.equal((await second.getArticle('article-1')).title, 'Persisted article');
    assert.deepEqual((await second.listAuditEntries()).map((entry) => entry.action), ['create']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('local admin storage persists media metadata and audit provenance', async () => {
  const storage = localStorage();
  await storage.createArticle({ id: 'article-1', title: 'Media owner' }, { actor: 'editor' });
  const media = await storage.createMedia({
    id: 'media-1', articleId: 'article-1', objectKey: 'article-1/image.webp', url: 'https://blob.example/image.webp',
    contentType: 'image/webp', byteSize: 128, width: 16, height: 16, checksum: 'a'.repeat(64),
  }, { actor: { type: 'user', id: 'editor' }, metadata: { requestId: 'request-1' } });
  assert.equal(media.objectKey, 'article-1/image.webp');
  assert.deepEqual((await storage.listMedia({ articleId: 'article-1' })).map((item) => item.id), ['media-1']);
  assert.equal((await storage.listAuditEntries({ articleId: 'article-1', action: 'media-upload' }))[0].metadata.requestId, 'request-1');
});

test('local admin storage records and acknowledges publication events atomically', async () => {
  const storage = localStorage();
  await storage.createArticle({ id: 'article-1', title: 'Outbox draft' }, { actor: 'editor', action: 'create-draft' });
  await storage.updateArticle('article-1', { public_status: 'published' }, {
    expectedVersion: 1,
    actor: 'admin',
    action: 'publish',
  });

  const pending = await storage.listPublicationOutbox();
  assert.deepEqual(pending.map((entry) => entry.action), ['create-draft', 'publish']);
  assert.equal(pending[1].payload.article.public_status, 'published');

  const processed = await storage.markPublicationOutboxProcessed(pending[0].id, { now: '2026-07-12T00:01:00.000Z' });
  assert.equal(processed.processedAt, '2026-07-12T00:01:00.000Z');
  assert.deepEqual((await storage.listPublicationOutbox()).map((entry) => entry.action), ['publish']);
  assert.equal((await storage.listPublicationOutbox({ pendingOnly: false })).length, 2);
});
