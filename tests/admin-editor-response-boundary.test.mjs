import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { once } from 'node:events';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
const articleResponse = {
  sourceSha: 'response-boundary-source-sha',
  sourceFile: 'tests/fixtures/admin-editor-response-boundary.json',
  publicDetail: { eligible: false },
  article: { id: 'response-boundary', title: 'Safe editor fixture', dek: 'Safe deck', bodyMarkdown: 'Safe body', source: 'Fixture', publishedAt: '2026-08-12T01:00:00Z', public_status: 'draft' },
};

const contentTypes = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

const startStaticServer = async () => {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!relative || relative.endsWith('/')) relative = `${relative}index.html`;
    if (!path.extname(relative)) relative = `${relative}/index.html`;
    const file = path.resolve(dist, relative);
    if (!file.startsWith(`${dist}${path.sep}`) || !fs.existsSync(file)) return response.writeHead(404).end();
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Static server did not expose a TCP address.');
  return { server, url: `http://127.0.0.1:${address.port}` };
};

const privateEditorState = async (page) => page.evaluate(() => {
  const login = document.getElementById('admin-login');
  const editor = document.getElementById('admin-editor');
  const title = document.getElementById('editor-title');
  const preview = document.getElementById('admin-preview');
  const context = document.getElementById('article-context-link');
  const form = document.getElementById('article-form');
  if (!(login instanceof HTMLElement) || !(editor instanceof HTMLElement) || !(title instanceof HTMLElement) || !(preview instanceof HTMLElement) || !(context instanceof HTMLAnchorElement) || !(form instanceof HTMLFormElement)) throw new Error('Expected private editor DOM is unavailable.');
  return {
    loginHidden: login.hidden,
    editorHidden: editor.hidden,
    title: title.textContent,
    preview: preview.textContent,
    context: context.getAttribute('href'),
    values: ['title', 'dek', 'bodyMarkdown'].map((name) => form.elements.namedItem(name)?.value || ''),
  };
});

const assertFailsClosed = async (page, label) => {
  await page.waitForFunction(() => {
    const status = document.getElementById('admin-status');
    return status instanceof HTMLElement && status.textContent !== '' && status.textContent !== 'Loading article...';
  });
  const state = await privateEditorState(page);
  assert.equal(state.loginHidden, false, `${label} retains the login boundary`);
  assert.equal(state.editorHidden, true, `${label} does not reveal the editor`);
  assert.equal(state.title, '', `${label} clears the private title`);
  assert.equal(state.preview, '', `${label} clears the private preview`);
  assert.equal(state.context, '/admin/dashboard/', `${label} restores the dashboard context`);
  assert.deepEqual(state.values, ['', '', ''], `${label} does not populate private form values`);
};

const openEditor = async (page, url, loginBody, articleBody) => {
  await page.route('**/api/admin/login', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: loginBody }));
  await page.route('**/api/admin/article**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: articleBody }));
  await page.goto(`${url}/admin/edit/?id=response-boundary`, { waitUntil: 'networkidle' });
};

const malformedSuccessScenarios = [
  { label: 'non-JSON session', loginBody: '<html>not a session</html>', articleBody: JSON.stringify(articleResponse) },
  { label: 'wrong-shape session', loginBody: JSON.stringify({ authenticated: true }), articleBody: JSON.stringify(articleResponse) },
  { label: 'non-JSON article', loginBody: JSON.stringify({ csrfToken: 'response-boundary-csrf' }), articleBody: '<html>not an article</html>' },
  { label: 'wrong-shape article', loginBody: JSON.stringify({ csrfToken: 'response-boundary-csrf' }), articleBody: JSON.stringify({ article: { title: 'Leaked private title' }, sourceFile: 42, sourceSha: null }) },
];

for (const scenario of malformedSuccessScenarios) test(`built editor fails closed for ${scenario.label} response`, async (t) => {
  // Given: a production editor shell and a 2xx API response that is not a valid session/article contract.
  assert.ok(fs.existsSync(path.join(dist, 'admin/edit/index.html')), 'build admin/edit before this behavioral test');
  const { server, url } = await startStaticServer();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(async () => {
    await browser.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  });
  const context = await browser.newContext({ viewport: { width: 375, height: 844 } });
  const page = await context.newPage();
  // When: the real browser starts the typed client against the malformed 2xx response.
  await openEditor(page, url, scenario.loginBody, scenario.articleBody);
  // Then: parsing fails closed before private editor state can be populated.
  await assertFailsClosed(page, scenario.label);
  await context.close();
});

test('built editor exposes a non-OK JSON API error without revealing private state', async (t) => {
  // Given: a loaded editor whose save request receives a JSON conflict response.
  assert.ok(fs.existsSync(path.join(dist, 'admin/edit/index.html')), 'build admin/edit before this behavioral test');
  const { server, url } = await startStaticServer();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(async () => {
    await browser.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  });
  const context = await browser.newContext({ viewport: { width: 375, height: 844 } });
  const page = await context.newPage();
  await page.route('**/api/admin/login', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ csrfToken: 'response-boundary-csrf' }) }));
  await page.route('**/api/admin/article**', (route) => {
    if (route.request().method() === 'POST') return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Source version conflict' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(articleResponse) });
  });
  // When: the save action receives a non-OK JSON error from the authenticated article API.
  await page.goto(`${url}/admin/edit/?id=response-boundary`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#admin-editor:not([hidden])');
  await page.locator('[data-action="save-draft"]').click();
  await page.waitForFunction(() => document.getElementById('admin-status')?.textContent === 'Source version conflict');
  // Then: the typed response error preserves its server message without leaking or clearing the loaded editor.
  const result = await page.evaluate(() => ({ status: document.getElementById('admin-status')?.textContent, editorHidden: document.getElementById('admin-editor')?.hidden, title: document.getElementById('editor-title')?.textContent }));
  assert.deepEqual(result, { status: 'Source version conflict', editorHidden: false, title: 'Safe editor fixture' });
  await context.close();
});
