import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('article page template exposes autonomous evidence components', () => {
  const page = fs.readFileSync('src/pages/news/[id].astro', 'utf8');
  assert.match(page, /ArticleEvidenceBox/);
  assert.match(page, /ClaimVerificationNote/);
  assert.match(page, /ArticleWatchMetrics/);
  assert.match(page, /Backfilled Analysis/);
});
