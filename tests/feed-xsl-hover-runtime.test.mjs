import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

const read = (relativePath) => fs.readFileSync(relativePath, 'utf8');

test('built human-readable RSS actions retain 40px focusable controls and visible primary and quiet hover states', () => {
  const stylesheet = read('dist/feed.xsl');
  const renderedFeed = execFileSync('/usr/bin/xsltproc', ['dist/feed.xsl', 'dist/rss.xml'], { encoding: 'utf8' });

  assert.match(renderedFeed, /<a class="btn" href="\/follow\/">How to follow<\/a>/);
  assert.match(renderedFeed, /<a class="btn quiet" href="\/">Back to the site<\/a>/);
  assert.match(stylesheet, /\.btn\s*\{[\s\S]*min-height:\s*40px;/);
  assert.match(stylesheet, /\.btn:focus-visible\s*\{[\s\S]*outline:\s*3px solid #0071e3;[\s\S]*outline-offset:\s*3px;/);
  assert.match(stylesheet, /\.btn:hover\s*\{[\s\S]*background:\s*#0066cc;[\s\S]*transform:\s*translateY\(-1px\);/);
  assert.match(stylesheet, /\.btn\.quiet:hover\s*\{[\s\S]*background:\s*#ebebef;/);
});
