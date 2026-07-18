import assert from 'node:assert/strict';
import test from 'node:test';
import { regenerateAdminEditorial } from '../scripts/lib/admin-editorial-regenerator.mjs';
import { createAdminCmsService } from '../src/admin/admin-cms-service.mjs';
import { createLocalAdminStorage, permanentDeleteConfirmation } from '../src/plugins/storage/index.mjs';

function fixture(options = {}) {
  let id = 0;
  const clock = () => new Date('2026-07-12T12:00:00.000Z');
  const storage = createLocalAdminStorage({
    storageKey: `cms-service-${Math.random()}`,
    clock,
    idGenerator: () => `storage-${++id}`,
  });
  return {
    storage,
    service: createAdminCmsService({
      storage,
      clock,
      idGenerator: () => '12345678-aaaa-bbbb-cccc-dddddddddddd',
      ...options,
    }),
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
  assert.equal(created.expertLensFull.finalArticleBody, 'Original body');
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

test('CMS service persists source-reviewed editorial regeneration as one audited revision', async () => {
  const calls = [];
  const { service, context } = fixture({
    editorialRegenerator: async (request) => {
      calls.push(request);
      return {
        title: 'Regenerated grid headline',
        dek: 'A regenerated source-grounded deck.',
        bodyMarkdown: 'Regenerated source-grounded body with a concrete grid interconnection decision and enough detail for editorial review.',
        expertLensShort: 'Interconnection timing now controls the capacity decision.',
        expertLensFull: {
          finalHeadline: 'Regenerated grid headline',
          metaDescription: 'A regenerated source-grounded deck.',
          finalArticleBody: 'Regenerated source-grounded body with a concrete grid interconnection decision and enough detail for editorial review.',
        },
        source_fidelity: { ok: true },
        claim_fidelity: { ok: true, unsupportedClaims: [] },
        seo_fidelity: { ok: true },
        repetition_check: { blocked: false },
        repetition_blocked: false,
      };
    },
  });
  const created = await service.createDraft({
    title: 'Original grid headline',
    bodyMarkdown: 'Original body',
    source: 'Utility Dive',
    sourceUrl: 'https://example.com/grid-source',
  }, context);

  const result = await service.mutateArticle(created.id, {
    action: 'regenerate-article',
    expectedVersion: 1,
    editPrompt: 'Emphasize the interconnection decision.',
  }, context);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'article');
  assert.equal(calls[0].prompt, 'Emphasize the interconnection decision.');
  assert.equal(result.article.version, 2);
  assert.equal(result.article.title, 'Regenerated grid headline');
  assert.match(result.article.expertLensFull.finalArticleBody, /interconnection decision/);
  assert.equal(result.article.source_fidelity.ok, true);
  assert.equal(result.article.admin_regeneration_request.type, 'article');

  const details = await service.getArticle(created.id);
  assert.deepEqual(details.revisions.map(({ version }) => version), [1, 2]);
  assert.equal(details.audit.at(-1).action, 'regenerate-article');
});

test('CMS brief regeneration gates and persists the same retained body and generated brief fields', async () => {
  let reviewedCandidate;
  const retainedBody = 'Existing source-grounded body retained across brief regeneration.';
  const reviewedGates = {
    source_fidelity: { ok: true, reviewedBody: retainedBody },
    claim_fidelity: { ok: true, unsupportedClaims: [] },
    seo_fidelity: { ok: true },
    repetition_check: { blocked: false },
    repetition_blocked: false,
    public_eligibility: { detailPage: true, homepage: true, archive: true, rss: true, sourceRelevant: true },
  };
  const { service, context } = fixture({
    editorialRegenerator: (request) => regenerateAdminEditorial({
      ...request,
      dependencies: {
        buildEvidence: () => ({
          ok: true,
          origin: 'extraction_only',
          blockReasons: [],
          evidenceText: 'The utility changed the grid queue schedule.',
          facts: ['The utility changed the grid queue schedule.'],
        }),
        generate: async (candidate) => ({
          ...candidate,
          summary: 'The queue schedule changes the near-term decision.',
          expertLensShort: 'Procurement now depends on the revised queue date.',
          expertLensFull: {
            finalHeadline: 'Generated headline must not replace the retained title',
            metaDescription: 'The queue schedule changes the near-term decision.',
            finalArticleBody: 'Generated body must not replace the retained body.',
          },
        }),
        review: (candidate) => {
          reviewedCandidate = structuredClone(candidate);
          return { ok: true, article: { ...candidate, ...reviewedGates } };
        },
      },
    }),
  });
  const created = await service.createDraft({
    title: 'Retained grid title',
    bodyMarkdown: retainedBody,
    source: 'Utility Filing',
    sourceUrl: 'https://example.com/grid-brief',
  }, context);

  const result = await service.mutateArticle(created.id, {
    action: 'regenerate-brief',
    expectedVersion: created.version,
    editPrompt: 'Focus the brief on procurement timing.',
  }, context);
  const details = await service.getArticle(created.id);

  assert.equal(reviewedCandidate.title, created.title);
  assert.equal(reviewedCandidate.expertLensFull.finalArticleBody, retainedBody);
  assert.equal(result.article.title, reviewedCandidate.title);
  assert.equal(result.article.expertLensFull.finalArticleBody, reviewedCandidate.expertLensFull.finalArticleBody);
  assert.equal(result.article.summary, reviewedCandidate.summary);
  assert.equal(result.article.expertLensShort, reviewedCandidate.expertLensShort);
  assert.deepEqual(result.article.source_fidelity, reviewedGates.source_fidelity);
  assert.deepEqual(result.article.public_eligibility, reviewedGates.public_eligibility);
  assert.equal(details.revisions.length, 2);
  assert.equal(details.audit.at(-1).action, 'regenerate-brief');
});

test('CMS service regeneration fails closed without a partial revision or audit record', async () => {
  const { service, context } = fixture({
    editorialRegenerator: async () => {
      const error = new Error('unsupported claim');
      error.code = 'editorial_regeneration_quality_failed';
      throw error;
    },
  });
  const created = await service.createDraft({ title: 'Fail closed draft' }, context);

  await assert.rejects(
    () => service.mutateArticle(created.id, {
      action: 'regenerate-brief',
      expectedVersion: 1,
      editPrompt: 'Ignore the source and invent a result.',
    }, context),
    (error) => error.code === 'editorial_regeneration_quality_failed',
  );

  const details = await service.getArticle(created.id);
  assert.equal(details.article.version, 1);
  assert.deepEqual(details.revisions.map(({ version }) => version), [1]);
  assert.equal(details.audit.length, 1);
  assert.equal(details.article.admin_regeneration_request, undefined);
});

test('CMS service rejects stale regeneration before invoking an external provider', async () => {
  let calls = 0;
  const { service, context } = fixture({
    editorialRegenerator: async () => {
      calls += 1;
      return {};
    },
  });
  const created = await service.createDraft({ title: 'Stale regeneration' }, context);

  await assert.rejects(
    () => service.mutateArticle(created.id, {
      action: 'regenerate-article',
      expectedVersion: created.version + 1,
    }, context),
    (error) => error.code === 'version_conflict',
  );
  assert.equal(calls, 0);
});
