import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { runContentCycleForFixture } from '../scripts/run-content-cycle.mjs';
import { runPublishCycle } from '../scripts/lib/publish-cycle.mjs';

const fixture = new URL('./fixtures/content-cycle-mixed.json', import.meta.url);

test('full offline content cycle downgrades unsupported longform while updating public artifacts together', async () => {
  const result = await runContentCycleForFixture(fixture);

  assert.equal(result.mode, 'full-cycle');
  assert.ok(result.summary.published >= 1);
  assert.ok(result.artifacts.latestNews.some((article) => article.public_status === 'published'));
  assert.ok(result.artifacts.searchIndex.some((article) => article.searchText?.includes('Utility schedule now controls')));
  assert.ok(result.artifacts.imageManifest.every((image) => image.heroImage && image.thumbnailImage && image.ogImage));
  assert.ok(result.artifacts.rssItems.length >= 1);
  const downgraded = result.artifacts.latestNews.find((article) => article.id === 'fact-rich-ai-campus');
  const cycleResult = result.results.find((article) => article.id === 'fact-rich-ai-campus');
  assert.equal(downgraded.public_content_tier, 'editorial_brief');
  assert.equal(downgraded.articlePagePublished, false);
  assert.equal(cycleResult.tier, 'editorial_brief');
  assert.ok(cycleResult.reasons.includes('longform_editorial_fidelity_failed'));
  assert.equal(result.artifacts.sitemapEntries.some((entry) => entry.loc === '/news/fact-rich-ai-campus/'), false);
  assert.equal(
    result.artifacts.rssItems.find((item) => item.title === downgraded.title)?.link,
    'https://example.com/fact-rich-ai-campus',
  );
  assert.deepEqual(result.artifacts.cacheReport.updatedArtifacts.sort(), [
    'adminReviewQueue',
    'imageManifest',
    'latestNews',
    'rssItems',
    'searchIndex',
    'sitemapEntries',
    'taxonomyPages',
  ]);
  assert.ok(result.artifacts.adminReviewQueue.some((entry) => entry.queue === 'low-relevance'));
  assert.ok(result.artifacts.adminReviewQueue.some((entry) => entry.queue === 'failed-extraction'));
});

test('publish cycle keeps internal cycle status out of public artifacts', async () => {
  const fixtureData = JSON.parse(fs.readFileSync(fixture, 'utf8'));
  const result = await runPublishCycle({
    articles: fixtureData.articles,
    routeArticle: async (article) => ({
      id: article.id,
      title: article.title,
      tier: article.expectedTier,
      public_status: article.expectedTier === 'hidden' ? 'hidden' : 'draft',
      coreFeedEligible: article.expectedTier !== 'hidden',
      detailPage: article.expectedTier === 'longform_analysis',
      longformGenerated: article.expectedTier === 'longform_analysis',
      finalArticleBody: article.articleText,
      brief: article.summary,
      reasons: article.expectedTier === 'hidden' ? ['low relevance'] : [],
      relevance: { score: article.infrastructure_relevance_score, visibility: article.expectedTier === 'hidden' ? 'hidden' : 'core' },
    }),
    now: '2026-05-31T08:00:00.000Z',
  });

  const publicText = JSON.stringify({
    latestNews: result.artifacts.latestNews,
    searchIndex: result.artifacts.searchIndex,
    rssItems: result.artifacts.rssItems,
    sitemapEntries: result.artifacts.sitemapEntries,
  });
  assert.doesNotMatch(publicText, /completed_no_qualifying_signals|routing_decision|reviewQueue|pipeline_status|cycle_status/i);
  const attemptedLongform = result.artifacts.latestNews.find((article) => article.id === 'fact-rich-ai-campus');
  assert.equal(attemptedLongform.public_content_tier, 'editorial_brief');
  assert.equal(attemptedLongform.articlePagePublished, false);
  assert.equal(result.artifacts.sitemapEntries.some((entry) => entry.loc === '/news/fact-rich-ai-campus/'), false);
});

test('publish cycle keeps source-link briefs off local detail pages', async () => {
  const sourceUrl = 'https://example.com/utility-campus-grid-queue';
  const result = await runPublishCycle({
    articles: [{
      id: 'utility-campus-grid-queue',
      title: 'Utility queue blocks campus energization',
      source: 'Example Grid Dispatch',
      sourceUrl,
      publishedAt: '2026-05-30T10:00:00.000Z',
      summary: 'A utility interconnect queue shifted the energization date for a compute campus.',
      articleText: [
        'The utility now expects interconnect studies to set the campus energization path.',
        'Project filings say the first phase depends on a signed service agreement, transformer delivery, and a final substation construction schedule.',
        'The developer told county officials that AI training demand is still reserved, but the campus cannot ramp racks until the utility completes feeder work.',
        'Local planners identified grid studies, road access, and backup generation permits as the decision points that could shift the opening date.',
        'Power equipment suppliers and interconnection engineering are named as the limiting factors for the first two halls.',
      ].join(' '),
      primary_category: 'Power & Grid',
      infrastructure_layer: 'Power',
      extraction_quality_score: 0.88,
      infrastructure_relevance_score: 0.81,
    }],
    routeArticle: async (article) => ({
      id: article.id,
      title: article.title,
      tier: 'editorial_brief',
      coreFeedEligible: true,
      detailPage: false,
      brief: article.summary,
      reasons: [],
      relevance: { score: 0.81, visibility: 'adjacent', laneKey: 'power-grid' },
    }),
    now: '2026-05-31T08:00:00.000Z',
  });

  const item = result.artifacts.latestNews.find((article) => article.id === 'utility-campus-grid-queue');
  assert.ok(item);
  assert.equal(item.homepagePublished, true);
  assert.equal(item.articlePagePublished, false);
  assert.equal(result.artifacts.sitemapEntries.some((entry) => entry.loc === '/news/utility-campus-grid-queue/'), false);
  assert.equal(result.artifacts.rssItems.find((rssItem) => rssItem.title === item.title)?.link, sourceUrl);
});

test('publish cycle detailPage false edge keeps thin briefs source-linked', async () => {
  const sourceUrl = 'https://example.com/thin-grid-brief';
  const result = await runPublishCycle({
    articles: [{
      id: 'thin-grid-brief',
      title: 'Interconnect queue still controls campus timing',
      source: 'Example Grid Dispatch',
      sourceUrl,
      publishedAt: '2026-05-30T10:00:00.000Z',
      summary: 'A short grid update keeps operators watching interconnect milestones.',
      articleText: [
        'A short grid update identified interconnect milestones as the active timing constraint for a planned compute campus.',
        'The source said the developer still has customer reservations, but energization depends on utility studies, transformer delivery, and a signed service agreement.',
        'County filings list substation construction, road access, and backup generation permits as the open decision points.',
        'Operators are watching whether the utility can align feeder work with the first building handoff.',
        'Power equipment suppliers and interconnection engineering remain the limiting factors for the initial halls.',
      ].join(' '),
      primary_category: 'Power & Grid',
      infrastructure_layer: 'Power',
      extraction_quality_score: 0.82,
      infrastructure_relevance_score: 0.74,
    }],
    routeArticle: async (article) => ({
      id: article.id,
      title: article.title,
      tier: 'editorial_brief',
      coreFeedEligible: true,
      detailPage: false,
      brief: article.summary,
      reasons: ['thin evidence'],
      relevance: { score: 0.74, visibility: 'adjacent', laneKey: 'power-grid' },
    }),
    now: '2026-05-31T08:00:00.000Z',
  });

  const item = result.artifacts.latestNews.find((article) => article.id === 'thin-grid-brief');
  assert.ok(item);
  assert.equal(item.homepagePublished, true);
  assert.equal(item.articlePagePublished, false);
  assert.equal(result.artifacts.sitemapEntries.some((entry) => entry.loc === '/news/thin-grid-brief/'), false);
  assert.equal(result.artifacts.rssItems.find((rssItem) => rssItem.title === item.title)?.link, sourceUrl);
});

test('package exposes npm run content:cycle', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts['content:cycle'], /run-content-cycle\.mjs/);
});
