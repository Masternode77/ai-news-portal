import assert from 'node:assert/strict';
import test from 'node:test';
import { auditPublicFeedVolume } from '../scripts/audit-public-feed-volume.mjs';

test('public feed volume follows fresh quality-gated longform inventory', () => {
  const result = auditPublicFeedVolume();

  assert.equal(result.ok, true);
  assert.ok(result.homepageCount >= 20);
  assert.equal(result.longformCount, result.targetLongformCount);
  assert.ok(result.freshQualityLongformCount <= result.qualityLongformCount);
  assert.ok(result.shortCount >= 10);
});
