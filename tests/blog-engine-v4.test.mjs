import test from 'node:test';
import assert from 'node:assert/strict';
import { generateBlogArticle } from '../scripts/lib/blog-engine-v4.mjs';
import { routeGradedPublishing } from '../scripts/lib/graded-publishing-router.mjs';
import { forbiddenPublicPhraseMatches } from '../scripts/lib/copy-quality-guard.mjs';

const factRichSourceText = [
  'A utility filing says a 620 MW AI data center campus cannot energize its first phase until two new substations are delivered.',
  'The developer said the first 180 MW phase is tied to reserved cloud capacity for AI training workloads.',
  'County documents identify water permits, road upgrades, and power delivery as dependencies before construction can move to commissioning.',
  'Transformer suppliers told the project team that high-voltage equipment lead times remain the limiting schedule factor.',
  'The power provider said the interconnection agreement will determine which customers receive firm service first.',
  'The financing memo says debt pricing changes if the first energization milestone slips beyond the target service window.',
  'The source notes that anchor customers can delay workload migration if site readiness or utility milestones move.',
].join(' ');

test('blog engine v4 creates a long local blog article from clean evidence', () => {
  const item = {
    id: 'china-power-test',
    title: 'China data centers tap spot power trading',
    source: 'Bloomberg Technology',
    sourceUrl: 'https://example.com/china-power',
    publishedAt: new Date().toISOString(),
    articleText: `${'China data centers, spot power trading, grid exposure, electricity procurement, and operating cost are cleanly described. '.repeat(25)}Final sentence complete.`,
    summary: 'China data centers are using spot power trading to manage electricity cost and grid exposure.',
    infrastructure_relevance_score: 0.78,
  };
  const result = generateBlogArticle(item, { route: routeGradedPublishing(item) });
  assert.equal(result.ok, true);
  assert.equal(result.article.articlePagePublished, true);
  assert.equal(result.article.public_generation_version, 'blog_engine_v4');
  assert.ok(result.article.expertLensFull.finalArticleBody.length >= 2200);
  assert.ok(result.article.public_presentation.view_detail.startsWith('/news/'));
});

test('core blog generation enforces fact-rich bounded longform with decision support', () => {
  const item = {
    id: 'grid-campus-decision',
    title: 'Utility schedule now controls a 620 MW AI campus',
    source: 'Utility Dive',
    sourceUrl: 'https://example.com/grid-campus-decision',
    publishedAt: new Date().toISOString(),
    articleText: factRichSourceText,
    summary: 'A 620 MW AI campus depends on substations, interconnection timing, water permits, transformer lead times, financing terms, and anchor cloud customers.',
    infrastructure_relevance_score: 0.94,
    primary_category: 'Power & Grid',
    infrastructure_layer: 'power',
  };

  const route = routeGradedPublishing(item);
  const result = generateBlogArticle(item, { route });
  const body = result.article.expertLensFull.finalArticleBody;

  assert.equal(route.route, 'core_longform_blog');
  assert.equal(result.ok, true);
  assert.ok(result.article.blog_metadata.visible_body_characters >= 4500);
  assert.ok(result.article.blog_metadata.visible_body_characters <= 7000);
  assert.ok(result.article.blog_metadata.evidence_fact_count >= 5);
  assert.ok(result.article.blog_metadata.section_count >= 4);
  assert.match(body, /counterargument|limitation|weaker version/i);
  assert.match(body, /operators|investors|buyers|decision implication/i);
  assert.deepEqual(forbiddenPublicPhraseMatches(body), []);
});
