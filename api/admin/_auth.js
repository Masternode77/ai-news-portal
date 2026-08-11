import crypto from 'node:crypto';
import net from 'node:net';

const COOKIE_NAME = 'cc_admin';
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const PASSWORD_KEY_LENGTH = 64;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const MIN_SESSION_SECRET_BYTES = 32;
const MIN_SESSION_SECRET_DISTINCT_CHARACTERS = 8;
const SCRYPT_HASH = /^scrypt\$([A-Za-z0-9_-]{16,256})\$([A-Za-z0-9_-]{86})$/;
const UNSAFE_SESSION_SECRETS = new Set(['replace-with-64-plus-random-characters', 'change-me', 'changeme', 'password', 'secret', 'admin', 'test']);
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

function validSessionSecret(value) {
  const secret = String(value || '');
  if (secret !== secret.trim() || Buffer.byteLength(secret, 'utf8') < MIN_SESSION_SECRET_BYTES) return false;
  if (UNSAFE_SESSION_SECRETS.has(secret.toLowerCase())) return false;
  return new Set(secret).size >= MIN_SESSION_SECRET_DISTINCT_CHARACTERS;
}

function validPasswordHash(value) {
  const match = String(value || '').match(SCRYPT_HASH);
  if (!match) return false;
  return Buffer.from(match[1], 'base64url').length >= 16 && Buffer.from(match[2], 'base64url').length === PASSWORD_KEY_LENGTH;
}

export function adminAuthConfigured() {
  return Boolean(process.env.ADMIN_USERNAME && validPasswordHash(process.env.ADMIN_PASSWORD_HASH) && validSessionSecret(getSessionSecret()));
}

export function adminRateLimitControlReady() {
  return process.env.NODE_ENV !== 'production' || process.env.ADMIN_VERCEL_RATE_LIMIT_READY === 'true';
}

export function json(res, statusCode, payload, headers = {}) {
  res.statusCode = statusCode;
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Pragma', 'no-cache');
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
  if (!adminAuthConfigured()) throw new Error('Admin auth is not configured.');
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
  if (!adminAuthConfigured()) {
    json(res, 500, { error: 'Admin auth is not configured. Set ADMIN_USERNAME, ADMIN_PASSWORD_HASH, and ADMIN_SESSION_SECRET.' });
    return null;
  }
  if (!adminRateLimitControlReady()) {
    json(res, 503, { error: 'Admin authentication is unavailable until its production rate-limit control is attested.' });
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
  if (!validPasswordHash(encoded)) return false;
  const [, salt, expected] = String(encoded).split('$');
  const actual = crypto.scryptSync(String(password), salt, PASSWORD_KEY_LENGTH).toString('base64url');
  return safeEqual(actual, expected);
}

export function credentialsMatch({ username = '', password = '' } = {}) {
  const expectedPasswordHash = process.env.ADMIN_PASSWORD_HASH || '';
  const expectedUsername = process.env.ADMIN_USERNAME || '';
  if (!expectedUsername || !validPasswordHash(expectedPasswordHash)) return false;
  if (!safeEqual(username, expectedUsername)) return false;
  return verifyAdminPassword(password, expectedPasswordHash);
}

function clientIp(req) {
  const remoteAddress = String(req.socket?.remoteAddress || '').trim();
  const mappedIpv4 = remoteAddress.match(/^::ffff:(.+)$/i)?.[1] || '';
  if (mappedIpv4 && net.isIP(mappedIpv4) === 4) return mappedIpv4;
  const family = net.isIP(remoteAddress);
  if (family === 4) return remoteAddress;
  if (family === 6) return remoteAddress.toLowerCase();
  return 'unknown';
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
    principalId: crypto.createHmac('sha256', getSessionSecret()).update(String(username || '')).digest('base64url').slice(0, 16),
    reason,
  };
  failedLoginAudit.push(audit);
  console.warn(JSON.stringify({ event: 'admin.login_failed', clientIp: audit.ip, principalId: audit.principalId, reason }));
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
