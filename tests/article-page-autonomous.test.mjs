import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('article page template keeps internal evidence components off the public article surface', () => {
  const page = fs.readFileSync('src/pages/news/[id].astro', 'utf8');
  assert.doesNotMatch(page, /ArticleEvidenceBox/);
  assert.doesNotMatch(page, /ClaimVerificationNote/);
  assert.doesNotMatch(page, /ArticleWatchMetrics/);
  assert.doesNotMatch(page, /Backfilled Analysis/);
});
