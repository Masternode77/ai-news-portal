import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (relativePath) => fs.readFileSync(relativePath, 'utf8');

test('contact variant uses the existing light-neutral-blue tokens instead of legacy commercial colors', () => {
  const contact = read('src/pages/contact.astro');
  const css = read('src/styles/terminal.css');

  assert.match(contact, /commercial-page-contact/);
  assert.match(css, /body:has\(\.commercial-page-contact\)\s*\{[\s\S]*background:\s*var\(--al-bg\);/);
  assert.match(css, /\.commercial-page-contact \.commercial-contact-list a:first-child\s*\{[\s\S]*background:\s*var\(--al-blue\);/);
  assert.match(css, /\.commercial-page-contact \.commercial-contact-list a:not\(:first-child\)\s*\{[\s\S]*background:\s*var\(--al-soft\);/);
  const contactScope = css.slice(css.indexOf('body:has(.commercial-page-contact)'), css.indexOf('/* Buttons'));
  assert.doesNotMatch(contactScope, /#[0-9a-f]{3,8}|rgb\(|hsl\(|linear-gradient/i);
});

test('mobile home lead deck is not line-clamped', () => {
  const css = read('src/styles/terminal.css');
  const mobileRule = css.match(/@media \(max-width: 720px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

  assert.match(mobileRule, /\.hero-lead-copy p\s*\{[\s\S]*display:\s*block;[\s\S]*overflow:\s*visible;[\s\S]*-webkit-line-clamp:\s*unset;[\s\S]*line-clamp:\s*unset;/);
});
