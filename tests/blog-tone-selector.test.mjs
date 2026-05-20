import test from 'node:test';
import assert from 'node:assert/strict';
import { selectBlogTone } from '../scripts/lib/blog-tone-selector.mjs';

test('tone selector caps repeated tones in recent posts', () => {
  const recent = [
    { blog_metadata: { tone: 'Policy risk analyst' } },
    { blog_metadata: { tone: 'Policy risk analyst' } },
    { blog_metadata: { tone: 'Policy risk analyst' } },
  ];
  const tone = selectBlogTone({ title: 'Texas data center moratorium' }, { recent });
  assert.notEqual(tone, 'Policy risk analyst');
});
