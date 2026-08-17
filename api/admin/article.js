import { AdminVersionRequiredError, AdminWriteConflictError, getEditableArticle, saveEditableArticle } from './_github.js';
import { json, requireAdmin } from './_auth.js';
import { RequestBodyError, readAdminArticleJson } from './_login-request.js';
import { isSupportedAdminArticleAction } from '../../scripts/lib/admin-article-store.mjs';
import { isPublicLongformArticle } from '../../scripts/lib/public-surface-eligibility.mjs';
import { authoredColumnPublicEligible, isAuthoredColumn } from '../../scripts/lib/authored-column-policy.mjs';
import { columnPath } from '../../scripts/lib/column-surface.mjs';
import { articleCanonicalPath } from '../../src/lib/seo-safeguards.js';

function articleIdFromRequest(req) {
  const url = new URL(req.url || '/', 'https://admin.local');
  return url.searchParams.get('id') || '';
}

function publicArticle(article) {
  const lens = article.expertLensFull || {};
  return {
    id: article.id,
    title: lens.finalHeadline || article.title || '',
    dek: article.deck || article.summary || lens.metaDescription || '',
    summary: article.summary || article.deck || '',
    expertLensShort: article.expertLensShort || article.expertLens || lens.thesis || '',
    bodyMarkdown: lens.finalArticleBody || article.fullArticleText || article.articleText || article.contentText || article.snippet || '',
    finalArticleBody: lens.finalArticleBody || article.articleText || article.contentText || article.snippet || '',
    metaDescription: lens.metaDescription || '',
    category: article.category || '',
    region: article.region || '',
    tags: article.tags || [],
    public_status: article.public_status || '',
    status: article.public_status || '',
    source: article.source || '',
    sourceUrl: article.sourceUrl || article.url || '',
    canonicalUrl: article.canonicalUrl || '',
    sourceImage: article.sourceImage || '',
    generatedImage: article.generatedImage || '',
    heroImage: article.heroImage || article.generatedImage || '',
    thumbnailImage: article.thumbnailImage || '',
    imageAlt: article.imageAlt || '',
    imagePrompt: article.imagePrompt || '',
    publishedAt: article.publishedAt || '',
  };
}

export function adminPublicDetailEligibility(article, options = {}) {
  if (isAuthoredColumn(article)) {
    const eligible = authoredColumnPublicEligible(article);
    return { eligible, href: eligible ? columnPath(article) : '' };
  }
  const eligible = isPublicLongformArticle(article, options);
  return { eligible, href: eligible ? articleCanonicalPath(article) : '' };
}

export default async function handler(req, res) {
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method || '');
  const session = requireAdmin(req, res, { csrf: mutating });
  if (!session) return;

  if (req.method === 'GET') {
    const id = articleIdFromRequest(req);
    if (!id) return json(res, 400, { error: 'Missing article id.' });
    try {
      const result = await getEditableArticle(id);
      if (!result) return json(res, 404, { error: 'Article not found.' });
      json(res, 200, { article: publicArticle(result.article), publicDetail: adminPublicDetailEligibility(result.article), sourceFile: result.sourceFile, sourceSha: result.sourceSha });
    } catch (error) {
      json(res, 500, { error: error.message || 'Unable to load article.' });
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = await readAdminArticleJson(req);
      if (!body.id) return json(res, 400, { error: 'Missing article id.' });
      const action = String(body.action || 'save-draft');
      if (!isSupportedAdminArticleAction(action)) return json(res, 400, { error: 'Unsupported admin article action.' });
      const result = await saveEditableArticle(body.id, { ...body, action }, { actor: session.sub, action, expectedSourceSha: body.expectedSourceSha });
      if (!result) return json(res, 404, { error: 'Article not found.' });
      if (result.blocked) return json(res, result.statusCode || 422, { error: 'Publish quality gate failed.', qualityErrors: result.qualityErrors, reviewQueue: result.reviewQueue, article: publicArticle(result.article) });
      json(res, 200, { ok: true, article: publicArticle(result.article), publicDetail: adminPublicDetailEligibility(result.article), auditEntry: result.auditEntry, preview: result.preview, sourceFile: result.sourceFile, sourceSha: result.sourceSha, commitSha: result.commitSha, commitUrl: result.commitUrl });
    } catch (error) {
      if (error instanceof RequestBodyError) return json(res, error.statusCode, { error: error.message });
      if (error instanceof AdminWriteConflictError || error instanceof AdminVersionRequiredError) {
        return json(res, error.statusCode, { error: error.message });
      }
      json(res, 500, { error: error.message || 'Unable to save article.' });
    }
    return;
  }

  json(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });
}
