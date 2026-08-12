import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = process.env.BUILT_DIR ? path.resolve(process.env.BUILT_DIR) : path.join(root, 'dist');
const builtPath = (fileName) => path.join(dist, fileName);
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const transform = () => execFileSync('/usr/bin/xsltproc', [builtPath('feed.xsl'), builtPath('rss.xml')], { encoding: 'utf8' });
const transformXml = (xml) => execFileSync('/usr/bin/xsltproc', [builtPath('feed.xsl'), '-'], { encoding: 'utf8', input: xml });

test('built human-readable RSS actions retain 40px focusable controls and visible primary and quiet hover states', () => {
  const stylesheet = fs.readFileSync(builtPath('feed.xsl'), 'utf8');
  const renderedFeed = transform();

  assert.match(renderedFeed, /<a class="btn" href="\/follow\/">How to follow<\/a>/);
  assert.match(renderedFeed, /<a class="btn quiet" href="\/">Back to the site<\/a>/);
  assert.match(stylesheet, /\.btn\s*\{[\s\S]*min-height:\s*40px;/);
  assert.match(stylesheet, /\.btn:focus-visible\s*\{[\s\S]*outline:\s*3px solid #0071e3;[\s\S]*outline-offset:\s*3px;/);
  assert.match(stylesheet, /\.btn:hover\s*\{[\s\S]*background:\s*#0066cc;[\s\S]*transform:\s*translateY\(-1px\);/);
  assert.match(stylesheet, /\.btn\.quiet:hover\s*\{[\s\S]*background:\s*#ebebef;/);
});

test('built human-readable RSS renders each feed media image as an accessible local article link', () => {
  const renderedFeed = transform();
  const images = [...renderedFeed.matchAll(/<img[^>]+src="([^"]+)"[^>]+alt="([^"]+)"/g)];

  assert.equal(images.length, 15, 'every feed item must render its media image');
  assert.equal(new Set(images.map(([, source]) => source)).size, 15, 'feed media must retain per-article paths');
  assert.equal(images.every(([, source, alt]) => /^\/generated\/articles\//.test(source) && alt.endsWith('editorial visual')), true);
  assert.equal(images.some(([, source]) => /^https?:\/\//.test(source)), false, 'browser-rendered feed images must stay on the current origin');
  assert.equal((renderedFeed.match(/class="item-media" href="https:\/\//g) || []).length, 15);
});

test('built human-readable RSS rejects non-article media URLs before creating browser image requests', () => {
  const renderedFeed = transformXml(`<?xml version="1.0"?>
    <rss xmlns:media="http://search.yahoo.com/mrss/"><channel><title>Feed</title><description>Test</description>
      <item><title>Allowed</title><link>https://example.com/allowed</link><description>Allowed</description><media:content url="https://www.computecurrent.com/generated/articles/allowed/og.webp"/></item>
      <item><title>Blocked</title><link>https://example.com/blocked</link><description>Blocked</description><media:content url="https://www.computecurrent.com//evil.example/track.webp"/></item>
    </channel></rss>`);
  const imageSources = [...renderedFeed.matchAll(/<img[^>]+src="([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(imageSources, ['/generated/articles/allowed/og.webp']);
  assert.doesNotMatch(renderedFeed, /(?:src=")?\/\/evil\.example/);
});
