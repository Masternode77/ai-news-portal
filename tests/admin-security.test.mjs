import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import articleHandler from '../api/admin/article.js';
import loginHandler from '../api/admin/login.js';
import {
  failedLoginAuditForTests,
  hashAdminPassword,
  resetLoginSecurityForTests,
} from '../api/admin/_auth.js';
import { auditAdminExclusion } from '../scripts/audit-admin-exclusion.mjs';

function configureAuth() {
  process.env.ADMIN_USERNAME = 'owner';
  process.env.ADMIN_PASSWORD_HASH = hashAdminPassword('correct-password', 'admin-security-test-salt');
  process.env.ADMIN_SESSION_SECRET = 'admin-security-session-secret-with-enough-entropy';
  delete process.env.ADMIN_PASSWORD;
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
  req.socket = { remoteAddress: '198.51.100.9' };
  return req;
}

test('admin auth fails closed without leaking configuration and never caches responses', async () => {
  delete process.env.ADMIN_USERNAME;
  delete process.env.ADMIN_PASSWORD_HASH;
  delete process.env.ADMIN_SESSION_SECRET;

  const response = await call(loginHandler, { method: 'GET' });

  assert.equal(response.statusCode, 503);
  assert.equal(response.getHeader('cache-control'), 'no-store');
  assert.doesNotMatch(response.body, /ADMIN_|SESSION_SECRET|PASSWORD_HASH/);
  assert.match(response.body, /temporarily unavailable/i);
});

test('admin JSON endpoints reject unsupported content types and oversized bodies', async () => {
  configureAuth();

  const unsupported = await call(loginHandler, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: { username: 'owner', password: 'correct-password' },
  });
  assert.equal(unsupported.statusCode, 415);

  const oversized = await call(loginHandler, {
    method: 'POST',
    body: { username: 'owner', password: 'x'.repeat(70 * 1024) },
  });
  assert.equal(oversized.statusCode, 413);
  assert.equal(oversized.getHeader('cache-control'), 'no-store');
});

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

async function fixtureDist(files = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'admin-exclusion-'));
  for (const [name, body] of Object.entries(files)) {
    const filePath = path.join(dir, name);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, body, 'utf8');
  }
  return dir;
}

test('wrong admin password is rejected, not cookie-setting, and logged before throttle', async () => {
  configureAuth();

  const first = await call(loginHandler, {
    method: 'POST',
    body: { username: 'owner', password: 'wrong-password' },
  });
  assert.equal(first.statusCode, 401);
  assert.equal(first.getHeader('set-cookie'), undefined);
  assert.equal(failedLoginAuditForTests().length, 1);
  assert.equal(failedLoginAuditForTests()[0].username, 'owner');

  for (let index = 0; index < 4; index += 1) {
    await call(loginHandler, {
      method: 'POST',
      body: { username: 'owner', password: 'wrong-password' },
    });
  }

  const throttled = await call(loginHandler, {
    method: 'POST',
    body: { username: 'owner', password: 'wrong-password' },
  });
  assert.equal(throttled.statusCode, 429);
  assert.match(throttled.body, /Too many failed login attempts/);
});

test('successful login sets httponly cookie and returns csrf token for mutating admin APIs', async () => {
  configureAuth();

  const login = await call(loginHandler, {
    method: 'POST',
    body: { username: 'owner', password: 'correct-password' },
  });
  assert.equal(login.statusCode, 200);
  assert.match(login.getHeader('set-cookie'), /HttpOnly/);
  assert.match(login.getHeader('set-cookie'), /SameSite=Strict/);
  assert.equal(typeof login.json().csrfToken, 'string');
  assert.ok(login.json().csrfToken.length >= 32);

  const sessionCheck = await call(loginHandler, {
    method: 'GET',
    headers: { cookie: login.getHeader('set-cookie') },
  });
  assert.equal(sessionCheck.statusCode, 200);
  assert.equal(sessionCheck.json().csrfToken, login.json().csrfToken);
});

test('admin article API rejects missing sessions and mutating requests without csrf token', async () => {
  configureAuth();

  const missingSession = await call(articleHandler, {
    method: 'GET',
    url: '/api/admin/article?id=known',
  });
  assert.equal(missingSession.statusCode, 401);
  assert.match(missingSession.body, /Admin login required/);

  const login = await call(loginHandler, {
    method: 'POST',
    body: { username: 'owner', password: 'correct-password' },
  });

  const missingCsrf = await call(articleHandler, {
    method: 'POST',
    url: '/api/admin/article',
    headers: { cookie: login.getHeader('set-cookie') },
    body: { id: 'known', title: 'Title', finalArticleBody: 'Body' },
  });
  assert.equal(missingCsrf.statusCode, 403);
  assert.match(missingCsrf.body, /CSRF token required/);

  const wrongCsrf = await call(articleHandler, {
    method: 'POST',
    url: '/api/admin/article',
    headers: {
      cookie: login.getHeader('set-cookie'),
      'x-csrf-token': 'wrong-token',
    },
    body: { id: 'known', title: 'Title', finalArticleBody: 'Body' },
  });
  assert.equal(wrongCsrf.statusCode, 403);
});

test('admin exclusion audit passes noindex admin pages and public indexes without admin routes', async () => {
  const distDir = await fixtureDist({
    'robots.txt': 'User-agent: *\nDisallow: /admin\nDisallow: /api/admin\nSitemap: https://www.computecurrent.com/sitemap.xml\n',
    'sitemap.xml': '<urlset><url><loc>https://www.computecurrent.com/</loc></url></urlset>',
    'admin/index.html': '<html><head><meta name="robots" content="noindex,nofollow"></head><body>Restricted access</body></html>',
    'admin.html/index.html': '<html><head><meta name="robots" content="noindex,nofollow"></head><body>Restricted access</body></html>',
  });

  const result = await auditAdminExclusion({ distDir });

  assert.equal(result.ok, true);
  assert.equal(result.failures.length, 0);
});

test('fails when admin appears in sitemap', async () => {
  const distDir = await fixtureDist({
    'robots.txt': 'User-agent: *\nDisallow: /admin\nDisallow: /api/admin\n',
    'sitemap.xml': '<urlset><url><loc>https://www.computecurrent.com/admin/</loc></url></urlset>',
    'admin/index.html': '<html><head><meta name="robots" content="noindex,nofollow"></head><body>Restricted access</body></html>',
  });

  const result = await auditAdminExclusion({ distDir });

  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.includes('admin route in sitemap')));
});
