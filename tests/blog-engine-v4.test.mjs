import test from 'node:test';
import assert from 'node:assert/strict';
import { generateBlogArticle } from '../scripts/lib/blog-engine-v4.mjs';
import { routeGradedPublishing } from '../scripts/lib/graded-publishing-router.mjs';
import { forbiddenPublicPhraseMatches } from '../scripts/lib/copy-quality-guard.mjs';
import { publicTemplatePhraseMatches } from '../scripts/lib/public-template-phrase-guard.mjs';
import { articleNoindexReasons } from '../src/lib/seo-safeguards.js';

const STALE_TEMPLATE_PHRASES = [
  'Commercially,',
  'Operationally,',
  'readers should test whether',
  'reported item can translate into',
];

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
  assert.equal(result.article.public_content_tier, 'longform_analysis');
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
  assert.equal(result.article.public_content_tier, 'longform_analysis');
  assert.ok(result.article.blog_metadata.visible_body_characters >= 4500);
  assert.ok(result.article.blog_metadata.visible_body_characters <= 7000);
  assert.ok(result.article.blog_metadata.evidence_fact_count >= 5);
  assert.ok(result.article.blog_metadata.section_count >= 4);
  assert.match(body, /counterargument|limitation|weaker version/i);
  assert.match(body, /operators|investors|buyers|decision implication/i);
  assert.deepEqual(forbiddenPublicPhraseMatches(body), []);
});

test('blog engine v4 filters stale template actors before public article output', () => {
  const staleTemplateText = [
    'Commercially, the item changes how buyers, operators, or investors should read capacity, cost, or execution risk around semiconductor supply.',
    'Operationally, readers should test whether the reported item can translate into deployable capacity.',
  ].join(' ');
  const item = {
    id: 'stale-template-actor-repro',
    title: 'ByteDance Targets 25% Rise in AI Infrastructure Spending: SCMP',
    source: 'Bloomberg Technology',
    sourceUrl: 'https://example.com/bytedance-ai-infrastructure',
    publishedAt: new Date().toISOString(),
    articleText: [
      'ByteDance has boosted planned spending on artificial intelligence infrastructure this year by 25% to 200 billion yuan as memory chip costs rise and the company expands AI services.',
      'The spending plan is tied to AI infrastructure procurement, semiconductor supply, memory costs, accelerator capacity, and data center equipment allocation.',
      staleTemplateText,
      'Procurement teams said high-bandwidth memory availability and server delivery schedules remain the main timing constraint for training clusters.',
      'The reported increase changes buyer allocation, supplier leverage, capital planning, operating cost exposure, and deployment sequencing for AI infrastructure teams.',
      'Investors should watch whether equipment lead times, contracted capacity, and memory pricing move enough to change the forecast service window.',
    ].join(' '),
    summary: staleTemplateText,
    infrastructure_relevance_score: 0.92,
    primary_category: 'Semiconductors',
    infrastructure_layer: 'semiconductor supply',
  };

  const result = generateBlogArticle(item, { route: routeGradedPublishing(item) });
  const publicText = [
    result.article.summary,
    result.article.snippet,
    result.article.deck,
    result.article.why_it_matters,
    result.article.public_presentation?.deck,
    result.article.public_presentation?.why_it_matters,
    result.article.expertLensShort,
    result.article.expertLensFull?.metaDescription,
    result.article.expertLensFull?.finalArticleBody,
  ].filter(Boolean).join('\n\n');

  assert.equal(result.ok, true);
  assert.equal(result.article.public_content_tier, 'longform_analysis');
  assert.ok(result.article.claim_ledger.length >= 4);
  assert.ok(result.article.evidence_pack.verified_facts.length >= 4);
  assert.deepEqual(result.evidencePack.namedActors.filter((actor) => /commercially|operationally/i.test(actor)), []);
  for (const phrase of STALE_TEMPLATE_PHRASES) {
    assert.equal(JSON.stringify(result.article).includes(phrase), false, `generated article leaked ${phrase}`);
  }
  assert.deepEqual(publicTemplatePhraseMatches(publicText), []);
  assert.deepEqual(articleNoindexReasons(result.article).filter((reason) => reason.startsWith('public_template_phrase:')), []);
});
