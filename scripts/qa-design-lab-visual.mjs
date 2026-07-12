import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, 'dist');
const OUTPUT_DIR = path.join(ROOT, 'artifacts', 'design-options');
const STATUS_PATH = path.join(OUTPUT_DIR, 'design-qa.json');

const themes = [
  { slug: 'midnight-intelligence', short: 'midnight' },
  { slug: 'research-ledger', short: 'ledger' },
  { slug: 'signal-mosaic', short: 'mosaic' },
];

const views = [
  { name: 'home', suffix: '', requiresImage: true },
  { name: 'article', suffix: 'article/', requiresImage: true },
  { name: 'states', suffix: 'states/', requiresImage: false },
];

const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'mobile', width: 390, height: 844 },
];

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.webp')) return 'image/webp';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.xml')) return 'application/xml; charset=utf-8';
  return 'application/octet-stream';
}

function insideDist(filePath) {
  const relative = path.relative(DIST_DIR, filePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function fileForRequest(rawUrl = '/') {
  const pathname = decodeURIComponent(new URL(rawUrl, 'http://local.test').pathname);
  const requested = pathname === '/' ? '/index.html' : pathname;
  const direct = path.join(DIST_DIR, requested);
  if (!insideDist(direct)) return '';
  const stat = await fs.stat(direct).catch(() => null);
  if (stat?.isFile()) return direct;
  if (stat?.isDirectory()) return path.join(direct, 'index.html');
  const index = path.join(direct, 'index.html');
  return insideDist(index) && await fs.stat(index).then((value) => value.isFile()).catch(() => false)
    ? index
    : '';
}

async function createServer() {
  const server = http.createServer(async (request, response) => {
    try {
      const filePath = await fileForRequest(request.url || '/');
      if (!filePath) {
        response.statusCode = 404;
        response.end('Not found');
        return;
      }
      response.setHeader('Content-Type', contentType(filePath));
      response.end(await fs.readFile(filePath));
    } catch (error) {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : String(error));
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require('playwright');
  } catch (localError) {
    const roots = (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean);
    for (const root of roots) {
      try {
        return createRequire(path.join(root, 'package.json'))('playwright');
      } catch {
        // Try the next explicitly supplied module root.
      }
    }
    throw localError;
  }
}

function screenshotName(theme, view, viewport) {
  const viewPart = view.name === 'home' ? '' : `-${view.name}`;
  return `${theme.short}${viewPart}-${viewport.name}.png`;
}

async function pixelEvidence(filePath) {
  const image = sharp(filePath);
  const [stats, metadata] = await Promise.all([image.stats(), image.metadata()]);
  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
    entropy: Number(stats.entropy.toFixed(3)),
    opaque: stats.isOpaque,
  };
}

async function inspectPage(page, view) {
  return page.evaluate(({ requiresImage, viewName }) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 2 && rect.height > 2 && style.display !== 'none'
        && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
    };

    const textElements = Array.from(document.querySelectorAll('h1,h2,h3,p,a,button,li,figcaption,strong'))
      .filter(visible);
    const clippedText = textElements.filter((element) => {
      const style = getComputedStyle(element);
      const clipsX = ['hidden', 'clip'].includes(style.overflowX)
        && element.scrollWidth > element.clientWidth + 2;
      const clipsY = ['hidden', 'clip'].includes(style.overflowY)
        && element.scrollHeight > element.clientHeight + 2;
      return clipsX || clipsY;
    }).slice(0, 10).map((element) => ({
      tag: element.tagName.toLowerCase(),
      className: typeof element.className === 'string' ? element.className : '',
      text: (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 90),
    }));

    const images = Array.from(document.images);
    const failedImages = images.filter((image) => !image.complete || image.naturalWidth === 0)
      .map((image) => image.getAttribute('src') || '');
    const viewportImages = images.filter((image) => {
      if (!visible(image)) return false;
      const rect = image.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight;
    }).map((image) => image.currentSrc || image.src);
    const repeatedViewportImages = [...new Set(viewportImages.filter((src, index) => (
      viewportImages.indexOf(src) !== index
    )))];

    const internalTerms = [
      'generation version', 'qualifying signal', 'deskwork', 'pipeline status',
      'blueprint', 'cycle status', 'internal score',
    ];
    const bodyText = document.body?.innerText || '';
    const headline = document.querySelector('h1');
    const headlineRect = headline?.getBoundingClientRect();
    const articleHeadlineInFirstViewport = viewName !== 'article' || Boolean(
      headlineRect && headlineRect.bottom > 0 && headlineRect.top < window.innerHeight,
    );

    return {
      bodyTextLength: bodyText.trim().length,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      clippedText,
      imageCount: images.length,
      failedImages,
      viewportImageCount: viewportImages.length,
      repeatedViewportImages,
      missingFirstViewportImage: requiresImage && viewportImages.length === 0,
      articleHeadlineInFirstViewport,
      internalTerms: internalTerms.filter((term) => bodyText.toLowerCase().includes(term)),
      exposedAdminLinks: Array.from(document.querySelectorAll('a[href]'))
        .map((anchor) => anchor.getAttribute('href') || '')
        .filter((href) => href === '/admin/' || href.startsWith('/admin.')),
      noindex: document.querySelector('meta[name="robots"]')?.getAttribute('content') || '',
      theme: document.querySelector('[data-design-theme]')?.getAttribute('data-design-theme') || '',
    };
  }, { requiresImage: view.requiresImage, viewName: view.name });
}

async function loadLazyImages(page) {
  await page.evaluate(async () => {
    const step = Math.max(320, Math.floor(window.innerHeight * 0.7));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 35));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(100);
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  if (!await fs.stat(path.join(DIST_DIR, 'index.html')).catch(() => null)) {
    throw new Error('Build output is missing. Run `npm run build` first.');
  }

  const { chromium } = loadPlaywright();
  const server = await createServer();
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const results = [];
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    for (const theme of themes) {
      for (const view of views) {
        const route = `/design-lab/${theme.slug}/${view.suffix}`;
        for (const viewport of viewports) {
          const page = await browser.newPage({
            viewport: { width: viewport.width, height: viewport.height },
            deviceScaleFactor: 1,
            reducedMotion: 'reduce',
          });
          const consoleErrors = [];
          page.on('console', (message) => {
            if (message.type() === 'error') consoleErrors.push(message.text());
          });
          const response = await page.goto(`${baseUrl}${route}`, {
            waitUntil: 'networkidle',
            timeout: 60000,
          });
          await page.evaluate(() => document.fonts.ready);
          await loadLazyImages(page);
          const outputPath = path.join(OUTPUT_DIR, screenshotName(theme, view, viewport));
          await page.screenshot({ path: outputPath, fullPage: true });
          const inspection = await inspectPage(page, view);
          results.push({
            theme: theme.slug,
            view: view.name,
            viewport: viewport.name,
            route,
            status: response?.status() || 0,
            screenshot: path.relative(ROOT, outputPath),
            consoleErrors,
            ...inspection,
            pixels: await pixelEvidence(outputPath),
          });
          await page.close();
        }
      }
    }
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  const failures = results.filter((result) => (
    result.status !== 200
    || result.consoleErrors.length > 0
    || result.bodyTextLength === 0
    || result.horizontalOverflow
    || result.clippedText.length > 0
    || result.failedImages.length > 0
    || result.repeatedViewportImages.length > 0
    || result.missingFirstViewportImage
    || !result.articleHeadlineInFirstViewport
    || result.internalTerms.length > 0
    || result.exposedAdminLinks.length > 0
    || !result.noindex.includes('noindex')
    || result.theme !== result.route.split('/')[2]
    || result.pixels.width === 0
    || result.pixels.height === 0
    || result.pixels.entropy < 0.2
  ));

  const report = {
    checkedAt: new Date().toISOString(),
    status: failures.length ? 'failed' : 'passed',
    captures: results.length,
    failures,
    results,
  };
  await fs.writeFile(STATUS_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[qa:design-lab] ${report.status}: ${results.length} captures, ${failures.length} failures`);
  if (failures.length) process.exitCode = 1;
}

await main();
