import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const publicFiles = [
  'src/pages/news/[id].astro',
  'src/components/PublicArticleHeader.astro',
  'src/components/PublicArticleBody.astro',
  'src/components/PublicAtAGlance.astro',
  'src/components/PublicWhatToWatch.astro',
  'src/components/PublicBottomLine.astro',
];

test('public article components do not import admin/debug components', () => {
  for (const file of publicFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.equal(/ArticleEvidenceBox|ClaimVerificationNote|AdminEvidenceBox|AdminClaimVerificationNote|components\/admin/i.test(source), false, `${file} imports admin QA surface`);
  }
});

test('admin content quality route keeps QA components under admin namespace', () => {
  const adminRoute = fs.readFileSync('src/pages/admin/content-quality/[id].astro', 'utf8');
  assert.match(adminRoute, /AdminEvidenceBox|AdminClaimVerificationNote/);
});
