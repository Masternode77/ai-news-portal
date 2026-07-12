import { authorizeAdminAction, json, requireAdmin } from './_auth.js';
import { adminError } from './_request.js';
import { getAdminCmsService } from './_storage.js';

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' });
  try {
    authorizeAdminAction(session, 'admin:audit');
    const url = new URL(req.url || '/', 'https://admin.local');
    const entries = await (await getAdminCmsService()).listAudit({
      articleId: url.searchParams.get('articleId') || undefined,
      action: url.searchParams.get('action') || undefined,
    });
    json(res, 200, { ok: true, entries });
  } catch (error) {
    adminError(res, error);
  }
}
