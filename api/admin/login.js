import {
  clearSessionCookie,
  createSession,
  credentialsMatch,
  json,
  loginThrottleResult,
  readJson,
  registerAdminSession,
  recordFailedLogin,
  recordSuccessfulLogin,
  requireAdmin,
  revokeAdminSession,
} from './_auth.js';

const LOGIN_ERROR_MESSAGES = {
  413: 'Request body is too large.',
  415: 'JSON content type required.',
  503: 'Admin service is temporarily unavailable.',
};

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const session = await requireAdmin(req, res);
    if (!session) return;
    json(res, 200, { ok: true, user: session.sub, csrfToken: session.csrf, sessionId: session.sid, role: session.role, roles: session.roles });
    return;
  }

  if (req.method === 'DELETE') {
    const session = await requireAdmin(req, res, { csrf: true, action: 'session:logout' });
    if (!session) return;
    if (!await revokeAdminSession(session)) {
      json(res, 503, { error: 'Admin service is temporarily unavailable.' });
      return;
    }
    json(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() });
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, POST, DELETE' });
    return;
  }

  try {
    const throttle = await loginThrottleResult(req);
    if (throttle.unavailable) {
      json(res, 503, { error: 'Admin service is temporarily unavailable.' });
      return;
    }
    if (throttle.blocked) {
      json(res, 429, { error: 'Too many failed login attempts. Try again later.' }, { 'Retry-After': String(throttle.retryAfterSeconds) });
      return;
    }

    const body = await readJson(req);
    if (!credentialsMatch(body)) {
      const recorded = await recordFailedLogin(req, body.username || '', 'invalid_credentials');
      if (!recorded && (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV)) {
        json(res, 503, { error: 'Admin service is temporarily unavailable.' });
        return;
      }
      json(res, 401, { error: 'Invalid username or password.' });
      return;
    }

    if (!await recordSuccessfulLogin(req, body.username || '')) {
      json(res, 503, { error: 'Admin service is temporarily unavailable.' });
      return;
    }
    const session = createSession(body.username || 'admin');
    if (!await registerAdminSession({
      sid: session.sessionId,
      sub: body.username || 'admin',
      role: session.role,
      exp: session.expiresAt,
    }, req)) {
      json(res, 503, { error: 'Admin service is temporarily unavailable.' });
      return;
    }
    json(res, 200, { ok: true, csrfToken: session.csrfToken, sessionId: session.sessionId, role: session.role, roles: session.roles }, { 'Set-Cookie': session.cookie });
  } catch (error) {
    const statusCode = [400, 413, 415, 503].includes(error?.statusCode)
      ? error.statusCode
      : 400;
    json(res, statusCode, { error: LOGIN_ERROR_MESSAGES[statusCode] || 'Invalid login request.' });
  }
}
