import { summarizeAdminAuditChange } from './admin-audit-log.mjs';
import { finalPublicationIntegrityResult, publicationIntegritySnapshot } from './final-publication-integrity.mjs';

function clone(value) {
  return structuredClone(value ?? {});
}

function text(value) {
  return String(value ?? '').trim();
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return String(value ?? '').split(',').map(text).filter(Boolean);
}

const COPY_FIELDS = new Set([
  'title',
  'dek',
  'summary',
  'bodyMarkdown',
  'finalArticleBody',
  'expertLensShort',
  'category',
  'region',
  'source',
  'sourceUrl',
  'canonicalUrl',
  'sourceImage',
  'generatedImage',
  'heroImage',
  'thumbnailImage',
  'imageAlt',
  'imagePrompt',
  'publishedAt',
  'metaDescription',
  'tags',
]);

const ACTION_FIELDS = Object.freeze({
  'save-draft': COPY_FIELDS,
  publish: COPY_FIELDS,
  preview: COPY_FIELDS,
  'upload-image': new Set(['replacementImage', 'heroImage', 'generatedImage', 'thumbnailImage', 'imageAlt']),
  hide: new Set(),
  noindex: new Set(),
  unpublish: new Set(),
});

function nowIso(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function bodyText(article = {}) {
  return text(article.expertLensFull?.finalArticleBody || article.fullArticleText || article.articleText || article.contentText || article.snippet);
}

function searchText(article = {}) {
  return [
    article.title,
    article.deck,
    article.summary,
    article.category,
    article.source,
    article.sourceUrl,
    article.canonicalUrl,
    article.expertLensShort,
    article.expertLensFull?.finalHeadline,
    article.expertLensFull?.finalArticleBody,
    ...(article.tags || []),
  ].filter(Boolean).join(' ');
}

function applyPatch(article = {}, patch = {}, fields = new Set()) {
  const next = clone(article);
  next.expertLensFull = { ...(next.expertLensFull || {}) };
  if (fields.has('title') && 'title' in patch) {
    next.title = text(patch.title);
    next.expertLensFull.finalHeadline = text(patch.title);
  }
  if ((fields.has('dek') && 'dek' in patch) || (fields.has('summary') && 'summary' in patch)) {
    const dek = text(patch.dek ?? patch.summary);
    next.deck = dek;
    next.summary = dek;
    next.expertLensFull.metaDescription = text(patch.metaDescription || dek);
  }
  if ((fields.has('bodyMarkdown') && 'bodyMarkdown' in patch) || (fields.has('finalArticleBody') && 'finalArticleBody' in patch)) {
    next.expertLensFull.finalArticleBody = text(patch.bodyMarkdown ?? patch.finalArticleBody);
  }
  if (fields.has('expertLensShort') && 'expertLensShort' in patch) {
    next.expertLensShort = text(patch.expertLensShort);
    next.expertLens = text(patch.expertLensShort);
    next.expertLensFull.thesis = text(patch.expertLensShort);
  }
  for (const field of ['category', 'region', 'source', 'sourceUrl', 'canonicalUrl', 'sourceImage', 'generatedImage', 'heroImage', 'thumbnailImage', 'imageAlt', 'imagePrompt', 'publishedAt']) {
    if (fields.has(field) && field in patch) next[field] = text(patch[field]);
  }
  if (fields.has('metaDescription') && 'metaDescription' in patch) next.expertLensFull.metaDescription = text(patch.metaDescription);
  if (fields.has('tags') && 'tags' in patch) next.tags = normalizeTags(patch.tags);
  return next;
}

export function validateAdminPublishQuality(article = {}, { recentRecords = [], sourceRegistry, sourceRegistrySha, now } = {}) {
  return finalPublicationIntegrityResult(article, recentRecords, { sourceRegistry, sourceRegistrySha, now }).reasons;
}

export function isSupportedAdminArticleAction(action = '') {
  return Object.hasOwn(ACTION_FIELDS, action);
}

function applyAction(next, action, patch, actor, timestamp) {
  if (action === 'publish') {
    next.public_status = 'published';
    next.draft = false;
    next.noindex = false;
    next.seo_noindex = false;
    next.hidden = false;
    next.articlePagePublished = true;
    next.homepagePublished = true;
    next.publishedAt = text(patch.publishedAt) || next.publishedAt || timestamp;
  } else if (action === 'save-draft' || action === 'unpublish') {
    next.public_status = 'draft';
    next.draft = true;
    next.articlePagePublished = false;
    next.homepagePublished = false;
  } else if (action === 'hide') {
    next.public_status = 'hidden';
    next.hidden = true;
    next.noindex = true;
    next.seo_noindex = true;
    next.articlePagePublished = false;
    next.homepagePublished = false;
  } else if (action === 'noindex') {
    next.public_status = 'noindex';
    next.noindex = true;
    next.seo_noindex = true;
    next.homepagePublished = false;
  } else if (action === 'upload-image') {
    const replacement = text(patch.replacementImage || patch.heroImage || patch.generatedImage);
    if (replacement) {
      next.heroImage = replacement;
      next.thumbnailImage = text(patch.thumbnailImage) || replacement;
      next.generatedImage = replacement;
    }
    if ('imageAlt' in patch) next.imageAlt = text(patch.imageAlt);
  }
}

export function applyAdminArticleAction({ article = {}, patch = {}, action = 'save-draft', actor = 'admin', now = new Date().toISOString(), commitSha = '', recentRecords = [], sourceRegistry, sourceRegistrySha } = {}) {
  const timestamp = nowIso(now);
  const before = clone(article);
  if (!isSupportedAdminArticleAction(action)) {
    return { ok: false, statusCode: 400, article: before, qualityErrors: ['unsupported_action'] };
  }
  const fields = ACTION_FIELDS[action];
  const next = applyPatch(before, patch, fields);
  if (action === 'preview') {
    return { ok: true, statusCode: 200, article: next, auditEntry: null, preview: buildAdminArticlePreview(next) };
  }
  applyAction(next, action, patch, actor, timestamp);
  const integrity = finalPublicationIntegrityResult(next, recentRecords, { sourceRegistry, sourceRegistrySha, now: timestamp });
  if (!integrity.ok) {
    return {
      ok: false,
      statusCode: 422,
      article: before,
      attemptedArticle: next,
      qualityErrors: integrity.reasons,
      reviewQueue: { action: action === 'publish' ? 'publish-blocked' : `${action}-blocked`, articleId: text(before.id), reasons: integrity.reasons, actor, timestamp },
    };
  }
  if (!integrity.skipped) next.publication_integrity = publicationIntegritySnapshot(integrity);
  next.updatedAt = timestamp;
  next.searchText = searchText(next);
  const auditEntry = summarizeAdminAuditChange({ before, after: next, actor, action, articleId: next.id, timestamp, commitSha });
  return { ok: true, statusCode: 200, article: next, auditEntry, preview: null };
}

export function syncAdminSearchIndex(searchIndex = [], article = {}) {
  const updated = { ...article, searchText: searchText(article) };
  const rows = Array.isArray(searchIndex) ? [...searchIndex] : [];
  const index = rows.findIndex((item) => item?.id === article.id);
  if (index === -1) return [...rows, updated];
  rows[index] = { ...rows[index], ...updated };
  return rows;
}

function escapeHtml(value = '') {
  return text(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

export function buildAdminArticlePreview(article = {}) {
  const title = escapeHtml(article.expertLensFull?.finalHeadline || article.title);
  const dek = escapeHtml(article.deck || article.summary);
  const body = escapeHtml(bodyText(article)).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');
  const image = escapeHtml(article.heroImage || article.generatedImage || article.sourceImage);
  const alt = escapeHtml(article.imageAlt || title);
  const imageHtml = image ? '<img src="' + image + '" alt="' + alt + '">' : '';
  return { title, dek, image, html: '<article class="admin-preview-article">' + imageHtml + '<h1>' + title + '</h1><p>' + dek + '</p><p>' + body + '</p></article>' };
}
