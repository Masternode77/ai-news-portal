import assert from 'node:assert/strict';
import {
  ARTICLE_PAGE_QUALITY_THRESHOLD,
  scoreExtractionQuality,
  splitByArticleQualityGate,
} from './lib/quality-gate.mjs';

const strongExtraction = [
  'A data center operator described a detailed shift in how new AI capacity is being connected to power markets.',
  'The report included operational context, customer timing, grid constraints, equipment dependencies, and market structure.',
  'That level of source extraction is enough to support a generated article page without relying only on the RSS snippet.',
  'Readers can understand what changed, why it matters, and which constraints will determine whether the capacity becomes useful.',
].join(' '.repeat(3)).repeat(8);

const weakExtraction = 'Short RSS snippet only.';

assert.ok(
  scoreExtractionQuality({
    articleText: strongExtraction,
    fallbackSnippet: 'Brief fallback snippet.',
    sourceUrl: 'https://example.com/report',
  }) >= ARTICLE_PAGE_QUALITY_THRESHOLD
);

assert.ok(
  scoreExtractionQuality({
    articleText: weakExtraction,
    fallbackSnippet: weakExtraction,
    sourceUrl: 'https://example.com/report',
  }) < ARTICLE_PAGE_QUALITY_THRESHOLD
);

const { publishable, blocked } = splitByArticleQualityGate([
  {
    id: 'good',
    title: 'Good extraction',
    articleText: strongExtraction,
    extraction_quality_score: 0.91,
  },
  {
    id: 'bad',
    title: 'Bad extraction',
    articleText: weakExtraction,
    extraction_quality_score: 0.2,
  },
]);

assert.equal(publishable.length, 1);
assert.equal(publishable[0].id, 'good');
assert.equal(blocked.length, 1);
assert.equal(blocked[0].id, 'bad');
assert.equal(blocked[0].qualityGateBlocked, true);
assert.equal(blocked[0].articlePagePublished, false);
assert.match(blocked[0].qualityGateReason, /below/);

console.log('quality gate test passed');
