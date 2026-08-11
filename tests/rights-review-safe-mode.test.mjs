import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  collectRightsReviewSafeModeEvidence,
  rightsReviewSafeModeResult,
} from '../scripts/lib/rights-review-safe-mode.mjs';

const SAFE_EVIDENCE = Object.freeze({
  authorizedSourceCount: 0,
  publicCardCount: 0,
  publicDetailCount: 0,
  rssItemCount: 0,
  localNewsLinkCount: 0,
  paidAdsEnabled: false,
  pauseStateVisible: true,
});

test('rights review safe mode accepts only an explicit zero-authorization empty public surface', () => {
  const result = rightsReviewSafeModeResult(SAFE_EVIDENCE);

  assert.equal(result.ok, true, result.reasons.join(', '));
  assert.equal(result.mode, 'rights_review_safe_mode');
});

for (const [field, unsafeValue, expectedReason] of [
  ['publicCardCount', 1, 'rights_review_safe_mode_public_cards_present'],
  ['publicDetailCount', 1, 'rights_review_safe_mode_public_details_present'],
  ['rssItemCount', 1, 'rights_review_safe_mode_rss_items_present'],
  ['localNewsLinkCount', 1, 'rights_review_safe_mode_local_news_links_present'],
  ['paidAdsEnabled', true, 'rights_review_safe_mode_paid_ads_enabled'],
  ['pauseStateVisible', false, 'rights_review_safe_mode_pause_state_not_visible'],
]) {
  test(`rights review safe mode fails closed when ${field} is unsafe`, () => {
    const result = rightsReviewSafeModeResult({ ...SAFE_EVIDENCE, [field]: unsafeValue });

    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes(expectedReason));
  });
}

test('rights review safe mode is unavailable when any current text-authorized source exists', () => {
  const result = rightsReviewSafeModeResult({ ...SAFE_EVIDENCE, authorizedSourceCount: 1 });

  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('rights_review_safe_mode_authorized_sources_present'));
});

test('rights review safe mode rejects missing or non-numeric inventory evidence', () => {
  const missing = rightsReviewSafeModeResult({ ...SAFE_EVIDENCE, rssItemCount: undefined });
  const invalid = rightsReviewSafeModeResult({ ...SAFE_EVIDENCE, publicDetailCount: '0' });

  assert.equal(missing.ok, false);
  assert.ok(missing.reasons.includes('rights_review_safe_mode_rss_item_count_invalid'));
  assert.equal(invalid.ok, false);
  assert.ok(invalid.reasons.includes('rights_review_safe_mode_public_detail_count_invalid'));
});

test('rendered evidence ignores private admin story links but catches absolute public leaks', (t) => {
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rights-review-safe-mode-'));
  t.after(() => fs.rmSync(distDir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(distDir, 'admin', 'edit', 'fixture'), { recursive: true });
  fs.writeFileSync(
    path.join(distDir, 'index.html'),
    '<p data-rights-review-state="zero-authorized-sources">Source-linked and long-form publication paused: 0 authorized sources are currently approved for text publication.</p>',
  );
  fs.writeFileSync(
    path.join(distDir, 'admin', 'edit', 'fixture', 'index.html'),
    '<article data-public-card><a href="/news/private-preview/">Private preview</a></article>',
  );
  fs.writeFileSync(path.join(distDir, 'rss.xml'), '<rss><channel></channel></rss>');

  const privateOnly = collectRightsReviewSafeModeEvidence({ distDir, sourceRegistry: [] });
  assert.equal(privateOnly.publicCardCount, 0);
  assert.equal(privateOnly.localNewsLinkCount, 0);
  assert.equal(rightsReviewSafeModeResult(privateOnly).ok, true);

  fs.writeFileSync(
    path.join(distDir, 'index.html'),
    '<p data-rights-review-state="zero-authorized-sources">Source-linked and long-form publication paused: 0 authorized sources.</p><a href="https://www.computecurrent.com/news/leak/">Leaked story</a>',
  );
  const leaked = collectRightsReviewSafeModeEvidence({ distDir, sourceRegistry: [] });
  assert.equal(leaked.localNewsLinkCount, 1);
  assert.equal(rightsReviewSafeModeResult(leaked).ok, false);
});
