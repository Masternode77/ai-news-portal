import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import articleHandler from '../api/admin/article.js';
import articlesHandler from '../api/admin/articles.js';
import auditHandler from '../api/admin/audit.js';
import dashboardHandler from '../api/admin/dashboard.js';
import loginHandler from '../api/admin/login.js';
import mediaHandler from '../api/admin/media.js';
import operationsHandler from '../api/admin/operations.js';
import revisionsHandler from '../api/admin/revisions.js';
import { hashAdminPassword, resetLoginSecurityForTests } from '../api/admin/_auth.js';
import { configureAdminMediaStorageForTests, configureAdminStorageForTests } from '../api/admin/_storage.js';
import { createAdminMediaStorage, createLocalAdminStorage, permanentDeleteConfirmation } from '../src/plugins/storage/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CODEX_RUNTIME_NODE_MODULES = path.join(
  os.homedir(),
  '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules',
);

export const ADMIN_BROWSER_E2E_SCENARIOS = Object.freeze([
  'unauthorized redirect',
  'login succeeds with seeded test admin',
  'create draft',
  'edit title',
  'edit body',
  'edit category',
  'edit source',
  'preview draft',
  'upload image',
  'save draft',
  'publish article',
  'unpublish article',
  'soft delete',
  'restore',
  'revision display',
  'permanent-delete confirmation',
  'logout/session rejection',
]);

const LOCAL_ONLY_GUARD = Object.freeze({
  localOnly: true,
  publicRebuildDiscovery: 'out-of-scope',
  allowedHosts: ['127.0.0.1', 'localhost'],
});

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    dist: 'dist',
    out: path.join('artifacts', 'admin-browser-e2e', 'result.json'),
    screenshotDir: path.join('artifacts', 'admin-browser-e2e', 'screenshots'),
    tempDir: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    args[key.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true;
  }
  return args;
}

function restoreEnv(previous) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.xml')) return 'application/xml; charset=utf-8';
  if (filePath.endsWith('.txt')) return 'text/plain; charset=utf-8';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  if (filePath.endsWith('.webp')) return 'image/webp';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fileForRequest(distDir, requestUrl) {
  const url = new URL(requestUrl, 'http://127.0.0.1');
  const clean = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  let filePath = path.resolve(distDir, clean);
  const relative = path.relative(distDir, filePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return '';
  const stat = await fs.stat(filePath).catch(() => null);
  if (stat?.isDirectory()) filePath = path.join(filePath, 'index.html');
  else if (!stat && !path.extname(filePath)) filePath = path.join(filePath, 'index.html');
  return await exists(filePath) ? filePath : '';
}

function handlerFor(url = '') {
  const pathname = new URL(url, 'http://127.0.0.1').pathname;
  if (pathname === '/api/admin/login') return loginHandler;
  if (pathname === '/api/admin/articles') return articlesHandler;
  if (pathname === '/api/admin/article') return articleHandler;
  if (pathname === '/api/admin/media') return mediaHandler;
  if (pathname === '/api/admin/revisions') return revisionsHandler;
  if (pathname === '/api/admin/audit') return auditHandler;
  if (pathname === '/api/admin/dashboard') return dashboardHandler;
  if (pathname === '/api/admin/operations') return operationsHandler;
  return null;
}

async function startHarnessServer({ distDir }) {
  const server = http.createServer(async (req, res) => {
    const apiHandler = handlerFor(req.url || '/');
    if (apiHandler) {
      await apiHandler(req, res);
      return;
    }
    const filePath = await fileForRequest(distDir, req.url || '/');
    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    res.end(await fs.readFile(filePath));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server;
}

async function closeServer(server) {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch (localError) {
    const nodeModules = process.env.PLAYWRIGHT_NODE_MODULES || CODEX_RUNTIME_NODE_MODULES;
    try {
      const require = createRequire(path.join(nodeModules, 'playwright-loader.cjs'));
      return require('playwright');
    } catch (runtimeError) {
      throw Object.assign(new Error(
        'Playwright is unavailable. Install it in the project or set PLAYWRIGHT_NODE_MODULES to a runtime that provides it.',
        { cause: runtimeError },
      ), { code: 'playwright_unavailable', localError });
    }
  }
}

async function makeTempDir(input = '') {
  if (input) {
    const directory = path.resolve(ROOT, input);
    await fs.mkdir(directory, { recursive: true });
    return { directory, remove: false };
  }
  const directory = await fs.mkdtemp(path.join('/tmp', 'compute-current-admin-e2e-'));
  return { directory, remove: true };
}

async function screenshot(page, screenshotDir, label) {
  const filePath = path.join(screenshotDir, `${String(label).replace(/[^a-z0-9-]+/gi, '-')}.png`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await page.screenshot({ path: filePath, fullPage: true });
  return path.relative(ROOT, filePath);
}

async function record(checks, label, work, page, screenshotDir) {
  const startedAt = new Date().toISOString();
  try {
    const details = await work();
    checks.push({
      label,
      ok: true,
      startedAt,
      completedAt: new Date().toISOString(),
      screenshot: page ? await screenshot(page, screenshotDir, label) : '',
      ...details,
    });
  } catch (error) {
    checks.push({
      label,
      ok: false,
      startedAt,
      completedAt: new Date().toISOString(),
      error: error?.message || String(error),
      screenshot: page ? await screenshot(page, screenshotDir, `${label}-failed`).catch(() => '') : '',
    });
    throw error;
  }
}

async function waitForStatus(page, pattern) {
  await page.waitForFunction((source) => {
    const re = new RegExp(source, 'i');
    return re.test(document.querySelector('#admin-session-status')?.textContent || '');
  }, pattern.source);
  return page.locator('#admin-session-status').textContent();
}

async function clickAction(page, action) {
  await page.locator(`[data-action="${action}"]`).click();
}

async function browserJson(page, pathName, options = {}) {
  return page.evaluate(async ({ pathName: targetPath, options: requestOptions }) => {
    const response = await fetch(targetPath, { credentials: 'same-origin', ...requestOptions });
    const payload = await response.json().catch(() => ({}));
    return {
      status: response.status,
      payload,
      headers: Object.fromEntries(response.headers.entries()),
    };
  }, { pathName, options });
}

async function writeTestPng(directory) {
  const filePath = path.join(directory, 'browser-e2e.png');
  await fs.writeFile(filePath, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABgAAAAQCAIAAACDRijCAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAIElEQVR4nGPgFpekCmIYNYh7NIy4R9OR+GgWESe/GAEA31dYgZM45NoAAAAASUVORK5CYII=',
    'base64',
  ));
  return filePath;
}

function publishableSourceText() {
  return [
    'A regional utility filing describes a 120 megawatt data center campus that depends on transformer delivery, substation work, and staged customer energization.',
    'The filing says the first data hall will not receive full service until feeder protection tests, metering installation, and switchgear commissioning are complete.',
    'Procurement notes identify transformers, breakers, and control gear as the limiting items for the construction schedule rather than building shell work.',
    'The developer has reserved land for a second phase, but the utility says any additional load request must wait for a separate interconnection study.',
    'Operators benefit if the first phase keeps its power window because rack installation can proceed before all campus expansion decisions are final.',
    'Cloud customers are exposed if the remaining substation work slips because accelerator clusters cannot be accepted until power quality testing is complete.',
    'Investors should watch whether the utility approves the second feeder and whether equipment delivery dates hold through factory acceptance testing.',
    'The source text is intentionally local and complete so the browser E2E publish step exercises the real admin quality gate without rebuilding public discovery.',
  ].join(' ');
}

async function exerciseBrowser({ baseUrl, browser, screenshotDir, checks, tempDir }) {
  const context = await browser.newContext({ baseURL: baseUrl });
  const page = await context.newPage();
  let articleId = '';
  try {
    await record(checks, 'unauthorized redirect', async () => {
      await page.goto('/admin/dashboard/', { waitUntil: 'networkidle' });
      await page.waitForURL(/\/admin\/login\/\?next=/);
      return { url: page.url() };
    }, page, screenshotDir);

    await record(checks, 'login succeeds with seeded test admin', async () => {
      await page.fill('input[name="username"]', 'e2e-admin');
      await page.fill('input[name="password"]', 'correct-password');
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(/\/admin\/dashboard\/$/);
      await waitForStatus(page, /signed in as e2e-admin/);
      return { url: page.url() };
    }, page, screenshotDir);

    await record(checks, 'create draft', async () => {
      const sourceText = publishableSourceText();
      await page.goto('/admin/articles/new/', { waitUntil: 'networkidle' });
      await page.fill('input[name="title"]', 'Browser E2E draft');
      await page.fill('textarea[name="summary"]', sourceText);
      await page.fill('textarea[name="bodyMarkdown"]', sourceText);
      await page.fill('input[name="category"]', 'Power and Grid');
      await page.fill('input[name="source"]', 'Browser Harness Source');
      await page.fill('input[name="sourceUrl"]', 'https://example.com/browser-harness-source');
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(/\/admin\/articles\/editor\/\?id=/);
      articleId = new URL(page.url()).searchParams.get('id') || '';
      if (!articleId) throw new Error('created article id missing from editor URL');
      return { articleId };
    }, page, screenshotDir);

    await record(checks, 'edit title', async () => {
      await page.fill('input[name="title"]', 'Browser E2E updated grid queue');
      await clickAction(page, 'save-draft');
      await waitForStatus(page, /save-draft complete/);
      return { title: await page.locator('input[name="title"]').inputValue() };
    }, page, screenshotDir);

    await record(checks, 'edit body', async () => {
      await page.fill('textarea[name="bodyMarkdown"]', [
        publishableSourceText(),
        'A utility filing describes a 120 MW data center campus that depends on transformer delivery, substation work, and staged customer energization.',
        'The browser E2E edit changes the article body, category, and source attribution through the real editor form.',
      ].join(' '));
      await clickAction(page, 'save-draft');
      await waitForStatus(page, /save-draft complete/);
      return { bodyCharacters: (await page.locator('textarea[name="bodyMarkdown"]').inputValue()).length };
    }, page, screenshotDir);

    await record(checks, 'edit category', async () => {
      await page.fill('input[name="category"]', 'Cloud Capacity');
      await clickAction(page, 'save-draft');
      await waitForStatus(page, /save-draft complete/);
      return { category: await page.locator('input[name="category"]').inputValue() };
    }, page, screenshotDir);

    await record(checks, 'edit source', async () => {
      await page.fill('input[name="source"]', 'Browser Harness Updated Source');
      await page.fill('input[name="sourceUrl"]', 'https://example.com/browser-harness-updated-source');
      await clickAction(page, 'save-draft');
      await waitForStatus(page, /save-draft complete/);
      return {
        source: await page.locator('input[name="source"]').inputValue(),
        sourceUrl: await page.locator('input[name="sourceUrl"]').inputValue(),
      };
    }, page, screenshotDir);

    await record(checks, 'preview draft', async () => {
      await clickAction(page, 'preview');
      await page.locator('#admin-preview').getByText('Browser E2E updated grid queue').waitFor();
      return { previewText: await page.locator('#admin-preview').innerText() };
    }, page, screenshotDir);

    await record(checks, 'upload image', async () => {
      await page.setInputFiles('input[name="media"]', await writeTestPng(tempDir));
      await page.fill('input[name="imageAlt"]', 'Browser E2E generated pixel');
      await clickAction(page, 'upload-image');
      await waitForStatus(page, /upload-image complete/);
      const mediaUrl = await page.locator('input[name="heroImage"]').inputValue();
      if (!mediaUrl.startsWith('/api/admin/media?')) throw new Error(`unexpected media URL ${mediaUrl}`);
      return { mediaUrl };
    }, page, screenshotDir);

    await record(checks, 'save draft', async () => {
      await page.fill('textarea[name="summary"]', publishableSourceText());
      await clickAction(page, 'save-draft');
      await waitForStatus(page, /save-draft complete/);
      return { version: await page.locator('input[name="version"]').inputValue() };
    }, page, screenshotDir);

    await record(checks, 'publish article', async () => {
      await clickAction(page, 'publish');
      await waitForStatus(page, /publish complete/);
      return { publicStatus: await page.locator('select[name="public_status"]').inputValue() };
    }, page, screenshotDir);

    await record(checks, 'unpublish article', async () => {
      await clickAction(page, 'unpublish');
      await waitForStatus(page, /unpublish complete/);
      return { publicStatus: await page.locator('select[name="public_status"]').inputValue() };
    }, page, screenshotDir);

    await record(checks, 'soft delete', async () => {
      await clickAction(page, 'soft-delete');
      await page.waitForTimeout(250);
      const detail = await browserJson(page, `/api/admin/article?id=${encodeURIComponent(articleId)}&includeDeleted=true`);
      if (detail.status !== 200 || !detail.payload.article.deletedAt) throw new Error('soft-deleted article was not readable as deleted');
      return { deletedAt: detail.payload.article.deletedAt, version: detail.payload.article.version };
    }, page, screenshotDir);

    await record(checks, 'restore', async () => {
      const detail = await browserJson(page, `/api/admin/article?id=${encodeURIComponent(articleId)}&includeDeleted=true`);
      const csrf = (await browserJson(page, '/api/admin/login')).payload.csrfToken;
      const restored = await browserJson(page, '/api/admin/article', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ id: articleId, action: 'restore', expectedVersion: detail.payload.article.version }),
      });
      if (restored.status !== 200) throw new Error(`restore failed: ${restored.status} ${JSON.stringify(restored.payload)}`);
      await page.goto(`/admin/articles/editor/?id=${encodeURIComponent(articleId)}`, { waitUntil: 'networkidle' });
      await waitForStatus(page, /signed in as e2e-admin/);
      return { version: restored.payload.article.version };
    }, page, screenshotDir);

    await record(checks, 'revision display', async () => {
      await page.locator('#admin-revisions li').first().waitFor();
      const text = await page.locator('#admin-revisions').innerText();
      if (!/v\d+/.test(text)) throw new Error('revision list did not render version labels');
      return { revisionText: text };
    }, page, screenshotDir);

    await record(checks, 'permanent-delete confirmation', async () => {
      await clickAction(page, 'soft-delete');
      await page.waitForTimeout(250);
      const deleted = await browserJson(page, `/api/admin/article?id=${encodeURIComponent(articleId)}&includeDeleted=true`);
      const csrf = (await browserJson(page, '/api/admin/login')).payload.csrfToken;
      const rejected = await browserJson(page, '/api/admin/article', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ id: articleId, expectedVersion: deleted.payload.article.version, confirmation: 'delete' }),
      });
      if (rejected.status < 400) throw new Error('permanent delete succeeded without confirmation');
      const accepted = await browserJson(page, '/api/admin/article', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({
          id: articleId,
          expectedVersion: deleted.payload.article.version,
          confirmation: permanentDeleteConfirmation(articleId),
        }),
      });
      if (accepted.status !== 200 || accepted.payload.deleted !== true) {
        throw new Error(`permanent delete confirmation failed: ${accepted.status} ${JSON.stringify(accepted.payload)}`);
      }
      return { rejectedStatus: rejected.status, deleted: true };
    }, page, screenshotDir);

    await record(checks, 'logout/session rejection', async () => {
      await page.goto('/admin/dashboard/', { waitUntil: 'networkidle' });
      await page.locator('#admin-logout').click();
      await page.waitForURL(/\/admin\/login\/$/);
      const session = await browserJson(page, '/api/admin/login');
      if (session.status !== 401) throw new Error(`expected rejected session after logout, got ${session.status}`);
      return { sessionStatus: session.status };
    }, page, screenshotDir);

    return checks;
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

export async function runAdminBrowserE2E(options = {}) {
  const distDir = path.resolve(ROOT, options.dist || 'dist');
  const outPath = path.resolve(ROOT, options.out || path.join('artifacts', 'admin-browser-e2e', 'result.json'));
  const screenshotDir = path.resolve(ROOT, options.screenshotDir || path.join('artifacts', 'admin-browser-e2e', 'screenshots'));
  const temp = await makeTempDir(options.tempDir || '');
  const mediaDir = path.join(temp.directory, 'media');
  const storagePath = path.join(temp.directory, 'admin-storage.json');
  const previousEnv = {
    ADMIN_USERNAME: process.env.ADMIN_USERNAME,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
    ADMIN_AUTH_STATE_FILE: process.env.ADMIN_AUTH_STATE_FILE,
    ADMIN_ROLE: process.env.ADMIN_ROLE,
    ADMIN_SEED_JSON: process.env.ADMIN_SEED_JSON,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };
  let server;
  let browser;
  const result = {
    ok: false,
    generatedAt: new Date().toISOString(),
    scenarios: ADMIN_BROWSER_E2E_SCENARIOS,
    guard: LOCAL_ONLY_GUARD,
    distDir: path.relative(ROOT, distDir),
    tempDir: temp.directory,
    screenshotDir: path.relative(ROOT, screenshotDir),
    checks: [],
    gaps: ['public rebuild and discovery assertions are outside this local-only admin harness'],
    cleanup: [],
  };

  try {
    if (!await exists(path.join(distDir, 'index.html'))) {
      throw new Error(`built dist is required at ${distDir}; create dist before this harness`);
    }
    await fs.mkdir(mediaDir, { recursive: true });
    await fs.rm(screenshotDir, { recursive: true, force: true });
    await fs.mkdir(screenshotDir, { recursive: true });
    process.env.ADMIN_USERNAME = 'e2e-admin';
    process.env.ADMIN_PASSWORD_HASH = hashAdminPassword('correct-password', 'admin-browser-e2e-salt');
    process.env.ADMIN_SESSION_SECRET = 'admin-browser-e2e-session-secret-with-at-least-sixty-four-bytes-0123456789';
    process.env.ADMIN_AUTH_STATE_FILE = path.join(temp.directory, 'auth-state.json');
    process.env.ADMIN_ROLE = 'admin';
    process.env.ADMIN_SEED_JSON = '0';
    delete process.env.ADMIN_PASSWORD;
    delete process.env.NODE_ENV;
    delete process.env.VERCEL_ENV;
    resetLoginSecurityForTests();
    configureAdminStorageForTests(createLocalAdminStorage({ filePath: storagePath }));
    configureAdminMediaStorageForTests(createAdminMediaStorage({ provider: 'local', directory: mediaDir }));

    server = await startHarnessServer({ distDir });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    result.baseUrl = baseUrl;
    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({ headless: true });
    result.checks = [];
    await exerciseBrowser({ baseUrl, browser, screenshotDir, checks: result.checks, tempDir: temp.directory });
    result.ok = result.checks.every((check) => check.ok);
    return result;
  } catch (error) {
    result.error = error?.message || String(error);
    return result;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
      result.cleanup.push('closed Playwright browser');
    }
    if (server) {
      await closeServer(server).catch(() => {});
      result.cleanup.push('closed local HTTP server');
    }
    configureAdminStorageForTests(null);
    configureAdminMediaStorageForTests(null);
    resetLoginSecurityForTests();
    restoreEnv(previousEnv);
    result.cleanup.push('restored admin env and test storage hooks');
    if (temp.remove) {
      await fs.rm(temp.directory, { recursive: true, force: true }).catch(() => {});
      result.cleanup.push('removed generated temp dir');
    }
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    if (!result.ok && !process.exitCode) process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runAdminBrowserE2E(parseArgs());
  console.log(JSON.stringify(result, null, 2));
}
