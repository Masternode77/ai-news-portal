import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Algorithm, hashSync as hashArgon2, verifySync as verifyArgon2 } from '@node-rs/argon2';
import { createPostgresAdminAuthSecurityHooks } from './_postgres-auth.js';

const COOKIE_NAME = 'cc_admin';
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const ARGON2_OPTIONS = Object.freeze({
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
});
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const MAX_JSON_BODY_BYTES = 64 * 1024;
const MAX_FAILED_LOGIN_AUDIT_ENTRIES = 100;
const MIN_SESSION_SECRET_BYTES = 64;
const failedLoginState = new Map();
const failedLoginAudit = [];
const revokedSessionIds = new Map();
const ROLE_ADMIN = 'admin';
const ROLE_EDITOR = 'editor';
const ADMIN_ACTIONS = new Set(['admin:*']);
const EDITOR_ACTIONS = new Set(['article:read', 'article:save-draft', 'article:preview', 'revision:read', 'media:read', 'media:upload', 'session:read', 'session:logout']);
let authSecurityHooks = null;
let defaultAuthSecurityHooks = null;

function currentAuthSecurityHooks() {
  if (authSecurityHooks) return authSecurityHooks;
  if (productionRuntime() && process.env.DATABASE_URL) {
    defaultAuthSecurityHooks ||= createPostgresAdminAuthSecurityHooks();
  }
  return defaultAuthSecurityHooks;
}

function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || '';
}

function sessionSecretConfigured() {
  return Buffer.byteLength(getSessionSecret(), 'utf8') >= MIN_SESSION_SECRET_BYTES;
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

function productionRuntime() {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL_ENV);
}

function configured() {
  try {
    return Boolean(
      process.env.ADMIN_USERNAME
      && isArgon2idHash(process.env.ADMIN_PASSWORD_HASH)
      && sessionSecretConfigured()
      && roleForUsername(process.env.ADMIN_USERNAME)
      && authStateAvailable(),
    );
  } catch {
    return false;
  }
}

export function json(res, statusCode, payload, headers = {}) {
  res.statusCode = statusCode;
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export async function readJson(req, { maxBytes = MAX_JSON_BODY_BYTES } = {}) {
  const contentType = headerValue(req, 'content-type').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw Object.assign(new Error('unsupported_content_type'), { statusCode: 415 });
  }
  const declaredLength = Number(headerValue(req, 'content-length'));
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 4 * 1024 * 1024) {
    throw Object.assign(new Error('invalid_body_limit'), { statusCode: 500 });
  }
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw Object.assign(new Error('request_too_large'), { statusCode: 413 });
  }
  const chunks = [];
  let receivedBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    receivedBytes += buffer.length;
    if (receivedBytes > maxBytes) {
      throw Object.assign(new Error('request_too_large'), { statusCode: 413 });
    }
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('invalid_json'), { statusCode: 400, code: 'invalid_json' });
  }
}

function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  return [ROLE_ADMIN, ROLE_EDITOR].includes(value) ? value : null;
}

function roleForUsername(username = 'admin') {
  const invalidRole = () => Object.assign(new Error('admin_role_configuration_invalid'), { statusCode: 503 });
  const configuredRoles = process.env.ADMIN_USER_ROLES || '';
  if (configuredRoles) {
    try {
      const roles = JSON.parse(configuredRoles);
      const role = roles && typeof roles === 'object' ? normalizeRole(roles[username]) : null;
      if (!role) throw invalidRole();
      return role;
    } catch {
      throw invalidRole();
    }
  }
  const role = normalizeRole(process.env.ADMIN_ROLE || ROLE_ADMIN);
  if (!role) throw invalidRole();
  return role;
}

function roleClaims(role = ROLE_ADMIN) {
  const normalized = normalizeRole(role);
  if (!normalized) throw new Error('admin_role_configuration_invalid');
  return {
    role: normalized,
    roles: normalized === ROLE_ADMIN ? [ROLE_ADMIN, ROLE_EDITOR] : [ROLE_EDITOR],
  };
}

function accountVersion(username, role) {
  const expectedUsername = process.env.ADMIN_USERNAME || '';
  if (!expectedUsername || !safeEqual(username, expectedUsername)) {
    throw new Error('admin_account_changed');
  }
  return crypto
    .createHmac('sha256', getSessionSecret())
    .update(`${username}\0${role}\0${process.env.ADMIN_PASSWORD_HASH || ''}`)
    .digest('base64url');
}

function actionSetForRole(role = ROLE_ADMIN) {
  const normalized = normalizeRole(role);
  if (!normalized) return new Set();
  return normalized === ROLE_ADMIN ? ADMIN_ACTIONS : EDITOR_ACTIONS;
}

function normalizeAction(action = '') {
  const value = String(action || '').trim();
  if (!value) return '';
  if (value.includes(':')) return value;
  return `article:${value}`;
}

export function canAdminPerformAction(session = {}, action = '') {
  const normalizedAction = normalizeAction(action);
  if (!normalizedAction) return false;
  const allowed = actionSetForRole(session.role || session.roles?.[0]);
  if (allowed.has('admin:*')) return true;
  if (allowed.has(normalizedAction)) return true;
  const [namespace] = normalizedAction.split(':');
  return allowed.has(`${namespace}:*`);
}

export function authorizeAdminAction(session = {}, action = '') {
  if (!canAdminPerformAction(session, action)) {
    const error = new Error('admin_action_forbidden');
    error.statusCode = 403;
    throw error;
  }
  return true;
}

function sessionPayload(username = 'admin', now = Date.now(), options = {}) {
  const claims = roleClaims(options.role || roleForUsername(username));
  return {
    sid: options.sid || crypto.randomBytes(24).toString('base64url'),
    sub: username,
    ...claims,
    authv: accountVersion(username, claims.role),
    exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
    csrf: crypto.randomBytes(32).toString('base64url'),
  };
}

export function createSession(username = 'admin', options = {}) {
  const session = sessionPayload(username, options.now || Date.now(), options);
  const payload = base64url(
    JSON.stringify(session),
  );
  const token = `${payload}.${sign(payload)}`;
  const secure = productionRuntime() ? '; Secure' : '';
  return {
    cookie: `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}${secure}`,
    csrfToken: session.csrf,
    expiresAt: session.exp,
    sessionId: session.sid,
    role: session.role,
    roles: session.roles,
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

export async function requireAdmin(req, res, options = {}) {
  if (!configured()) {
    json(res, 503, { error: 'Admin service is temporarily unavailable.' });
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
    session.role = normalizeRole(session.role || session.roles?.[0]);
    if (!session.role) throw new Error('invalid_session_role');
    session.roles = roleClaims(session.role).roles;
    const currentRole = roleForUsername(session.sub);
    const currentAccountVersion = accountVersion(session.sub, currentRole);
    if (
      session.role !== currentRole
      || !session.authv
      || !safeEqual(session.authv, currentAccountVersion)
    ) {
      json(res, 401, { error: 'Admin session expired.' });
      return null;
    }
    if (!session.exp || session.exp < Math.floor(Date.now() / 1000)) {
      json(res, 401, { error: 'Admin session expired.' });
      return null;
    }
    const revocation = await sessionRevocationResult(session);
    if (revocation.unavailable) {
      json(res, 503, { error: 'Admin service is temporarily unavailable.' });
      return null;
    }
    if (revocation.revoked) {
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
    if (options.action && !canAdminPerformAction(session, options.action)) {
      json(res, 403, { error: 'Admin action not allowed.' });
      return null;
    }
    return session;
  } catch {
    json(res, 401, { error: 'Admin login required.' });
    return null;
  }
}

function isArgon2idHash(encoded = '') {
  return String(encoded).startsWith('$argon2id$');
}

function verifyAdminPassword(password = '', encoded = '') {
  if (!isArgon2idHash(encoded)) return false;
  try {
    return verifyArgon2(String(encoded), String(password));
  } catch {
    return false;
  }
}

export function hashAdminPassword(password = '', salt = '') {
  const options = salt
    ? { ...ARGON2_OPTIONS, salt: Buffer.from(String(salt)) }
    : ARGON2_OPTIONS;
  return hashArgon2(String(password), options);
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

function safeAuditValue(value = '', maxLength = 96) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, maxLength);
}

function throttleEntry(req, now = Date.now()) {
  const ip = clientIp(req);
  const entry = readLoginThrottleEntry(ip);
  if (!entry || now - entry.firstAt > LOGIN_WINDOW_MS) {
    return { ip, count: 0, firstAt: now };
  }
  return { ip, ...entry };
}

function authStatePath() {
  const statePath = process.env.ADMIN_AUTH_STATE_FILE || '';
  return statePath ? path.resolve(statePath) : '';
}

function authStateAvailable() {
  const hooks = currentAuthSecurityHooks();
  if (productionRuntime()) return Boolean(hooks);
  return Boolean(hooks || authStatePath() || process.env.NODE_ENV !== 'production');
}

function authStateUnavailableResult() {
  return productionRuntime() && !authStateAvailable();
}

function emptyAuthState() {
  return { failedLogins: {}, failedLoginAudit: [], revokedSessions: {} };
}

function loadFileAuthState() {
  const filePath = authStatePath();
  if (!filePath) return null;
  try {
    if (!fs.existsSync(filePath)) return emptyAuthState();
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      failedLogins: parsed && typeof parsed.failedLogins === 'object' ? parsed.failedLogins : {},
      failedLoginAudit: Array.isArray(parsed?.failedLoginAudit) ? parsed.failedLoginAudit : [],
      revokedSessions: parsed && typeof parsed.revokedSessions === 'object' ? parsed.revokedSessions : {},
    };
  } catch {
    return null;
  }
}

function saveFileAuthState(state) {
  const filePath = authStatePath();
  if (!filePath) return false;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

function withFileAuthState(mutator) {
  const state = loadFileAuthState();
  if (!state) return { unavailable: true };
  const result = mutator(state) || {};
  if (result.write !== false && !saveFileAuthState(state)) return { unavailable: true };
  return result;
}

function readLoginThrottleEntry(ip) {
  const hooks = currentAuthSecurityHooks();
  if (hooks?.loginThrottle?.get) return hooks.loginThrottle.get(ip) || null;
  const filePath = authStatePath();
  if (filePath) {
    const state = loadFileAuthState();
    if (!state) return null;
    return state.failedLogins?.[ip] || null;
  }
  return failedLoginState.get(ip);
}

export async function loginThrottleResult(req, now = Date.now()) {
  if (authStateUnavailableResult()) return { blocked: true, unavailable: true, ip: clientIp(req), count: 0, retryAfterSeconds: 0 };
  const hooks = currentAuthSecurityHooks();
  if (hooks?.loginThrottle?.check) {
    try {
      return { unavailable: false, ...await hooks.loginThrottle.check({ req, ip: clientIp(req), now }) };
    } catch {
      return { blocked: true, unavailable: productionRuntime(), ip: clientIp(req), count: 0, retryAfterSeconds: 0 };
    }
  }
  if (authStatePath() && !loadFileAuthState()) {
    return { blocked: true, unavailable: productionRuntime(), ip: clientIp(req), count: 0, retryAfterSeconds: 0 };
  }
  const entry = throttleEntry(req, now);
  const blocked = entry.count >= MAX_FAILED_LOGIN_ATTEMPTS;
  return {
    unavailable: false,
    blocked,
    ip: entry.ip,
    count: entry.count,
    retryAfterSeconds: blocked
      ? Math.max(1, Math.ceil((LOGIN_WINDOW_MS - (now - entry.firstAt)) / 1000))
      : 0,
  };
}

export async function recordFailedLogin(req, username = '', reason = 'invalid_credentials', now = Date.now()) {
  const hooks = currentAuthSecurityHooks();
  if (hooks?.loginThrottle?.recordFailure) {
    try {
      return await hooks.loginThrottle.recordFailure({ req, ip: clientIp(req), username, reason, now });
    } catch {
      return null;
    }
  }
  const entry = throttleEntry(req, now);
  const next = {
    count: entry.count + 1,
    firstAt: entry.firstAt,
    latestAt: now,
  };
  const audit = {
    timestamp: new Date(now).toISOString(),
    ip: safeAuditValue(entry.ip),
    username: safeAuditValue(username),
    reason: safeAuditValue(reason, 48),
  };
  const filePath = authStatePath();
  if (filePath) {
    const result = withFileAuthState((state) => {
      state.failedLogins[entry.ip] = next;
      state.failedLoginAudit.push(audit);
      if (state.failedLoginAudit.length > MAX_FAILED_LOGIN_AUDIT_ENTRIES) state.failedLoginAudit.shift();
    });
    if (result.unavailable && productionRuntime()) return null;
  } else {
    failedLoginState.set(entry.ip, next);
    failedLoginAudit.push(audit);
    if (failedLoginAudit.length > MAX_FAILED_LOGIN_AUDIT_ENTRIES) failedLoginAudit.shift();
  }
  console.warn(`[admin-auth] failed login username=${audit.username || '(blank)'} ip=${audit.ip} reason=${audit.reason}`);
  return audit;
}

export async function recordSuccessfulLogin(req, username = '') {
  const ip = clientIp(req);
  const hooks = currentAuthSecurityHooks();
  if (hooks?.loginThrottle?.recordSuccess) {
    try {
      return (await hooks.loginThrottle.recordSuccess({ req, ip, username, now: Date.now() })) !== false;
    } catch {
      return false;
    }
  }
  const filePath = authStatePath();
  if (filePath) {
    withFileAuthState((state) => {
      delete state.failedLogins[ip];
    });
    return true;
  }
  failedLoginState.delete(ip);
  return true;
}

export function failedLoginAuditForTests() {
  const filePath = authStatePath();
  if (filePath) {
    const state = loadFileAuthState();
    return state ? [...state.failedLoginAudit] : [];
  }
  return [...failedLoginAudit];
}

async function sessionRevocationResult(session = {}) {
  if (!session.sid) return { revoked: true, unavailable: false };
  if (authStateUnavailableResult()) return { revoked: true, unavailable: true };
  const hooks = currentAuthSecurityHooks();
  if (hooks?.sessionRevocation?.isRevoked) {
    try {
      return { unavailable: false, revoked: Boolean(await hooks.sessionRevocation.isRevoked(session)) };
    } catch {
      return { revoked: true, unavailable: productionRuntime() };
    }
  }
  const filePath = authStatePath();
  if (filePath) {
    const state = loadFileAuthState();
    if (!state) return { revoked: true, unavailable: true };
    return { unavailable: false, revoked: Boolean(state.revokedSessions?.[session.sid]) };
  }
  return { unavailable: false, revoked: revokedSessionIds.has(session.sid) };
}

export async function registerAdminSession(session = {}, req = {}) {
  const hooks = currentAuthSecurityHooks();
  if (hooks?.sessionRevocation?.register) {
    try {
      return Boolean(await hooks.sessionRevocation.register({
        session,
        metadata: { ip: clientIp(req), userAgent: safeAuditValue(headerValue(req, 'user-agent'), 160) },
      }));
    } catch {
      return false;
    }
  }
  return !productionRuntime();
}

export async function revokeAdminSession(session = {}, now = Date.now()) {
  if (!session.sid) return false;
  const revoked = {
    sid: safeAuditValue(session.sid, 128),
    sub: safeAuditValue(session.sub),
    revokedAt: new Date(now).toISOString(),
    exp: Number(session.exp) || 0,
  };
  const hooks = currentAuthSecurityHooks();
  if (hooks?.sessionRevocation?.revoke) {
    try {
      return Boolean(await hooks.sessionRevocation.revoke({ session, revoked, now }));
    } catch {
      return false;
    }
  }
  const filePath = authStatePath();
  if (filePath) {
    const result = withFileAuthState((state) => {
      state.revokedSessions[session.sid] = revoked;
    });
    return !result.unavailable;
  }
  revokedSessionIds.set(session.sid, revoked);
  return true;
}

export function configureAdminAuthSecurityHooks(hooks = null) {
  authSecurityHooks = hooks;
}

export function configureAdminAuthHooksForTests(hooks = null) {
  configureAdminAuthSecurityHooks(hooks);
}

export function resetLoginSecurityForTests() {
  failedLoginState.clear();
  failedLoginAudit.length = 0;
  revokedSessionIds.clear();
  authSecurityHooks = null;
  defaultAuthSecurityHooks = null;
  const filePath = authStatePath();
  if (filePath) {
    try {
      fs.rmSync(filePath, { force: true });
    } catch {
      // Test helper best-effort cleanup only.
    }
  }
}
