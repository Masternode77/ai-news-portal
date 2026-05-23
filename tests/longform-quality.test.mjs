import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateLongformAnalysis,
  longformQualityResult,
} from '../scripts/lib/longform-engine.mjs';

const evidenceText = [
  'A utility filing says a 300 MW data center campus cannot energize its first phase until a new substation is delivered.',
  'The developer said the first phase is tied to AI training workloads and reserved cloud capacity.',
  'County documents identify water, road, and power upgrades as dependencies before the campus can open.',
  'Equipment suppliers named transformer lead times as the limiting schedule factor.',
  'The power provider said the interconnection agreement will determine which customers receive firm service first.',
].join(' ');

test('longform engine produces publication-length analysis with varied sections', () => {
  const article = generateLongformAnalysis({
    id: 'grid-campus',
    title: 'Grid Delivery Is Now the Schedule for a 300 MW AI Campus',
    source: 'Utility Dive',
    sourceUrl: 'https://example.com/grid-campus',
    publishedAt: '2026-05-20T00:00:00Z',
    primary_category: 'Power & Grid',
    infrastructure_layer: 'power',
    infrastructure_relevance_score: 0.9,
    extraction_quality_score: 0.96,
    articleText: evidenceText.repeat(3),
    summary: 'A data center campus depends on power delivery, interconnection timing, and equipment lead times.',
  }, { index: 0 });

  const quality = longformQualityResult(article);
  assert.equal(quality.ok, true);
  assert.ok(quality.metrics.visibleBodyCharacters >= 4500);
  assert.ok(quality.metrics.paragraphCount >= 6);
  assert.ok(quality.metrics.sectionCount >= 4);
  assert.equal(/What Changed|Why Teams Care|Metric To Watch|At a Glance|Editorial Read/.test(article.expertLensFull.finalArticleBody), false);
});
