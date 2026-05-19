import { requireAdmin, json } from './admin/_auth.js';
import { exportLeads } from '../scripts/lib/lead-store.mjs';

export default async function handler(req, res) {
  const session = requireAdmin(req, res);
  if (!session) return;

  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' });
    return;
  }

  json(res, 200, {
    ok: true,
    leads: exportLeads(),
  });
}
