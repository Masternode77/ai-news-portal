import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { runContentCycleForFixture } from './helpers/content-cycle-fixture.mjs';
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
  assert.equal(downgraded.imageProvider, 'image2');
  assert.equal(downgraded.forceAiImage, true);
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
  const sourceText = [
    'The utility now expects interconnect studies to set the campus energization path.',
    'Project filings say the first phase depends on a signed service agreement, transformer delivery, and a final substation construction schedule.',
    'The developer told county officials that AI training demand is still reserved, but the campus cannot ramp racks until the utility completes feeder work.',
    'Local planners identified grid studies, road access, and backup generation permits as the decision points that could shift the opening date.',
    'Power equipment suppliers and interconnection engineering are named as the limiting factors for the first two halls.',
  ].join(' ');
  const result = await runPublishCycle({
    articles: [{
      id: 'utility-campus-grid-queue',
      title: 'Utility queue blocks campus energization',
      source: 'Example Grid Dispatch',
      sourceUrl,
      publishedAt: '2026-05-30T10:00:00.000Z',
      summary: 'A utility interconnect queue shifted the energization date for a compute campus.',
      contentText: sourceText,
      articleText: sourceText,
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
  const sourceText = [
    'A short grid update identified interconnect milestones as the active timing constraint for a planned compute campus.',
    'The source said the developer still has customer reservations, but energization depends on utility studies, transformer delivery, and a signed service agreement.',
    'County filings list substation construction, road access, and backup generation permits as the open decision points.',
    'Operators are watching whether the utility can align feeder work with the first building handoff.',
    'Power equipment suppliers and interconnection engineering remain the limiting factors for the initial halls.',
  ].join(' ');
  const result = await runPublishCycle({
    articles: [{
      id: 'thin-grid-brief',
      title: 'Interconnect queue still controls campus timing',
      source: 'Example Grid Dispatch',
      sourceUrl,
      publishedAt: '2026-05-30T10:00:00.000Z',
      summary: 'A short grid update keeps operators watching interconnect milestones.',
      contentText: sourceText,
      articleText: sourceText,
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

test('publish cycle prefers cleaned extraction over conflicting generated content fields', async () => {
  const trustedSource = 'The utility filing sets transformer delivery and substation construction milestones before the planned AI data center campus can energize in 2028.';
  const fabricated = 'Fabricated operator commentary claims unlimited cloud capacity is already available.';
  const result = await runPublishCycle({
    articles: [{
      id: 'source-precedence-grid-filing',
      title: 'Utility filing sets 2028 campus energization milestones',
      source: 'Example Grid Dispatch',
      sourceUrl: 'https://example.com/source-precedence-grid-filing',
      publishedAt: '2026-05-30T10:00:00.000Z',
      summary: fabricated,
      contentText: fabricated,
      articleText: fabricated,
      cleaned_source_text: trustedSource,
      primary_category: 'Power & Grid',
      infrastructure_layer: 'Power',
      extraction_quality_score: 0.9,
      infrastructure_relevance_score: 0.9,
    }],
    routeArticle: async (article) => ({
      id: article.id,
      title: article.title,
      tier: 'editorial_brief',
      coreFeedEligible: true,
      detailPage: false,
      brief: article.summary,
      reasons: [],
      relevance: { score: 0.9, visibility: 'core', laneKey: 'power-grid' },
    }),
    now: '2026-05-31T08:00:00.000Z',
  });

  const item = result.artifacts.latestNews[0];
  const rssItem = result.artifacts.rssItems.find((entry) => entry.title === item.title);
  assert.equal(item.contentText, trustedSource);
  assert.equal(item.cleaned_source_text, trustedSource);
  assert.match(rssItem.description, /transformer delivery and substation construction/);
  assert.doesNotMatch(rssItem.description, /unlimited cloud capacity/i);
});

test('publish cycle preserves extracted article text without laundering feed snippets', async () => {
  const trustedSource = 'The grid operator filing says a 240 MW data centre cannot energize until a new substation and transformer bank enter service.';
  const generatedSnippet = 'Generated snippet claims unlimited AI cloud capacity is immediately available.';
  const result = await runPublishCycle({
    articles: [{
      id: 'article-text-source-boundary',
      title: 'Grid filing sets the substation sequence for a 240 MW data centre',
      source: 'Example Grid Dispatch',
      sourceUrl: 'https://example.com/article-text-source-boundary',
      publishedAt: '2026-05-30T10:00:00.000Z',
      summary: generatedSnippet,
      snippet: generatedSnippet,
      contentText: generatedSnippet,
      articleText: trustedSource,
      primary_category: 'Power & Grid',
      infrastructure_layer: 'Power',
      extraction_quality_score: 0.9,
      infrastructure_relevance_score: 0.9,
    }],
    routeArticle: async (article) => ({
      id: article.id,
      title: article.title,
      tier: 'editorial_brief',
      coreFeedEligible: true,
      detailPage: false,
      brief: article.summary,
      reasons: [],
      relevance: { score: 0.9, visibility: 'core', laneKey: 'power-grid' },
    }),
    now: '2026-05-31T08:00:00.000Z',
  });

  const item = result.artifacts.latestNews[0];
  const rssItem = result.artifacts.rssItems.find((entry) => entry.title === item.title);
  assert.equal(item.contentText, trustedSource);
  assert.equal(item.cleaned_source_text, trustedSource);
  assert.match(rssItem.description, /240 MW data centre/);
  assert.doesNotMatch(rssItem.description, /unlimited AI cloud capacity/i);
});

test('package routes npm run content:cycle through the guarded command surface', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(
    pkg.scripts['content:cycle'],
    'node ./scripts/content-command-surface.mjs cycle --production',
  );
  assert.doesNotMatch(pkg.scripts['content:cycle'], /run-content-cycle\.mjs|--fixture|CANONICAL_FIXTURE_HELPER/);
});
