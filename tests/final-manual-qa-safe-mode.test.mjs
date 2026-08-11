import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as finalManualQa from '../scripts/final-manual-qa.mjs';

const SAFE_HOME = '<main><p data-rights-review-state="zero-authorized-sources">Source-linked and long-form publication paused: 0 authorized sources are currently approved for text publication.</p></main>';

function fixtureDist(t, { homepage = SAFE_HOME, rss = '<rss><channel></channel></rss>' } = {}) {
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'final-manual-qa-'));
  t.after(() => fs.rmSync(distDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(distDir, 'index.html'), homepage);
  fs.writeFileSync(path.join(distDir, 'rss.xml'), rss);
  return distDir;
}

function addDetail(distDir, id, body = '<main>Public article</main>') {
  const detailDir = path.join(distDir, 'news', id);
  fs.mkdirSync(detailDir, { recursive: true });
  fs.writeFileSync(path.join(detailDir, 'index.html'), body);
}

test('manual QA records a verified article-page skip for zero-detail rights-review safe mode', async (t) => {
  // Given: a rendered public surface with no details and the complete safe-mode proof.
  const distDir = fixtureDist(t);

  // When: the final manual QA chooses its article-page action.
  const plan = await finalManualQa.buildManualQaArticlePlan(distDir, { sourceRegistry: [] });

  // Then: it records a successful verified skip and never constructs /news//.
  assert.equal(plan.ok, true, plan.reasons.join(', '));
  assert.equal(plan.articleRoute, '');
  assert.equal(plan.adminEditRoute, '/admin/edit/');
  assert.deepEqual(plan.articleCheck, {
    label: 'article',
    route: '',
    status: 0,
    ok: true,
    skipped: true,
    mode: 'rights_review_safe_mode',
    reason: 'verified_zero_public_detail_inventory',
    verifiedPublicDetailCount: 0,
  });
});

test('manual QA requires a concrete built article page whenever public detail inventory is nonzero', async (t) => {
  // Given: one rendered public detail and a normal homepage that links to it.
  const distDir = fixtureDist(t, {
    homepage: '<main><a href="/news/public-detail/">Read article</a></main>',
    rss: '<rss><channel><item><link>https://www.computecurrent.com/news/public-detail/</link></item></channel></rss>',
  });
  addDetail(distDir, 'public-detail');

  // When: the final manual QA chooses its article-page action.
  const plan = await finalManualQa.buildManualQaArticlePlan(distDir, { sourceRegistry: [] });

  // Then: the real built route remains mandatory and supplies the editor context ID.
  assert.equal(plan.ok, true, plan.reasons.join(', '));
  assert.equal(plan.articleRoute, '/news/public-detail/');
  assert.equal(plan.adminEditRoute, '/admin/edit/?id=public-detail');
  assert.equal(plan.articleCheck, null);
});

test('manual QA fails when zero detail inventory lacks verified rights-review safe-mode evidence', async (t) => {
  // Given: no public details and no visible safe-mode state.
  const distDir = fixtureDist(t, { homepage: '<main>No articles</main>' });

  // When: the final manual QA plans the article check.
  const plan = await finalManualQa.buildManualQaArticlePlan(distDir, { sourceRegistry: [] });

  // Then: zero inventory cannot silently become a skip.
  assert.equal(plan.ok, false);
  assert.ok(plan.reasons.includes('zero_detail_inventory_without_verified_rights_review_safe_mode'));
  assert.equal(plan.articleCheck.skipped, false);
});

test('manual QA fails when a safe-mode homepage contradicts nonzero detail inventory', async (t) => {
  // Given: the homepage claims zero-authorized safe mode while a detail page exists.
  const distDir = fixtureDist(t);
  addDetail(distDir, 'contradictory-detail');

  // When: the final manual QA plans the article check.
  const plan = await finalManualQa.buildManualQaArticlePlan(distDir, { sourceRegistry: [] });

  // Then: contradictory evidence fails instead of skipping or browsing an inconsistent candidate.
  assert.equal(plan.ok, false);
  assert.ok(plan.reasons.includes('rights_review_safe_mode_conflicts_with_public_details'));
});

test('manual QA fails malformed news inventory instead of treating it as zero details', async (t) => {
  // Given: a news child exists without its required rendered index.
  const distDir = fixtureDist(t);
  fs.mkdirSync(path.join(distDir, 'news', 'missing-index'), { recursive: true });

  // When: the final manual QA plans the article check.
  const plan = await finalManualQa.buildManualQaArticlePlan(distDir, { sourceRegistry: [] });

  // Then: malformed inventory is an explicit failure, not a safe-mode skip.
  assert.equal(plan.ok, false);
  assert.ok(plan.reasons.includes('malformed_public_detail_inventory:missing-index'));
});

test('manual QA fails when discovered detail IDs disagree with recursive rendered inventory', async (t) => {
  // Given: one valid direct detail contains an unexpected nested detail page.
  const distDir = fixtureDist(t, { homepage: '<main><a href="/news/direct-detail/">Read article</a></main>' });
  addDetail(distDir, 'direct-detail');
  const nestedDir = path.join(distDir, 'news', 'direct-detail', 'nested');
  fs.mkdirSync(nestedDir, { recursive: true });
  fs.writeFileSync(path.join(nestedDir, 'index.html'), '<main>Unexpected nested detail</main>');

  // When: the final manual QA reconciles direct routes with rendered evidence.
  const plan = await finalManualQa.buildManualQaArticlePlan(distDir, { sourceRegistry: [] });

  // Then: count disagreement fails before any article route is browsed.
  assert.equal(plan.ok, false);
  assert.ok(plan.reasons.includes('public_detail_inventory_count_mismatch:1/2'));
});
