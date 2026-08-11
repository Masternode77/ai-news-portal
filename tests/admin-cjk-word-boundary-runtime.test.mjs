import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { once } from 'node:events';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
const hangulCompounds = {
  nfc: '데이터센터',
  nfd: '\u1103\u1166\u110b\u1175\u1110\u1165\u1109\u1166\u11ab\u1110\u1165',
  compatibility: 'ㄷㅔㅇㅣㅌㅓㅅㅔㄴㅌㅓ',
};
const cjkFixture = {
  sourceSha: 'cjk-geometry-fixture',
  sourceFile: 'tests/fixtures/admin-cjk-geometry.json',
  publicDetail: { eligible: true, href: '/news/cjk-geometry/' },
  article: {
    id: 'cjk-geometry',
    title: `AI ${hangulCompounds.nfc} operations`,
    dek: `${hangulCompounds.nfd} operations memo`,
    expertLensShort: '운영자는 계통 연결 일정과 장비 조달을 함께 확인해야 합니다.',
    bodyMarkdown: `${hangulCompounds.compatibility} review.\n\nLong English URL safety check: https://example.com/${'capacity-planning-'.repeat(18)}review`,
    category: 'Power & Grid',
    region: 'Korea',
    source: '한국전력 리서치',
    sourceUrl: 'https://example.com/source',
    publishedAt: '2026-08-12T01:00:00Z',
    public_status: 'published',
    tags: ['전력망', '데이터센터'],
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

test('built admin editor detects every Hangul Unicode form while keeping compounds whole and English unmarked', async (t) => {
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
    }, cjkFixture);
    await page.goto(`${url}/admin/edit/?id=cjk-geometry`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#admin-editor:not([hidden])');

    const checks = [
      { surface: 'title', selector: '#editor-title', form: 'nfc', compound: hangulCompounds.nfc },
      { surface: 'deck', selector: '.admin-preview-article p:nth-of-type(1)', form: 'nfd', compound: hangulCompounds.nfd },
      { surface: 'body', selector: '.admin-preview-article p:nth-of-type(2)', form: 'compatibility', compound: hangulCompounds.compatibility },
    ];
    const geometry = await page.evaluate((phraseChecks) => {
      const phraseRects = (selector, compound) => {
        const root = document.querySelector(selector);
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const text = walker.currentNode;
          const index = text.textContent.indexOf(compound);
          if (index === -1) continue;
          const range = document.createRange();
          range.setStart(text, index);
          range.setEnd(text, index + compound.length);
          return Array.from(range.getClientRects()).map(({ left, right, top, bottom, width, height }) => ({ left, right, top, bottom, width, height }));
        }
        return [];
      };
      return {
        phrases: phraseChecks.map(({ surface, selector, form, compound }) => {
          const element = document.querySelector(selector);
          const style = getComputedStyle(element);
          return { surface, selector, form, compound, rects: phraseRects(selector, compound), lang: element.lang, wordBreak: style.wordBreak, overflowWrap: style.overflowWrap };
        }),
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth,
        controls: ['input[name="title"]', '#logout-button', '[data-action="preview"]'].map((selector) => {
          const element = document.querySelector(selector);
          const rect = element.getBoundingClientRect();
          return { selector, width: rect.width, height: rect.height, right: rect.right };
        }),
      };
    }, checks);

    for (const phrase of geometry.phrases) {
      assert.equal(phrase.rects.length, 1, `${viewport.label} ${phrase.surface} ${phrase.form} keeps its compound on one visual line: ${JSON.stringify(phrase.rects)}`);
      assert.ok(phrase.rects[0].left >= -1 && phrase.rects[0].right <= viewport.width + 1, `${viewport.label} ${phrase.surface} ${phrase.form} compound remains inside the viewport`);
      assert.equal(phrase.lang, 'ko', `${viewport.label} ${phrase.surface} ${phrase.form} is language-marked for Hangul wrapping`);
      assert.equal(phrase.wordBreak, 'keep-all', `${viewport.label} ${phrase.surface} preserves Hangul word boundaries`);
      assert.equal(phrase.overflowWrap, 'anywhere', `${viewport.label} ${phrase.surface} retains emergency wrapping`);
    }
    assert.ok(geometry.scrollWidth <= geometry.innerWidth + 1, `${viewport.label} long English URL does not cause horizontal overflow`);
    for (const control of geometry.controls) {
      assert.ok(control.width > 0 && control.height > 0 && control.right <= viewport.width + 1, `${viewport.label} ${control.selector} remains visible and in layout`);
    }
    if (viewport.width === 375) {
      const mutation = await page.evaluate((phraseChecks) => {
        for (const { selector, form } of phraseChecks) {
          const element = document.querySelector(selector);
          element?.removeAttribute('lang');
          if (form === 'compatibility' && element) {
            element.style.maxWidth = '56px';
            element.style.wordBreak = 'break-all';
          }
        }
        const phraseRects = (selector, compound) => {
          const root = document.querySelector(selector);
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const text = walker.currentNode;
            const index = text.textContent.indexOf(compound);
            if (index === -1) continue;
            const range = document.createRange();
            range.setStart(text, index);
            range.setEnd(text, index + compound.length);
            return Array.from(range.getClientRects());
          }
          return [];
        };
        return phraseChecks.map(({ selector, form, compound }) => ({ form, compound, lineCount: phraseRects(selector, compound).length }));
      }, checks);
      assert.ok(mutation.some((phrase) => phrase.form === 'compatibility' && phrase.lineCount > 1), `${viewport.label} Unicode detector/keep-all mutation reintroduces a compatibility-Jamo split: ${JSON.stringify(mutation)}`);
      t.diagnostic(`mobile Unicode-detector/keep-all mutation: ${JSON.stringify(mutation)}`);
    }
    await page.locator('input[name="title"]').fill('English-only title');
    await page.locator('textarea[name="dek"]').fill('English-only deck');
    await page.locator('textarea[name="bodyMarkdown"]').fill(`English-only URL: https://example.com/${'capacity-planning-'.repeat(18)}review`);
    await page.locator('[data-action="preview"]').click();
    const englishOnly = await page.evaluate(() => ({
      marked: Array.from(document.querySelectorAll('.admin-preview-article h3, .admin-preview-article p')).map((element) => ({ text: element.textContent, lang: element.lang })),
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth,
    }));
    assert.ok(englishOnly.marked.every((element) => element.lang === ''), `${viewport.label} English-only preview remains unmarked: ${JSON.stringify(englishOnly.marked)}`);
    assert.ok(englishOnly.scrollWidth <= englishOnly.innerWidth + 1, `${viewport.label} English-only URL remains within the viewport`);
    await context.close();
  }
});
