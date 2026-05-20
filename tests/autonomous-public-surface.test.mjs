import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { publicPublishQualityGate, PUBLIC_INTERNAL_LABELS } from '../scripts/lib/public-publish-quality-gate.mjs';
import { routePublicLane } from '../scripts/lib/public-lane-router.mjs';
import { hasExplicitInfrastructureCapacityEvidence, isSingleSourceVendorOrProductPost } from '../scripts/lib/source-scope-policy.mjs';

const FORBIDDEN = [
  ...PUBLIC_INTERNAL_LABELS,
  'evidence anchor',
  'infrastructure lane',
  'cluster clears the desk bar',
  'source item centers on',
  'control point in this story',
  'Why the desk selected it',
];

function loadPublicArticles() {
  const latest = JSON.parse(fs.readFileSync('src/data/latest-news.json', 'utf8'));
  return latest.filter((item) =>
    item.articlePagePublished === true
    && item.archiveOnly !== true
    && item.public_status !== 'quarantined'
  );
}

test('public data surface has no internal QA/debug labels', () => {
  const articles = loadPublicArticles();
  const text = articles.map((article) => [
    article.title,
    article.deck,
    article.public_presentation?.deck,
    article.expertLensFull?.finalArticleBody,
    article.article_body_markdown,
  ].filter(Boolean).join('\n')).join('\n');
  for (const phrase of FORBIDDEN) {
    assert.equal(text.includes(phrase), false, `public data leaked ${phrase}`);
  }
});

test('published public articles pass the editorial v2 gate and strict routing checks', () => {
  const articles = loadPublicArticles();
  assert.ok(articles.length > 0);
  for (const article of articles) {
    const gate = publicPublishQualityGate(article);
    assert.equal(gate.ok, true, `${article.id} failed gate: ${gate.reasons.join(', ')}`);
    const strict = routePublicLane(article);
    assert.equal(article.public_routing?.routing_decision, strict.routing_decision, `${article.id} route drift`);
    if (isSingleSourceVendorOrProductPost(article)) {
      assert.notEqual(article.public_routing?.public_signal_label, 'Core Signal', `${article.id} over-routed single-source vendor post`);
    }
    if (article.primary_category === 'Cloud Capacity') {
      assert.equal(hasExplicitInfrastructureCapacityEvidence(article), true, `${article.id} lacks explicit capacity proof`);
    }
  }
});
