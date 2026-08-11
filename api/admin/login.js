import {
  adminAuthConfigured,
  adminRateLimitControlReady,
  clearSessionCookie,
  createSession,
  credentialsMatch,
  json,
  loginThrottleResult,
  recordFailedLogin,
  recordSuccessfulLogin,
  requireAdmin,
} from './_auth.js';
import { RequestBodyError, readLoginJson } from './_login-request.js';

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

  if (!adminRateLimitControlReady()) {
    json(res, 503, { error: 'Admin login is unavailable until its production rate-limit control is attested.' });
    return;
  }
  if (!adminAuthConfigured()) {
    json(res, 500, { error: 'Admin auth is not configured. Set a valid ADMIN_USERNAME, ADMIN_PASSWORD_HASH, and ADMIN_SESSION_SECRET.' });
    return;
  }

  try {
    const throttle = loginThrottleResult(req);
    if (throttle.blocked) {
      json(res, 429, { error: 'Too many failed login attempts. Try again later.' }, { 'Retry-After': String(throttle.retryAfterSeconds) });
      return;
    }

    const body = await readLoginJson(req);
    if (!credentialsMatch(body)) {
      recordFailedLogin(req, body.username || '', 'invalid_credentials');
      json(res, 401, { error: 'Invalid username or password.' });
      return;
    }

    recordSuccessfulLogin(req);
    const session = createSession(body.username || 'admin');
    json(res, 200, { ok: true, csrfToken: session.csrfToken }, { 'Set-Cookie': session.cookie });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      json(res, error.statusCode, { error: error.message });
      return;
    }
    json(res, 400, { error: 'Invalid login request.' });
  }
}
