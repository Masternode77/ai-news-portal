import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import loginHandler from '../api/admin/login.js';
import { hashAdminPassword } from '../api/admin/_auth.js';
import {
  collectRightsReviewSafeModeEvidence,
  RIGHTS_REVIEW_PAUSE_STATE,
  rightsReviewSafeModeResult,
} from './lib/rights-review-safe-mode.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = path.join(ROOT, 'evidence/compute-current-omo-ultra-rebuild/f3-manual-qa/result.json');
const DEFAULT_SCREENSHOT_DIR = path.join(ROOT, 'evidence/compute-current-omo-ultra-rebuild/f3-manual-qa/screenshots');
const FALLBACK_NODE_MODULES = '/Users/josh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { out: DEFAULT_OUT, screenshotDir: DEFAULT_SCREENSHOT_DIR, dist: 'dist' };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    args[key.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true;
  }
  return args;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function firstChild(dir, predicate = () => true) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const match = entries.find((entry) => predicate(entry));
  return match?.name || '';
}

export async function buildManualQaArticlePlan(distDir, { sourceRegistry, now } = {}) {
  const newsDir = path.join(distDir, 'news');
  const newsEntries = await fs.readdir(newsDir, { withFileTypes: true }).catch((error) => {
    if (error?.code === 'ENOENT') return [];
    throw error;
  });
  const malformed = [];
  const detailIds = [];
  for (const entry of newsEntries) {
    const hasIndex = entry.isDirectory() && await exists(path.join(newsDir, entry.name, 'index.html'));
    if (!hasIndex) malformed.push(entry.name);
    else detailIds.push(entry.name);
  }
  detailIds.sort((left, right) => left.localeCompare(right));

  const safeModeEvidence = collectRightsReviewSafeModeEvidence({ distDir, sourceRegistry, now });
  const safeMode = rightsReviewSafeModeResult(safeModeEvidence);
  const homepage = await fs.readFile(path.join(distDir, 'index.html'), 'utf8').catch(() => '');
  const homepageClaimsSafeMode = homepage.includes(`data-rights-review-state="${RIGHTS_REVIEW_PAUSE_STATE}"`);
  if (malformed.length > 0) {
    return {
      ok: false,
      reasons: malformed.map((name) => `malformed_public_detail_inventory:${name}`),
      articleRoute: '',
      adminEditRoute: '/admin/edit/',
      articleCheck: {
        label: 'article',
        route: '',
        status: 0,
        ok: false,
        skipped: false,
        mode: 'normal',
        reason: 'malformed_public_detail_inventory',
        verifiedPublicDetailCount: detailIds.length,
      },
      safeModeEvidence,
    };
  }

  if (safeModeEvidence.publicDetailCount !== detailIds.length) {
    return {
      ok: false,
      reasons: [`public_detail_inventory_count_mismatch:${detailIds.length}/${safeModeEvidence.publicDetailCount}`],
      articleRoute: '',
      adminEditRoute: '/admin/edit/',
      articleCheck: {
        label: 'article',
        route: '',
        status: 0,
        ok: false,
        skipped: false,
        mode: 'normal',
        reason: 'public_detail_inventory_count_mismatch',
        verifiedPublicDetailCount: safeModeEvidence.publicDetailCount,
      },
      safeModeEvidence,
    };
  }

  if (detailIds.length === 0) {
    if (!safeMode.ok) {
      return {
        ok: false,
        reasons: ['zero_detail_inventory_without_verified_rights_review_safe_mode', ...safeMode.reasons],
        articleRoute: '',
        adminEditRoute: '/admin/edit/',
        articleCheck: {
          label: 'article',
          route: '',
          status: 0,
          ok: false,
          skipped: false,
          mode: 'normal',
          reason: 'zero_detail_inventory_without_verified_rights_review_safe_mode',
          verifiedPublicDetailCount: 0,
        },
        safeModeEvidence,
      };
    }
    return {
      ok: true,
      reasons: [],
      articleRoute: '',
      adminEditRoute: '/admin/edit/',
      articleCheck: {
        label: 'article',
        route: '',
        status: 0,
        ok: true,
        skipped: true,
        mode: 'rights_review_safe_mode',
        reason: 'verified_zero_public_detail_inventory',
        verifiedPublicDetailCount: 0,
      },
      safeModeEvidence,
    };
  }

  if (homepageClaimsSafeMode) {
    return {
      ok: false,
      reasons: ['rights_review_safe_mode_conflicts_with_public_details'],
      articleRoute: '',
      adminEditRoute: '/admin/edit/',
      articleCheck: {
        label: 'article',
        route: '',
        status: 0,
        ok: false,
        skipped: false,
        mode: 'normal',
        reason: 'rights_review_safe_mode_conflicts_with_public_details',
        verifiedPublicDetailCount: detailIds.length,
      },
      safeModeEvidence,
    };
  }

  const newsId = detailIds[0];
  const encodedNewsId = encodeURIComponent(newsId);
  return {
    ok: true,
    reasons: [],
    articleRoute: `/news/${encodedNewsId}/`,
    adminEditRoute: `/admin/edit/?id=${encodedNewsId}`,
    articleCheck: null,
    safeModeEvidence,
  };
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.xml')) return 'application/xml; charset=utf-8';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  if (filePath.endsWith('.webp')) return 'image/webp';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

async function fileForRequest(distDir, requestUrl) {
  const url = new URL(requestUrl, 'http://local.test');
  const cleanPath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  let filePath = path.resolve(distDir, cleanPath || 'index.html');
  if (!filePath.startsWith(distDir)) return '';
  if ((await fs.stat(filePath).catch(() => null))?.isDirectory()) filePath = path.join(filePath, 'index.html');
  if (!(await exists(filePath)) && !path.extname(filePath)) filePath = path.join(filePath, 'index.html');
  return filePath.startsWith(distDir) && await exists(filePath) ? filePath : '';
}

async function startStaticServer(distDir) {
  const server = http.createServer(async (req, res) => {
    const filePath = await fileForRequest(distDir, req.url || '/');
    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }
    const body = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function startAdminServer() {
  const oldEnv = {
    ADMIN_USERNAME: process.env.ADMIN_USERNAME,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
  };
  process.env.ADMIN_USERNAME = 'final-qa-admin';
  process.env.ADMIN_PASSWORD_HASH = hashAdminPassword('correct-password', 'final-qa-salt');
  process.env.ADMIN_SESSION_SECRET = 'final-qa-session-secret-with-enough-entropy';
  const server = http.createServer((req, res) => {
    if ((req.url || '').startsWith('/api/admin/login')) {
      loginHandler(req, res);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, restore: () => Object.assign(process.env, oldEnv) };
}

async function closeServer(server) {
  await new Promise((resolve) => server.close(resolve));
}

async function browserQa(baseUrl, distDir, screenshotDir) {
  const articlePlan = await buildManualQaArticlePlan(distDir);
  if (!articlePlan.ok) return [articlePlan.articleCheck];
  const { chromium } = await loadPlaywright();
  const category = await firstChild(path.join(distDir, 'category'), (entry) => entry.isDirectory());
  const routes = [
    ['home', '/'],
    ...(articlePlan.articleRoute ? [['article', articlePlan.articleRoute]] : []),
    ['archive', '/archive/'],
    ['category', `/category/${category}/`],
    ['admin-html', '/admin.html'],
    ['admin-edit', articlePlan.adminEditRoute],
  ];
  await fs.mkdir(screenshotDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const checks = articlePlan.articleCheck ? [articlePlan.articleCheck] : [];
  try {
    for (const [label, route] of routes) {
      const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
      const screenshotPath = path.join(screenshotDir, `${label}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      checks.push({
        label,
        route,
        status: response?.status() || 0,
        ok: Boolean(response?.ok()),
        title: await page.title(),
        screenshot: path.relative(ROOT, screenshotPath),
      });
    }
  } finally {
    await browser.close();
  }
  return checks;
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch (error) {
    const nodeModules = process.env.PLAYWRIGHT_NODE_MODULES || FALLBACK_NODE_MODULES;
    const require = createRequire(path.join(nodeModules, 'playwright-loader.cjs'));
    return require('playwright');
  }
}

async function adminHttpQa(baseUrl) {
  const unauth = await fetch(`${baseUrl}/api/admin/login`);
  const wrong = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'final-qa-admin', password: 'wrong-password' }),
  });
  const login = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'final-qa-admin', password: 'correct-password' }),
  });
  const cookie = login.headers.get('set-cookie') || '';
  const session = await fetch(`${baseUrl}/api/admin/login`, { headers: { cookie } });
  return [
    { label: 'unauthenticated admin API', expected: 401, status: unauth.status, ok: unauth.status === 401 },
    { label: 'wrong password', expected: 401, status: wrong.status, ok: wrong.status === 401 },
    { label: 'authenticated session', expected: 200, status: session.status, ok: session.status === 200 },
  ];
}

async function publicImageQa(baseUrl, distDir) {
  const roots = ['generated/articles', 'generated/fallbacks'];
  for (const root of roots) {
    const dir = path.join(distDir, root);
    const name = await firstChild(dir, (entry) => entry.isFile());
    if (!name) continue;
    const route = `/${root}/${name}`;
    const response = await fetch(`${baseUrl}${route}`);
    return { route, status: response.status, ok: response.status === 200 };
  }
  return { route: '', status: 0, ok: false, error: 'no generated public image found' };
}

export async function runFinalManualQa(options = {}) {
  const outPath = path.resolve(ROOT, options.out || DEFAULT_OUT);
  const screenshotDir = path.resolve(ROOT, options.screenshotDir || DEFAULT_SCREENSHOT_DIR);
  const distDir = path.resolve(ROOT, options.dist || 'dist');
  const staticServer = await startStaticServer(distDir);
  const admin = await startAdminServer();
  const staticBase = `http://127.0.0.1:${staticServer.address().port}`;
  const adminBase = `http://127.0.0.1:${admin.server.address().port}`;
  try {
    const [browser, adminHttp, publicImage] = await Promise.all([
      browserQa(staticBase, distDir, screenshotDir),
      adminHttpQa(adminBase),
      publicImageQa(staticBase, distDir),
    ]);
    const result = {
      generatedAt: new Date().toISOString(),
      staticBase,
      adminBase,
      browser,
      adminHttp,
      publicImage,
      ok: browser.every((check) => check.ok) && adminHttp.every((check) => check.ok) && publicImage.ok,
      cleanup: ['closed Playwright browser', 'closed static server', 'closed admin API server', 'restored admin auth environment variables'],
    };
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    return result;
  } finally {
    await closeServer(staticServer);
    await closeServer(admin.server);
    admin.restore();
  }
}

if (process.argv[1] && process.argv[1].endsWith('final-manual-qa.mjs')) {
  const result = await runFinalManualQa(parseArgs());
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
