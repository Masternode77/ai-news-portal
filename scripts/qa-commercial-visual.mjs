import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, 'dist');
const EVIDENCE_DIR = process.env.QA_EVIDENCE_DIR ? path.resolve(process.env.QA_EVIDENCE_DIR) : '';
const STATUS_PATH = EVIDENCE_DIR ? path.join(EVIDENCE_DIR, 'commercial-visual.json') : path.join(ROOT, 'artifacts', 'visual-status', 'commercial-visual.json');
const STATUS_DIR = path.dirname(STATUS_PATH);
const SCREENSHOT_DIR = EVIDENCE_DIR ? path.join(EVIDENCE_DIR, 'visual-commercial') : path.join(ROOT, 'artifacts', 'visual-commercial');
const REQUIRED_VISUAL_QA = process.env.GITHUB_ACTIONS === 'true';
const baseTargets = [
  { path: '/', slug: 'home', requiredLinks: ['/archive/', '/methodology/', '/editorial-policy/', '/ai-disclosure/', '/contact/', '/rss.xml'] },
  { path: '/methodology/', slug: 'methodology', requiredLinks: [] },
  { path: '/editorial-policy/', slug: 'editorial-policy', requiredLinks: [] },
  { path: '/ai-disclosure/', slug: 'ai-disclosure', requiredLinks: [] },
  { path: '/contact/', slug: 'contact', requiredLinks: ['mailto:briefings@computecurrent.com'] },
  { path: '/archive/', slug: 'archive', requiredLinks: [] },
];

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

async function writeStatus(payload) {
  await fs.mkdir(STATUS_DIR, { recursive: true });
  await fs.writeFile(STATUS_PATH, JSON.stringify({ checkedAt: new Date().toISOString(), ...payload }, null, 2));
}

function contentTypeFor(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.xml')) return 'application/xml; charset=utf-8';
  if (filePath.endsWith('.txt')) return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

async function fileForRequest(url = '/') {
  const parsed = new URL(url, 'http://local.test');
  const cleanPath = parsed.pathname === '/' ? '/index.html' : parsed.pathname;
  const directPath = path.join(DIST_DIR, cleanPath);
  if (!isInsideDist(directPath)) return '';
  const directStat = await fs.stat(directPath).catch(() => null);

  if (directStat?.isDirectory()) return path.join(directPath, 'index.html');
  if (directStat?.isFile()) return directPath;

  const indexPath = path.join(DIST_DIR, cleanPath, 'index.html');
  if (!isInsideDist(indexPath)) return '';
  const indexStat = await fs.stat(indexPath).catch(() => null);
  return indexStat?.isFile() ? indexPath : '';
}

function isInsideDist(filePath) {
  const relative = path.relative(DIST_DIR, filePath);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function createServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const targetPath = await fileForRequest(req.url || '/');
      if (!targetPath) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }

      const bytes = await fs.readFile(targetPath);
      res.setHeader('Content-Type', contentTypeFor(targetPath));
      res.end(bytes);
    } catch (error) {
      res.statusCode = 500;
      res.end(error.message);
    }
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

async function firstArticleTarget() {
  const newsDir = path.join(DIST_DIR, 'news');
  const entries = await fs.readdir(newsDir, { withFileTypes: true }).catch(() => []);
  const first = entries.find((entry) => entry.isDirectory());
  return first ? { path: `/news/${first.name}/`, slug: `news-${first.name}`, requiredLinks: [] } : null;
}

async function targets() {
  const article = await firstArticleTarget();
  return article ? [...baseTargets, article] : baseTargets;
}

async function pageChecks(page, target, screenshotPath) {
  return page.evaluate(({ requiredLinks }) => {
    const maxFindings = 12;
    const keySelector = 'a,button,h1,h2,h3,h4,h5,h6,p,article,nav,input,select,textarea,summary,[role="button"],[role="link"]';
    const visibleElements = Array.from(document.querySelectorAll(keySelector))
      .map((element, index) => {
        const rect = element.getBoundingClientRect();
        return { element, index, rect, style: window.getComputedStyle(element) };
      })
      .filter(({ rect, style }) => (
        rect.width > 4 && rect.height > 4 && style.display !== 'none'
        && style.visibility !== 'hidden' && Number.parseFloat(style.opacity || '1') > 0.05
      ));
    const describe = ({ element, index, rect }) => ({
      element: element.tagName.toLowerCase(),
      index,
      className: typeof element.className === 'string' ? element.className : '',
      text: (element.innerText || element.getAttribute('aria-label') || element.getAttribute('value') || '').trim().replace(/\s+/g, ' ').slice(0, 80),
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
    });
    const clippingOverflow = new Set(['hidden', 'clip']);
    const isLineClamped = (style) => {
      const clamp = style.webkitLineClamp || style.lineClamp || '';
      return clamp && clamp !== 'none' && clamp !== 'unset' && Number.parseInt(clamp, 10) > 0;
    };
    const clippedElements = visibleElements
      .filter(({ element, style }) => {
        if (isLineClamped(style)) return false;
        const clippedX = element.scrollWidth > element.clientWidth + 1 && clippingOverflow.has(style.overflowX);
        const clippedY = element.scrollHeight > element.clientHeight + 1 && clippingOverflow.has(style.overflowY);
        return clippedX || clippedY;
      })
      .slice(0, maxFindings)
      .map((entry) => ({
        ...describe(entry),
        overflow: { x: Math.max(0, entry.element.scrollWidth - entry.element.clientWidth), y: Math.max(0, entry.element.scrollHeight - entry.element.clientHeight) },
      }));
    const overlappingElements = [];
    for (let leftIndex = 0; leftIndex < visibleElements.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < visibleElements.length; rightIndex += 1) {
        const left = visibleElements[leftIndex];
        const right = visibleElements[rightIndex];
        if (left.element.contains(right.element) || right.element.contains(left.element)) continue;
        if (isLineClamped(left.style) || isLineClamped(right.style)) continue;
        const overlapWidth = Math.min(left.rect.right, right.rect.right) - Math.max(left.rect.left, right.rect.left);
        const overlapHeight = Math.min(left.rect.bottom, right.rect.bottom) - Math.max(left.rect.top, right.rect.top);
        if (overlapWidth <= 0 || overlapHeight <= 0) continue;
        const overlapArea = overlapWidth * overlapHeight;
        const smallestArea = Math.min(left.rect.width * left.rect.height, right.rect.width * right.rect.height);
        if (overlapArea < 96 || overlapArea / smallestArea < 0.2) continue;
        overlappingElements.push({
          first: describe(left),
          second: describe(right),
          overlap: { width: Math.round(overlapWidth), height: Math.round(overlapHeight), area: Math.round(overlapArea) },
        });
        if (overlappingElements.length >= maxFindings) break;
      }
      if (overlappingElements.length >= maxFindings) break;
    }
    const documentWidth = document.documentElement.scrollWidth;
    const viewportWidth = window.innerWidth;
    const links = Array.from(document.querySelectorAll('a')).map((anchor) => anchor.getAttribute('href') || '');
    const bodyText = document.body?.innerText || '';
    const interactiveCount = document.querySelectorAll('a, button').length;
    return {
      title: document.title,
      bodyTextLength: bodyText.trim().length,
      interactiveCount,
      viewportWidth,
      documentWidth,
      horizontalOverflow: documentWidth > viewportWidth + 1,
      clippedElements,
      overlappingElements,
      missingRequiredLinks: requiredLinks.filter((required) => !links.some((link) => link === required || link.startsWith(required))),
    };
  }, { requiredLinks: target.requiredLinks }).then(async (checks) => {
    const stat = await fs.stat(screenshotPath).catch(() => null);
    return {
      ...checks,
      screenshot: path.relative(ROOT, screenshotPath),
      screenshotBytes: stat?.size || 0,
      blankScreenshot: !stat || stat.size === 0,
    };
  });
}

async function main() {
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });

  const distIndex = path.join(DIST_DIR, 'index.html');
  const distIndexStat = await fs.stat(distIndex).catch(() => null);
  if (!distIndexStat) {
    await writeStatus({
      status: REQUIRED_VISUAL_QA ? 'failed' : 'unavailable',
      reason: 'dist_missing',
      detail: 'Build output not found. Run `npm run build` before visual QA.',
      environmentConstraint: !REQUIRED_VISUAL_QA,
    });
    if (REQUIRED_VISUAL_QA) process.exitCode = 1;
    return;
  }

  let playwright;
  try {
    playwright = await import('playwright');
  } catch (error) {
    await writeStatus({
      status: REQUIRED_VISUAL_QA ? 'failed' : 'unavailable',
      reason: 'playwright_not_installed',
      detail: error?.message || 'playwright package is not installed',
      environmentConstraint: !REQUIRED_VISUAL_QA,
      routes: (await targets()).map((target) => target.path),
      viewports,
    });
    console.log(`[qa:visual:commercial] ${REQUIRED_VISUAL_QA ? 'failed' : 'unavailable'}: playwright is not installed`);
    if (REQUIRED_VISUAL_QA) process.exitCode = 1;
    return;
  }

  const server = await createServer();
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const results = [];
  let browser;

  try {
    browser = await playwright.chromium.launch({ headless: true });
    for (const target of await targets()) {
      for (const viewport of viewports) {
        const page = await browser.newPage({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 1,
        });
        const response = await page.goto(`${baseUrl}${target.path}`, { waitUntil: 'networkidle', timeout: 60000 });
        const screenshotPath = path.join(SCREENSHOT_DIR, `${target.slug}-${viewport.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        results.push({
          route: target.path,
          viewport: viewport.name,
          status: response?.status() || 0,
          ...(await pageChecks(page, target, screenshotPath)),
        });
        await page.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }

  const failures = results.filter((result) => (
    result.status < 200
    || result.status >= 400
    || result.blankScreenshot
    || result.horizontalOverflow
    || result.clippedElements.length > 0
    || result.overlappingElements.length > 0
    || result.bodyTextLength === 0
    || result.missingRequiredLinks.length > 0
  ));

  await writeStatus({
    status: failures.length ? 'failed' : 'passed',
    reason: failures.length ? 'route_visual_checks_failed' : 'public_visual_checks_passed',
    routes: results.length,
    screenshots: results.map((result) => result.screenshot),
    failures,
    results,
  });

  console.log(`[qa:visual:commercial] ${failures.length ? 'failed' : 'passed'}: ${results.length} captures`);
  if (failures.length) process.exitCode = 1;
}

await main();
