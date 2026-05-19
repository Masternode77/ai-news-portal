import crypto from 'node:crypto';

const COOKIE_NAME = 'cc_admin';
const SESSION_TTL_SECONDS = 60 * 60 * 8;

function getSecret() {
  return process.env.ADMIN_AUTH_SECRET || process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD || '';
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(payload) {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        if (index === -1) return [part, ''];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function safeEqual(a = '', b = '') {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function json(res, statusCode, payload, headers = {}) {
  res.statusCode = statusCode;
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createSessionCookie(username = 'admin') {
  const payload = base64url(
    JSON.stringify({
      sub: username,
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    }),
  );
  const token = `${payload}.${sign(payload)}`;
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export function requireAdmin(req, res) {
  if (!getSecret()) {
    json(res, 500, { error: 'Admin auth is not configured. Set ADMIN_PASSWORD and ADMIN_AUTH_SECRET.' });
    return null;
  }

  const token = parseCookies(req.headers.cookie || '')[COOKIE_NAME];
  if (!token || !token.includes('.')) {
    json(res, 401, { error: 'Admin login required.' });
    return null;
  }

  const [payload, signature] = token.split('.');
  if (!safeEqual(signature, sign(payload))) {
    json(res, 401, { error: 'Admin login required.' });
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!session.exp || session.exp < Math.floor(Date.now() / 1000)) {
      json(res, 401, { error: 'Admin session expired.' });
      return null;
    }
    return session;
  } catch {
    json(res, 401, { error: 'Admin login required.' });
    return null;
  }
}

export function credentialsMatch({ username = '', password = '' } = {}) {
  const expectedPassword = process.env.ADMIN_PASSWORD || '';
  const expectedUsername = process.env.ADMIN_USERNAME || '';
  if (!expectedPassword) return false;
  if (expectedUsername && username !== expectedUsername) return false;
  return safeEqual(password, expectedPassword);
}
