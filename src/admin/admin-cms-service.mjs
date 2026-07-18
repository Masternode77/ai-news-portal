import { randomUUID } from 'node:crypto';
import { applyAdminArticleAction } from '../../scripts/lib/admin-article-store.mjs';
import { regenerateAdminEditorial } from '../../scripts/lib/admin-editorial-regenerator.mjs';
import { AdminStorageError, assertAdminStorageAdapter } from '../plugins/storage/index.mjs';

function text(value) {
  return String(value ?? '').trim();
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(',').map(text).filter(Boolean);
}

function slug(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 56);
}

function optionalHttpUrl(value, field) {
  const candidate = text(value);
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('unsafe_url');
    return parsed.toString();
  } catch {
    throw new AdminStorageError(`${field} must be a public HTTP(S) URL`, 'invalid_url');
  }
}

function validateInputUrls(input = {}) {
  const next = { ...input };
  for (const field of ['sourceUrl', 'canonicalUrl']) {
    if (field in next) next[field] = optionalHttpUrl(next[field], field);
  }
  for (const field of ['sourceImage', 'generatedImage', 'heroImage', 'thumbnailImage', 'replacementImage']) {
    if (!(field in next)) continue;
    const value = text(next[field]);
    next[field] = value.startsWith('/') ? value : optionalHttpUrl(value, field);
  }
  return next;
}

function actorFromContext(context = {}) {
  return {
    type: 'user',
    id: text(context.actor?.id || context.actor || 'admin'),
    role: text(context.actor?.role || context.role || 'admin'),
    sessionId: text(context.sessionId),
  };
}

function metadataFromContext(context = {}) {
  return {
    ipHash: text(context.ipHash),
    sessionId: text(context.sessionId),
    requestId: text(context.requestId),
  };
}

function matches(article, query = {}) {
  if (!query.includeDeleted && article.deletedAt) return false;
  if (query.status && text(article.public_status).toLowerCase() !== text(query.status).toLowerCase()) return false;
  if (query.category && text(article.category).toLowerCase() !== text(query.category).toLowerCase()) return false;
  if (query.source && text(article.source).toLowerCase() !== text(query.source).toLowerCase()) return false;
  if (query.q) {
    const haystack = [article.id, article.title, article.summary, article.category, article.source, ...(article.tags || [])]
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(text(query.q).toLowerCase())) return false;
  }
  return true;
}

function isLiveArticle(article = {}) {
  return ['published', 'scheduled'].includes(text(article.public_status).toLowerCase())
    || article.articlePagePublished === true
    || article.homepagePublished === true;
}

export class AdminCmsService {
  constructor({
    storage,
    idGenerator = randomUUID,
    clock = () => new Date(),
    editorialRegenerator = regenerateAdminEditorial,
  }) {
    this.storage = assertAdminStorageAdapter(storage);
    this.idGenerator = idGenerator;
    this.clock = clock;
    this.editorialRegenerator = editorialRegenerator;
  }

  async listArticles(query = {}) {
    const rows = await this.storage.listArticles({ includeDeleted: query.includeDeleted === true });
    const limit = Math.min(2000, Math.max(1, Number(query.limit) || 100));
    return rows
      .filter((article) => matches(article, query))
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      .slice(0, limit);
  }

  async createDraft(input = {}, context = {}) {
    input = validateInputUrls(input);
    const title = text(input.title);
    if (!title) throw new AdminStorageError('article title is required', 'missing_title');
    const id = text(input.id) || `${slug(title) || 'article'}-${this.idGenerator().slice(0, 8)}`;
    const now = this.clock().toISOString();
    const inputFull = input.expertLensFull && typeof input.expertLensFull === 'object' && !Array.isArray(input.expertLensFull)
      ? structuredClone(input.expertLensFull)
      : {};
    const summary = text(input.summary || input.dek);
    const article = {
      ...structuredClone(input),
      id,
      title,
      summary,
      category: text(input.category),
      source: text(input.source),
      sourceUrl: text(input.sourceUrl),
      tags: list(input.tags),
      entities: list(input.entities),
      public_status: 'draft',
      draft: true,
      articlePagePublished: false,
      homepagePublished: false,
      scheduledAt: text(input.scheduledAt),
      expertLensFull: {
        ...inputFull,
        finalHeadline: text(inputFull.finalHeadline || title),
        metaDescription: text(inputFull.metaDescription || summary),
        finalArticleBody: text(input.bodyMarkdown || input.finalArticleBody || inputFull.finalArticleBody),
      },
      updatedAt: now,
    };
    return this.storage.createArticle(article, {
      action: 'create-draft',
      actor: actorFromContext(context),
      metadata: metadataFromContext(context),
    });
  }

  async getArticle(id, { includeDeleted = false } = {}) {
    const article = await this.storage.getArticle(id, { includeDeleted });
    if (!article) throw new AdminStorageError(`article ${id} was not found`, 'article_not_found');
    const [revisions, audit] = await Promise.all([
      this.storage.listRevisions(id),
      this.storage.listAuditEntries({ articleId: id }),
    ]);
    return { article, revisions, audit };
  }

  async mutateArticle(id, input = {}, context = {}) {
    input = validateInputUrls(input);
    const action = text(input.action || 'save-draft');
    const expectedVersion = Number(input.expectedVersion ?? input.version);
    if (action !== 'preview' && (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)) {
      throw new AdminStorageError('expectedVersion is required for article mutations', 'expected_version_required');
    }
    const versionOptions = Number.isSafeInteger(expectedVersion) && expectedVersion >= 0
      ? { expectedVersion }
      : {};
    const actor = actorFromContext(context);
    const metadata = metadataFromContext(context);

    if (action === 'schedule') {
      const scheduledAt = new Date(input.scheduledAt || '');
      if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= this.clock().getTime()) {
        throw new AdminStorageError('scheduledAt must be a valid future timestamp', 'invalid_schedule');
      }
      input.scheduledAt = scheduledAt.toISOString();
    }

    if (action === 'soft-delete') {
      return { ok: true, article: await this.storage.softDeleteArticle(id, { ...versionOptions, actor, metadata }) };
    }
    if (action === 'restore') {
      return { ok: true, article: await this.storage.restoreArticle(id, { ...versionOptions, actor, metadata }) };
    }
    if (action === 'permanent-delete') {
      const result = await this.storage.permanentlyDeleteArticle(id, {
        ...versionOptions,
        actor,
        metadata,
        confirmation: input.confirmation,
      });
      return { ok: true, ...result };
    }

    const current = await this.storage.getArticle(id, { includeDeleted: true });
    if (!current) throw new AdminStorageError(`article ${id} was not found`, 'article_not_found');
    if (current.deletedAt) throw new AdminStorageError(`article ${id} is deleted`, 'article_deleted');
    if (action !== 'preview' && current.version !== expectedVersion) {
      throw new AdminStorageError(
        `article version conflict: expected ${expectedVersion}, found ${current.version}`,
        'version_conflict',
      );
    }
    if (actor.role === 'editor' && action !== 'preview' && isLiveArticle(current)) {
      throw new AdminStorageError('Editors cannot mutate live or scheduled articles', 'admin_action_forbidden');
    }
    if (['regenerate-article', 'regenerate-brief'].includes(action)) {
      try {
        const recentArticles = await this.storage.listArticles({ includeDeleted: false });
        const regenerationPatch = await this.editorialRegenerator({
          article: structuredClone(current),
          type: action === 'regenerate-brief' ? 'brief' : 'article',
          prompt: text(input.editPrompt || input.prompt),
          recentArticles,
        });
        input = { ...input, ...regenerationPatch };
      } catch (error) {
        if (error instanceof AdminStorageError) throw error;
        throw new AdminStorageError(
          'Editorial regeneration failed its source or quality checks',
          text(error?.code) || 'editorial_regeneration_failed',
        );
      }
    }
    const result = applyAdminArticleAction({
      article: current,
      patch: input,
      action,
      actor: actor.id,
      now: this.clock().toISOString(),
    });
    if (!result.ok) return result;
    if (action === 'preview') {
      return {
        ...result,
        preview: {
          ...result.preview,
          text: text(
            result.article.expertLensFull?.finalArticleBody
              || result.article.bodyMarkdown
              || result.article.articleText
              || result.article.contentText,
          ),
        },
      };
    }
    const article = await this.storage.updateArticle(id, result.article, {
      ...versionOptions,
      action,
      actor,
      metadata,
    });
    return { ...result, article };
  }

  async listAudit(query = {}) {
    const rows = await this.storage.listAuditEntries(query);
    return rows.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || ''))).slice(0, 500);
  }
}

export function createAdminCmsService(options) {
  return new AdminCmsService(options);
}
