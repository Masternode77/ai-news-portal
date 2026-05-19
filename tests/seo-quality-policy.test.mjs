import test from 'node:test';
import assert from 'node:assert/strict';
import { rssItemEligible, seoNoindexReasons, sitemapArticleEligible } from '../scripts/lib/seo-quality-policy.mjs';

test('noindexes and excludes quarantined records', () => {
  const article = {
    id: 'q',
    public_status: 'quarantined',
    homepagePublished: false,
    articlePagePublished: false,
    archiveOnly: true,
    infrastructure_relevance_score: 0.9,
    articleText: 'Copyright © 2026 TechTarget, Inc.',
  };
  assert.ok(seoNoindexReasons(article).includes('quarantined'));
  assert.equal(sitemapArticleEligible(article), false);
  assert.equal(rssItemEligible(article), false);
});

test('allows clean core articles into sitemap and RSS', () => {
  const article = {
    id: 'clean-core',
    title: 'Texas county data center moratorium raises siting risk',
    homepagePublished: true,
    articlePagePublished: true,
    infrastructure_relevance_score: 0.9,
    articleText: `${'Texas county permitting and data center moratorium evidence affects grid planning and construction timing. '.repeat(25)}Final sentence complete.`,
    expertLensFull: {
      finalArticleBody: `${'Texas county permitting and data center moratorium evidence affects grid planning and construction timing. '.repeat(10)}Final sentence complete.`,
    },
  };
  assert.equal(sitemapArticleEligible(article), true);
  assert.equal(rssItemEligible(article), true);
});
