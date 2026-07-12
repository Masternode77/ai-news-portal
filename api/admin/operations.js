import fs from 'node:fs';
import path from 'node:path';
import { authorizeAdminAction, json, requireAdmin } from './_auth.js';
import { adminError } from './_request.js';
import { getAdminCmsService } from './_storage.js';

function readData(name, fallback = []) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve('src/data', name), 'utf8'));
  } catch {
    return fallback;
  }
}

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' });
  try {
    const view = new URL(req.url || '/', 'https://admin.local').searchParams.get('view');
    authorizeAdminAction(session, view === 'quarantine' ? 'admin:quarantine' : 'admin:operations');
    let rows;
    if (view === 'sources') rows = readData('source-health.json').slice(0, 250);
    else if (view === 'pipeline') rows = readData('editorial-cycles.json').slice(0, 100);
    else if (view === 'quarantine') {
      rows = await (await getAdminCmsService()).listArticles({ includeDeleted: true, limit: 200 });
      rows = rows.filter((item) => item.deletedAt || ['quarantined', 'hidden', 'noindex'].includes(item.public_status));
    } else return json(res, 400, { error: 'Unknown admin view.' });
    json(res, 200, { ok: true, rows });
  } catch (error) {
    adminError(res, error);
  }
}
