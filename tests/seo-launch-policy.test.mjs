import assert from 'node:assert/strict';
import test from 'node:test';
import { isIndexableLocalArticle, isUsefulRssItem, canonicalForArticle } from '../scripts/lib/seo-launch-policy.mjs';

test('seo launch policy indexes local articles and suppresses quarantined items', () => {
  const local = { id: 'abc', articlePagePublished: true, noindex: false, seo_noindex: false, public_status: 'published' };
  const quarantined = { ...local, public_status: 'quarantined' };
  assert.equal(isIndexableLocalArticle(local), true);
  assert.equal(isUsefulRssItem(local), true);
  assert.equal(isIndexableLocalArticle(quarantined), false);
  assert.equal(isUsefulRssItem(quarantined), false);
  assert.equal(canonicalForArticle(local), 'https://www.computecurrent.com/news/abc/');
});
