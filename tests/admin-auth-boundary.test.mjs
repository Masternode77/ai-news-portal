import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import test from 'node:test';
import loginHandler from '../api/admin/login.js';
import {
  adminRateLimitControlReady,
  createSession,
  failedLoginAuditForTests,
  hashAdminPassword,
  recordFailedLogin,
  requireAdmin,
  resetLoginSecurityForTests,
} from '../api/admin/_auth.js';

function configureAuth() {
  process.env.ADMIN_USERNAME = 'owner';
  process.env.ADMIN_PASSWORD_HASH = hashAdminPassword('correct-password', 'admin-boundary-test-salt');
  process.env.ADMIN_SESSION_SECRET = 'admin-boundary-session-secret-with-enough-entropy';
  delete process.env.ADMIN_VERCEL_RATE_LIMIT_READY;
  resetLoginSecurityForTests();
}

function request({ headers = {}, body, rawBody } = {}) {
  const payload = rawBody === undefined ? JSON.stringify(body) : rawBody;
  const req = Readable.from([Buffer.from(payload)]);
  req.method = 'POST';
  req.url = '/api/admin/login';
  req.headers = { 'content-type': 'application/json', ...headers };
  req.socket = { remoteAddress: '198.51.100.9' };
  return req;
}

function response() {
  return {
    headers: {},
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    getHeader(key) { return this.headers[key.toLowerCase()]; },
    end(body) { this.body = body; },
  };
}

async function login(options) {
  const res = response();
  await loginHandler(request(options), res);
  return res;
}

function authenticatedRequest(cookie) {
  const req = Readable.from([]);
  req.headers = { cookie };
  return req;
}

function forgedCookie(secret) {
  const payload = Buffer.from(JSON.stringify({ sub: 'owner', exp: Math.floor(Date.now() / 1000) + 3600, csrf: 'forged' })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `cc_admin=${payload}.${signature}`;
}

test('login rejects declared and streamed oversized bodies before credential verification', async () => {
  configureAuth();

  const declared = await login({ headers: { 'content-length': '8192' }, body: { username: 'owner', password: 'correct-password' } });
  assert.equal(declared.statusCode, 413);
  assert.equal(failedLoginAuditForTests().length, 0);

  const streamed = await login({ rawBody: JSON.stringify({ username: 'owner', password: 'x'.repeat(5000) }) });
  assert.equal(streamed.statusCode, 413);
  assert.equal(failedLoginAuditForTests().length, 0);
});

test('login rejects structurally invalid JSON before credential verification', async () => {
  configureAuth();

  const result = await login({ body: ['owner', 'correct-password'] });

  assert.equal(result.statusCode, 400);
  assert.equal(failedLoginAuditForTests().length, 0);
});

test('login throttle ignores spoofed forwarding headers and keys on the socket peer', async () => {
  configureAuth();

  for (let index = 0; index < 5; index += 1) {
    await login({ headers: { 'x-forwarded-for': `203.0.113.${index + 1}` }, body: { username: 'owner', password: 'wrong-password' } });
  }
  const result = await login({ body: { username: 'owner', password: 'wrong-password' } });

  assert.equal(result.statusCode, 429);
  assert.equal(failedLoginAuditForTests().every((audit) => audit.ip === '198.51.100.9'), true);
});

test('production login fails closed until the external rate-limit control is attested', async () => {
  configureAuth();
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  try {
    const result = await login({ body: { username: 'owner', password: 'correct-password' } });
    assert.equal(result.statusCode, 503);
    assert.equal(result.getHeader('set-cookie'), undefined);

    process.env.ADMIN_VERCEL_RATE_LIMIT_READY = 'true';
    const attested = await login({ body: { username: 'owner', password: 'correct-password' } });
    assert.equal(attested.statusCode, 200);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test('admin rate-limit attestation stays aligned across runtime, env template, and deployment checklist', () => {
  const envTemplate = fs.readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  const checklist = fs.readFileSync(new URL('../docs/commercialization-deploy-checklist.md', import.meta.url), 'utf8');
  const gate = fs.readFileSync(new URL('../docs/admin-auth-production-gate.md', import.meta.url), 'utf8');
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAttestation = process.env.ADMIN_VERCEL_RATE_LIMIT_READY;

  try {
    assert.match(envTemplate, /^ADMIN_VERCEL_RATE_LIMIT_READY=false$/m);
    assert.match(checklist, /admin-auth-production-gate\.md/);
    assert.match(gate, /ADMIN_VERCEL_RATE_LIMIT_READY=true/);

    process.env.NODE_ENV = 'production';
    delete process.env.ADMIN_VERCEL_RATE_LIMIT_READY;
    assert.equal(adminRateLimitControlReady(), false);
    process.env.ADMIN_VERCEL_RATE_LIMIT_READY = 'true';
    assert.equal(adminRateLimitControlReady(), true);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousAttestation === undefined) delete process.env.ADMIN_VERCEL_RATE_LIMIT_READY;
    else process.env.ADMIN_VERCEL_RATE_LIMIT_READY = previousAttestation;
  }
});

test('admin rejects placeholder, low-entropy, and malformed password-hash configuration before sessions sign', () => {
  configureAuth();
  const safeSecret = process.env.ADMIN_SESSION_SECRET;
  const safeHash = process.env.ADMIN_PASSWORD_HASH;

  try {
    for (const unsafeSecret of ['replace-with-64-plus-random-characters', 'x'.repeat(64), 'short-secret']) {
      process.env.ADMIN_SESSION_SECRET = unsafeSecret;
      assert.throws(() => createSession('owner'));
      const res = response();
      assert.equal(requireAdmin(authenticatedRequest(forgedCookie(unsafeSecret)), res), null);
      assert.equal(res.statusCode, 500);
    }

    process.env.ADMIN_SESSION_SECRET = safeSecret;
    process.env.ADMIN_PASSWORD_HASH = 'scrypt$bad$short';
    assert.throws(() => createSession('owner'));
  } finally {
    process.env.ADMIN_SESSION_SECRET = safeSecret;
    process.env.ADMIN_PASSWORD_HASH = safeHash;
  }
});

test('failed-login audit emits a fixed event without retaining or logging the raw username', () => {
  configureAuth();
  const rawUsername = 'operator\ninjected-field';
  const originalWarn = console.warn;
  const emitted = [];
  console.warn = (event) => emitted.push(event);

  try {
    const audit = recordFailedLogin(request({ body: { username: rawUsername, password: 'invalid' } }), rawUsername);
    assert.equal(Object.hasOwn(audit, 'username'), false);
    assert.match(audit.principalId, /^[A-Za-z0-9_-]{16}$/);
    assert.equal(JSON.stringify(audit).includes(rawUsername), false);
    assert.equal(emitted.length, 1);
    const log = JSON.parse(emitted[0]);
    assert.deepEqual(log, { event: 'admin.login_failed', clientIp: '198.51.100.9', principalId: audit.principalId, reason: 'invalid_credentials' });
  } finally {
    console.warn = originalWarn;
  }
});
