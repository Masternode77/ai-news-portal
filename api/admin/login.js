import { clearSessionCookie, createSessionCookie, credentialsMatch, json, readJson, requireAdmin } from './_auth.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const session = requireAdmin(req, res);
    if (!session) return;
    json(res, 200, { ok: true, user: session.sub });
    return;
  }

  if (req.method === 'DELETE') {
    json(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() });
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, POST, DELETE' });
    return;
  }

  try {
    const body = await readJson(req);
    if (!credentialsMatch(body)) {
      json(res, 401, { error: 'Invalid username or password.' });
      return;
    }

    json(res, 200, { ok: true }, { 'Set-Cookie': createSessionCookie(body.username || 'admin') });
  } catch {
    json(res, 400, { error: 'Invalid login request.' });
  }
}
