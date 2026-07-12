import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import {
  AdminStorageError,
  assertPermanentDeleteConfirmation,
  clone,
  makeAuditEntry,
  makeRevision,
  normalizeArticle,
  normalizeId,
  utcTimestamp,
  validateExpectedVersion,
} from './admin-storage-contract.mjs';

function postgresClient(databaseUrl) {
  const sql = postgres(databaseUrl, {
    max: Math.max(1, Number(process.env.ADMIN_DATABASE_POOL_SIZE) || 1),
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  const wrap = (client) => ({
    query(text, params = []) {
      return client.unsafe(text, params);
    },
  });
  return {
    ...wrap(sql),
    transaction(work) {
      return sql.begin((transaction) => work(wrap(transaction)));
    },
    end() {
      return sql.end({ timeout: 5 });
    },
  };
}

function ensureClient({ sqlClient, databaseUrl = process.env.DATABASE_URL } = {}) {
  if (sqlClient) return sqlClient;
  if (!databaseUrl) {
    throw new AdminStorageError('DATABASE_URL is required for postgres admin storage', 'database_url_required');
  }
  return postgresClient(databaseUrl);
}

async function query(client, text, params = []) {
  const result = typeof client === 'function'
    ? await client(text, params)
    : await client.query(text, params);
  if (Array.isArray(result)) return { rows: result };
  return result ?? { rows: [] };
}

function firstRow(result) {
  return result.rows?.[0] ?? null;
}

function rowArticle(row) {
  if (!row) return null;
  return clone(row.article ?? row.data ?? row);
}

class PostgresAdminStorageTransaction {
  #client;
  #clock;
  #idGenerator;

  constructor(client, { clock, idGenerator }) {
    this.#client = client;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  async #insertRevisionAndAudit({ article, before = null, action, actor, timestamp, metadata }) {
    const revision = makeRevision({
      revisionId: this.#idGenerator(),
      article,
      timestamp,
      actor,
      action,
      previousVersion: before?.version ?? null,
    });
    const auditEntry = makeAuditEntry({
      id: this.#idGenerator(),
      articleId: article.id,
      action,
      actor,
      timestamp,
      before,
      after: article,
      metadata,
    });
    await query(this.#client, `
      insert into admin_article_revisions
        (id, article_id, version, previous_version, action, actor, article, created_at)
      values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
    `, [
      revision.id,
      revision.articleId,
      revision.version,
      revision.previousVersion,
      revision.action,
      JSON.stringify(revision.actor),
      JSON.stringify(revision.article),
      revision.timestamp,
    ]);
    await query(this.#client, `
      insert into admin_audit_log
        (id, article_id, action, actor, before_article, after_article, metadata, created_at)
      values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8)
    `, [
      auditEntry.id,
      auditEntry.articleId,
      auditEntry.action,
      JSON.stringify(auditEntry.actor),
      JSON.stringify(auditEntry.before),
      JSON.stringify(auditEntry.after),
      JSON.stringify(auditEntry.metadata),
      auditEntry.timestamp,
    ]);
    await query(this.#client, `
      insert into admin_publication_outbox
        (id, article_id, action, article_version, payload, created_at)
      values ($1, $2, $3, $4, $5::jsonb, $6)
    `, [
      this.#idGenerator(),
      article.id,
      action,
      article.version,
      JSON.stringify({ article, deleted: Boolean(article.deletedAt) }),
      timestamp,
    ]);
  }

  async #getArticleForUpdate(id) {
    return rowArticle(firstRow(await query(this.#client, `
      select article
      from admin_articles
      where id = $1
      for update
    `, [normalizeId(id)])));
  }

  async createArticle(article, options = {}) {
    const timestamp = utcTimestamp(options.now ?? this.#clock());
    const normalized = normalizeArticle(article, { timestamp, version: 1 });
    const existing = firstRow(await query(this.#client, 'select id from admin_articles where id = $1', [normalized.id]));
    if (existing) throw new AdminStorageError(`article ${normalized.id} already exists`, 'duplicate_article');
    await query(this.#client, `
      insert into admin_articles (id, version, article, created_at, updated_at, deleted_at)
      values ($1, $2, $3::jsonb, $4, $5, $6)
    `, [
      normalized.id,
      normalized.version,
      JSON.stringify(normalized),
      normalized.createdAt,
      normalized.updatedAt,
      normalized.deletedAt,
    ]);
    await this.#insertRevisionAndAudit({
      article: normalized,
      action: options.action ?? 'create',
      actor: options.actor,
      timestamp,
      metadata: options.metadata,
    });
    return clone(normalized);
  }

  async getArticle(id, { includeDeleted = false } = {}) {
    const article = rowArticle(firstRow(await query(this.#client, 'select article from admin_articles where id = $1', [normalizeId(id)])));
    if (!article || (!includeDeleted && article.deletedAt)) return null;
    return clone(article);
  }

  async listArticles({ includeDeleted = false } = {}) {
    const result = await query(this.#client, `
      select article
      from admin_articles
      where ($1::boolean = true or deleted_at is null)
      order by id asc
    `, [includeDeleted]);
    return clone(result.rows.map(rowArticle));
  }

  async updateArticle(id, patch, options = {}) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new AdminStorageError('patch object is required', 'invalid_patch');
    }
    const before = await this.#getArticleForUpdate(id);
    const articleId = normalizeId(id);
    if (!before) throw new AdminStorageError(`article ${articleId} was not found`, 'article_not_found');
    if (before.deletedAt) throw new AdminStorageError(`article ${articleId} is deleted`, 'article_deleted');
    validateExpectedVersion(before, options.expectedVersion);
    const timestamp = utcTimestamp(options.now ?? this.#clock());
    const next = normalizeArticle({
      ...before,
      ...clone(patch),
      id: before.id,
      version: before.version + 1,
      createdAt: before.createdAt,
      updatedAt: timestamp,
      deletedAt: before.deletedAt,
      deletedBy: before.deletedBy,
    }, { timestamp, version: before.version + 1 });
    await query(this.#client, `
      update admin_articles
      set version = $2, article = $3::jsonb, updated_at = $4, deleted_at = $5
      where id = $1
    `, [next.id, next.version, JSON.stringify(next), next.updatedAt, next.deletedAt]);
    await this.#insertRevisionAndAudit({
      article: next,
      before,
      action: options.action ?? 'update',
      actor: options.actor,
      timestamp,
      metadata: options.metadata,
    });
    return clone(next);
  }

  async softDeleteArticle(id, options = {}) {
    const before = await this.#getArticleForUpdate(id);
    const articleId = normalizeId(id);
    if (!before) throw new AdminStorageError(`article ${articleId} was not found`, 'article_not_found');
    if (before.deletedAt) throw new AdminStorageError(`article ${articleId} is already deleted`, 'article_deleted');
    validateExpectedVersion(before, options.expectedVersion);
    const timestamp = utcTimestamp(options.now ?? this.#clock());
    const next = normalizeArticle({
      ...before,
      version: before.version + 1,
      updatedAt: timestamp,
      deletedAt: timestamp,
      deletedBy: options.actor ?? 'system',
    }, { timestamp, version: before.version + 1 });
    await query(this.#client, `
      update admin_articles
      set version = $2, article = $3::jsonb, updated_at = $4, deleted_at = $5
      where id = $1
    `, [next.id, next.version, JSON.stringify(next), next.updatedAt, next.deletedAt]);
    await this.#insertRevisionAndAudit({
      article: next,
      before,
      action: 'soft-delete',
      actor: options.actor,
      timestamp,
      metadata: options.metadata,
    });
    return clone(next);
  }

  async restoreArticle(id, options = {}) {
    const before = await this.#getArticleForUpdate(id);
    const articleId = normalizeId(id);
    if (!before) throw new AdminStorageError(`article ${articleId} was not found`, 'article_not_found');
    if (!before.deletedAt) throw new AdminStorageError(`article ${articleId} is not deleted`, 'article_not_deleted');
    validateExpectedVersion(before, options.expectedVersion);
    const timestamp = utcTimestamp(options.now ?? this.#clock());
    const next = normalizeArticle({
      ...before,
      version: before.version + 1,
      updatedAt: timestamp,
      deletedAt: null,
      deletedBy: null,
    }, { timestamp, version: before.version + 1 });
    await query(this.#client, `
      update admin_articles
      set version = $2, article = $3::jsonb, updated_at = $4, deleted_at = null
      where id = $1
    `, [next.id, next.version, JSON.stringify(next), next.updatedAt]);
    await this.#insertRevisionAndAudit({
      article: next,
      before,
      action: 'restore',
      actor: options.actor,
      timestamp,
      metadata: options.metadata,
    });
    return clone(next);
  }

  async permanentlyDeleteArticle(id, options = {}) {
    const articleId = normalizeId(id);
    assertPermanentDeleteConfirmation(articleId, options.confirmation);
    const before = await this.#getArticleForUpdate(articleId);
    if (!before) throw new AdminStorageError(`article ${articleId} was not found`, 'article_not_found');
    if (!before.deletedAt) throw new AdminStorageError(`article ${articleId} must be soft deleted first`, 'soft_delete_required');
    validateExpectedVersion(before, options.expectedVersion);
    const timestamp = utcTimestamp(options.now ?? this.#clock());
    await query(this.#client, 'delete from admin_articles where id = $1', [articleId]);
    const auditEntry = makeAuditEntry({
      id: this.#idGenerator(),
      articleId,
      action: 'permanent-delete',
      actor: options.actor,
      timestamp,
      before,
      after: null,
      metadata: { confirmationAccepted: true, ...clone(options.metadata ?? {}) },
    });
    await query(this.#client, `
      insert into admin_audit_log
        (id, article_id, action, actor, before_article, after_article, metadata, created_at)
      values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8)
    `, [
      auditEntry.id,
      auditEntry.articleId,
      auditEntry.action,
      JSON.stringify(auditEntry.actor),
      JSON.stringify(auditEntry.before),
      JSON.stringify(auditEntry.after),
      JSON.stringify(auditEntry.metadata),
      auditEntry.timestamp,
    ]);
    await query(this.#client, `
      insert into admin_publication_outbox
        (id, article_id, action, article_version, payload, created_at)
      values ($1, $2, 'permanent-delete', $3, $4::jsonb, $5)
    `, [this.#idGenerator(), articleId, before.version, JSON.stringify({ article: null, deleted: true }), timestamp]);
    return { id: articleId, deleted: true };
  }

  async listRevisions(id) {
    const result = await query(this.#client, `
      select id, article_id as "articleId", version, previous_version as "previousVersion", action, actor, article, created_at as timestamp
      from admin_article_revisions
      where article_id = $1
      order by version asc, created_at asc
    `, [normalizeId(id)]);
    return clone(result.rows);
  }

  async listAuditEntries({ articleId, action } = {}) {
    const result = await query(this.#client, `
      select id, article_id as "articleId", action, actor, before_article as before, after_article as after, metadata, created_at as timestamp
      from admin_audit_log
      where ($1::text is null or article_id = $1)
        and ($2::text is null or action = $2)
      order by created_at asc, id asc
    `, [articleId ?? null, action ?? null]);
    return clone(result.rows);
  }

  async createMedia(media, options = {}) {
    const timestamp = utcTimestamp(options.now ?? this.#clock());
    const id = normalizeId(media?.id, 'media_id');
    const articleId = normalizeId(media?.articleId, 'article_id');
    const record = { ...clone(media), id, articleId, createdAt: media.createdAt || timestamp };
    await query(this.#client, `
      insert into admin_media
        (id, article_id, object_key, content_type, byte_size, width, height, checksum, alt_text, metadata, created_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
    `, [id, articleId, record.objectKey, record.contentType, record.byteSize, record.width, record.height, record.checksum, record.altText || '', JSON.stringify(record.metadata || {}), record.createdAt]);
    const auditEntry = makeAuditEntry({
      id: this.#idGenerator(), articleId, action: 'media-upload', actor: options.actor, timestamp,
      before: null, after: record, metadata: options.metadata,
    });
    await query(this.#client, `
      insert into admin_audit_log
        (id, article_id, action, actor, before_article, after_article, metadata, created_at)
      values ($1, $2, $3, $4::jsonb, null, $5::jsonb, $6::jsonb, $7)
    `, [auditEntry.id, articleId, auditEntry.action, JSON.stringify(auditEntry.actor), JSON.stringify(record), JSON.stringify(auditEntry.metadata), timestamp]);
    return clone(record);
  }

  async listMedia({ articleId } = {}) {
    const result = await query(this.#client, `
      select id, article_id as "articleId", object_key as "objectKey", content_type as "contentType",
        byte_size as "byteSize", width, height, checksum, alt_text as "altText", metadata, created_at as "createdAt"
      from admin_media
      where ($1::text is null or article_id = $1)
      order by created_at asc, id asc
    `, [articleId || null]);
    return clone(result.rows);
  }

  async listPublicationOutbox({ pendingOnly = true, limit = 100 } = {}) {
    const safeLimit = Math.min(1000, Math.max(1, Number(limit) || 100));
    const result = await query(this.#client, `
      select id, article_id as "articleId", action, article_version as "articleVersion",
        payload, created_at as "createdAt", processed_at as "processedAt", processing_error as "processingError"
      from admin_publication_outbox
      where ($1::boolean = false or processed_at is null)
      order by created_at asc, id asc
      limit $2
    `, [pendingOnly, safeLimit]);
    return clone(result.rows);
  }

  async markPublicationOutboxProcessed(id, { error = null, now } = {}) {
    const timestamp = utcTimestamp(now ?? this.#clock());
    const result = await query(this.#client, `
      update admin_publication_outbox
      set processed_at = case when $2::text is null then $3 else null end,
        processing_error = $2
      where id = $1
      returning id, article_id as "articleId", action, article_version as "articleVersion",
        payload, created_at as "createdAt", processed_at as "processedAt", processing_error as "processingError"
    `, [normalizeId(id, 'outbox_id'), error ? String(error).slice(0, 2000) : null, timestamp]);
    const entry = firstRow(result);
    if (!entry) throw new AdminStorageError(`publication event ${id} was not found`, 'publication_event_not_found');
    return clone(entry);
  }
}

export class PostgresAdminStorage {
  #client;
  #clock;
  #idGenerator;

  constructor(options = {}) {
    this.#client = ensureClient(options);
    this.#clock = options.clock ?? (() => new Date());
    this.#idGenerator = options.idGenerator ?? randomUUID;
  }

  async transaction(work) {
    if (typeof work !== 'function') throw new AdminStorageError('transaction work must be a function', 'invalid_transaction');
    if (typeof this.#client.transaction === 'function') {
      return clone(await this.#client.transaction((client) => work(new PostgresAdminStorageTransaction(client, {
        clock: this.#clock,
        idGenerator: this.#idGenerator,
      }))));
    }
    await query(this.#client, 'begin');
    try {
      const result = await work(new PostgresAdminStorageTransaction(this.#client, {
        clock: this.#clock,
        idGenerator: this.#idGenerator,
      }));
      await query(this.#client, 'commit');
      return clone(result);
    } catch (error) {
      await query(this.#client, 'rollback');
      throw error;
    }
  }

  async createArticle(article, options) {
    return this.transaction((tx) => tx.createArticle(article, options));
  }

  async getArticle(id, options) {
    return new PostgresAdminStorageTransaction(this.#client, {
      clock: this.#clock,
      idGenerator: this.#idGenerator,
    }).getArticle(id, options);
  }

  async listArticles(options) {
    return new PostgresAdminStorageTransaction(this.#client, {
      clock: this.#clock,
      idGenerator: this.#idGenerator,
    }).listArticles(options);
  }

  async updateArticle(id, patch, options) {
    return this.transaction((tx) => tx.updateArticle(id, patch, options));
  }

  async softDeleteArticle(id, options) {
    return this.transaction((tx) => tx.softDeleteArticle(id, options));
  }

  async restoreArticle(id, options) {
    return this.transaction((tx) => tx.restoreArticle(id, options));
  }

  async permanentlyDeleteArticle(id, options) {
    return this.transaction((tx) => tx.permanentlyDeleteArticle(id, options));
  }

  async listRevisions(id) {
    return new PostgresAdminStorageTransaction(this.#client, {
      clock: this.#clock,
      idGenerator: this.#idGenerator,
    }).listRevisions(id);
  }

  async listAuditEntries(queryInput) {
    return new PostgresAdminStorageTransaction(this.#client, {
      clock: this.#clock,
      idGenerator: this.#idGenerator,
    }).listAuditEntries(queryInput);
  }

  async createMedia(media, options) {
    return this.transaction((tx) => tx.createMedia(media, options));
  }

  async listMedia(queryInput) {
    return new PostgresAdminStorageTransaction(this.#client, {
      clock: this.#clock,
      idGenerator: this.#idGenerator,
    }).listMedia(queryInput);
  }

  async listPublicationOutbox(queryInput) {
    return new PostgresAdminStorageTransaction(this.#client, {
      clock: this.#clock,
      idGenerator: this.#idGenerator,
    }).listPublicationOutbox(queryInput);
  }

  async markPublicationOutboxProcessed(id, options) {
    return this.transaction((tx) => tx.markPublicationOutboxProcessed(id, options));
  }

  async close() {
    if (typeof this.#client.end === 'function') await this.#client.end();
  }
}

export function createPostgresAdminStorage(options) {
  return new PostgresAdminStorage(options);
}
