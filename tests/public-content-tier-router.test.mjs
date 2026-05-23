import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PUBLIC_CONTENT_TIERS,
  routePublicContentTier,
} from '../scripts/lib/public-content-tier-router.mjs';

const cleanEvidence = [
  'Utility planners said a 300 MW data center campus is waiting on substation delivery and a signed interconnection agreement.',
  'The developer identified phased capacity, expected service dates, and a local permitting schedule.',
  'Power equipment suppliers are named as the limiting factor for the first two halls.',
  'The source links the capacity plan to AI training demand and cloud customer reservations.',
  'County filings describe water, grid, and road upgrades that must land before the campus opens.',
].join(' ');

test('routes high relevance clean evidence to longform analysis', () => {
  const result = routePublicContentTier({
    id: 'longform',
    title: 'Data center campus waits on 300 MW grid upgrade',
    source: 'Data Center Dynamics',
    infrastructure_relevance_score: 0.88,
    extraction_quality_score: 0.94,
    articleText: cleanEvidence.repeat(3),
    summary: 'Data center power capacity and interconnection timing are central to this item.',
  });

  assert.equal(result.tier, PUBLIC_CONTENT_TIERS.LONGFORM_ANALYSIS);
  assert.equal(result.homepageVisible, true);
  assert.equal(result.detailPage, true);
  assert.equal(result.noindex, false);
});

test('routes medium relevance clean evidence to editorial brief', () => {
  const result = routePublicContentTier({
    id: 'brief',
    title: 'Cooling supplier expands CDU capacity for AI racks',
    source: 'Thermal News',
    infrastructure_relevance_score: 0.64,
    extraction_quality_score: 0.9,
    articleText: cleanEvidence.repeat(2),
    summary: 'Cooling supply and AI rack density are the infrastructure angle.',
  });

  assert.equal(result.tier, PUBLIC_CONTENT_TIERS.EDITORIAL_BRIEF);
  assert.equal(result.homepageVisible, true);
  assert.equal(result.detailPage, false);
});

test('keeps high relevance but thin evidence as a signal card only', () => {
  const result = routePublicContentTier({
    id: 'signal',
    title: 'Cloud region capacity is delayed by power delivery',
    source: 'Cloud Wire',
    infrastructure_relevance_score: 0.83,
    extraction_quality_score: 0.88,
    articleText: 'A cloud region capacity update mentioned power delivery delays for AI infrastructure customers.',
    summary: 'Cloud capacity is affected by local power delivery.',
    sourceUrl: 'https://example.com/cloud-region-power-delay',
  });

  assert.equal(result.tier, PUBLIC_CONTENT_TIERS.SIGNAL_CARD);
  assert.equal(result.homepageVisible, true);
  assert.equal(result.detailPage, false);
});

test('hides dirty extraction and low relevance consumer items', () => {
  const dirty = routePublicContentTier({
    id: 'dirty',
    title: 'GPU capacity report',
    source: 'Example',
    infrastructure_relevance_score: 0.9,
    extraction_quality_score: 0.2,
    articleText: 'Subscribe now. Privacy policy. Terms of use. Advertisement.',
  });
  const consumer = routePublicContentTier({
    id: 'consumer',
    title: 'Amazon deal on a gaming laptop',
    source: 'Deals Blog',
    infrastructure_relevance_score: 0.2,
    extraction_quality_score: 0.95,
    articleText: cleanEvidence,
  });

  assert.equal(dirty.tier, PUBLIC_CONTENT_TIERS.HIDDEN);
  assert.equal(dirty.homepageVisible, false);
  assert.equal(consumer.tier, PUBLIC_CONTENT_TIERS.HIDDEN);
  assert.equal(consumer.homepageVisible, false);
});
