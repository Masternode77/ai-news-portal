import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('public article page excludes autonomous evidence and claim-debug components', () => {
  const page = fs.readFileSync('src/pages/news/[id].astro', 'utf8');
  assert.doesNotMatch(page, /ArticleEvidenceBox/);
  assert.doesNotMatch(page, /ClaimVerificationNote/);
  assert.doesNotMatch(page, /Backfilled Analysis/);
  assert.match(page, /buildPublicArticleModel/);
});

test('admin content quality page owns debug evidence and claim verification', () => {
  const page = fs.readFileSync('src/pages/admin/content-quality/[id].astro', 'utf8');
  assert.match(page, /AdminEvidenceBox/);
  assert.match(page, /AdminClaimVerificationNote/);
  assert.match(page, /Backfilled Analysis/);
});
