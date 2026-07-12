import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import loginHandler from '../api/admin/login.js';
import {
  canAdminPerformAction,
  configureAdminAuthSecurityHooks,
  hashAdminPassword,
  requireAdmin,
  resetLoginSecurityForTests,
} from '../api/admin/_auth.js';

function resetEnv() {
  delete process.env.ADMIN_USERNAME;
  delete process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_PASSWORD_HASH;
  delete process.env.ADMIN_SESSION_SECRET;
  delete process.env.ADMIN_AUTH_STATE_FILE;
  delete process.env.ADMIN_ROLE;
  delete process.env.ADMIN_USER_ROLES;
  delete process.env.ADMIN_AUTH_SECRET;
  delete process.env.AUTH_SECRET;
  delete process.env.NODE_ENV;
  resetLoginSecurityForTests();
}

function configureAuth(options = {}) {
  process.env.ADMIN_USERNAME = 'owner';
  process.env.ADMIN_PASSWORD_HASH = hashAdminPassword('correct-password', 'admin-durable-test-salt');
  process.env.ADMIN_SESSION_SECRET = 'admin-durable-session-secret-with-at-least-sixty-four-bytes-0123456789';
  if (options.role) process.env.ADMIN_ROLE = options.role;
  if (options.stateFile) process.env.ADMIN_AUTH_STATE_FILE = options.stateFile;
  resetLoginSecurityForTests();
}

function mockReq({ method = 'GET', url = '/api/admin/login', headers = {}, body } = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = Readable.from(chunks);
  req.method = method;
  req.url = url;
  req.headers = body === undefined
    ? headers
    : { 'content-type': 'application/json', ...headers };
  req.socket = { remoteAddress: '203.0.113.42' };
  return req;
}

function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    getHeader(key) {
      return this.headers[key.toLowerCase()];
    },
    end(body = '') {
      this.body = body;
      this.ended = true;
    },
    json() {
      return JSON.parse(this.body || '{}');
    },
  };
}

async function call(handler, reqOptions) {
  const req = mockReq(reqOptions);
  const res = mockRes();
  await handler(req, res);
  return res;
}

async function tempStateFile() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'admin-auth-state-'));
  return path.join(dir, 'state.json');
}

test('admin session claims include durable session id and editor role authorization boundaries', async () => {
  resetEnv();
  configureAuth({ role: 'editor' });

  const login = await call(loginHandler, {
    method: 'POST',
    body: { username: 'owner', password: 'correct-password' },
  });

  assert.equal(login.statusCode, 200);
  assert.equal(login.json().role, 'editor');
  assert.deepEqual(login.json().roles, ['editor']);
  assert.equal(typeof login.json().sessionId, 'string');
  assert.ok(login.json().sessionId.length >= 24);

  const sessionCheck = await call(loginHandler, {
    method: 'GET',
    headers: { cookie: login.getHeader('set-cookie') },
  });
  assert.equal(sessionCheck.statusCode, 200);
  assert.equal(sessionCheck.json().sessionId, login.json().sessionId);
  assert.equal(canAdminPerformAction(sessionCheck.json(), 'save-draft'), true);
  assert.equal(canAdminPerformAction(sessionCheck.json(), 'publish'), false);

  const res = mockRes();
  const forbidden = await requireAdmin(mockReq({ headers: { cookie: login.getHeader('set-cookie') } }), res, { action: 'article:publish' });
  assert.equal(forbidden, null);
  assert.equal(res.statusCode, 403);
});

test('logout requires csrf and revokes the session id in durable auth state', async () => {
  resetEnv();
  const stateFile = await tempStateFile();
  configureAuth({ stateFile });

  const login = await call(loginHandler, {
    method: 'POST',
    body: { username: 'owner', password: 'correct-password' },
  });
  const cookie = login.getHeader('set-cookie');
  const { csrfToken, sessionId } = login.json();

  const missingCsrf = await call(loginHandler, {
    method: 'DELETE',
    headers: { cookie },
  });
  assert.equal(missingCsrf.statusCode, 403);

  const stillActive = await call(loginHandler, {
    method: 'GET',
    headers: { cookie },
  });
  assert.equal(stillActive.statusCode, 200);

  const logout = await call(loginHandler, {
    method: 'DELETE',
    headers: { cookie, 'x-csrf-token': csrfToken },
  });
  assert.equal(logout.statusCode, 200);
  assert.match(logout.getHeader('set-cookie'), /Max-Age=0/);

  const state = JSON.parse(await fs.readFile(stateFile, 'utf8'));
  assert.equal(state.revokedSessions[sessionId].sub, 'owner');

  const revoked = await call(loginHandler, {
    method: 'GET',
    headers: { cookie },
  });
  assert.equal(revoked.statusCode, 401);
  assert.match(revoked.body, /session expired/i);
});

test('file-backed login throttle persists failed login audit and blocks repeated attempts', async () => {
  resetEnv();
  const stateFile = await tempStateFile();
  configureAuth({ stateFile });

  for (let index = 0; index < 5; index += 1) {
    const response = await call(loginHandler, {
      method: 'POST',
      body: { username: 'owner', password: 'wrong-password' },
    });
    assert.equal(response.statusCode, 401);
  }

  const state = JSON.parse(await fs.readFile(stateFile, 'utf8'));
  assert.equal(state.failedLoginAudit.length, 5);
  assert.equal(state.failedLoginAudit[0].username, 'owner');

  const blocked = await call(loginHandler, {
    method: 'POST',
    body: { username: 'owner', password: 'correct-password' },
  });
  assert.equal(blocked.statusCode, 429);
  assert.match(blocked.getHeader('retry-after'), /^\d+$/);
});

test('production admin auth fails closed when durable auth state is not configured', async () => {
  resetEnv();
  process.env.NODE_ENV = 'production';
  process.env.ADMIN_USERNAME = 'owner';
  process.env.ADMIN_PASSWORD_HASH = hashAdminPassword('correct-password', 'admin-durable-test-salt');
  process.env.ADMIN_SESSION_SECRET = 'admin-durable-session-secret-with-at-least-sixty-four-bytes-0123456789';

  const login = await call(loginHandler, {
    method: 'POST',
    body: { username: 'owner', password: 'correct-password' },
  });
  assert.equal(login.statusCode, 503);
  assert.equal(login.getHeader('set-cookie'), undefined);
  assert.match(login.body, /temporarily unavailable/i);

  resetEnv();
});

test('production admin auth accepts explicit pluggable throttle and revocation hooks', async () => {
  resetEnv();
  process.env.NODE_ENV = 'production';
  process.env.ADMIN_USERNAME = 'owner';
  process.env.ADMIN_PASSWORD_HASH = hashAdminPassword('correct-password', 'admin-durable-test-salt');
  process.env.ADMIN_SESSION_SECRET = 'admin-durable-session-secret-with-at-least-sixty-four-bytes-0123456789';

  let throttleChecked = false;
  let successRecorded = false;
  let revokedSessionId = '';
  configureAdminAuthSecurityHooks({
    loginThrottle: {
      check() {
        throttleChecked = true;
        return { blocked: false, count: 0, retryAfterSeconds: 0 };
      },
      recordSuccess() {
        successRecorded = true;
        return true;
      },
    },
    sessionRevocation: {
      register() {
        return true;
      },
      isRevoked() {
        return false;
      },
      revoke({ session }) {
        revokedSessionId = session.sid;
        return true;
      },
    },
  });

  const login = await call(loginHandler, {
    method: 'POST',
    body: { username: 'owner', password: 'correct-password' },
  });
  assert.equal(login.statusCode, 200);
  assert.equal(throttleChecked, true);
  assert.equal(successRecorded, true);

  const logout = await call(loginHandler, {
    method: 'DELETE',
    headers: { cookie: login.getHeader('set-cookie'), 'x-csrf-token': login.json().csrfToken },
  });
  assert.equal(logout.statusCode, 200);
  assert.equal(revokedSessionId, login.json().sessionId);

  resetEnv();
});

test('unknown or malformed role configuration fails closed', async () => {
  resetEnv();
  process.env.ADMIN_USERNAME = 'owner';
  process.env.ADMIN_PASSWORD_HASH = hashAdminPassword('correct-password', 'admin-durable-test-salt');
  process.env.ADMIN_SESSION_SECRET = 'admin-durable-session-secret-with-at-least-sixty-four-bytes-0123456789';
  process.env.ADMIN_ROLE = 'edtor';
  let response = await call(loginHandler, {
    method: 'POST',
    body: { username: 'owner', password: 'correct-password' },
  });
  assert.equal(response.statusCode, 503);
  assert.equal(response.getHeader('set-cookie'), undefined);

  process.env.ADMIN_ROLE = 'admin';
  process.env.ADMIN_USER_ROLES = '{broken-json';
  response = await call(loginHandler, {
    method: 'POST',
    body: { username: 'owner', password: 'correct-password' },
  });
  assert.equal(response.statusCode, 503);
  assert.equal(response.getHeader('set-cookie'), undefined);
});

test('production failed-login audit persistence errors fail closed', async () => {
  resetEnv();
  process.env.NODE_ENV = 'production';
  process.env.ADMIN_USERNAME = 'owner';
  process.env.ADMIN_PASSWORD_HASH = hashAdminPassword('correct-password', 'admin-durable-test-salt');
  process.env.ADMIN_SESSION_SECRET = 'admin-durable-session-secret-with-at-least-sixty-four-bytes-0123456789';
  configureAdminAuthSecurityHooks({
    loginThrottle: {
      check: () => ({ blocked: false }),
      recordFailure: () => null,
    },
    sessionRevocation: { isRevoked: () => false, revoke: () => true },
  });
  const response = await call(loginHandler, {
    method: 'POST',
    body: { username: 'owner', password: 'wrong-password' },
  });
  assert.equal(response.statusCode, 503);
  assert.doesNotMatch(response.body, /Invalid username or password/);
});
