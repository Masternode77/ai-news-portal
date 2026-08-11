import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { once } from 'node:events';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
const trackerUrl = 'https://preview-tracker.invalid/pixel.gif';
const insecureTrackerUrl = 'http://preview-tracker.invalid/pixel.gif';
const previewFixture = {
  sourceSha: 'preview-image-request-boundary-fixture',
  sourceFile: 'tests/fixtures/admin-preview-image-request-boundary.json',
  publicDetail: { eligible: false },
  article: {
    id: 'preview-image-request-boundary',
    title: '데이터센터 preview image boundary',
    dek: 'Private preview fixture',
    bodyMarkdown: 'Preview body',
    source: 'Fixture source',
    publishedAt: '2026-08-12T01:00:00Z',
    public_status: 'draft',
    sourceImage: trackerUrl,
  },
};

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const startStaticServer = async () => {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!relative || relative.endsWith('/')) relative = `${relative}index.html`;
    if (!path.extname(relative)) relative = `${relative}/index.html`;
    const file = path.resolve(dist, relative);
    if (!file.startsWith(`${dist}${path.sep}`) || !fs.existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}` };
};

const previewImageSnapshot = async (page) => page.evaluate(() => ({
  imageCount: document.querySelectorAll('#admin-preview img').length,
  imageSource: document.querySelector('#admin-preview img')?.getAttribute('src') || '',
  unsafeNodes: document.querySelectorAll('#admin-preview script, #admin-preview svg, #admin-preview [onload]').length,
  scrollWidth: document.documentElement.scrollWidth,
  innerWidth: window.innerWidth,
}));

test('built admin preview requests and renders only site-owned generated or uploads image paths', async (t) => {
  assert.ok(fs.existsSync(path.join(dist, 'admin/edit/index.html')), 'build admin/edit before this behavioral test');
  const { server, url } = await startStaticServer();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(async () => {
    await browser.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  });

  for (const viewport of [{ label: 'mobile', width: 375, height: 844 }, { label: 'desktop', width: 1440, height: 900 }]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    await page.addInitScript((fixture) => {
      window.fetch = async (input) => {
        const requestUrl = typeof input === 'string' ? input : input.url;
        if (requestUrl.includes('/api/admin/login')) return new Response(JSON.stringify({ csrfToken: 'test-csrf-token' }), { status: 200 });
        if (requestUrl.includes('/api/admin/article')) return new Response(JSON.stringify(fixture), { status: 200 });
        return new Response(JSON.stringify({ error: 'Unexpected fixture request' }), { status: 404 });
      };
    }, previewFixture);
    const outboundRequests = [];
    page.on('request', (request) => {
      if (request.url().includes('preview-tracker.invalid')) {
        outboundRequests.push({
          url: request.url(),
          referer: request.headers().referer || '',
          resourceType: request.resourceType(),
        });
      }
    });
    await page.route(`${trackerUrl}*`, (route) => route.fulfill({ status: 204 }));
    await page.route(`${insecureTrackerUrl}*`, (route) => route.fulfill({ status: 204 }));
    await page.goto(`${url}/admin/edit/?id=preview-image-request-boundary`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#admin-editor:not([hidden])');
    await page.locator('#admin-preview').scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);

    const initial = { ...await previewImageSnapshot(page), requests: outboundRequests };
    t.diagnostic(`${viewport.label} RED probe: ${JSON.stringify(initial)}`);
    assert.equal(initial.requests.length, 0, `${viewport.label} remote source image makes no tracker request from the private editor`);
    assert.equal(initial.imageCount, 0, `${viewport.label} remote source image creates no preview img`);

    const setCandidates = async (values) => {
      await page.evaluate((fieldValues) => {
        for (const name of ['replacementImage', 'heroImage', 'generatedImage', 'sourceImage']) {
          const input = document.querySelector(`[name="${name}"]`);
          input.value = fieldValues[name] || '';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, values);
      await page.locator('[data-action="preview"]').click();
      await page.locator('#admin-preview').scrollIntoViewIfNeeded();
      await page.waitForTimeout(100);
    };
    const setCandidate = (field, value) => setCandidates({ [field]: value });

    for (const scenario of [
      {
        label: 'invalid replacement falls through to local hero',
        values: { replacementImage: trackerUrl, heroImage: '/generated/fallbacks/power-grid.svg' },
        expectedImage: '/generated/fallbacks/power-grid.svg',
      },
      {
        label: 'invalid replacement and hero fall through to local generated image',
        values: { replacementImage: trackerUrl, heroImage: 'data:image/svg+xml,invalid', generatedImage: '/generated/fallbacks/data-centers.svg', sourceImage: trackerUrl },
        expectedImage: '/generated/fallbacks/data-centers.svg',
      },
      {
        label: 'safe replacement retains priority over safe hero',
        values: { replacementImage: '/uploads/editor-approved-replacement.webp', heroImage: '/generated/fallbacks/power-grid.svg' },
        expectedImage: '/uploads/editor-approved-replacement.webp',
      },
      {
        label: 'remote source does not mask an earlier local generated image',
        values: { generatedImage: '/generated/fallbacks/cooling.svg', sourceImage: trackerUrl },
        expectedImage: '/generated/fallbacks/cooling.svg',
      },
      {
        label: 'all invalid candidates render no image',
        values: { replacementImage: trackerUrl, heroImage: 'data:image/svg+xml,invalid', generatedImage: '/generated/%2e%2e/invalid.svg', sourceImage: insecureTrackerUrl },
        expectedImage: '',
      },
    ]) {
      const scenarioStart = outboundRequests.length;
      await setCandidates(scenario.values);
      const result = { ...await previewImageSnapshot(page), requests: outboundRequests.slice(scenarioStart) };
      t.diagnostic(`${viewport.label} precedence ${scenario.label}: ${JSON.stringify(result)}`);
      assert.equal(result.imageSource, scenario.expectedImage, `${viewport.label} ${scenario.label}`);
      assert.equal(result.imageCount, scenario.expectedImage ? 1 : 0, `${viewport.label} ${scenario.label} has the expected image presence`);
      assert.equal(result.requests.length, 0, `${viewport.label} ${scenario.label} creates no tracker request`);
    }

    const requestStart = outboundRequests.length;
    await setCandidate('generatedImage', '/generated/fallbacks/power-grid.svg');
    const generated = { ...await previewImageSnapshot(page), requests: outboundRequests.slice(requestStart) };
    assert.equal(generated.imageSource, '/generated/fallbacks/power-grid.svg', `${viewport.label} safe generated image renders`);
    assert.equal(generated.requests.length, 0, `${viewport.label} safe generated image makes no tracker request`);

    await setCandidate('replacementImage', '/uploads/editor-approved-replacement.webp');
    const replacement = { ...await previewImageSnapshot(page), requests: outboundRequests.slice(requestStart) };
    assert.equal(replacement.imageSource, '/uploads/editor-approved-replacement.webp', `${viewport.label} safe replacement image renders`);
    assert.equal(replacement.requests.length, 0, `${viewport.label} safe replacement image makes no tracker request`);

    await setCandidate('generatedImage', `/generated/${'safe-local-image-'.repeat(32)}preview.webp`);
    const longLocal = { ...await previewImageSnapshot(page), requests: outboundRequests.slice(requestStart) };
    assert.ok(longLocal.imageSource.startsWith('/generated/'), `${viewport.label} long local generated path renders`);
    assert.ok(longLocal.scrollWidth <= longLocal.innerWidth + 1, `${viewport.label} long local generated path does not cause overflow`);

    for (const candidate of [
      { field: 'replacementImage', value: trackerUrl },
      { field: 'heroImage', value: trackerUrl },
      { field: 'generatedImage', value: trackerUrl },
      { field: 'replacementImage', value: insecureTrackerUrl },
      { field: 'replacementImage', value: '//preview-tracker.invalid/pixel.gif' },
      { field: 'replacementImage', value: 'data:image/svg+xml,<svg onload=alert(1)>' },
      { field: 'replacementImage', value: 'javascript:alert(1)' },
      { field: 'replacementImage', value: 'blob:https://preview-tracker.invalid/pixel.gif' },
      { field: 'replacementImage', value: '/generated\\preview-tracker.svg' },
      { field: 'replacementImage', value: '/generated//preview-tracker.svg' },
      { field: 'replacementImage', value: '/generated/../preview-tracker.svg' },
      { field: 'replacementImage', value: '/generated/%2e%2e/preview-tracker.svg' },
      { field: 'replacementImage', value: '/generated/http%3Apreview-tracker.svg' },
      { field: 'replacementImage', value: '/generated/%ZZ/preview-tracker.svg' },
      { field: 'replacementImage', value: '/generated/preview-tracker.svg?cache=1' },
      { field: 'replacementImage', value: '/generated/preview-tracker.svg#fragment' },
      { field: 'replacementImage', value: '/generated/preview tracker.svg' },
      { field: 'replacementImage', value: '/generated/\u0001preview-tracker.svg' },
      { field: 'replacementImage', value: '/generated/\"><svg onload=alert(1)>' },
      { field: 'sourceImage', value: trackerUrl },
    ]) {
      const candidateStart = outboundRequests.length;
      await setCandidate(candidate.field, candidate.value);
      const blocked = { ...await previewImageSnapshot(page), requests: outboundRequests.slice(candidateStart) };
      assert.equal(blocked.imageCount, 0, `${viewport.label} blocks preview img for ${candidate.value}`);
      assert.equal(blocked.requests.length, 0, `${viewport.label} makes no tracker request for ${candidate.value}`);
      assert.equal(blocked.unsafeNodes, 0, `${viewport.label} keeps ${candidate.value} inert`);
    }

    await context.close();
  }
});
