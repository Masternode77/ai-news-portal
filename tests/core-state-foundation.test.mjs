import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CANONICAL_STATES,
  InMemoryStateStorage,
  LifecycleTransitionError,
  createTransitionRecord,
  isLegalTransition,
  validateTransitionRecord,
} from '../src/core/state/index.mjs';

const transitionFields = {
  id: 'transition-1',
  articleId: 'article-1',
  fromState: 'discovered',
  toState: 'fetched',
  actor: { type: 'service', id: 'pipeline' },
  timestamp: '2026-07-11T00:00:00.000Z',
  reason: { code: 'source_fetched', detail: 'Source response met the fetch contract.' },
  pipelineVersion: '5.6.0',
  sourceVersion: 'source-etag-1',
  articleVersion: 1,
  idempotencyKey: 'cycle-1:ingest:article-1',
  correlationId: 'correlation-1',
};

test('canonical lifecycle exposes the documented states and fails closed on illegal transitions', () => {
  assert.deepEqual(CANONICAL_STATES.slice(0, 4), ['discovered', 'fetched', 'extracted', 'extraction_failed']);
  assert.equal(isLegalTransition('discovered', 'fetched'), true);
  assert.equal(isLegalTransition('clean_source', 'editorial_candidate'), true);
  assert.equal(isLegalTransition('publish_ready', 'source_signal'), true);
  assert.equal(isLegalTransition('extraction_failed', 'fetched'), true);
  assert.equal(isLegalTransition('review_failed', 'drafting'), true);
  assert.equal(isLegalTransition('published', 'deleted'), true);
  assert.equal(isLegalTransition('published', 'drafting'), false);
  assert.equal(isLegalTransition('deleted', 'discovered'), false);
});

test('transition records require complete provenance and return an immutable normalized record', () => {
  const record = createTransitionRecord(transitionFields);
  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(record.actor), true);
  assert.equal(record.articleVersion, 1);
  assert.throws(() => validateTransitionRecord({ ...transitionFields, correlationId: '' }), /correlationId/);
  assert.throws(() => validateTransitionRecord({ ...transitionFields, timestamp: 'July 11' }), /ISO UTC/);
  assert.throws(() => validateTransitionRecord({ ...transitionFields, toState: 'published' }), LifecycleTransitionError);
});

test('memory storage atomically updates state and appends a complete transition record', async () => {
  const storage = new InMemoryStateStorage({
    clock: () => new Date('2026-07-11T00:00:00.000Z'),
    idGenerator: () => 'transition-1',
  });
  await storage.insertArticle({ id: 'article-1', state: 'discovered', version: 0, title: 'Power queue expands' });

  const record = await storage.transition({
    articleId: 'article-1',
    toState: 'fetched',
    actor: 'pipeline',
    reason: transitionFields.reason,
    pipelineVersion: '5.6.0',
    sourceVersion: 'source-etag-1',
    expectedArticleVersion: 0,
    idempotencyKey: 'cycle-1:ingest:article-1',
    correlationId: 'correlation-1',
  });

  assert.equal((await storage.getArticle('article-1')).state, 'fetched');
  assert.equal((await storage.getArticle('article-1')).version, 1);
  assert.deepEqual(await storage.listTransitions(), [record]);

  record.reason.detail = 'mutated outside storage';
  assert.equal((await storage.listTransitions())[0].reason.detail, transitionFields.reason.detail);
});

test('memory transactions roll back article and transition changes when work fails', async () => {
  const storage = new InMemoryStateStorage({ idGenerator: () => 'transition-rollback' });
  await storage.insertArticle({ id: 'article-1', state: 'discovered', version: 0 });

  await assert.rejects(() => storage.transaction(async (tx) => {
    assert.equal(tx.snapshot, undefined);
    await tx.transition({
      articleId: 'article-1',
      toState: 'fetched',
      actor: 'pipeline',
      reason: transitionFields.reason,
      pipelineVersion: '5.6.0',
      sourceVersion: 'source-etag-1',
      idempotencyKey: 'rollback-key',
      correlationId: 'correlation-rollback',
    });
    throw new Error('provider failed');
  }), /provider failed/);

  assert.equal((await storage.getArticle('article-1')).state, 'discovered');
  assert.deepEqual(await storage.listTransitions(), []);
});

test('quarantine can restore only the captured prior state', async () => {
  let id = 0;
  const storage = new InMemoryStateStorage({ idGenerator: () => `transition-${++id}` });
  await storage.insertArticle({ id: 'article-1', state: 'clean_source', version: 4 });
  const base = {
    articleId: 'article-1',
    actor: 'quality-gate',
    reason: { code: 'manual_review', detail: 'A source claim requires review.' },
    pipelineVersion: '5.6.0',
    sourceVersion: 'source-4',
    correlationId: 'correlation-quarantine',
  };

  await storage.transition({ ...base, toState: 'quarantined', idempotencyKey: 'quarantine' });
  await assert.rejects(() => storage.transition({ ...base, toState: 'fetched', idempotencyKey: 'bad-restore' }), /illegal lifecycle transition/);
  await storage.transition({ ...base, toState: 'clean_source', idempotencyKey: 'restore' });

  assert.equal((await storage.getArticle('article-1')).state, 'clean_source');
  assert.equal((await storage.listTransitions({ articleId: 'article-1' })).length, 2);
});

test('deleted is a restorable soft-delete state while physical deletion remains outside lifecycle transitions', async () => {
  let id = 0;
  const storage = new InMemoryStateStorage({ idGenerator: () => `delete-transition-${++id}` });
  await storage.insertArticle({ id: 'article-1', state: 'published', version: 7 });
  const base = {
    articleId: 'article-1',
    actor: { type: 'user', id: 'admin' },
    reason: { code: 'admin_soft_delete', detail: 'The editor removed this item from public discovery.' },
    pipelineVersion: '5.6.0',
    sourceVersion: 'source-7',
    correlationId: 'correlation-delete',
  };

  await storage.transition({ ...base, toState: 'deleted', idempotencyKey: 'delete' });
  assert.equal((await storage.getArticle('article-1')).deletedFrom, 'published');
  await assert.rejects(() => storage.transition({ ...base, toState: 'drafting', idempotencyKey: 'bad-restore' }), /illegal lifecycle transition/);
  await storage.transition({ ...base, toState: 'published', idempotencyKey: 'restore' });

  const restored = await storage.getArticle('article-1');
  assert.equal(restored.state, 'published');
  assert.equal('deletedFrom' in restored, false);
});
