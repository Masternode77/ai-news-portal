import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (relativePath) => fs.readFileSync(relativePath, 'utf8');

const builtBodyText = (html) => {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? '';
  return body
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
};

test('built privacy body keeps words separate across inline links and emphasis', () => {
  const bodyText = builtBodyText(read('dist/privacy/index.html'));

  assert.match(bodyText, /account at adssettings\.google\.com/);
  assert.match(bodyText, /sites at policies\.google\.com\/technologies\/partner-sites/);
  assert.match(bodyText, /the Privacy choices control/);
  assert.doesNotMatch(bodyText, /account atadssettings|sites atpolicies|thePrivacy choices|the the Privacy choices/i);
});

test('language-marked CJK text gets phrase-aware wrapping without changing English defaults', () => {
  const css = read('src/styles/terminal.css');

  assert.match(css, /:where\(\[lang\|='ja'\], \[lang\|='zh'\], \[lang\|='ko'\]\)\s*\{/);
  assert.match(css, /word-break:\s*auto-phrase;/);
  assert.match(css, /overflow-wrap:\s*normal;/);
  assert.match(css, /text-wrap:\s*balance;/);
});

test('masthead targets and its brand-mark exception match the design contract', () => {
  const css = read('src/styles/terminal.css');
  const design = read('DESIGN.md');

  assert.match(css, /\.masthead-actions \.btn-primary,[\s\S]*?min-height:\s*40px;/);
  assert.match(design, /small, aria-hidden masthead mark is the sole blue-gradient exception/i);
  assert.match(design, /Decorative background gradients are prohibited/i);
});
