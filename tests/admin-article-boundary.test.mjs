import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import articleHandler from '../api/admin/article.js';
import { createSession, hashAdminPassword, resetLoginSecurityForTests } from '../api/admin/_auth.js';

function configureAuth() {
  process.env.ADMIN_USERNAME = 'owner';
  process.env.ADMIN_PASSWORD_HASH = hashAdminPassword('correct-password');
  process.env.ADMIN_SESSION_SECRET = 'admin-article-boundary-session-secret-with-enough-entropy';
  delete process.env.ADMIN_VERCEL_RATE_LIMIT_READY;
  resetLoginSecurityForTests();
}

function request({ headers = {}, body, chunks } = {}) {
  const session = createSession('owner');
  const req = Readable.from(chunks || [Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.url = '/api/admin/article';
  req.headers = {
    cookie: session.cookie,
    'content-type': 'application/json',
    'x-csrf-token': session.csrfToken,
    ...headers,
  };
  req.socket = { remoteAddress: '198.51.100.9' };
  return req;
}

function response() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    end(body = '') { this.body = body; },
  };
}

async function articleRequest(options) {
  const res = response();
  await articleHandler(request(options), res);
  return res;
}

test('article mutations reject non-JSON and declared or streamed oversize bodies before store access', async () => {
  configureAuth();
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => { fetchCalls += 1; throw new Error('store access must not occur'); };

  try {
    const unsupported = await articleRequest({ headers: { 'content-type': 'text/plain' }, body: { id: 'article-1' } });
    assert.equal(unsupported.statusCode, 415);

    const declared = await articleRequest({ headers: { 'content-length': '300000' }, body: { id: 'article-1' } });
    assert.equal(declared.statusCode, 413);

    const streamed = await articleRequest({ chunks: [Buffer.from('{"id":"article-1","bodyMarkdown":"'), Buffer.from('x'.repeat(300000)), Buffer.from('"}')] });
    assert.equal(streamed.statusCode, 413);
    assert.equal(fetchCalls, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('article mutations reject unsupported keys and oversized fields before store access', async () => {
  configureAuth();
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => { fetchCalls += 1; throw new Error('store access must not occur'); };

  try {
    const unsupported = await articleRequest({ body: { id: 'article-1', action: 'save-draft', expectedSourceSha: 'source-v1', unpermitted: 'value' } });
    assert.equal(unsupported.statusCode, 400);

    const oversized = await articleRequest({ body: { id: 'article-1', action: 'save-draft', expectedSourceSha: 'source-v1', title: 'x'.repeat(4097) } });
    assert.equal(oversized.statusCode, 400);
    assert.equal(fetchCalls, 0);
  } finally {
    global.fetch = originalFetch;
  }
});
