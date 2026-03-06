import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST_DIR = path.join(process.cwd(), 'dist');
const OUT_DIR = path.join(process.cwd(), 'artifacts');
const OUT_PATH = path.join(OUT_DIR, 'homepage.png');
const DEFAULT_PORT = 4173;

function contentTypeFor(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

async function createServer(port = DEFAULT_PORT) {
  const server = http.createServer(async (req, res) => {
    try {
      const reqPath = req.url === '/' ? '/index.html' : req.url;
      const cleanPath = reqPath.split('?')[0];
      const filePath = path.join(DIST_DIR, cleanPath);

      const stat = await fs.stat(filePath).catch(() => null);
      let targetPath = filePath;

      if (!stat) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }

      if (stat.isDirectory()) {
        targetPath = path.join(filePath, 'index.html');
      }

      const bytes = await fs.readFile(targetPath);
      res.setHeader('Content-Type', contentTypeFor(targetPath));
      res.end(bytes);
    } catch (error) {
      res.statusCode = 500;
      res.end(error.message);
    }
  });

  await new Promise((resolve) => server.listen(port, resolve));
  return server;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const server = await createServer();
  const baseUrl = process.env.PREVIEW_BASE_URL || `http://127.0.0.1:${DEFAULT_PORT}`;

  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1512, height: 982 },
      deviceScaleFactor: 1.5,
    });
    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.screenshot({ path: OUT_PATH, fullPage: true });
    await browser.close();
    console.log(`[preview] wrote screenshot -> ${OUT_PATH}`);
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error('[preview] fatal error:', error);
  process.exitCode = 1;
});
