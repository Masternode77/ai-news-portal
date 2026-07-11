import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { serializeJsonForHtml } from '../src/lib/safe-html.js';
import {
  firstSafePublicHttpUrl,
  safePublicHref,
  safePublicHttpUrl,
  safePublicPath,
} from '../src/lib/public-url.js';
import { sourceAttributionFor } from '../src/lib/seo-safeguards.js';

test('public URL guards allow only credential-free HTTP(S) links and local absolute paths', () => {
  assert.equal(safePublicHttpUrl('https://example.com/report?q=grid'), 'https://example.com/report?q=grid');
  assert.equal(safePublicHttpUrl('javascript:alert(1)'), '');
  assert.equal(safePublicHttpUrl('data:text/html,<script>alert(1)</script>'), '');
  assert.equal(safePublicHttpUrl('https://user:secret@example.com/report'), '');
  assert.equal(safePublicHttpUrl('https://example.com/line\nbreak'), '');
  assert.equal(safePublicHttpUrl('http://localhost:3000/admin'), '');
  assert.equal(safePublicHttpUrl('http://127.0.0.1/admin'), '');
  assert.equal(safePublicHttpUrl('http://169.254.169.254/latest/meta-data/'), '');
  assert.equal(safePublicHttpUrl('http://192.168.1.2/internal'), '');
  assert.equal(safePublicHttpUrl('http://[::1]/admin'), '');
  assert.equal(safePublicHttpUrl('http://[::ffff:127.0.0.1]/admin'), '');
  assert.equal(safePublicHttpUrl('http://[::ffff:7f00:1]/admin'), '');
  assert.equal(safePublicHref('/news/report/'), '/news/report/');
  assert.equal(safePublicHref('//example.com/report'), '');
  assert.equal(safePublicHref('/news\\report'), '');
  assert.equal(safePublicPath('/news/report/'), '/news/report/');
  assert.equal(safePublicPath('https://example.com/report'), '');
});

test('source attribution skips an unsafe higher-priority URL and retains the first safe source', () => {
  const article = {
    source: 'Grid Journal',
    expertLensFull: { sourceLink: 'javascript:alert(1)' },
    sourceUrl: 'https://example.com/safe-report',
  };

  assert.equal(firstSafePublicHttpUrl(['mailto:test@example.com', article.sourceUrl]), article.sourceUrl);
  assert.deepEqual(sourceAttributionFor(article), {
    name: 'Grid Journal',
    url: article.sourceUrl,
    domain: 'example.com',
  });
});

test('JSON embedded in an HTML script cannot terminate the JSON-LD element', () => {
  const serialized = serializeJsonForHtml({
    headline: '</script><script>globalThis.compromised = true</script>',
    separator: '\u2028',
  });

  assert.doesNotMatch(serialized, /<|>|&|\u2028/);
  assert.match(serialized, /\\u003c\/script\\u003e/);

  const articleTemplate = fs.readFileSync('src/pages/news/[id].astro', 'utf8');
  assert.match(articleTemplate, /serializeJsonForHtml\(structuredData\)/);
  assert.doesNotMatch(articleTemplate, /set:html=\{JSON\.stringify\(structuredData\)\}/);
});
