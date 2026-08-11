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
  req.headers = { 'content-type': 'application/json', ...headers };
  req.socket = { remoteAddress: '198.51.100.9' };
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
  assert.equal(Object.hasOwn(failedLoginAuditForTests()[0], 'username'), false);
  assert.match(failedLoginAuditForTests()[0].principalId, /^[A-Za-z0-9_-]{16}$/);

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

test('admin article API returns 409 when the submitted source SHA is stale', async () => {
  // Given: an authenticated editor loaded source-v1 while GitHub now serves source-v2.
  configureAuth();
  process.env.GITHUB_TOKEN = 'test-token'; process.env.GITHUB_REPO = 'test/repo'; process.env.GITHUB_BRANCH = 'main';
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const apiPath = new URL(url).pathname.replace('/repos/test/repo', '');
    if (apiPath === '/git/ref/heads/main') {
      return { ok: true, status: 200, text: async () => JSON.stringify({ object: { sha: 'head-v2' } }) };
    }
    if (apiPath.startsWith('/contents/')) {
      if (apiPath === '/contents/config/sourceRegistry.yml' && new URL(url).searchParams.get('ref') === 'head-v2') {
        return { ok: true, status: 200, text: async () => JSON.stringify({ sha: 'registry-v2', content: Buffer.from('sources:\n  - id: authorized-test-source\n    name: Authorized Test Source\n    domain: example.test\n    feed: https://example.test/feed\n    status: active_feed\n    text_use_basis: licensed\n    image_use_basis: unreviewed\n    terms_url: https://example.test/terms\n    reviewed_at: 2026-08-09T00:00:00.000Z\n    allow_text_use: true\n    allow_image_reuse: false\n').toString('base64') }) };
      }
      const rows = apiPath.includes('latest-news.json')
        ? [{ id: 'article-1', title: 'Current title', public_status: 'draft', sourceRegistryId: 'authorized-test-source', sourceUrl: 'https://example.test/article-1', expertLensFull: {} }]
        : [];
      return { ok: true, status: 200, text: async () => JSON.stringify({ sha: apiPath.includes('latest-news.json') ? 'source-v2' : 'archive-v1', content: Buffer.from(JSON.stringify(rows)).toString('base64') }) };
    }
    throw new Error(`Unexpected GitHub request ${apiPath}`);
  };

  try {
    const login = await call(loginHandler, { method: 'POST', body: { username: 'owner', password: 'correct-password' } });

    // When: the stale editor submits an otherwise-valid write.
    const save = await call(articleHandler, {
      method: 'POST',
      url: '/api/admin/article',
      headers: { cookie: login.getHeader('set-cookie'), 'x-csrf-token': login.json().csrfToken },
      body: { id: 'article-1', action: 'save-draft', expectedSourceSha: 'source-v1', title: 'Stale title' },
    });

    // Then: the HTTP boundary reports a conflict explicitly.
    assert.equal(save.statusCode, 409);
    assert.match(save.body, /changed since it was loaded/i);
  } finally {
    global.fetch = originalFetch;
    delete process.env.GITHUB_TOKEN; delete process.env.GITHUB_REPO; delete process.env.GITHUB_BRANCH;
  }
});

test('admin article API fails closed when the exact-head source registry is malformed', async () => {
  configureAuth();
  process.env.GITHUB_TOKEN = 'test-token'; process.env.GITHUB_REPO = 'test/repo'; process.env.GITHUB_BRANCH = 'main';
  const originalFetch = global.fetch;
  const writes = [];
  global.fetch = async (url, options = {}) => {
    const apiPath = new URL(url).pathname.replace('/repos/test/repo', '');
    const method = options.method || 'GET';
    if (method !== 'GET') writes.push({ apiPath, method });
    if (apiPath === '/git/ref/heads/main') return { ok: true, status: 200, text: async () => JSON.stringify({ object: { sha: 'head-v2' } }) };
    if (apiPath === '/contents/config/sourceRegistry.yml') return { ok: true, status: 200, text: async () => JSON.stringify({ sha: 'registry-v2', content: Buffer.from('sources:\n').toString('base64') }) };
    if (apiPath.startsWith('/contents/')) {
      const rows = apiPath.includes('latest-news.json') ? [{ id: 'article-1', title: 'Current title', public_status: 'draft' }] : [];
      return { ok: true, status: 200, text: async () => JSON.stringify({ sha: apiPath.includes('latest-news.json') ? 'source-v1' : 'archive-v1', content: Buffer.from(JSON.stringify(rows)).toString('base64') }) };
    }
    throw new Error(`Unexpected GitHub request ${apiPath}`);
  };

  try {
    const login = await call(loginHandler, { method: 'POST', body: { username: 'owner', password: 'correct-password' } });
    const save = await call(articleHandler, {
      method: 'POST',
      url: '/api/admin/article',
      headers: { cookie: login.getHeader('set-cookie'), 'x-csrf-token': login.json().csrfToken },
      body: { id: 'article-1', action: 'save-draft', expectedSourceSha: 'source-v1', title: 'Current title' },
    });

    assert.equal(save.statusCode, 500);
    assert.equal(writes.length, 0);
  } finally {
    global.fetch = originalFetch;
    delete process.env.GITHUB_TOKEN; delete process.env.GITHUB_REPO; delete process.env.GITHUB_BRANCH;
  }
});

test('admin article API rejects unconsumed regeneration actions', async () => {
  // Given: an authenticated editor session.
  configureAuth();
  const login = await call(loginHandler, { method: 'POST', body: { username: 'owner', password: 'correct-password' } });

  // When: a legacy client submits an action with no runtime consumer.
  const save = await call(articleHandler, {
    method: 'POST',
    url: '/api/admin/article',
    headers: { cookie: login.getHeader('set-cookie'), 'x-csrf-token': login.json().csrfToken },
    body: { id: 'article-1', action: 'regenerate-image', expectedSourceSha: 'source-v1' },
  });

  // Then: the server rejects the unsupported action explicitly.
  assert.equal(save.statusCode, 400);
  assert.match(save.body, /Unsupported admin article action/);
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
