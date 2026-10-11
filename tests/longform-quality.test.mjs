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

test('longform quality rejects clipped source fragments in visible body copy', () => {
  const body = [
    'A utility filing puts power delivery at the center of the AI campus schedule because substations, permits, and transformer lead times now set the practical calendar.',
    'The evidence matters for operators because energization, customer migration, financing, and site readiness have to line up before capacity becomes usable.',
    'Operating Read',
    'Operators can use the filing to test whether procurement dates and utility milestones are realistic enough to support customer commitments.',
    'Investor Read',
    'Investors should separate demand for AI capacity from the cash conversion path because debt pricing changes if the first energization date slips.',
    'Buyer Exposure',
    'Cloud buyers remain exposed if anchor workloads are committed before site readiness, power delivery, and supplier allocation are actually visible.',
    'Counterweight',
    'The counterargument is that a filing can identify a schedule risk without proving that economics or customer demand have changed.',
    'Decision Point',
    'The useful decision point is whether the next interconnection agreement turns the plan into firm service or leaves the campus in a conditional queue.',
    'The operator warned about fuelin.',
  ].join('\n\n');

  const result = longformQualityResult({ expertLensFull: { finalArticleBody: body } });

  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('known_clipped_sentence_fragment'));
});

test('longform quality rejects writer-only copy on every public surface of the record', () => {
  const article = generateLongformAnalysis({
    id: 'grid-campus-copy',
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
  }, { index: 1 });
  const clean = longformQualityResult(article);
  assert.equal(clean.ok, true, clean.reasons.join(','));
  assert.equal(clean.metrics.readerCopyIssueCount, 0);

  const leakedBody = longformQualityResult({
    ...article,
    expertLensFull: {
      ...article.expertLensFull,
      finalArticleBody: `${article.expertLensFull.finalArticleBody}\n\nThe supplied extract does not report production latency.`,
    },
  });
  assert.equal(leakedBody.ok, false);
  assert.ok(leakedBody.reasons.includes('reader_copy:input_provenance:expertLensFull.finalArticleBody'));
  assert.equal(leakedBody.metrics.readerCopyIssueCount, 1);

  const leakedMetadata = longformQualityResult({
    ...article,
    deck: 'I will not invent numbers for this deck.',
    corrections: [{ date: '2026-10-11', summary: 'Replaced a figure built from the extract I have.' }],
    figures: [{ title: 'Approved load', items: [{ label: 'the supplied extract', display: '1 GW' }] }],
  });
  assert.deepEqual(leakedMetadata.reasons.filter((reason) => reason.startsWith('reader_copy:')), [
    'reader_copy:process_assurance:deck',
    'reader_copy:writer_extract:corrections[0].summary',
    'reader_copy:input_provenance:figures[0].items[0].label',
  ]);

  // Source evidence is not reader copy: a publisher's own "excerpts" wording passes.
  const sourceOnly = longformQualityResult({ ...article, articleText: `The supplied extract says so. ${article.articleText}` });
  assert.equal(sourceOnly.ok, true, sourceOnly.reasons.join(','));
});
