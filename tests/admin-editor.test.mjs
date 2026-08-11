import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('admin editor exposes action controls and full editable article metadata', () => {
  const source = fs.readFileSync(new URL('../src/pages/admin/edit.astro', import.meta.url), 'utf8');
  const client = fs.readFileSync(new URL('../src/lib/admin-editor/client.ts', import.meta.url), 'utf8');
  const dom = fs.readFileSync(new URL('../src/lib/admin-editor/dom.ts', import.meta.url), 'utf8');
  for (const name of ['sourceUrl', 'publishedAt', 'public_status', 'canonicalUrl', 'heroImage', 'thumbnailImage', 'imageAlt', 'imagePrompt']) {
    assert.match(source, new RegExp('name="' + name + '"'));
  }
  for (const action of ['save-draft', 'publish', 'hide', 'noindex', 'upload-image', 'preview']) {
    assert.match(source, new RegExp('data-action="' + action + '"'));
  }
  for (const action of ['regenerate-article', 'regenerate-brief', 'regenerate-image']) {
    assert.doesNotMatch(source, new RegExp('data-action="' + action + '"'));
  }
  assert.match(source, /startAdminEditor\(document\)/);
  assert.doesNotMatch(source, /@ts-nocheck/);
  assert.match(source, /admin-preview/);
  assert.match(dom, /expectedSourceSha/);
  assert.match(client, /response\.sourceSha/);
});
