import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (relativePath) => fs.readFileSync(relativePath, 'utf8');

test('admin sign-in uses the shared admin action hover and visible focus treatment', () => {
  const css = read('src/styles/global.css');

  assert.match(css, /\.admin-form button:hover\s*\{[\s\S]*border-color:\s*var\(--accent\);[\s\S]*background:\s*var\(--accent\);[\s\S]*color:\s*var\(--surface\);/);
  assert.match(css, /\.admin-shell :is\(a, button\):focus-visible\s*\{[\s\S]*outline:\s*3px solid var\(--accent\);[\s\S]*outline-offset:\s*3px;/);
});
