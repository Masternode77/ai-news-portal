import test from 'node:test';
import assert from 'node:assert/strict';
import latestNews from '../src/data/latest-news.json' with { type: 'json' };
import archivedNews from '../src/data/archived-news.json' with { type: 'json' };
import { routePublicLane, CORE_LANE_KEYS, CORE_RELEVANCE_THRESHOLD } from '../scripts/lib/public-lane-router.mjs';
import { guardPublicTemplatePhrases } from '../scripts/lib/public-template-phrase-guard.mjs';
import { detectBoilerplate } from '../scripts/lib/boilerplate-detector.mjs';
import { detectTruncationArtifacts } from '../scripts/lib/truncation-detector.mjs';

function text(article = {}) {
  return [
    article.title,
    article.summary,
    article.snippet,
    article.deck,
    article.why_it_matters,
    article.public_presentation?.deck,
    article.public_presentation?.why_it_matters,
    article.expertLensFull?.finalArticleBody,
  ].filter(Boolean).join(' ');
}

test('current public data has no low-relevance core lane records', () => {
  for (const article of [...latestNews, ...archivedNews]) {
    if (article.homepagePublished === false || article.archiveOnly === true) continue;
    const route = routePublicLane(article);
    if (!CORE_LANE_KEYS.has(route.laneKey)) continue;
    assert.ok(Number(route.score) >= CORE_RELEVANCE_THRESHOLD, `${article.id} has low core score`);
  }
});

test('currently public records do not contain emergency-banned public copy', () => {
  const publicRecords = [...latestNews, ...archivedNews].filter((article) => article.homepagePublished !== false || article.articlePagePublished !== false);
  for (const article of publicRecords) {
    const value = text(article);
    assert.equal(guardPublicTemplatePhrases(value).ok, true, `${article.id} has template phrase`);
    assert.equal(detectBoilerplate(value).copyright_footer_detected, false, `${article.id} has copyright footer`);
    assert.equal(detectTruncationArtifacts(value, { allowEllipsis: true }).ok, true, `${article.id} has truncation`);
  }
});
