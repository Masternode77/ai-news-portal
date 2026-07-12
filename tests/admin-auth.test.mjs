import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import {
  createSessionCookie,
  credentialsMatch,
  hashAdminPassword,
  requireAdmin,
  resetLoginSecurityForTests,
} from '../api/admin/_auth.js';

function resetEnv() {
  delete process.env.ADMIN_USERNAME;
  delete process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_PASSWORD_HASH;
  delete process.env.ADMIN_SESSION_SECRET;
  delete process.env.ADMIN_AUTH_SECRET;
  delete process.env.AUTH_SECRET;
  resetLoginSecurityForTests();
}

function mockReq(headers = {}) {
  const req = Readable.from([]);
  req.headers = headers;
  return req;
}

function mockRes() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    end(body = '') {
      this.body = body;
      this.ended = true;
    },
  };
}

test('admin credentials require ADMIN_PASSWORD_HASH and configured username', () => {
  resetEnv();
  process.env.ADMIN_USERNAME = 'owner';
  process.env.ADMIN_PASSWORD = 'plaintext-legacy-password';
  process.env.ADMIN_PASSWORD_HASH = hashAdminPassword('correct horse battery staple', 'fixed-test-salt');

  assert.equal(credentialsMatch({ username: 'owner', password: 'correct horse battery staple' }), true);
  assert.equal(credentialsMatch({ username: 'owner', password: 'wrong' }), false);
  assert.equal(credentialsMatch({ username: 'intruder', password: 'correct horse battery staple' }), false);

  delete process.env.ADMIN_PASSWORD_HASH;
  assert.equal(credentialsMatch({ username: 'owner', password: 'plaintext-legacy-password' }), false);
});

test('admin session cookie is signed, httponly, strict, expiring, and carries csrf metadata', async () => {
  resetEnv();
  process.env.ADMIN_USERNAME = 'owner';
  process.env.ADMIN_PASSWORD_HASH = hashAdminPassword('not-used-for-session-test', 'session-test-salt');
  process.env.ADMIN_SESSION_SECRET = 'test-session-secret-with-at-least-sixty-four-bytes-0123456789abcdef';

  const cookie = createSessionCookie('owner');
  assert.match(cookie, /cc_admin=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Max-Age=28800/);
  assert.doesNotMatch(cookie, /test-session-secret/);

  const res = mockRes();
  const session = await requireAdmin(mockReq({ cookie }), res);
  assert.equal(res.ended, undefined);
  assert.equal(session.sub, 'owner');
  assert.equal(typeof session.csrf, 'string');
  assert.ok(session.csrf.length >= 32);
});

test('admin session authentication fails closed when the signing secret is shorter than 64 bytes', async () => {
  resetEnv();
  process.env.ADMIN_USERNAME = 'owner';
  process.env.ADMIN_PASSWORD_HASH = hashAdminPassword('not-used-for-session-test', 'weak-secret-test-salt');
  process.env.ADMIN_SESSION_SECRET = 'too-short';

  const res = mockRes();
  const session = await requireAdmin(mockReq(), res);
  assert.equal(session, null);
  assert.equal(res.statusCode, 503);
  assert.doesNotMatch(res.body, /too-short|ADMIN_SESSION_SECRET/);
});
