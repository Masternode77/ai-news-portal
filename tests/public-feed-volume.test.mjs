import assert from 'node:assert/strict';
import test from 'node:test';
import { publicFeedVolumeResult } from '../scripts/audit-public-feed-volume.mjs';
import { authorizePublicTestRecords } from './fixtures/admin-publication-integrity.mjs';

const SAFE_EVIDENCE = {
  authorizedSourceCount: 0,
  publicCardCount: 0,
  publicDetailCount: 0,
  rssItemCount: 0,
  localNewsLinkCount: 0,
  paidAdsEnabled: false,
  pauseStateVisible: true,
};

function signalRecords(count = 30) {
  return Array.from({ length: count }, (_, index) => ({
    id: `feed-volume-signal-${index}`,
    title: `Utility interconnection milestone ${index + 1} changes AI data center timing`,
    summary: `The grid operator approved substation work ${index + 1} for a large AI data center campus.`,
    articleText: `Utility interconnection evidence ${index + 1} connects substation construction, grid capacity, and AI data center commissioning. `.repeat(8),
    sourceUrl: `https://fixture.example/feed-volume-signal-${index}`,
    publishedAt: new Date(Date.UTC(2026, 7, 9, 0, index)).toISOString(),
    public_content_tier: 'signal_card',
    public_status: 'published',
    public_routing: { visibility: 'adjacent' },
    homepagePublished: true,
    archiveOnly: false,
  }));
}

test('public feed volume follows normal thresholds for explicitly authorized inventory', () => {
  const authorized = authorizePublicTestRecords(signalRecords());
  const result = publicFeedVolumeResult(authorized.records, authorized.options);

  assert.equal(result.ok, true);
  assert.ok(result.homepageCount >= 20);
  assert.equal(result.longformCount, result.targetLongformCount);
  assert.ok(result.shortCount >= 10);
  assert.equal(result.mode, 'normal');
});

test('public feed volume does not relax normal thresholds when one source is authorized', () => {
  const authorized = authorizePublicTestRecords(signalRecords(1));
  const result = publicFeedVolumeResult(authorized.records, {
    ...authorized.options,
    safeModeEvidence: { ...SAFE_EVIDENCE, authorizedSourceCount: 1 },
  });

  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('short_signal_count_below_10'));
  assert.notEqual(result.mode, 'rights_review_safe_mode');
});

test('public feed volume accepts the explicit zero-authorization rights review safe mode', () => {
  const result = publicFeedVolumeResult([], { safeModeEvidence: SAFE_EVIDENCE });

  assert.equal(result.ok, true, result.reasons.join(', '));
  assert.equal(result.mode, 'rights_review_safe_mode');
  assert.equal(result.homepageCount, 0);
});

test('public feed volume safe mode fails closed on leaked public inventory or hidden pause state', () => {
  for (const unsafeEvidence of [
    { publicCardCount: 1 },
    { publicDetailCount: 1 },
    { rssItemCount: 1 },
    { localNewsLinkCount: 1 },
    { paidAdsEnabled: true },
    { pauseStateVisible: false },
  ]) {
    const result = publicFeedVolumeResult([], {
      safeModeEvidence: { ...SAFE_EVIDENCE, ...unsafeEvidence },
    });
    assert.equal(result.ok, false, JSON.stringify(unsafeEvidence));
    assert.ok(result.reasons.length > 0, JSON.stringify(unsafeEvidence));
  }
});
