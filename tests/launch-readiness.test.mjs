import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { publicPublishQualityGateV3 } from '../scripts/lib/public-publish-quality-gate-v3.mjs';

test('launch data surface has enough clean local articles for a credible v1', () => {
  const latest = JSON.parse(fs.readFileSync('src/data/latest-news.json', 'utf8'));
  const search = JSON.parse(fs.readFileSync('src/data/search-index.json', 'utf8'));
  const visible = latest.filter((item) => item.homepagePublished !== false && item.archiveOnly !== true);
  const local = visible.filter((item) => item.articlePagePublished === true && item.signalCardOnly !== true);
  const full = local.filter((item) => /Core Longform Blog|Standard Blog/i.test(item.public_route || ''));
  assert.ok(visible.length >= 20);
  assert.ok(local.length >= 12);
  assert.ok(full.length >= 6);
  assert.ok(search.length > 0);
  for (const article of local.slice(0, 20)) {
    const gate = publicPublishQualityGateV3(article);
    assert.equal(gate.ok, true, `${article.id}: ${gate.reasons.join(', ')}`);
  }
});
