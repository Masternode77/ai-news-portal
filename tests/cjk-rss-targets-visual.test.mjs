import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (relativePath) => fs.readFileSync(relativePath, 'utf8');

test('Chinese opt-in phrase markup keeps a compound intact without changing Korean, Japanese, or English wrapping', () => {
  const css = read('src/styles/terminal.css');

  assert.match(css, /:where\(\[lang\|='zh'\] \.cjk-phrase, \.cjk-phrase\[lang\|='zh'\]\)\s*\{[\s\S]*white-space:\s*nowrap;/);
  assert.doesNotMatch(css, /\[lang\|='(?:ja|ko)'\] \.cjk-phrase/);
});

test('human-readable RSS actions meet the shared target and focus-visible contract', () => {
  const feedStylesheet = read('public/feed.xsl');

  assert.match(feedStylesheet, /\.btn\s*\{[\s\S]*min-height:\s*40px;/);
  assert.match(feedStylesheet, /\.btn:focus-visible\s*\{[\s\S]*outline:\s*3px solid #0071e3;[\s\S]*outline-offset:\s*3px;/);
});
