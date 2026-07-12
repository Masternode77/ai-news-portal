import assert from 'node:assert/strict';
import test from 'node:test';
import { getRssString } from '@astrojs/rss';
import { buildRssItems, rssMetadata } from '../scripts/lib/rss-builder.mjs';
import { findInternalLanguageHits } from '../scripts/lib/internal-language-guard.mjs';
import { generateLongformAnalysis } from '../scripts/lib/longform-engine.mjs';
import { repairPublicLongformRecord } from '../scripts/repair-public-longform-inventory.mjs';

function validLongform(overrides = {}) {
  const articleText = 'A utility filing ties a contracted AI campus to substation delivery, transformer procurement, cooling completion, customer fit-out, financing, and a dated energization milestone. '.repeat(12);
  const article = generateLongformAnalysis({
    id: 'a',
    title: 'Grid delivery sets the schedule for a contracted AI campus',
    source: 'Infrastructure Filing',
    sourceUrl: 'https://example.com/contracted-campus',
    publishedAt: '2026-05-20T00:00:00Z',
    category: 'Power & Grid',
    primary_category: 'Power & Grid',
    infrastructure_layer: 'power',
    extraction_quality_score: 0.95,
    infrastructure_relevance_score: 0.9,
    articleText,
    rawText: articleText,
    summary: 'A contracted campus still depends on utility and construction milestones.',
    ...overrides,
  });
  return {
    ...article,
    source_fidelity: { ok: true },
    claim_fidelity: { ok: true, unsupportedClaims: [] },
    seo_fidelity: { ok: true },
  };
}

test('rss builder excludes archived internal items', () => {
  const items = buildRssItems([
    validLongform(),
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

test('rss builder includes a repaired core source signal without stale longform copy', () => {
  const sourceText = 'A source filing connects a 300 MW data center campus to utility delivery, substation work, cooling systems, financing milestones, and customer-ready capacity. '.repeat(8);
  const repaired = repairPublicLongformRecord({
    ...validLongform({
      id: 'repaired-core-source',
      sourceUrl: 'https://example.com/repaired-core-source',
      articleText: sourceText,
      rawText: sourceText,
    }),
    expertLensFull: { finalArticleBody: 'Too short for local publication.' },
  });
  const items = buildRssItems([repaired]);
  assert.equal(repaired.public_status, 'signal');
  assert.equal(repaired.expertLensFull, undefined);
  assert.equal(items.length, 1);
  assert.equal(items[0].link, 'https://example.com/repaired-core-source');
  assert.doesNotMatch(`${items[0].title} ${items[0].description}`, /longform|quality gate|noindex/i);
});

test('rss builder omits a failed local longform when its fallback source URL is unsafe', () => {
  const article = validLongform({ sourceUrl: 'javascript:alert(1)' });
  article.expertLensFull.finalArticleBody = 'Too short for a public local article.';

  assert.deepEqual(buildRssItems([article]), []);
});

test('rss builder omits a source-only item without a safe external URL', () => {
  const publicSourceText = 'Verified AI infrastructure source text connects capacity planning, power access, grid constraints, and cloud demand to a public market signal. '.repeat(8);
  const article = {
    id: 'source-only-without-url',
    title: 'Source-only capacity signal without a URL',
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
    deck: 'Clean public deck.',
  };

  assert.deepEqual(buildRssItems([article]), []);
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
  const items = buildRssItems([validLongform()]);

  const xml = await getRssString({
    ...rssMetadata(),
    items,
  });

  assert.match(xml, /<media:content\b/);
  assert.match(xml, /xmlns:media="http:\/\/search\.yahoo\.com\/mrss\/"/);
});
