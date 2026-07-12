import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test, { afterEach } from 'node:test';
import sharp from 'sharp';
import articleHandler from '../api/admin/article.js';
import articlesHandler from '../api/admin/articles.js';
import auditHandler from '../api/admin/audit.js';
import dashboardHandler from '../api/admin/dashboard.js';
import loginHandler from '../api/admin/login.js';
import mediaHandler from '../api/admin/media.js';
import revisionsHandler from '../api/admin/revisions.js';
import { createSession, hashAdminPassword, resetLoginSecurityForTests } from '../api/admin/_auth.js';
import { configureAdminMediaStorageForTests, configureAdminStorageForTests } from '../api/admin/_storage.js';
import { createLocalAdminStorage, permanentDeleteConfirmation } from '../src/plugins/storage/index.mjs';
import { createAdminMediaStorage } from '../src/plugins/storage/admin-media-storage.mjs';

const temporaryDirectories = new Set();

function configure(role = 'admin') {
  process.env.ADMIN_USERNAME = 'owner';
  process.env.ADMIN_PASSWORD_HASH = hashAdminPassword('correct-password', 'cms-api-test-salt');
  process.env.ADMIN_SESSION_SECRET = 'cms-api-session-secret-with-at-least-sixty-four-bytes-0123456789abcdef';
  process.env.ADMIN_ROLE = role;
  delete process.env.NODE_ENV;
  delete process.env.VERCEL_ENV;
  resetLoginSecurityForTests();
  configureAdminStorageForTests(createLocalAdminStorage({ storageKey: `cms-api-${Math.random()}` }));
}

afterEach(async () => {
  configureAdminStorageForTests(null);
  configureAdminMediaStorageForTests(null);
  resetLoginSecurityForTests();
  for (const name of ['ADMIN_USERNAME', 'ADMIN_PASSWORD_HASH', 'ADMIN_SESSION_SECRET', 'ADMIN_ROLE', 'NODE_ENV', 'VERCEL_ENV']) delete process.env[name];
  await Promise.all([...temporaryDirectories].map((directory) => fs.rm(directory, { recursive: true, force: true })));
  temporaryDirectories.clear();
});

function req({ method = 'GET', url = '/', headers = {}, body, rawBody } = {}) {
  const bytes = rawBody !== undefined ? Buffer.from(rawBody) : body === undefined ? null : Buffer.from(JSON.stringify(body));
  const request = Readable.from(bytes ? [bytes] : []);
  request.method = method;
  request.url = url;
  request.headers = bytes ? { 'content-type': 'application/json', ...headers } : headers;
  request.socket = { remoteAddress: '198.51.100.20' };
  return request;
}

function res() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    getHeader(name) { return this.headers[name.toLowerCase()]; },
    end(body = '') { this.body = body; },
    json() { return JSON.parse(this.body || '{}'); },
  };
}

async function call(handler, options) {
  const response = res();
  await handler(req(options), response);
  return response;
}

async function session(role = 'admin') {
  configure(role);
  const login = await call(loginHandler, { method: 'POST', body: { username: 'owner', password: 'correct-password' } });
  return { cookie: login.getHeader('set-cookie'), csrf: login.json().csrfToken };
}

function authHeaders(auth, mutate = false) {
  return { cookie: auth.cookie, ...(mutate ? { 'x-csrf-token': auth.csrf } : {}) };
}

test('storage-backed admin APIs cover create, list, get, preview, save, revisions, audit, delete, and restore', async () => {
  const auth = await session();
  const created = await call(articlesHandler, {
    method: 'POST',
    headers: authHeaders(auth, true),
    body: { title: 'API-created draft', bodyMarkdown: 'Original body', category: 'Power and Grid', sourceUrl: 'https://example.com/source' },
  });
  assert.equal(created.statusCode, 201);
  const article = created.json().article;

  const listed = await call(articlesHandler, { method: 'GET', url: '/api/admin/articles?q=API-created', headers: authHeaders(auth) });
  assert.deepEqual(listed.json().articles.map((item) => item.id), [article.id]);

  const preview = await call(articleHandler, {
    method: 'PATCH',
    headers: authHeaders(auth, true),
    body: { id: article.id, action: 'preview', expectedVersion: 1, title: 'Preview headline', bodyMarkdown: 'Preview body' },
  });
  assert.equal(preview.json().preview.text, 'Preview body');

  const unchanged = await call(articleHandler, { method: 'GET', url: `/api/admin/article?id=${article.id}`, headers: authHeaders(auth) });
  assert.equal(unchanged.json().article.title, 'API-created draft');

  const saved = await call(articleHandler, {
    method: 'PATCH',
    headers: authHeaders(auth, true),
    body: { id: article.id, action: 'save-draft', expectedVersion: 1, title: 'Saved through API', bodyMarkdown: 'Saved body' },
  });
  assert.equal(saved.json().article.version, 2);

  const stale = await call(articleHandler, {
    method: 'PATCH',
    headers: authHeaders(auth, true),
    body: { id: article.id, action: 'save-draft', expectedVersion: 1, title: 'Stale' },
  });
  assert.equal(stale.statusCode, 409);

  const revisions = await call(revisionsHandler, { method: 'GET', url: `/api/admin/revisions?id=${article.id}`, headers: authHeaders(auth) });
  assert.deepEqual(revisions.json().revisions.map((item) => item.version), [1, 2]);
  const audit = await call(auditHandler, { method: 'GET', url: `/api/admin/audit?articleId=${article.id}`, headers: authHeaders(auth) });
  assert.equal(audit.json().entries.at(-1).metadata.sessionId.length > 0, true);

  const softDeleted = await call(articleHandler, {
    method: 'PATCH', headers: authHeaders(auth, true), body: { id: article.id, action: 'soft-delete', expectedVersion: 2 },
  });
  assert.equal(softDeleted.json().article.version, 3);
  const editorSession = createSession('owner', { role: 'editor' });
  const editorAuth = { cookie: editorSession.cookie, csrf: editorSession.csrfToken };
  const editorDeletedDetail = await call(articleHandler, {
    method: 'GET', url: `/api/admin/article?id=${article.id}`, headers: authHeaders(editorAuth),
  });
  assert.equal(editorDeletedDetail.statusCode, 404);
  const editorElevatedDetail = await call(articleHandler, {
    method: 'GET', url: `/api/admin/article?id=${article.id}&includeDeleted=true`, headers: authHeaders(editorAuth),
  });
  assert.equal(editorElevatedDetail.statusCode, 403);
  const editorDashboard = await call(dashboardHandler, { method: 'GET', url: '/api/admin/dashboard', headers: authHeaders(editorAuth) });
  assert.equal(editorDashboard.statusCode, 200);
  assert.equal(editorDashboard.json().articles.some((item) => item.id === article.id), false);
  const adminDeletedDetail = await call(articleHandler, {
    method: 'GET', url: `/api/admin/article?id=${article.id}&includeDeleted=true`, headers: authHeaders(auth),
  });
  assert.equal(adminDeletedDetail.statusCode, 200);
  const restored = await call(articleHandler, {
    method: 'PATCH', headers: authHeaders(auth, true), body: { id: article.id, action: 'restore', expectedVersion: 3 },
  });
  assert.equal(restored.json().article.version, 4);
  const deletedAgain = await call(articleHandler, {
    method: 'PATCH', headers: authHeaders(auth, true), body: { id: article.id, action: 'soft-delete', expectedVersion: 4 },
  });
  const permanent = await call(articleHandler, {
    method: 'DELETE',
    headers: authHeaders(auth, true),
    body: { id: article.id, expectedVersion: deletedAgain.json().article.version, confirmation: permanentDeleteConfirmation(article.id) },
  });
  assert.equal(permanent.json().deleted, true);
});

test('admin APIs map malformed JSON, missing versions, and editor authorization without leaking internals', async () => {
  let auth = await session();
  const invalidJson = await call(articlesHandler, { method: 'POST', headers: authHeaders(auth, true), rawBody: '{not-json' });
  assert.equal(invalidJson.statusCode, 400);
  assert.equal(invalidJson.json().code, 'invalid_json');

  const created = await call(articlesHandler, {
    method: 'POST', headers: authHeaders(auth, true), body: { title: 'Version boundary' },
  });
  const missingVersion = await call(articleHandler, {
    method: 'PATCH', headers: authHeaders(auth, true), body: { id: created.json().article.id, action: 'save-draft', title: 'No version' },
  });
  assert.equal(missingVersion.statusCode, 428);

  auth = await session('editor');
  const editorDraft = await call(articlesHandler, {
    method: 'POST', headers: authHeaders(auth, true), body: { title: 'Editor draft' },
  });
  assert.equal(editorDraft.statusCode, 201);
  const forbiddenPublish = await call(articleHandler, {
    method: 'PATCH', headers: authHeaders(auth, true), body: { id: editorDraft.json().article.id, action: 'publish', expectedVersion: 1 },
  });
  assert.equal(forbiddenPublish.statusCode, 403);
  const forbiddenAudit = await call(auditHandler, { method: 'GET', headers: authHeaders(auth) });
  assert.equal(forbiddenAudit.statusCode, 403);
});

test('permanent deletion requires both admin role and the article-specific confirmation', async () => {
  const admin = await session('admin');
  const created = await call(articlesHandler, {
    method: 'POST',
    headers: authHeaders(admin, true),
    body: { title: 'Permanent deletion boundary' },
  });
  const article = created.json().article;
  const softDeleted = await call(articleHandler, {
    method: 'PATCH',
    headers: authHeaders(admin, true),
    body: { id: article.id, action: 'soft-delete', expectedVersion: article.version },
  });
  const version = softDeleted.json().article.version;

  const missingConfirmation = await call(articleHandler, {
    method: 'DELETE',
    headers: authHeaders(admin, true),
    body: { id: article.id, expectedVersion: version },
  });
  assert.equal(missingConfirmation.statusCode, 400);

  const editorSession = createSession('owner', { role: 'editor' });
  const editor = { cookie: editorSession.cookie, csrf: editorSession.csrfToken };
  const forbiddenEditor = await call(articleHandler, {
    method: 'DELETE',
    headers: authHeaders(editor, true),
    body: {
      id: article.id,
      expectedVersion: version,
      confirmation: permanentDeleteConfirmation(article.id),
    },
  });
  assert.equal(forbiddenEditor.statusCode, 403);

  const stillPresent = await call(articleHandler, {
    method: 'GET',
    url: `/api/admin/article?id=${article.id}&includeDeleted=true`,
    headers: authHeaders(admin),
  });
  assert.equal(stillPresent.statusCode, 200);
});

test('admin media API validates, normalizes, stores, serves, and audits an authenticated upload', async () => {
  const auth = await session('admin');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'admin-media-api-'));
  temporaryDirectories.add(directory);
  configureAdminMediaStorageForTests(createAdminMediaStorage({ provider: 'local', directory }));
  const created = await call(articlesHandler, {
    method: 'POST', headers: authHeaders(auth, true), body: { title: 'Media API draft' },
  });
  const article = created.json().article;
  const png = await sharp({ create: { width: 24, height: 16, channels: 3, background: '#0b1719' } }).png().toBuffer();

  const missingCsrf = await call(mediaHandler, {
    method: 'POST', headers: authHeaders(auth), body: { articleId: article.id, contentType: 'image/png', data: png.toString('base64') },
  });
  assert.equal(missingCsrf.statusCode, 403);

  const uploaded = await call(mediaHandler, {
    method: 'POST',
    headers: authHeaders(auth, true),
    body: { articleId: article.id, name: 'source.png', contentType: 'image/png', data: png.toString('base64'), altText: 'Cooling plant' },
  });
  assert.equal(uploaded.statusCode, 201);
  const media = uploaded.json().media;
  assert.equal(media.contentType, 'image/webp');
  assert.equal(media.altText, 'Cooling plant');
  assert.equal(media.url, `/api/admin/media?id=${encodeURIComponent(media.id)}&articleId=${encodeURIComponent(article.id)}`);

  const served = await call(mediaHandler, { method: 'GET', url: media.url, headers: authHeaders(auth) });
  assert.equal(served.statusCode, 200);
  assert.equal(served.getHeader('content-type'), 'image/webp');
  assert.equal(Buffer.from(served.body).subarray(0, 4).toString('ascii'), 'RIFF');

  const other = await call(articlesHandler, {
    method: 'POST', headers: authHeaders(auth, true), body: { title: 'Different media owner' },
  });
  const crossArticleUrl = `/api/admin/media?id=${encodeURIComponent(media.id)}&articleId=${encodeURIComponent(other.json().article.id)}`;
  const crossArticleRead = await call(mediaHandler, { method: 'GET', url: crossArticleUrl, headers: authHeaders(auth) });
  assert.equal(crossArticleRead.statusCode, 404);

  const audit = await call(auditHandler, { method: 'GET', url: `/api/admin/audit?articleId=${article.id}`, headers: authHeaders(auth) });
  assert.equal(audit.json().entries.some((entry) => entry.action === 'media-upload'), true);
  assert.equal(audit.json().entries.some((entry) => Object.hasOwn(entry.metadata, 'ip')), false);

  const malformed = await call(mediaHandler, {
    method: 'POST', headers: authHeaders(auth, true), body: { articleId: article.id, contentType: 'image/png', data: 'A===' },
  });
  assert.equal(malformed.statusCode, 400);
  assert.equal(malformed.json().code, 'invalid_media_data');
});

test('editor cannot mutate or attach media to an article after it becomes live', async () => {
  const admin = await session('admin');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'admin-editor-live-media-'));
  temporaryDirectories.add(directory);
  configureAdminMediaStorageForTests(createAdminMediaStorage({ provider: 'local', directory }));
  const sourceText = [
    'The operator confirmed a new closed-loop cooling plant for a 40-megawatt data hall in its latest construction update.',
    'Mechanical installation is complete in the first hall, while electrical commissioning remains scheduled for August.',
    'The utility has energized the primary substation and is testing the final feeder before customer equipment arrives.',
    'Contractors reported that switchgear delivery moved forward by two weeks after the supplier cleared factory acceptance tests.',
    'The first deployment will use liquid-cooled racks, with the second hall retaining air cooling for lower-density systems.',
    'Management expects initial customer acceptance in September and full contracted capacity before the end of the year.',
  ].join(' ');
  const created = await call(articlesHandler, {
    method: 'POST', headers: authHeaders(admin, true), body: { title: 'Protected live article', rawText: sourceText },
  });
  const articleId = created.json().article.id;
  const published = await call(articleHandler, {
    method: 'PATCH',
    headers: authHeaders(admin, true),
    body: {
      id: articleId,
      action: 'publish',
      expectedVersion: 1,
      bodyMarkdown: sourceText,
    },
  });
  assert.equal(published.statusCode, 200, JSON.stringify(published.json()));

  const editorSession = createSession('owner', { role: 'editor' });
  const editor = { cookie: editorSession.cookie, csrf: editorSession.csrfToken };
  for (const action of ['save-draft', 'regenerate-image']) {
    const response = await call(articleHandler, {
      method: 'PATCH',
      headers: authHeaders(editor, true),
      body: { id: articleId, action, expectedVersion: published.json().article.version, title: 'Forbidden edit' },
    });
    assert.equal(response.statusCode, 403);
  }

  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#111111' } }).png().toBuffer();
  const upload = await call(mediaHandler, {
    method: 'POST',
    headers: authHeaders(editor, true),
    body: { articleId, contentType: 'image/png', data: png.toString('base64') },
  });
  assert.equal(upload.statusCode, 403);

  const unchanged = await call(articleHandler, {
    method: 'GET', url: `/api/admin/article?id=${articleId}`, headers: authHeaders(admin),
  });
  assert.equal(unchanged.json().article.version, published.json().article.version);
  assert.equal(unchanged.json().article.title, 'Protected live article');
});
