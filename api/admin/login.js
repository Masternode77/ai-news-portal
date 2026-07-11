import {
  clearSessionCookie,
  createSession,
  credentialsMatch,
  json,
  loginThrottleResult,
  readJson,
  recordFailedLogin,
  recordSuccessfulLogin,
  requireAdmin,
} from './_auth.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const session = requireAdmin(req, res);
    if (!session) return;
    json(res, 200, { ok: true, user: session.sub, csrfToken: session.csrf });
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
    const throttle = loginThrottleResult(req);
    if (throttle.blocked) {
      json(res, 429, { error: 'Too many failed login attempts. Try again later.' }, { 'Retry-After': String(throttle.retryAfterSeconds) });
      return;
    }

    const body = await readJson(req);
    if (!credentialsMatch(body)) {
      recordFailedLogin(req, body.username || '', 'invalid_credentials');
      json(res, 401, { error: 'Invalid username or password.' });
      return;
    }

    recordSuccessfulLogin(req);
    const session = createSession(body.username || 'admin');
    json(res, 200, { ok: true, csrfToken: session.csrfToken }, { 'Set-Cookie': session.cookie });
  } catch (error) {
    const statusCode = error?.statusCode === 413 || error?.statusCode === 415
      ? error.statusCode
      : 400;
    json(res, statusCode, { error: statusCode === 413 ? 'Request body is too large.' : statusCode === 415 ? 'JSON content type required.' : 'Invalid login request.' });
  }
}
