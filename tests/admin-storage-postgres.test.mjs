import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AdminStorageError,
  createPostgresAdminStorage,
} from '../src/plugins/storage/index.mjs';

function queryClient(handler) {
  const calls = [];
  return {
    calls,
    async query(text, params = []) {
      calls.push({ text: text.trim(), params });
      return handler?.(text, params, calls) ?? { rows: [] };
    },
  };
}

test('postgres admin storage fails closed without DATABASE_URL or injected SQL client', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    assert.throws(
      () => createPostgresAdminStorage(),
      (error) => error instanceof AdminStorageError && error.code === 'database_url_required',
    );
  } finally {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

test('storage factory refuses local persistence in production', async () => {
  const { createAdminStorage } = await import('../src/plugins/storage/index.mjs');
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.throws(
      () => createAdminStorage({ provider: 'local' }),
      (error) => error instanceof AdminStorageError && error.code === 'production_storage_required',
    );
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('postgres admin storage uses an injected SQL client and wraps mutations in a transaction', async () => {
  let id = 0;
  const client = queryClient((text, params) => {
    if (/select id from admin_articles/.test(text)) return { rows: [] };
    if (/insert into admin_articles/.test(text)) {
      assert.equal(params[0], 'article-1');
      assert.equal(params[1], 1);
      assert.equal(JSON.parse(params[2]).title, 'Postgres-backed draft');
    }
    return { rows: [] };
  });
  const storage = createPostgresAdminStorage({
    sqlClient: client,
    clock: () => new Date('2026-07-12T01:00:00.000Z'),
    idGenerator: () => `pg-id-${++id}`,
  });

  const created = await storage.createArticle({ id: 'article-1', title: 'Postgres-backed draft' }, { actor: 'editor' });

  assert.equal(created.version, 1);
  assert.equal(client.calls[0].text, 'begin');
  assert.equal(client.calls.at(-1).text, 'commit');
  assert.ok(client.calls.some((call) => /insert into admin_article_revisions/.test(call.text)));
  assert.ok(client.calls.some((call) => /insert into admin_audit_log/.test(call.text)));
  assert.ok(client.calls.some((call) => /insert into admin_publication_outbox/.test(call.text)));
});

test('postgres admin storage rolls back injected-client transactions on failure', async () => {
  const client = queryClient((text) => {
    if (/select id from admin_articles/.test(text)) return { rows: [] };
    if (/insert into admin_article_revisions/.test(text)) throw new Error('revision write failed');
    return { rows: [] };
  });
  const storage = createPostgresAdminStorage({
    sqlClient: client,
    clock: () => new Date('2026-07-12T01:00:00.000Z'),
  });

  await assert.rejects(
    () => storage.createArticle({ id: 'article-1', title: 'Rollback' }, { actor: 'editor' }),
    /revision write failed/,
  );

  assert.equal(client.calls[0].text, 'begin');
  assert.equal(client.calls.at(-1).text, 'rollback');
});

test('postgres admin storage read methods support injected SQL rows', async () => {
  const client = queryClient((text) => {
    if (/select article from admin_articles where id = \$1/.test(text)) {
      return { rows: [{ article: { id: 'article-1', version: 2, title: 'Read row', deletedAt: null } }] };
    }
    if (/from admin_article_revisions/.test(text)) {
      return { rows: [{ id: 'rev-1', articleId: 'article-1', version: 1 }] };
    }
    return { rows: [] };
  });
  const storage = createPostgresAdminStorage({ sqlClient: client });

  assert.equal((await storage.getArticle('article-1')).title, 'Read row');
  assert.deepEqual(await storage.listRevisions('article-1'), [{ id: 'rev-1', articleId: 'article-1', version: 1 }]);
});
