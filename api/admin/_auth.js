import crypto from 'node:crypto';

const COOKIE_NAME = 'cc_admin';
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const PASSWORD_KEY_LENGTH = 64;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const failedLoginState = new Map();
const failedLoginAudit = [];

function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || '';
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(payload) {
  return crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
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
        try {
          return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
        } catch {
          return [part.slice(0, index), ''];
        }
      }),
  );
}

function safeEqual(a = '', b = '') {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function configured() {
  return Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD_HASH && getSessionSecret());
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

function sessionPayload(username = 'admin', now = Date.now()) {
  return {
    sub: username,
    exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
    csrf: crypto.randomBytes(32).toString('base64url'),
  };
}

export function createSession(username = 'admin', options = {}) {
  const session = sessionPayload(username, options.now || Date.now());
  const payload = base64url(
    JSON.stringify(session),
  );
  const token = `${payload}.${sign(payload)}`;
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return {
    cookie: `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}${secure}`,
    csrfToken: session.csrf,
    expiresAt: session.exp,
  };
}

export function createSessionCookie(username = 'admin') {
  return createSession(username).cookie;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

function headerValue(req, name) {
  const value = req.headers?.[name] || req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : String(value || '');
}

export function requireAdmin(req, res, options = {}) {
  if (!configured()) {
    json(res, 500, { error: 'Admin auth is not configured. Set ADMIN_USERNAME, ADMIN_PASSWORD_HASH, and ADMIN_SESSION_SECRET.' });
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
    if (options.csrf === true) {
      const csrfToken = headerValue(req, 'x-csrf-token');
      if (!csrfToken || !session.csrf || !safeEqual(csrfToken, session.csrf)) {
        json(res, 403, { error: 'CSRF token required.' });
        return null;
      }
    }
    return session;
  } catch {
    json(res, 401, { error: 'Admin login required.' });
    return null;
  }
}

export function hashAdminPassword(password = '', salt = crypto.randomBytes(16).toString('base64url')) {
  const key = crypto.scryptSync(String(password), String(salt), PASSWORD_KEY_LENGTH);
  return `scrypt$${salt}$${key.toString('base64url')}`;
}

function verifyAdminPassword(password = '', encoded = '') {
  const [algorithm, salt, expected] = String(encoded || '').split('$');
  if (algorithm !== 'scrypt' || !salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, PASSWORD_KEY_LENGTH).toString('base64url');
  return safeEqual(actual, expected);
}

export function credentialsMatch({ username = '', password = '' } = {}) {
  const expectedPasswordHash = process.env.ADMIN_PASSWORD_HASH || '';
  const expectedUsername = process.env.ADMIN_USERNAME || '';
  if (!expectedUsername || !expectedPasswordHash) return false;
  if (!safeEqual(username, expectedUsername)) return false;
  return verifyAdminPassword(password, expectedPasswordHash);
}

function clientIp(req) {
  const forwarded = headerValue(req, 'x-forwarded-for').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

function throttleEntry(req, now = Date.now()) {
  const ip = clientIp(req);
  const entry = failedLoginState.get(ip);
  if (!entry || now - entry.firstAt > LOGIN_WINDOW_MS) {
    return { ip, count: 0, firstAt: now };
  }
  return { ip, ...entry };
}

export function loginThrottleResult(req, now = Date.now()) {
  const entry = throttleEntry(req, now);
  const blocked = entry.count >= MAX_FAILED_LOGIN_ATTEMPTS;
  return {
    blocked,
    ip: entry.ip,
    count: entry.count,
    retryAfterSeconds: blocked
      ? Math.max(1, Math.ceil((LOGIN_WINDOW_MS - (now - entry.firstAt)) / 1000))
      : 0,
  };
}

export function recordFailedLogin(req, username = '', reason = 'invalid_credentials', now = Date.now()) {
  const entry = throttleEntry(req, now);
  const next = {
    count: entry.count + 1,
    firstAt: entry.firstAt,
    latestAt: now,
  };
  failedLoginState.set(entry.ip, next);
  const audit = {
    timestamp: new Date(now).toISOString(),
    ip: entry.ip,
    username: String(username || ''),
    reason,
  };
  failedLoginAudit.push(audit);
  console.warn(`[admin-auth] failed login username=${audit.username || '(blank)'} ip=${audit.ip} reason=${reason}`);
  return audit;
}

export function recordSuccessfulLogin(req) {
  failedLoginState.delete(clientIp(req));
}

export function failedLoginAuditForTests() {
  return [...failedLoginAudit];
}

export function resetLoginSecurityForTests() {
  failedLoginState.clear();
  failedLoginAudit.length = 0;
}
