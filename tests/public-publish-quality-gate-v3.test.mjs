import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { publicPublishQualityGateV3 } from '../scripts/lib/public-publish-quality-gate-v3.mjs';

function latestArticle() {
  const latest = JSON.parse(fs.readFileSync('src/data/latest-news.json', 'utf8'));
  return latest.find((item) => item.editorial_engine_version === 'editorial_article_engine_v3') || latest[0];
}

test('launch-ready public articles pass the v3 publish gate', () => {
  const article = latestArticle();
  assert.ok(article, 'expected a launch article fixture in latest-news.json');
  const gate = publicPublishQualityGateV3(article);
  assert.equal(gate.ok, true, gate.reasons.join(', '));
  assert.equal(gate.version, 'public_publish_quality_gate_v3');
  assert.ok(gate.metrics.human_style_score >= 0.84);
  assert.ok(gate.metrics.insight_density_score >= 0.78);
});

test('v3 gate rejects public internal label leakage', () => {
  const article = {
    ...latestArticle(),
    deck: 'Evidence',
  };
  const gate = publicPublishQualityGateV3(article);
  assert.equal(gate.ok, false);
  assert.ok(gate.reasons.some((reason) => /internal_label_leak|forbidden/i.test(reason)));
});
