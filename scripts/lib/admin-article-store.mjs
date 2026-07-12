import { bannedPhraseMatches } from './banned-phrases.mjs';
import { guardPublicCopy } from './copy-quality-guard.mjs';
import { summarizeAdminAuditChange } from './admin-audit-log.mjs';
import { sourceExtractionPassesPublicGate } from './source-extraction-fail-closed.mjs';

const ADMIN_ACTIONS = new Set([
  'publish',
  'save-draft',
  'unpublish',
  'schedule',
  'hide',
  'noindex',
  'regenerate-article',
  'regenerate-brief',
  'regenerate-image',
  'edit-prompt',
  'upload-image',
  'preview',
]);

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

function nowIso(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function bodyText(article = {}) {
  return text(article.expertLensFull?.finalArticleBody || article.fullArticleText || article.articleText || article.contentText || article.snippet);
}

function score(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function extractionQualityScore(article = {}) {
  return score(article.extraction_quality_score)
    ?? score(article.extraction_qa?.extraction_quality_score)
    ?? score(article.source_quality_score);
}

function validateAdminSourceQuality(article = {}) {
  const errors = [];
  const extractionScore = extractionQualityScore(article);
  const publicSourceGate = sourceExtractionPassesPublicGate(article);

  if (article.extraction_failed === true) errors.push('extraction_failed');
  if (extractionScore !== null && extractionScore < 0.5) errors.push(`extraction_quality_score_below_0.5:${extractionScore}`);
  if (article.public_extraction_passed === false) errors.push('public_extraction_failed');
  if (!publicSourceGate.ok) {
    errors.push(...(publicSourceGate.block_reasons || ['source_gate_failed']).map((reason) => `public_source_gate_failed:${reason}`));
  }

  return errors;
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

function applyPatch(article = {}, patch = {}) {
  const next = clone(article);
  next.expertLensFull = { ...(next.expertLensFull || {}) };
  if ('title' in patch) {
    next.title = text(patch.title);
    next.expertLensFull.finalHeadline = text(patch.title);
  }
  if ('dek' in patch || 'summary' in patch) {
    const dek = text(patch.dek ?? patch.summary);
    next.deck = dek;
    next.summary = dek;
    next.expertLensFull.metaDescription = text(patch.metaDescription || dek);
  }
  if ('bodyMarkdown' in patch || 'finalArticleBody' in patch) next.expertLensFull.finalArticleBody = text(patch.bodyMarkdown ?? patch.finalArticleBody);
  if ('expertLensShort' in patch) {
    next.expertLensShort = text(patch.expertLensShort);
    next.expertLens = text(patch.expertLensShort);
    next.expertLensFull.thesis = text(patch.expertLensShort);
  }
  for (const field of ['category', 'region', 'source', 'sourceUrl', 'canonicalUrl', 'sourceImage', 'generatedImage', 'heroImage', 'thumbnailImage', 'imageAlt', 'imagePrompt', 'publishedAt', 'scheduledAt']) {
    if (field in patch) next[field] = text(patch[field]);
  }
  if ('public_status' in patch || 'status' in patch) next.public_status = text(patch.public_status ?? patch.status);
  if ('tags' in patch) next.tags = normalizeTags(patch.tags);
  if ('entities' in patch) next.entities = normalizeTags(patch.entities);
  return next;
}

export function validateAdminPublishQuality(article = {}, { action = 'publish', publicEligible = false } = {}) {
  if (action !== 'publish' && !publicEligible) return [];
  const copy = [article.title, article.deck || article.summary, bodyText(article)].filter(Boolean).join('\n\n');
  const guard = guardPublicCopy(copy);
  const banned = bannedPhraseMatches(copy);
  const errors = [];
  if (!text(article.title)) errors.push('missing_title');
  if (bodyText(article).length < 120) errors.push('body_too_short_for_publish');
  errors.push(...validateAdminSourceQuality(article));
  if (guard.reasons.length) errors.push(...guard.reasons);
  if (Object.keys(banned).length) errors.push(...Object.keys(banned).map((phrase) => 'banned_phrase:' + phrase));
  return [...new Set(errors)];
}

function isPubliclyEligible(article = {}) {
  if (article.hidden === true || article.draft === true) return false;
  if (['draft', 'hidden', 'unpublished', 'deleted'].includes(text(article.public_status).toLowerCase())) return false;
  return article.public_status === 'published'
    || article.articlePagePublished === true
    || article.homepagePublished === true;
}

function requestRegeneration(article, type, patch, actor, timestamp) {
  article.admin_regeneration_request = {
    type,
    prompt: text(patch.editPrompt || patch.imagePrompt || patch.prompt),
    requestedAt: timestamp,
    requestedBy: actor,
  };
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
  } else if (action === 'schedule') {
    next.public_status = 'scheduled';
    next.draft = true;
    next.articlePagePublished = false;
    next.homepagePublished = false;
    next.scheduledAt = text(patch.scheduledAt);
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
  } else if (action === 'regenerate-article') {
    requestRegeneration(next, 'article', patch, actor, timestamp);
  } else if (action === 'regenerate-brief') {
    requestRegeneration(next, 'brief', patch, actor, timestamp);
  } else if (action === 'regenerate-image') {
    requestRegeneration(next, 'image', patch, actor, timestamp);
    if ('imagePrompt' in patch) next.imagePrompt = text(patch.imagePrompt);
  } else if (action === 'edit-prompt') {
    next.imagePrompt = text(patch.imagePrompt || patch.editPrompt);
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

export function applyAdminArticleAction({ article = {}, patch = {}, action = 'save-draft', actor = 'admin', now = new Date().toISOString(), commitSha = '' } = {}) {
  const timestamp = nowIso(now);
  const before = clone(article);
  if (!ADMIN_ACTIONS.has(action)) {
    return {
      ok: false,
      statusCode: 400,
      article: before,
      qualityErrors: [`unknown_admin_action:${action}`],
    };
  }

  const candidate = applyPatch(before, patch);
  if (action !== 'preview') {
    applyAction(candidate, action, patch, actor, timestamp);
  }
  const validatePublicState = action !== 'preview' && isPubliclyEligible(candidate);
  if (action === 'publish' || validatePublicState) {
    const qualityErrors = validateAdminPublishQuality(candidate, {
      action,
      publicEligible: validatePublicState,
    });
    if (qualityErrors.length) {
      return {
        ok: false,
        statusCode: 422,
        article: before,
        attemptedArticle: candidate,
        qualityErrors,
        reviewQueue: {
          action: action === 'publish' ? 'publish-blocked' : `${action}-blocked`,
          articleId: text(before.id),
          reasons: qualityErrors,
          actor,
          timestamp,
        },
      };
    }
  }
  const next = candidate;
  next.updatedAt = timestamp;
  next.searchText = searchText(next);
  const auditEntry = summarizeAdminAuditChange({ before, after: next, actor, action, articleId: next.id, timestamp, commitSha });
  return { ok: true, statusCode: 200, article: next, auditEntry, preview: action === 'preview' ? buildAdminArticlePreview(next) : null };
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
  const titleText = text(article.expertLensFull?.finalHeadline || article.title);
  const dekText = text(article.deck || article.summary);
  const articleBody = bodyText(article);
  const imageText = text(article.heroImage || article.generatedImage || article.sourceImage);
  const title = escapeHtml(titleText);
  const dek = escapeHtml(dekText);
  const body = escapeHtml(articleBody).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');
  const image = escapeHtml(imageText);
  const alt = escapeHtml(article.imageAlt || titleText);
  const imageHtml = image ? '<img src="' + image + '" alt="' + alt + '">' : '';
  return {
    title: titleText,
    dek: dekText,
    text: articleBody,
    image: imageText,
    html: '<article class="admin-preview-article">' + imageHtml + '<h1>' + title + '</h1><p>' + dek + '</p><p>' + body + '</p></article>',
  };
}
