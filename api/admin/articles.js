import { authorizeAdminAction, json, readJson, requireAdmin } from './_auth.js';
import { adminError, requestContext } from './_request.js';
import { getAdminCmsService } from './_storage.js';

export default async function handler(req, res) {
  const mutating = req.method === 'POST';
  const session = await requireAdmin(req, res, { csrf: mutating });
  if (!session) return;

  try {
    const service = await getAdminCmsService();
    if (req.method === 'GET') {
      const url = new URL(req.url || '/', 'https://admin.local');
      const includeDeleted = url.searchParams.get('includeDeleted') === 'true';
      authorizeAdminAction(session, includeDeleted ? 'admin:read-deleted' : 'article:read');
      const articles = await service.listArticles({
        q: url.searchParams.get('q') || '',
        status: url.searchParams.get('status') || '',
        category: url.searchParams.get('category') || '',
        source: url.searchParams.get('source') || '',
        includeDeleted,
        limit: url.searchParams.get('limit') || 100,
      });
      json(res, 200, { ok: true, articles });
      return;
    }
    if (req.method === 'POST') {
      authorizeAdminAction(session, 'article:save-draft');
      const article = await service.createDraft(await readJson(req), requestContext(req, session));
      json(res, 201, { ok: true, article });
      return;
    }
    json(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });
  } catch (error) {
    adminError(res, error);
  }
}
