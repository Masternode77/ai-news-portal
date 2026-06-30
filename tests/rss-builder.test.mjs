import assert from 'node:assert/strict';
import test from 'node:test';
import { getRssString } from '@astrojs/rss';
import { buildRssItems, rssMetadata } from '../scripts/lib/rss-builder.mjs';
import { findInternalLanguageHits } from '../scripts/lib/internal-language-guard.mjs';

test('rss builder excludes archived internal items', () => {
  const articleText = 'Published data center infrastructure analysis connects verified source evidence to power, storage, and capacity milestones. '.repeat(16);
  const items = buildRssItems([
    {
      id: 'a',
      title: 'Published analysis',
      publishedAt: '2026-05-20T00:00:00Z',
      articlePagePublished: true,
      homepagePublished: true,
      archiveOnly: false,
      noindex: false,
      seo_noindex: false,
      public_status: 'published',
      publishing_route: 'Featured Analysis',
      public_routing: { visibility: 'core' },
      extraction_quality_score: 0.95,
      infrastructure_relevance_score: 0.9,
      category: 'Power & Grid',
      articleText,
      expertLensFull: { finalArticleBody: articleText },
      deck: 'Clean public deck.',
    },
    { id: 'b', title: 'Archived', publishedAt: '2026-05-20T00:00:00Z', articlePagePublished: false, archiveOnly: true, public_status: 'archive_only_noindex', deck: 'Hidden.' },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].link, '/news/a/');
  assert.equal(items[0].image, '/generated/fallbacks/power-grid.svg');
  assert.match(items[0].customData, /media:content/);
  assert.doesNotMatch(items[0].customData, /\/admin\//);
});

test('rss builder preserves external source links for source-only public briefs', () => {
  const publicSourceText = 'Verified AI infrastructure source text connects capacity planning, power access, grid constraints, and cloud demand to a public market signal. '.repeat(8);
  const items = buildRssItems([
    {
      id: 'source-only',
      title: 'Source-only capacity signal',
      publishedAt: '2026-05-21T00:00:00Z',
      articlePagePublished: false,
      homepagePublished: true,
      archiveOnly: false,
      noindex: false,
      seo_noindex: false,
      public_status: 'published',
      public_routing: { visibility: 'adjacent' },
      extraction_quality_score: 0.9,
      infrastructure_relevance_score: 0.8,
      category: 'Cloud Capacity',
      articleText: publicSourceText,
      rawText: publicSourceText,
      sourceUrl: 'https://example.com/source-only-capacity-signal',
      deck: 'Clean public deck.',
    },
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0].link, 'https://example.com/source-only-capacity-signal');
});

test('rss builder omits extraction-clean weak self-driving items without source-backed infrastructure fit', () => {
  const publicSourceText = 'Wayve executives described how end-to-end learning changes autonomous driving research, vehicle testing, road behavior, safety review, and product timelines for automakers. '.repeat(8);
  const items = buildRssItems([
    {
      id: 'weak-self-driving-rss',
      title: 'AI Is Reshaping Self-Driving Cars, Wayve CEO Says',
      publishedAt: '2026-05-22T00:00:00Z',
      articlePagePublished: false,
      homepagePublished: true,
      archiveOnly: false,
      noindex: false,
      seo_noindex: false,
      public_status: 'published',
      public_routing: { visibility: 'adjacent' },
      extraction_quality_score: 0.92,
      infrastructure_relevance_score: 0.62,
      category: 'AI Infrastructure',
      infrastructure_layer: 'Compute',
      source: 'Bloomberg Technology',
      summary: 'Wayve executives described a self-driving research update for automakers.',
      articleText: publicSourceText,
      rawText: publicSourceText,
      sourceUrl: 'https://example.com/weak-self-driving-rss',
    },
  ]);

  assert.deepEqual(items, []);
});

test('rss builder descriptions do not expose compact-signal fallback copy', () => {
  const publicSourceText = 'Verified source text connects data center procurement timing, power equipment delivery, supplier timing, and operating risk to a public market signal. '.repeat(8);
  const items = buildRssItems([
    {
      id: 'procurement-fallback',
      title: 'Regional procurement update changes buyer timing',
      publishedAt: '2026-05-22T00:00:00Z',
      articlePagePublished: false,
      homepagePublished: true,
      archiveOnly: false,
      noindex: false,
      seo_noindex: false,
      public_status: 'published',
      public_routing: { visibility: 'adjacent' },
      extraction_quality_score: 0.9,
      infrastructure_relevance_score: 0.8,
      category: 'Operations',
      infrastructure_layer: 'procurement',
      articleText: publicSourceText,
      rawText: publicSourceText,
      sourceUrl: 'https://example.com/procurement-fallback',
    },
  ]);

  assert.equal(items.length, 1);
  assert.doesNotMatch(items[0].description, /gives infrastructure readers a compact signal/i);
  assert.doesNotMatch(items[0].description, /compact signal on AI capacity planning/i);
});

test('rss builder uses safe public-facing copy for eligible items with visible internal wording', () => {
  const publicSourceText = 'Verified AI infrastructure source text connects grid capacity planning, power access, utility procurement, and cloud demand to a public market signal. '.repeat(8);
  const items = buildRssItems([
    {
      id: 'blueprint-rss-title',
      title: 'Architecting the blueprint for AI grid capacity',
      publishedAt: '2026-05-23T00:00:00Z',
      articlePagePublished: false,
      homepagePublished: true,
      archiveOnly: false,
      noindex: false,
      seo_noindex: false,
      public_status: 'published',
      public_routing: { visibility: 'adjacent' },
      extraction_quality_score: 0.9,
      infrastructure_relevance_score: 0.8,
      category: 'Power & Grid',
      infrastructure_layer: 'grid capacity',
      source: 'Grid Source',
      articleText: publicSourceText,
      rawText: publicSourceText,
      sourceUrl: 'https://example.com/rss-title-fixture',
      deck: 'The source described a deployment blueprint for grid capacity planning with named operators and procurement timing.',
    },
    {
      id: 'clean-rss-title',
      title: 'Utility queue update changes AI campus timing',
      publishedAt: '2026-05-22T00:00:00Z',
      articlePagePublished: false,
      homepagePublished: true,
      archiveOnly: false,
      noindex: false,
      seo_noindex: false,
      public_status: 'published',
      public_routing: { visibility: 'adjacent' },
      extraction_quality_score: 0.9,
      infrastructure_relevance_score: 0.8,
      category: 'Power & Grid',
      infrastructure_layer: 'grid capacity',
      articleText: publicSourceText,
      rawText: publicSourceText,
      sourceUrl: 'https://example.com/clean-rss-title',
      deck: 'Utility queue filings connect AI campus timing to grid capacity, interconnection milestones, and procurement risk.',
    },
  ]);

  assert.equal(items.length, 2);
  const item = items.find((entry) => entry.link === 'https://example.com/rss-title-fixture');
  assert.ok(item);
  assert.doesNotMatch(item.title, /\bblueprint\b/i);
  assert.doesNotMatch(item.description, /\bblueprint\b/i);
  assert.deepEqual(findInternalLanguageHits([{ path: '/rss.xml', surface: 'rss', text: `${item.title} ${item.description}` }]), []);
});

test('rss builder omits eligible items when generated card copy cannot pass the public gate', () => {
  const publicSourceText = 'Verified AI infrastructure source text connects grid capacity planning, power access, utility procurement, and cloud demand to a public market signal. '.repeat(8);
  const items = buildRssItems([
    {
      id: 'unsafe-rss-generic-fallback',
      title: 'Extraction threshold routing decision',
      publishedAt: '2026-05-24T00:00:00Z',
      articlePagePublished: false,
      homepagePublished: true,
      archiveOnly: false,
      noindex: false,
      seo_noindex: false,
      public_status: 'published',
      public_routing: { visibility: 'adjacent' },
      extraction_quality_score: 0.9,
      infrastructure_relevance_score: 0.8,
      category: 'Qualification',
      infrastructure_layer: 'qualification',
      source: 'Relevance score',
      articleText: publicSourceText,
      rawText: publicSourceText,
      sourceUrl: 'https://example.com/unsafe-rss-generic-fallback',
    },
  ]);

  assert.deepEqual(items, []);
});

test('rss metadata binds media namespace when feed items include media content', async () => {
  const articleText = 'Published data center infrastructure analysis connects verified source evidence to power, storage, and capacity milestones. '.repeat(16);
  const items = buildRssItems([
    {
      id: 'a',
      title: 'Published analysis',
      publishedAt: '2026-05-20T00:00:00Z',
      articlePagePublished: true,
      homepagePublished: true,
      archiveOnly: false,
      noindex: false,
      seo_noindex: false,
      public_status: 'published',
      publishing_route: 'Featured Analysis',
      public_routing: { visibility: 'core' },
      extraction_quality_score: 0.95,
      infrastructure_relevance_score: 0.9,
      category: 'Power & Grid',
      articleText,
      expertLensFull: { finalArticleBody: articleText },
      deck: 'Clean public deck.',
    },
  ]);

  const xml = await getRssString({
    ...rssMetadata(),
    items,
  });

  assert.match(xml, /<media:content\b/);
  assert.match(xml, /xmlns:media="http:\/\/search\.yahoo\.com\/mrss\/"/);
});
