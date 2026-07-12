import assert from 'node:assert/strict';
import test from 'node:test';
import { runContentCycleForArticle } from './helpers/content-cycle-fixture.mjs';

test('content cycle downgrades a longform candidate when generated claims fail fidelity', async () => {
  const result = await runContentCycleForArticle({
    id: 'clean-infra',
    title: 'Data center campus waits on 300 MW grid upgrade',
    source: 'Grid Capacity Journal',
    sourceUrl: 'https://example.com/clean-infra',
    infrastructure_relevance_score: 0.9,
    extraction_quality_score: 0.94,
    articleText: [
      'Utility planners said a 300 MW data center campus is waiting on substation delivery and a signed interconnection agreement.',
      'The developer identified phased capacity, expected service dates, and a local permitting schedule.',
      'Power equipment suppliers are named as the limiting factor for the first two halls.',
      'The source links the capacity plan to AI training demand and cloud customer reservations.',
      'County filings describe water, grid, and road upgrades that must land before the campus opens.',
    ].join(' ').repeat(4),
  });

  assert.equal(result.extraction_passed, true);
  assert.equal(result.rawTier, 'longform_analysis');
  assert.equal(result.tier, 'editorial_brief');
  assert.equal(result.coreFeedEligible, true);
  assert.equal(result.detailPage, false);
  assert.equal(result.longformGenerated, true);
  assert.equal(result.source_fidelity.ok, true);
  assert.equal(result.claim_fidelity.ok, false);
  assert.equal(result.seo_fidelity.ok, false);
  assert.ok(result.reasons.includes('longform_editorial_fidelity_failed'));
  assert.match(result.public_status, /draft|published/);
});

test('content cycle keeps low relevance consumer AI out of the core feed', async () => {
  const result = await runContentCycleForArticle({
    id: 'consumer-ai',
    title: 'Wearable AI gadget gets a photo app and gaming features',
    source: 'Consumer Gadgets',
    sourceUrl: 'https://example.com/consumer-ai',
    infrastructure_relevance_score: 0.21,
    extraction_quality_score: 0.91,
    articleText: 'The consumer wearable update adds a social photo app, gaming features, and chatbot controls for shoppers. It does not describe cloud capacity, data center power, semiconductor supply, enterprise deployment, or infrastructure purchasing decisions.'.repeat(5),
  });

  assert.ok(['source_only', 'hidden'].includes(result.tier));
  assert.equal(result.coreFeedEligible, false);
  assert.match(result.reasons.join(' '), /relevance|product|boundary|archive/i);
});

test('content cycle turns thin but clean infrastructure evidence into a brief instead of padded longform', async () => {
  const result = await runContentCycleForArticle({
    id: 'thin-infra',
    title: 'Cooling supplier expands CDU capacity for AI racks',
    source: 'Thermal News',
    sourceUrl: 'https://example.com/thin-infra',
    infrastructure_relevance_score: 0.71,
    extraction_quality_score: 0.9,
    articleText: [
      'The supplier said production capacity for coolant distribution units is expanding to support AI racks.',
      'Operators will still need deployment dates, rack density targets, and customer commitments before treating the signal as delivered capacity.',
      'The source identifies cooling equipment availability as the constraint for near-term AI infrastructure buildouts.',
    ].join(' ').repeat(2),
  });

  assert.equal(result.extraction_passed, false);
  assert.equal(result.public_extraction_passed, true);
  assert.equal(result.tier, 'editorial_brief');
  assert.equal(result.longformGenerated, false);
  assert.ok(result.briefWordCount >= 150);
  assert.ok(result.briefWordCount <= 300);
});
