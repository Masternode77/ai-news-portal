import test from 'node:test';
import assert from 'node:assert/strict';
import { routePublicLane, CORE_LANE_KEYS, CORE_RELEVANCE_THRESHOLD } from '../scripts/lib/public-lane-router.mjs';
import { guardPublicTemplatePhrases } from '../scripts/lib/public-template-phrase-guard.mjs';
import { detectBoilerplate } from '../scripts/lib/boilerplate-detector.mjs';
import { detectTruncationArtifacts } from '../scripts/lib/truncation-detector.mjs';
import { rssItemEligible, sitemapArticleEligible } from '../scripts/lib/seo-quality-policy.mjs';

const cleanSource = `${'NetApp and Red Hat OpenShift backup, storage, and disaster recovery controls matter for enterprise AI platform infrastructure. '.repeat(18)}Final sentence complete.`;

test('quality policy keeps low relevance records out of core public lanes', () => {
  const route = routePublicLane({
    id: 'gpu-deal',
    title: 'AMD RX 9070 GPU Amazon deal hits all-time low',
    infrastructure_relevance_score: 0.9,
    articleText: cleanSource,
  });

  assert.equal(CORE_LANE_KEYS.has(route.laneKey), false);
  assert.ok(route.score >= CORE_RELEVANCE_THRESHOLD);
});

test('public guard rejects emergency template, boilerplate, and truncation leaks', () => {
  const text = [
    'The issue is no longer demand alone; it is whether the surrounding infrastructure is ready.',
    'Want more Data Center Knowledge stories in your Google search results?',
    'Copyright © 2026 TechTarget, Inc.',
    'The deployment ended across on-premises and clo.',
  ].join(' ');

  assert.equal(guardPublicTemplatePhrases(text).ok, false);
  assert.equal(detectBoilerplate(text).copyright_footer_detected, true);
  assert.equal(detectTruncationArtifacts(text, { allowEllipsis: true }).ok, false);
});

test('quarantined records are excluded from sitemap and RSS eligibility', () => {
  const article = {
    id: 'dirty-source',
    title: 'Data Center Knowledge footer leak',
    infrastructure_relevance_score: 1,
    articleText: 'Want more Data Center Knowledge stories in your Google search results? Copyright © 2026 TechTarget, Inc.',
    public_status: 'quarantined',
    quarantined: true,
    homepagePublished: false,
    articlePagePublished: false,
    archiveOnly: true,
    seo_noindex: true,
  };

  assert.equal(sitemapArticleEligible(article), false);
  assert.equal(rssItemEligible(article), false);
});
