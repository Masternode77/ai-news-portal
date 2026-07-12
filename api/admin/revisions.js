import { authorizeAdminAction, json, requireAdmin } from './_auth.js';
import { adminError } from './_request.js';
import { getAdminCmsService } from './_storage.js';

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' });
  try {
    authorizeAdminAction(session, 'revision:read');
    const id = new URL(req.url || '/', 'https://admin.local').searchParams.get('id') || '';
    if (!id) return json(res, 400, { error: 'Missing article id.' });
    const result = await (await getAdminCmsService()).getArticle(id);
    json(res, 200, { ok: true, revisions: result.revisions });
  } catch (error) {
    adminError(res, error);
  }
}
