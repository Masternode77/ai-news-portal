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
    summary: article.summary || '',
    expertLensShort: article.expertLensShort || article.expertLens || lens.thesis || '',
    finalArticleBody: lens.finalArticleBody || article.articleText || article.contentText || article.snippet || '',
    metaDescription: lens.metaDescription || '',
    category: article.category || '',
    region: article.region || '',
    tags: article.tags || [],
    source: article.source || '',
    sourceUrl: article.sourceUrl || article.url || '',
    sourceImage: article.sourceImage || '',
    generatedImage: article.generatedImage || '',
    publishedAt: article.publishedAt || '',
  };
}

export default async function handler(req, res) {
  const session = requireAdmin(req, res);
  if (!session) return;

  if (req.method === 'GET') {
    const id = articleIdFromRequest(req);
    if (!id) {
      json(res, 400, { error: 'Missing article id.' });
      return;
    }

    try {
      const result = await getEditableArticle(id);
      if (!result) {
        json(res, 404, { error: 'Article not found.' });
        return;
      }
      json(res, 200, { article: publicArticle(result.article), sourceFile: result.sourceFile });
    } catch (error) {
      json(res, 500, { error: error.message || 'Unable to load article.' });
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = await readJson(req);
      if (!body.id) {
        json(res, 400, { error: 'Missing article id.' });
        return;
      }
      if (!String(body.title || '').trim()) {
        json(res, 400, { error: 'Title is required.' });
        return;
      }
      if (!String(body.finalArticleBody || '').trim()) {
        json(res, 400, { error: 'Article body is required.' });
        return;
      }

      const result = await saveEditableArticle(body.id, body);
      if (!result) {
        json(res, 404, { error: 'Article not found.' });
        return;
      }
      json(res, 200, {
        ok: true,
        article: publicArticle(result.article),
        sourceFile: result.sourceFile,
        commitSha: result.commitSha,
        commitUrl: result.commitUrl,
      });
    } catch (error) {
      json(res, 500, { error: error.message || 'Unable to save article.' });
    }
    return;
  }

  json(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });
}
