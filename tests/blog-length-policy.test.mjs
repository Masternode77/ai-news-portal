import test from 'node:test';
import assert from 'node:assert/strict';
import { blogLengthResult } from '../scripts/lib/blog-length-policy.mjs';

test('blog length policy rejects summary-length full posts', () => {
  const result = blogLengthResult('Thesis\n\nShort paragraph.', 'standard_blog');
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('visible_body_below_4500'));
});
