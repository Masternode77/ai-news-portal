import { randomUUID } from 'node:crypto';
import { assertLegalTransition, isCanonicalState } from './lifecycle.mjs';
import { createTransitionRecord } from './transition-record.mjs';

export class InMemoryStorageError extends Error {
  constructor(message, code = 'memory_storage_error') {
    super(message);
    this.name = 'InMemoryStorageError';
    this.code = code;
  }
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function cloneSnapshot(snapshot) {
  return {
    articles: new Map([...snapshot.articles].map(([id, article]) => [id, clone(article)])),
    transitions: snapshot.transitions.map(clone),
    idempotency: new Map([...snapshot.idempotency].map(([key, value]) => [key, clone(value)])),
  };
}

function validateArticle(article) {
  if (!article || typeof article !== 'object' || typeof article.id !== 'string' || article.id.trim() === '') {
    throw new InMemoryStorageError('article id is required', 'invalid_article');
  }
  if (!isCanonicalState(article.state)) throw new InMemoryStorageError(`invalid article state ${String(article.state)}`, 'invalid_article_state');
  if (!Number.isSafeInteger(article.version) || article.version < 0) throw new InMemoryStorageError('article version must be a non-negative integer', 'invalid_article_version');
  return { ...clone(article), id: article.id.trim() };
}

class MemoryTransaction {
  #snapshot;
  #clock;
  #idGenerator;

  constructor(snapshot, { clock, idGenerator }) {
    this.#snapshot = snapshot;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  async insertArticle(article) {
    const validated = validateArticle(article);
    if (this.#snapshot.articles.has(validated.id)) throw new InMemoryStorageError(`article ${validated.id} already exists`, 'duplicate_article');
    this.#snapshot.articles.set(validated.id, validated);
    return clone(validated);
  }

  async getArticle(id) {
    return clone(this.#snapshot.articles.get(id) ?? null);
  }

  async transition(input) {
    const article = this.#snapshot.articles.get(input.articleId);
    if (!article) throw new InMemoryStorageError(`article ${input.articleId} was not found`, 'article_not_found');
    if (input.fromState !== undefined && input.fromState !== article.state) {
      throw new InMemoryStorageError(`expected article state ${input.fromState}, found ${article.state}`, 'state_conflict');
    }
    if (input.expectedArticleVersion !== undefined && input.expectedArticleVersion !== article.version) {
      throw new InMemoryStorageError(`expected article version ${input.expectedArticleVersion}, found ${article.version}`, 'version_conflict');
    }

    const restoredState = article.state === 'quarantined'
      ? article.quarantinedFrom
      : article.state === 'deleted'
        ? article.deletedFrom
        : undefined;
    assertLegalTransition(article.state, input.toState, { restoredState });
    const articleVersion = article.version + 1;
    if (input.articleVersion !== undefined && input.articleVersion !== articleVersion) {
      throw new InMemoryStorageError(`next article version must be ${articleVersion}`, 'version_conflict');
    }
    const record = createTransitionRecord({
      ...input,
      articleId: article.id,
      fromState: article.state,
      articleVersion,
    }, {
      id: input.id ?? this.#idGenerator(),
      timestamp: input.timestamp ?? this.#clock().toISOString(),
      restoredState,
    });

    const nextArticle = {
      ...article,
      state: input.toState,
      version: articleVersion,
      pipelineVersion: input.pipelineVersion,
      sourceVersion: input.sourceVersion,
    };
    if (input.toState === 'quarantined') nextArticle.quarantinedFrom = article.state;
    if (input.toState === 'deleted') nextArticle.deletedFrom = article.state;
    else if (article.state === 'deleted') delete nextArticle.deletedFrom;
    if (article.state === 'quarantined' && input.toState !== 'deleted') delete nextArticle.quarantinedFrom;
    this.#snapshot.articles.set(article.id, nextArticle);
    this.#snapshot.transitions.push(record);
    return clone(record);
  }

  async listTransitions({ articleId } = {}) {
    return clone(articleId
      ? this.#snapshot.transitions.filter((record) => record.articleId === articleId)
      : this.#snapshot.transitions);
  }

  async getIdempotency(key) {
    return clone(this.#snapshot.idempotency.get(key));
  }

  async putIdempotency(key, value) {
    if (typeof key !== 'string' || key.trim() === '') throw new InMemoryStorageError('idempotency key is required', 'invalid_idempotency_key');
    if (this.#snapshot.idempotency.has(key)) throw new InMemoryStorageError(`idempotency key ${key} already exists`, 'duplicate_idempotency_key');
    this.#snapshot.idempotency.set(key, clone(value));
    return clone(value);
  }
}

export class InMemoryStateStorage {
  #snapshot = { articles: new Map(), transitions: [], idempotency: new Map() };
  #queue = Promise.resolve();
  #clock;
  #idGenerator;

  constructor({ clock = () => new Date(), idGenerator = randomUUID } = {}) {
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  async transaction(work) {
    if (typeof work !== 'function') throw new InMemoryStorageError('transaction work must be a function', 'invalid_transaction');
    const previous = this.#queue;
    let release;
    this.#queue = new Promise((resolve) => { release = resolve; });
    await previous;
    const draft = cloneSnapshot(this.#snapshot);
    try {
      const result = await work(new MemoryTransaction(draft, { clock: this.#clock, idGenerator: this.#idGenerator }));
      const clonedResult = clone(result);
      this.#snapshot = draft;
      return clonedResult;
    } finally {
      release();
    }
  }

  async insertArticle(article) {
    return this.transaction((tx) => tx.insertArticle(article));
  }

  async getArticle(id) {
    await this.#queue;
    return clone(this.#snapshot.articles.get(id) ?? null);
  }

  async transition(input) {
    return this.transaction((tx) => tx.transition(input));
  }

  async listTransitions(query) {
    await this.#queue;
    return clone(query?.articleId
      ? this.#snapshot.transitions.filter((record) => record.articleId === query.articleId)
      : this.#snapshot.transitions);
  }

  async getIdempotency(key) {
    await this.#queue;
    return clone(this.#snapshot.idempotency.get(key));
  }
}
