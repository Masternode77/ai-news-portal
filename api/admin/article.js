import { getEditableArticle, saveEditableArticle } from './_github.js';
import { json, readJson, requireAdmin } from './_auth.js';

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
      json(res, 200, { article: publicArticle(result.article), sourceFile: result.sourceFile });
    } catch (error) {
      json(res, 500, { error: error.message || 'Unable to load article.' });
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = await readJson(req);
      if (!body.id) return json(res, 400, { error: 'Missing article id.' });
      const result = await saveEditableArticle(body.id, body, { actor: session.sub, action: body.action || 'save-draft' });
      if (!result) return json(res, 404, { error: 'Article not found.' });
      if (result.blocked) return json(res, result.statusCode || 422, { error: 'Publish quality gate failed.', qualityErrors: result.qualityErrors, reviewQueue: result.reviewQueue, article: publicArticle(result.article) });
      json(res, 200, { ok: true, article: publicArticle(result.article), auditEntry: result.auditEntry, preview: result.preview, sourceFile: result.sourceFile, commitSha: result.commitSha, commitUrl: result.commitUrl });
    } catch (error) {
      const statusCode = error?.statusCode === 413 || error?.statusCode === 415
        ? error.statusCode
        : 500;
      json(res, statusCode, {
        error: statusCode === 413
          ? 'Request body is too large.'
          : statusCode === 415
            ? 'JSON content type required.'
            : 'Unable to save article.',
      });
    }
    return;
  }

  json(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });
}
