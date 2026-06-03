import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import test from 'node:test';
import dashboardHandler from '../api/admin/dashboard.js';
import { createSession, hashAdminPassword, resetLoginSecurityForTests } from '../api/admin/_auth.js';
import { buildSitemapEntries, sitemapXml } from '../scripts/lib/sitemap-builder.mjs';

test('robots and sitemap surfaces keep admin routes out of public indexes', () => {
  const robots = fs.readFileSync(new URL('../src/pages/robots.txt.ts', import.meta.url), 'utf8');
  assert.match(robots, /Disallow: \/admin\//);
  assert.match(robots, /Disallow: \/api\/admin\//);

  const sitemap = sitemapXml(buildSitemapEntries([]));
  assert.doesNotMatch(sitemap, /\/admin(?:\/|\.html|<)/);
  assert.doesNotMatch(sitemap, /\/api\/admin\//);

  const astroConfig = fs.readFileSync(new URL('../astro.config.mjs', import.meta.url), 'utf8');
  assert.match(astroConfig, /pathname\.startsWith\('\/admin'\)/);
});

test('/admin and /admin.html render only a login shell with no private data payload', () => {
  const adminSource = fs.readFileSync(new URL('../src/pages/admin.astro', import.meta.url), 'utf8');
  const adminHtmlSource = fs.readFileSync(new URL('../src/pages/admin.html.astro', import.meta.url), 'utf8');

  for (const source of [adminSource, adminHtmlSource]) {
    assert.match(source, /noindex=\{true\}/);
    assert.match(source, /\/api\/admin\/login/);
    assert.doesNotMatch(source, /latest-news\.json|archived-news\.json|buildAdmin/);
    assert.doesNotMatch(source, /ADMIN_PASSWORD|ADMIN_SESSION_SECRET|ADMIN_PASSWORD_HASH/);
  }
});

function configureDashboardAuth() {
  process.env.ADMIN_USERNAME = 'owner';
  process.env.ADMIN_PASSWORD_HASH = hashAdminPassword('correct-password', 'admin-dashboard-routes-salt');
  process.env.ADMIN_SESSION_SECRET = 'admin-dashboard-route-secret-with-enough-entropy';
  delete process.env.ADMIN_PASSWORD;
  resetLoginSecurityForTests();
}

function mockReq({ method = 'GET', url = '/api/admin/dashboard', headers = {} } = {}) {
  const req = Readable.from([]);
  req.method = method;
  req.url = url;
  req.headers = headers;
  req.socket = { remoteAddress: '198.51.100.10' };
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
    json() {
      return JSON.parse(this.body || '{}');
    },
  };
}

async function callDashboard(reqOptions) {
  const res = mockRes();
  await dashboardHandler(mockReq(reqOptions), res);
  return res;
}

test('admin dashboard API keeps logs behind admin session auth', async () => {
  configureDashboardAuth();

  const missingSession = await callDashboard({ url: '/api/admin/dashboard?status=missing-image' });
  assert.equal(missingSession.statusCode, 401);

  const sessionCookie = createSession('owner').cookie;
  const authed = await callDashboard({
    url: '/api/admin/dashboard?status=missing-image&q=gitex',
    headers: { cookie: sessionCookie },
  });

  assert.equal(authed.statusCode, 200);
  const payload = authed.json();
  assert.ok(payload.dashboard.counts.total > 0);
  assert.ok(Array.isArray(payload.dashboard.logs.generation));
  assert.ok(Array.isArray(payload.articles));
  assert.deepEqual(payload.filters, { q: 'gitex', status: 'missing-image' });
});

test('admin dashboard route is API-backed and does not embed private article datasets', () => {
  const dashboardSource = fs.readFileSync(new URL('../src/pages/admin/dashboard.astro', import.meta.url), 'utf8');
  const adminSource = fs.readFileSync(new URL('../src/pages/admin.astro', import.meta.url), 'utf8');
  const adminHtmlSource = fs.readFileSync(new URL('../src/pages/admin.html.astro', import.meta.url), 'utf8');

  assert.match(dashboardSource, new RegExp('noindex=\\{true\\}'));
  assert.match(dashboardSource, new RegExp('/api/admin/dashboard'));
  assert.doesNotMatch(dashboardSource, new RegExp('latest-news\\.json|archived-news\\.json|source-health\\.json|claim-ledger\\.json|editorial-cycles\\.json'));
  assert.match(adminSource, new RegExp('/admin/dashboard/'));
  assert.match(adminHtmlSource, new RegExp('/admin/dashboard/'));
});
