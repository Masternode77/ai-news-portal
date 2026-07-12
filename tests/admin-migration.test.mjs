import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runAdminStorageMigrations } from '../scripts/migrate-admin-storage.mjs';

test('admin migration runner fails closed without a database connection', async () => {
  await assert.rejects(
    () => runAdminStorageMigrations({ databaseUrl: '', migrationDirectory: 'unused' }),
    /DATABASE_URL is required/,
  );
});

test('admin migration runner applies ordered SQL inside transactions', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'admin-migrations-'));
  await fs.writeFile(path.join(directory, '002_second.sql'), 'select 2;', 'utf8');
  await fs.writeFile(path.join(directory, '001_first.sql'), 'select 1;', 'utf8');
  const applied = [];
  const sqlClient = {
    async unsafe(sql, params = []) {
      applied.push(params.length ? `${sql.trim()}:${params.join(',')}` : sql.trim());
      return [];
    },
    async begin(work) {
      applied.push('begin');
      await work({ async unsafe(sql, params = []) { applied.push(params.length ? `${sql.trim()}:${params.join(',')}` : sql.trim()); } });
      applied.push('commit');
    },
  };

  try {
    const result = await runAdminStorageMigrations({ sqlClient, migrationDirectory: directory });
    assert.deepEqual(result.applied, ['001_first.sql', '002_second.sql']);
    assert.deepEqual(result.skipped, []);
    assert.equal(applied.filter((entry) => entry === 'begin').length, 2);
    assert.ok(applied.includes('select 1;'));
    assert.ok(applied.includes('select 2;'));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('admin migration runner skips versions already recorded in schema_migrations', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'admin-migrations-'));
  await fs.writeFile(path.join(directory, '001_first.sql'), 'select 1;', 'utf8');
  await fs.writeFile(path.join(directory, '002_second.sql'), 'select 2;', 'utf8');
  const executed = [];
  const sqlClient = {
    async unsafe(sql) {
      if (/select version/.test(sql)) return [{ version: '001_first.sql' }];
      return [];
    },
    async begin(work) {
      await work({ async unsafe(sql) { executed.push(sql.trim()); } });
    },
  };
  try {
    const result = await runAdminStorageMigrations({ sqlClient, migrationDirectory: directory });
    assert.deepEqual(result.applied, ['002_second.sql']);
    assert.deepEqual(result.skipped, ['001_first.sql']);
    assert.equal(executed.some((sql) => sql === 'select 1;'), false);
    assert.equal(executed.some((sql) => sql === 'select 2;'), true);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('admin schema matches auth, taxonomy, media, and publication contracts', async () => {
  const migration = await fs.readFile(path.resolve('migrations/001_admin_storage.sql'), 'utf8');
  assert.match(migration, /create table if not exists admin_sessions[\s\S]*role text not null[\s\S]*updated_at timestamptz/);
  assert.match(migration, /create table if not exists admin_article_categories/);
  assert.match(migration, /create table if not exists admin_article_tags/);
  assert.match(migration, /create table if not exists admin_article_entities/);
  assert.match(migration, /create table if not exists admin_media/);
  assert.match(migration, /create table if not exists admin_publication_outbox/);
  assert.doesNotMatch(migration, /values \('001_admin_storage'\)/);
});
