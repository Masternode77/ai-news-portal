import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { parseFeedItem } from '../scripts/lib/fetch-feeds.mjs';
import { safeHttpUrl, serializeJsonForScript } from '../scripts/lib/normalize.mjs';
import { buildArticleStructuredData, sourceAttributionFor } from '../src/lib/seo-safeguards.js';

const feed = {
  source: 'Source Desk',
  region: 'Global',
  language: 'en',
  defaultCategory: 'Data Centers',
};

const item = (link) => ({
  title: 'Grid timing reshapes AI campus delivery',
  link,
  isoDate: '2026-08-09T00:00:00.000Z',
  content: 'Utility interconnection timing is the immediate infrastructure constraint.',
});

test('public URL boundary rejects unsafe schemes and control characters at feed ingestion', () => {
  // Given: externally sourced links with executable schemes or control characters.
  const unsafeLinks = [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://example.com/source\nnext',
    'https://example.com/source\u0007bell',
  ];

  // When: the links are normalized and parsed as feed items.
  const results = unsafeLinks.map((link) => ({
    normalized: safeHttpUrl(link),
    parsed: parseFeedItem(feed, item(link)),
  }));

  // Then: no unsafe link can enter the public feed.
  for (const result of results) {
    assert.equal(result.normalized, '');
    assert.equal(result.parsed, null);
  }
});

test('public URL boundary preserves valid source attribution while rejecting an unsafe preferred source', () => {
  // Given: a valid source URL and an unsafe higher-priority source field.
  const article = {
    source: 'Example Source',
    expertLensFull: { sourceLink: 'javascript:alert(1)' },
    sourceUrl: 'https://example.com/source?keep=1',
  };

  // When: public attribution is derived.
  const attribution = sourceAttributionFor(article);

  // Then: valid HTTP(S) attribution survives and the unsafe source is absent.
  assert.deepEqual(attribution, {
    name: 'Example Source',
    url: 'https://example.com/source?keep=1',
    domain: 'example.com',
  });
  assert.equal(safeHttpUrl('https://example.com/source?keep=1'), 'https://example.com/source?keep=1');
  assert.equal(safeHttpUrl('http://example.com/source?keep=1'), 'http://example.com/source?keep=1');
});

test('JSON-LD serializer keeps representative data semantically intact without a script breakout', () => {
  // Given: article metadata containing script-sensitive characters from an external source.
  const structuredData = buildArticleStructuredData({
    article: {
      source: 'Example Source',
      sourceUrl: 'https://example.com/source',
      publishedAt: '2026-08-09T00:00:00.000Z',
      tags: ['power'],
    },
    site: {
      name: 'Compute Current',
      url: 'https://www.computecurrent.com',
      defaultOgImage: '/og.png',
    },
    title: '</script><img src=x onerror=alert(1)> & \u2028 \u2029',
    description: 'Source context < > & \u2028 \u2029',
    image: '/generated/article.webp',
    canonicalUrl: 'https://www.computecurrent.com/news/secure/',
    taxonomy: { primary: 'Data Centers', stakeholders: ['operators'] },
    articleBody: ['A source-grounded infrastructure analysis.'],
  });

  // When: the structured data is serialized for an inline script element.
  const serialized = serializeJsonForScript(structuredData);

  // Then: the script cannot close early and JSON consumers recover the same data.
  assert.doesNotMatch(serialized, /<|>|&|\u2028|\u2029/);
  assert.doesNotMatch(serialized, /<\/script/i);
  assert.deepEqual(JSON.parse(serialized), structuredData);
});

test('news and card templates use the public render security boundary', async () => {
  // Given: the two public templates that render externally sourced URLs and JSON-LD.
  const [newsPage, articleCard] = await Promise.all([
    fs.readFile(new URL('../src/pages/news/[id].astro', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/components/ArticleCard.astro', import.meta.url), 'utf8'),
  ]);

  // When: the templates are inspected at their render boundaries.
  const usesSafeJson = /serializeJsonForScript\(structuredData\)/.test(newsPage);
  const usesSafeSourceUrl = /safeHttpUrl\(signal\.read_source\)/.test(articleCard);

  // Then: JSON-LD and externally sourced card links share the safety boundary.
  assert.equal(usesSafeJson, true);
  assert.equal(usesSafeSourceUrl, true);
});
