import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import test from 'node:test';
import dashboardHandler from '../api/admin/dashboard.js';
import { createSession, hashAdminPassword, resetLoginSecurityForTests } from '../api/admin/_auth.js';
import { buildSitemapEntries, sitemapXml } from '../scripts/lib/sitemap-builder.mjs';

const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

function rewriteFor(pathname) {
  for (const rewrite of vercel.rewrites || []) {
    const sourceParts = rewrite.source.split('/').filter(Boolean);
    const pathParts = pathname.split('/').filter(Boolean);
    if (sourceParts.length !== pathParts.length) continue;

    const params = {};
    const matches = sourceParts.every((part, index) => {
      if (!part.startsWith(':')) return part === pathParts[index];
      params[part.slice(1)] = pathParts[index];
      return Boolean(pathParts[index]);
    });
    if (!matches) continue;

    return {
      source: rewrite.source,
      destination: rewrite.destination.replace(/:([A-Za-z0-9_]+)/g, (_, key) => params[key] || ''),
    };
  }
  return null;
}

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

test('Vercel rewrites public admin article URLs to the existing secure editor shell', () => {
  const rewrites = vercel.rewrites || [];
  const sources = rewrites.map((rewrite) => rewrite.source);
  const newIndex = sources.indexOf('/admin/articles/new');
  const editIndex = sources.indexOf('/admin/articles/:id/edit');
  const showIndex = sources.indexOf('/admin/articles/:id');

  assert.notEqual(newIndex, -1);
  assert.notEqual(editIndex, -1);
  assert.notEqual(showIndex, -1);
  assert.ok(newIndex < editIndex);
  assert.ok(editIndex < showIndex);

  assert.deepEqual(rewriteFor('/admin/articles/new'), {
    source: '/admin/articles/new',
    destination: '/admin/articles/new/',
  });
  assert.deepEqual(rewriteFor('/admin/articles/source-123/edit'), {
    source: '/admin/articles/:id/edit',
    destination: '/admin/articles/editor/?id=source-123',
  });
  assert.deepEqual(rewriteFor('/admin/articles/source-123'), {
    source: '/admin/articles/:id',
    destination: '/admin/articles/editor/?id=source-123',
  });
});

test('public admin article URL contract does not add a second admin UI or public article exposure', () => {
  const adminHeader = vercel.headers.find((entry) => entry.source === '/admin/(.*)');
  assert.ok(adminHeader);
  assert.ok(adminHeader.headers.some((header) => header.key === 'Cache-Control' && /no-store/.test(header.value)));
  assert.ok(adminHeader.headers.some((header) => header.key === 'X-Robots-Tag' && /noindex/.test(header.value)));

  const editorSource = fs.readFileSync(new URL('../src/pages/admin/articles/editor.astro', import.meta.url), 'utf8');
  assert.match(editorSource, /AdminCmsShell/);
  assert.match(editorSource, /canonicalPath="\/admin\/articles\/editor\/"/);

  assert.equal(fs.existsSync(new URL('../src/pages/admin/articles/[id].astro', import.meta.url)), false);
  assert.equal(fs.existsSync(new URL('../src/pages/admin/articles/[id]/edit.astro', import.meta.url)), false);

  const sitemap = sitemapXml(buildSitemapEntries([{ id: 'source-123', public_status: 'draft' }]));
  assert.doesNotMatch(sitemap, /\/admin\/articles\/source-123/);
  assert.doesNotMatch(sitemap, /\/news\/source-123/);
});

test('/admin and /admin.html converge on the canonical login without a duplicate auth client', () => {
  const adminSource = fs.readFileSync(new URL('../src/pages/admin.astro', import.meta.url), 'utf8');
  const adminHtmlSource = fs.readFileSync(new URL('../src/pages/admin.html.astro', import.meta.url), 'utf8');
  const redirectSource = fs.readFileSync(
    new URL('../src/components/AdminLoginRedirect.astro', import.meta.url),
    'utf8',
  );

  for (const source of [adminSource, adminHtmlSource]) {
    assert.match(source, /AdminLoginRedirect/);
    assert.doesNotMatch(source, /\/api\/admin\/login|<form|type="password"/);
  }

  assert.match(redirectSource, /canonicalPath="\/admin\/login\/"/);
  assert.match(redirectSource, /noindex=\{true\}/);
  assert.match(redirectSource, /window\.location\.replace\('\/admin\/login\/'\)/);
  assert.doesNotMatch(redirectSource, /\/api\/admin\/login|<form|type="password"/);
  assert.doesNotMatch(redirectSource, /latest-news\.json|archived-news\.json|buildAdmin/);
  assert.doesNotMatch(redirectSource, /ADMIN_PASSWORD|ADMIN_SESSION_SECRET|ADMIN_PASSWORD_HASH/);
});

function configureDashboardAuth() {
  process.env.ADMIN_USERNAME = 'owner';
  process.env.ADMIN_PASSWORD_HASH = hashAdminPassword('correct-password', 'admin-dashboard-routes-salt');
  process.env.ADMIN_SESSION_SECRET = 'admin-dashboard-route-secret-with-at-least-sixty-four-bytes-0123456789';
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
  const shellSource = fs.readFileSync(new URL('../src/components/AdminCmsShell.astro', import.meta.url), 'utf8');
  const adminSource = fs.readFileSync(new URL('../src/pages/admin.astro', import.meta.url), 'utf8');
  const adminHtmlSource = fs.readFileSync(new URL('../src/pages/admin.html.astro', import.meta.url), 'utf8');

  assert.match(dashboardSource, /AdminCmsShell/);
  assert.match(shellSource, new RegExp('noindex=\\{true\\}'));
  assert.match(shellSource, /\/api\/admin\/login/);
  assert.doesNotMatch(dashboardSource, new RegExp('latest-news\\.json|archived-news\\.json|source-health\\.json|claim-ledger\\.json|editorial-cycles\\.json'));
  assert.match(adminSource, /AdminLoginRedirect/);
  assert.match(adminHtmlSource, /AdminLoginRedirect/);
});
