import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('admin editor exposes action controls and full editable article metadata', () => {
  const source = fs.readFileSync(new URL('../src/pages/admin/edit/[id].astro', import.meta.url), 'utf8');
  for (const name of ['sourceUrl', 'publishedAt', 'public_status', 'canonicalUrl', 'heroImage', 'thumbnailImage', 'imageAlt', 'imagePrompt']) {
    assert.match(source, new RegExp('name="' + name + '"'));
  }
  for (const action of ['save-draft', 'publish', 'hide', 'noindex', 'regenerate-article', 'regenerate-brief', 'regenerate-image', 'upload-image', 'preview']) {
    assert.match(source, new RegExp('data-action="' + action + '"'));
  }
  assert.match(source, /admin-preview/);
});
