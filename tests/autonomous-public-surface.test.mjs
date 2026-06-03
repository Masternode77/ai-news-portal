import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const FORBIDDEN = [
  'Commercially,',
  'Operationally,',
  'worth a local Compute Current read',
  'lens for infrastructure readers',
  'reported item can translate into',
  'readers should test whether',
  'not just another AI headline',
  'puts power under',
  'pending clearer execution evidence',
  'The source evidence is clean enough to monitor',
];

test('current autonomous public data surface has no banned AI-summary phrases', () => {
  for (const file of ['src/data/latest-news.json', 'src/data/search-index.json']) {
    const text = fs.readFileSync(file, 'utf8');
    for (const phrase of FORBIDDEN) {
      assert.equal(text.includes(phrase), false, `${file} leaked ${phrase}`);
    }
  }
});

test('published autonomous analyses carry claim ledgers and bottom-line data', () => {
  const latest = JSON.parse(fs.readFileSync('src/data/latest-news.json', 'utf8'));
  const analyses = latest.filter((item) => item.articlePagePublished === true);
  for (const article of analyses) {
    assert.ok(article.claim_ledger?.length >= 4, `${article.title} missing claim ledger`);
    assert.ok(article.evidence_pack?.verified_facts?.length >= 4, `${article.title} missing evidence facts`);
    assert.ok(article.editorial_thesis?.bottom_line, `${article.title} missing bottom line`);
    assert.ok(article.blog_metadata?.source_summary_ratio <= 0.35, `${article.title} is source-summary dominant`);
  }
});

test('autonomous items that fail longform quality stay on source-linked signal routes', () => {
  const latest = JSON.parse(fs.readFileSync('src/data/latest-news.json', 'utf8'));
  const failedLongformCandidates = latest.filter((item) => item.signalCardReason === 'longform_quality_gate_failed');
  assert.ok(failedLongformCandidates.length > 0);

  for (const article of failedLongformCandidates) {
    assert.equal(article.articlePagePublished, false, `${article.title} should not publish a local article page`);
    assert.equal(article.signalCardOnly, true, `${article.title} should stay signal-only`);
    assert.equal(article.public_status, 'signal', `${article.title} should publish as a signal`);
    assert.match(article.primaryHref || '', /^https?:\/\//, `${article.title} should link to the source`);
  }
});
