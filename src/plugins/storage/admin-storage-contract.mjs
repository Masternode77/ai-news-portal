export const ADMIN_STORAGE_CAPABILITY = 'admin.storage';
export const PERMANENT_DELETE_CONFIRMATION_PREFIX = 'permanently-delete';

export class AdminStorageError extends Error {
  constructor(message, code = 'admin_storage_error', details = {}) {
    super(message);
    this.name = 'AdminStorageError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function utcTimestamp(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) throw new AdminStorageError('timestamp must be a valid date', 'invalid_timestamp');
  return date.toISOString();
}

export function permanentDeleteConfirmation(articleId) {
  const id = normalizeId(articleId);
  return `${PERMANENT_DELETE_CONFIRMATION_PREFIX}:${id}`;
}

export function assertPermanentDeleteConfirmation(articleId, confirmation) {
  const expected = permanentDeleteConfirmation(articleId);
  if (confirmation !== expected) {
    throw new AdminStorageError(`permanent delete requires confirmation token ${expected}`, 'delete_confirmation_required', { expected });
  }
}

export function normalizeId(id, field = 'id') {
  if (typeof id !== 'string' || id.trim() === '') throw new AdminStorageError(`${field} is required`, `invalid_${field}`);
  return id.trim();
}

export function normalizeActor(actor = 'system') {
  if (typeof actor === 'string') {
    const id = actor.trim();
    if (id === '') throw new AdminStorageError('actor is required', 'invalid_actor');
    return Object.freeze({ type: 'user', id });
  }
  if (!actor || typeof actor !== 'object') throw new AdminStorageError('actor is required', 'invalid_actor');
  const type = typeof actor.type === 'string' && actor.type.trim() !== '' ? actor.type.trim() : 'user';
  const id = normalizeId(actor.id, 'actor_id');
  return Object.freeze({ ...clone(actor), type, id });
}

export function validateExpectedVersion(article, expectedVersion) {
  if (expectedVersion === undefined) {
    throw new AdminStorageError('expectedVersion is required for article mutations', 'expected_version_required');
  }
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    throw new AdminStorageError('expectedVersion must be a non-negative integer', 'invalid_expected_version');
  }
  if (article.version !== expectedVersion) {
    throw new AdminStorageError(`expected article version ${expectedVersion}, found ${article.version}`, 'version_conflict', {
      expectedVersion,
      actualVersion: article.version,
    });
  }
}

export function normalizeArticle(input, { timestamp = utcTimestamp(), version = 1 } = {}) {
  if (!input || typeof input !== 'object') throw new AdminStorageError('article object is required', 'invalid_article');
  const id = normalizeId(input.id);
  if (!Number.isSafeInteger(version) || version < 1) throw new AdminStorageError('article version must be a positive integer', 'invalid_article_version');
  const article = {
    ...clone(input),
    id,
    version,
    deletedAt: input.deletedAt ?? null,
    deletedBy: input.deletedBy ?? null,
    createdAt: input.createdAt ?? timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
  return Object.freeze(article);
}

export function makeRevision({ article, revisionId, timestamp, actor, action, previousVersion = null }) {
  return Object.freeze({
    id: revisionId,
    articleId: article.id,
    version: article.version,
    previousVersion,
    action,
    actor: normalizeActor(actor),
    timestamp,
    article: clone(article),
  });
}

export function makeAuditEntry({ id, articleId, action, actor, timestamp, before = null, after = null, metadata = {} }) {
  return Object.freeze({
    id,
    articleId,
    action,
    actor: normalizeActor(actor),
    timestamp,
    before: clone(before),
    after: clone(after),
    metadata: clone(metadata),
  });
}

export function assertAdminStorageAdapter(adapter) {
  const required = [
    'transaction',
    'createArticle',
    'getArticle',
    'listArticles',
    'updateArticle',
    'softDeleteArticle',
    'restoreArticle',
    'permanentlyDeleteArticle',
    'listRevisions',
    'listAuditEntries',
    'createMedia',
    'listMedia',
    'listPublicationOutbox',
    'markPublicationOutboxProcessed',
  ];
  for (const method of required) {
    if (typeof adapter?.[method] !== 'function') {
      throw new AdminStorageError(`admin storage adapter is missing ${method}()`, 'invalid_adapter', { method });
    }
  }
  return adapter;
}
