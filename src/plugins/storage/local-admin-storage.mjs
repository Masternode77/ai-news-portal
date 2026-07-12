import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
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

const sharedStores = new Map();

function emptySnapshot() {
  return {
    articles: new Map(),
    revisions: [],
    audit: [],
    media: new Map(),
    publicationOutbox: [],
  };
}

function cloneSnapshot(snapshot) {
  return {
    articles: new Map([...snapshot.articles].map(([id, article]) => [id, clone(article)])),
    revisions: snapshot.revisions.map(clone),
    audit: snapshot.audit.map(clone),
    media: new Map([...snapshot.media].map(([id, media]) => [id, clone(media)])),
    publicationOutbox: snapshot.publicationOutbox.map(clone),
  };
}

function serializeSnapshot(snapshot) {
  return JSON.stringify({
    articles: [...snapshot.articles.values()],
    revisions: snapshot.revisions,
    audit: snapshot.audit,
    media: [...snapshot.media.values()],
    publicationOutbox: snapshot.publicationOutbox,
  }, null, 2);
}

function deserializeSnapshot(serialized) {
  const parsed = JSON.parse(serialized);
  const snapshot = emptySnapshot();
  for (const article of parsed.articles ?? []) snapshot.articles.set(article.id, article);
  snapshot.revisions = parsed.revisions ?? [];
  snapshot.audit = parsed.audit ?? [];
  for (const media of parsed.media ?? []) snapshot.media.set(media.id, media);
  snapshot.publicationOutbox = parsed.publicationOutbox ?? [];
  return snapshot;
}

function loadStore({ storageKey, filePath }) {
  const key = filePath ?? storageKey;
  if (!filePath && sharedStores.has(key)) return sharedStores.get(key);
  const snapshot = filePath && existsSync(filePath)
    ? deserializeSnapshot(readFileSync(filePath, 'utf8'))
    : emptySnapshot();
  const store = { key, filePath, snapshot, queue: Promise.resolve() };
  if (!filePath) sharedStores.set(key, store);
  return store;
}

function persistStore(store, snapshot) {
  if (!store.filePath) return;
  const directory = path.dirname(store.filePath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = `${store.filePath}.${process.pid}.${randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporary, 'w', 0o600);
    writeFileSync(descriptor, serializeSnapshot(snapshot), 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, store.filePath);
    const directoryDescriptor = openSync(directory, 'r');
    try {
      fsyncSync(directoryDescriptor);
    } finally {
      closeSync(directoryDescriptor);
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temporary, { force: true });
  }
}

function assertLocalPath(filePath) {
  if (!filePath) return;
  const resolved = path.resolve(filePath);
  for (const forbidden of ['src/data', 'public', 'dist'].map((entry) => path.resolve(entry))) {
    if (resolved === forbidden || resolved.startsWith(`${forbidden}${path.sep}`)) {
      throw new AdminStorageError('local admin storage must stay outside source and build artifacts', 'unsafe_local_storage_path');
    }
  }
}

function recordMutation(snapshot, { idGenerator, article, before = null, action, actor, timestamp, metadata }) {
  const revision = makeRevision({
    revisionId: idGenerator(),
    article,
    timestamp,
    actor,
    action,
    previousVersion: before?.version ?? null,
  });
  const auditEntry = makeAuditEntry({
    id: idGenerator(),
    articleId: article.id,
    action,
    actor,
    timestamp,
    before,
    after: article,
    metadata,
  });
  snapshot.revisions.push(revision);
  snapshot.audit.push(auditEntry);
  snapshot.publicationOutbox.push({
    id: idGenerator(),
    articleId: article.id,
    action,
    articleVersion: article.version,
    payload: { article: clone(article), deleted: Boolean(article.deletedAt) },
    createdAt: timestamp,
    processedAt: null,
    processingError: null,
  });
  return { revision, auditEntry };
}

class LocalAdminStorageTransaction {
  #snapshot;
  #clock;
  #idGenerator;

  constructor(snapshot, { clock, idGenerator }) {
    this.#snapshot = snapshot;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  async createArticle(article, options = {}) {
    const timestamp = utcTimestamp(options.now ?? this.#clock());
    const normalized = normalizeArticle(article, { timestamp, version: 1 });
    if (this.#snapshot.articles.has(normalized.id)) {
      throw new AdminStorageError(`article ${normalized.id} already exists`, 'duplicate_article');
    }
    this.#snapshot.articles.set(normalized.id, normalized);
    recordMutation(this.#snapshot, {
      idGenerator: this.#idGenerator,
      article: normalized,
      action: options.action ?? 'create',
      actor: options.actor,
      timestamp,
      metadata: options.metadata,
    });
    return clone(normalized);
  }

  async getArticle(id, { includeDeleted = false } = {}) {
    const article = this.#snapshot.articles.get(normalizeId(id));
    if (!article || (!includeDeleted && article.deletedAt)) return null;
    return clone(article);
  }

  async listArticles({ includeDeleted = false } = {}) {
    const articles = [...this.#snapshot.articles.values()]
      .filter((article) => includeDeleted || !article.deletedAt)
      .sort((a, b) => a.id.localeCompare(b.id));
    return clone(articles);
  }

  async updateArticle(id, patch, options = {}) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new AdminStorageError('patch object is required', 'invalid_patch');
    }
    const articleId = normalizeId(id);
    const before = this.#snapshot.articles.get(articleId);
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
    this.#snapshot.articles.set(articleId, next);
    recordMutation(this.#snapshot, {
      idGenerator: this.#idGenerator,
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
    const articleId = normalizeId(id);
    const before = this.#snapshot.articles.get(articleId);
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
    this.#snapshot.articles.set(articleId, next);
    recordMutation(this.#snapshot, {
      idGenerator: this.#idGenerator,
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
    const articleId = normalizeId(id);
    const before = this.#snapshot.articles.get(articleId);
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
    this.#snapshot.articles.set(articleId, next);
    recordMutation(this.#snapshot, {
      idGenerator: this.#idGenerator,
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
    const before = this.#snapshot.articles.get(articleId);
    if (!before) throw new AdminStorageError(`article ${articleId} was not found`, 'article_not_found');
    if (!before.deletedAt) throw new AdminStorageError(`article ${articleId} must be soft deleted first`, 'soft_delete_required');
    validateExpectedVersion(before, options.expectedVersion);
    const timestamp = utcTimestamp(options.now ?? this.#clock());
    this.#snapshot.articles.delete(articleId);
    this.#snapshot.audit.push(makeAuditEntry({
      id: this.#idGenerator(),
      articleId,
      action: 'permanent-delete',
      actor: options.actor,
      timestamp,
      before,
      after: null,
      metadata: { confirmationAccepted: true, ...clone(options.metadata ?? {}) },
    }));
    this.#snapshot.publicationOutbox.push({
      id: this.#idGenerator(),
      articleId,
      action: 'permanent-delete',
      articleVersion: before.version,
      payload: { article: null, deleted: true },
      createdAt: timestamp,
      processedAt: null,
      processingError: null,
    });
    return { id: articleId, deleted: true };
  }

  async listRevisions(id) {
    const articleId = normalizeId(id);
    return clone(this.#snapshot.revisions.filter((revision) => revision.articleId === articleId));
  }

  async listAuditEntries({ articleId, action } = {}) {
    return clone(this.#snapshot.audit
      .filter((entry) => articleId === undefined || entry.articleId === articleId)
      .filter((entry) => action === undefined || entry.action === action));
  }

  async createMedia(media, options = {}) {
    const timestamp = utcTimestamp(options.now ?? this.#clock());
    const id = normalizeId(media?.id, 'media_id');
    const articleId = normalizeId(media?.articleId, 'article_id');
    if (!this.#snapshot.articles.has(articleId)) throw new AdminStorageError(`article ${articleId} was not found`, 'article_not_found');
    if (this.#snapshot.media.has(id)) throw new AdminStorageError(`media ${id} already exists`, 'duplicate_media');
    const record = Object.freeze({ ...clone(media), id, articleId, createdAt: media.createdAt || timestamp });
    this.#snapshot.media.set(id, record);
    this.#snapshot.audit.push(makeAuditEntry({
      id: this.#idGenerator(), articleId, action: 'media-upload', actor: options.actor, timestamp,
      before: null, after: record, metadata: options.metadata,
    }));
    return clone(record);
  }

  async listMedia({ articleId } = {}) {
    return clone([...this.#snapshot.media.values()].filter((media) => !articleId || media.articleId === articleId));
  }

  async listPublicationOutbox({ pendingOnly = true, limit = 100 } = {}) {
    const safeLimit = Math.min(1000, Math.max(1, Number(limit) || 100));
    return clone(this.#snapshot.publicationOutbox
      .filter((entry) => !pendingOnly || !entry.processedAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, safeLimit));
  }

  async markPublicationOutboxProcessed(id, { error = null, now } = {}) {
    const outboxId = normalizeId(id, 'outbox_id');
    const entry = this.#snapshot.publicationOutbox.find((candidate) => candidate.id === outboxId);
    if (!entry) throw new AdminStorageError(`publication event ${outboxId} was not found`, 'publication_event_not_found');
    entry.processingError = error ? String(error).slice(0, 2000) : null;
    entry.processedAt = error ? null : utcTimestamp(now ?? this.#clock());
    return clone(entry);
  }
}

export class LocalAdminStorage {
  #store;
  #clock;
  #idGenerator;

  constructor({ storageKey = 'default', filePath, clock = () => new Date(), idGenerator = randomUUID } = {}) {
    assertLocalPath(filePath);
    this.#store = loadStore({ storageKey, filePath });
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  async transaction(work) {
    if (typeof work !== 'function') throw new AdminStorageError('transaction work must be a function', 'invalid_transaction');
    const previous = this.#store.queue;
    let release;
    this.#store.queue = new Promise((resolve) => { release = resolve; });
    await previous;
    const draft = cloneSnapshot(this.#store.snapshot);
    try {
      const result = await work(new LocalAdminStorageTransaction(draft, {
        clock: this.#clock,
        idGenerator: this.#idGenerator,
      }));
      const clonedResult = clone(result);
      persistStore(this.#store, draft);
      this.#store.snapshot = draft;
      return clonedResult;
    } finally {
      release();
    }
  }

  async createArticle(article, options) {
    return this.transaction((tx) => tx.createArticle(article, options));
  }

  async getArticle(id, options) {
    await this.#store.queue;
    return new LocalAdminStorageTransaction(this.#store.snapshot, {
      clock: this.#clock,
      idGenerator: this.#idGenerator,
    }).getArticle(id, options);
  }

  async listArticles(options) {
    await this.#store.queue;
    return new LocalAdminStorageTransaction(this.#store.snapshot, {
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
    await this.#store.queue;
    return new LocalAdminStorageTransaction(this.#store.snapshot, {
      clock: this.#clock,
      idGenerator: this.#idGenerator,
    }).listRevisions(id);
  }

  async listAuditEntries(query) {
    await this.#store.queue;
    return new LocalAdminStorageTransaction(this.#store.snapshot, {
      clock: this.#clock,
      idGenerator: this.#idGenerator,
    }).listAuditEntries(query);
  }

  async createMedia(media, options) {
    return this.transaction((tx) => tx.createMedia(media, options));
  }

  async listMedia(query) {
    await this.#store.queue;
    return new LocalAdminStorageTransaction(this.#store.snapshot, {
      clock: this.#clock,
      idGenerator: this.#idGenerator,
    }).listMedia(query);
  }

  async listPublicationOutbox(query) {
    await this.#store.queue;
    return new LocalAdminStorageTransaction(this.#store.snapshot, {
      clock: this.#clock,
      idGenerator: this.#idGenerator,
    }).listPublicationOutbox(query);
  }

  async markPublicationOutboxProcessed(id, options) {
    return this.transaction((tx) => tx.markPublicationOutboxProcessed(id, options));
  }
}

export function createLocalAdminStorage(options) {
  return new LocalAdminStorage(options);
}
