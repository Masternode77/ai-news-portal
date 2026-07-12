import { authorizeAdminAction, json, readJson, requireAdmin } from './_auth.js';
import { adminError, requestContext } from './_request.js';
import { getAdminCmsService } from './_storage.js';

function articleId(req, body = {}) {
  return body.id || new URL(req.url || '/', 'https://admin.local').searchParams.get('id') || '';
}

function permissionFor(action) {
  if (action === 'preview') return 'article:preview';
  if (['save-draft', 'regenerate-article', 'regenerate-brief', 'regenerate-image', 'upload-image'].includes(action)) return 'article:save-draft';
  if (action === 'permanent-delete') return 'admin:permanent-delete';
  return 'article:publish';
}

export default async function handler(req, res) {
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method || '');
  const session = await requireAdmin(req, res, { csrf: mutating });
  if (!session) return;

  try {
    const service = await getAdminCmsService();
    if (req.method === 'GET') {
      const includeDeleted = new URL(req.url || '/', 'https://admin.local').searchParams.get('includeDeleted') === 'true';
      authorizeAdminAction(session, includeDeleted ? 'admin:read-deleted' : 'article:read');
      const id = articleId(req);
      if (!id) return json(res, 400, { error: 'Missing article id.' });
      const { article, revisions } = await service.getArticle(id, { includeDeleted });
      json(res, 200, { ok: true, article, revisions });
      return;
    }
    if (mutating) {
      const body = await readJson(req);
      const id = articleId(req, body);
      if (!id) return json(res, 400, { error: 'Missing article id.' });
      const action = req.method === 'DELETE' ? 'permanent-delete' : body.action || 'save-draft';
      authorizeAdminAction(session, permissionFor(action));
      const result = await service.mutateArticle(id, { ...body, action }, requestContext(req, session));
      if (!result.ok) {
        json(res, result.statusCode || 422, {
          error: 'Article quality gate failed.',
          qualityErrors: result.qualityErrors,
          reviewQueue: result.reviewQueue,
          article: result.article,
        });
        return;
      }
      json(res, 200, result);
      return;
    }
    json(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, POST, PUT, PATCH, DELETE' });
  } catch (error) {
    adminError(res, error);
  }
}
