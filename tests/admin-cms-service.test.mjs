import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminCmsService } from '../src/admin/admin-cms-service.mjs';
import { createLocalAdminStorage, permanentDeleteConfirmation } from '../src/plugins/storage/index.mjs';

function fixture() {
  let id = 0;
  const clock = () => new Date('2026-07-12T12:00:00.000Z');
  const storage = createLocalAdminStorage({
    storageKey: `cms-service-${Math.random()}`,
    clock,
    idGenerator: () => `storage-${++id}`,
  });
  return {
    storage,
    service: createAdminCmsService({ storage, clock, idGenerator: () => '12345678-aaaa-bbbb-cccc-dddddddddddd' }),
    context: { actor: { id: 'editor', role: 'editor' }, sessionId: 'session-1', requestId: 'request-1', ip: '203.0.113.8' },
  };
}

test('CMS service creates, filters, previews, mutates, and audits without preview persistence', async () => {
  const { service, context } = fixture();
  const created = await service.createDraft({
    title: 'Grid queue changes procurement timing',
    bodyMarkdown: 'Original body',
    category: 'Power and Grid',
    source: 'Utility Dive',
    sourceUrl: 'https://example.com/grid',
    tags: 'grid, procurement',
  }, context);

  assert.equal(created.version, 1);
  assert.match(created.id, /^grid-queue-changes-procurement-timing-/);
  assert.deepEqual(created.tags, ['grid', 'procurement']);
  assert.equal((await service.listArticles({ q: 'utility', category: 'Power and Grid' })).length, 1);

  const preview = await service.mutateArticle(created.id, {
    action: 'preview',
    title: 'Preview-only headline',
    bodyMarkdown: 'Preview-only body',
  }, context);
  assert.equal(preview.preview.title, 'Preview-only headline');
  assert.equal(preview.preview.text, 'Preview-only body');
  assert.equal((await service.getArticle(created.id)).article.title, created.title);

  const saved = await service.mutateArticle(created.id, {
    action: 'save-draft',
    expectedVersion: 1,
    title: 'Saved headline',
    bodyMarkdown: 'Saved body',
  }, context);
  assert.equal(saved.article.version, 2);
  assert.equal(saved.article.title, 'Saved headline');

  await assert.rejects(
    () => service.mutateArticle(created.id, { action: 'save-draft', expectedVersion: 1, title: 'Stale' }, context),
    (error) => error.code === 'version_conflict',
  );

  const details = await service.getArticle(created.id);
  assert.deepEqual(details.revisions.map((item) => item.version), [1, 2]);
  assert.equal(details.audit.at(-1).metadata.requestId, 'request-1');
  assert.equal(details.audit.at(-1).actor.id, 'editor');
});

test('CMS service validates URLs and future schedules before persistence', async () => {
  const { service, context } = fixture();
  await assert.rejects(
    () => service.createDraft({ title: 'Unsafe URL', sourceUrl: 'javascript:alert(1)' }, context),
    (error) => error.code === 'invalid_url',
  );
  const created = await service.createDraft({ title: 'Schedule boundary', bodyMarkdown: 'Draft' }, context);
  await assert.rejects(
    () => service.mutateArticle(created.id, { action: 'schedule', expectedVersion: 1, scheduledAt: 'not-a-date' }, context),
    (error) => error.code === 'invalid_schedule',
  );
  await assert.rejects(
    () => service.mutateArticle(created.id, { action: 'schedule', expectedVersion: 1, scheduledAt: '2026-07-12T11:00:00Z' }, context),
    (error) => error.code === 'invalid_schedule',
  );
  const scheduled = await service.mutateArticle(created.id, {
    action: 'schedule',
    expectedVersion: 1,
    scheduledAt: '2026-07-13T11:00:00Z',
  }, context);
  assert.equal(scheduled.article.public_status, 'scheduled');
  assert.equal(scheduled.article.scheduledAt, '2026-07-13T11:00:00.000Z');
});

test('CMS service supports the complete deletion lifecycle with revision checks', async () => {
  const { service, context } = fixture();
  const created = await service.createDraft({ title: 'Deletion lifecycle' }, context);
  const deleted = await service.mutateArticle(created.id, { action: 'soft-delete', expectedVersion: 1 }, context);
  assert.ok(deleted.article.deletedAt);
  assert.equal((await service.listArticles()).length, 0);
  assert.equal((await service.listArticles({ includeDeleted: true })).length, 1);

  const restored = await service.mutateArticle(created.id, { action: 'restore', expectedVersion: 2 }, context);
  assert.equal(restored.article.deletedAt, null);
  const deletedAgain = await service.mutateArticle(created.id, { action: 'soft-delete', expectedVersion: 3 }, context);
  const permanent = await service.mutateArticle(created.id, {
    action: 'permanent-delete',
    expectedVersion: deletedAgain.article.version,
    confirmation: permanentDeleteConfirmation(created.id),
  }, context);
  assert.equal(permanent.deleted, true);
  await assert.rejects(() => service.getArticle(created.id), (error) => error.code === 'article_not_found');
});

test('CMS service can return more than 200 rows for authenticated dashboard aggregation', async () => {
  const { storage, service } = fixture();
  await storage.transaction(async (transaction) => {
    for (let index = 0; index < 225; index += 1) {
      await transaction.createArticle({ id: `bulk-${String(index).padStart(3, '0')}`, title: `Bulk ${index}` });
    }
  });
  assert.equal((await service.listArticles({ limit: 2000 })).length, 225);
});
