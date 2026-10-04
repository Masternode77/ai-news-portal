import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClaimLedger } from '../scripts/lib/claim-ledger.mjs';

test('claim ledger records numeric claims for published analysis candidates', () => {
  const result = buildClaimLedger({
    cluster_id: 'sig_test',
    representative_source: {
      title: 'Battery portfolio reaches 300 MW',
      cleaned_text: 'Green Capital and Prime Capital are developing a 300 MW battery storage portfolio for data center power flexibility.',
      source_url: 'https://example.com/story',
      source_name: 'Example Source',
      source_published_at: '2026-05-20T00:00:00Z',
    },
  }, 'article_test');
  assert.ok(result.claims.some((claim) => claim.numeric_value === 300));
  assert.equal(result.summary.unsupported_claim_count, 0);
});

test('an unpunctuated headline stays out of the first body claim and keeps every body slot', () => {
  const body = Array.from({ length: 8 }, (_, index) => `Sentence ${index + 1} reports that the operator added ${index + 10} MW of contracted data center capacity this quarter.`).join(' ');
  const result = buildClaimLedger({
    cluster_id: 'sig_headline',
    representative_source: {
      title: 'Trade data consistent with $3B of chips routed through Malaysia',
      cleaned_text: `Between April 2024 and June 2025, China recorded $3.8 billion of server imports from Malaysia. ${body}`,
      source_url: 'https://example.com/headline',
      source_name: 'Example Source',
      source_published_at: '2026-10-01T00:00:00Z',
    },
  }, 'article_headline');
  const texts = result.claims.map((claim) => claim.claim_text);
  assert.ok(texts.some((text) => text.startsWith('Between April 2024 and June 2025, China recorded $3.8 billion')), 'the first body sentence is its own claim');
  assert.ok(!texts.some((text) => /Malaysia Between April/.test(text)), 'the headline is not glued to the body');
  assert.ok(result.claims.some((claim) => claim.numeric_value === 16), 'the eighth body sentence still yields its claim alongside the headline');
});

test('a short headline keeps its number as a claim', () => {
  const result = buildClaimLedger({
    cluster_id: 'sig_short_headline',
    representative_source: {
      title: 'Firm plans 300 MW data center',
      cleaned_text: 'The developer filed its zoning application with the county planning office on Monday morning.',
      source_url: 'https://example.com/short',
      source_name: 'Example Source',
      source_published_at: '2026-10-01T00:00:00Z',
    },
  }, 'article_short');
  assert.ok(result.claims.some((claim) => claim.numeric_value === 300 && claim.claim_text === 'Firm plans 300 MW data center.'));
});

test('headline claims do not crowd a third source out of the claim budget', () => {
  const sourceWith = (name, base) => ({
    title: `${name} adds ${base} MW of contracted data center capacity`,
    cleaned_text: Array.from({ length: 8 }, (_, index) => `${name} sentence ${index + 1} reports ${base + index + 1} MW of contracted data center capacity this quarter.`).join(' '),
    source_url: `https://example.com/${name.toLowerCase()}`,
    source_name: name,
    source_published_at: '2026-10-01T00:00:00Z',
  });
  const result = buildClaimLedger({
    cluster_id: 'sig_budget',
    representative_source: sourceWith('Alpha', 100),
    supporting_sources: [sourceWith('Beta', 200), sourceWith('Gamma', 300)],
  }, 'article_budget');
  const fromGamma = result.claims.filter((claim) => claim.source_name === 'Gamma');
  assert.ok(fromGamma.some((claim) => claim.numeric_value === 301), 'the third source still contributes its body claims');
  assert.ok(result.claims.some((claim) => claim.numeric_value === 100), 'headline claims are kept on top of the body budget');
});

test('a headline repeated by a body sentence beyond the claim budget is still kept', () => {
  const headline = 'Gamma adds 700 MW of contracted data center capacity in Ohio';
  const body = [
    ...Array.from({ length: 7 }, (_, index) => `Sentence ${index + 1} reports ${index + 11} MW, ${index + 21} MW and ${index + 31} MW of contracted capacity this quarter.`),
    `${headline}.`,
  ].join(' ');
  const result = buildClaimLedger({
    cluster_id: 'sig_repeat',
    representative_source: {
      title: headline,
      cleaned_text: body,
      source_url: 'https://example.com/repeat',
      source_name: 'Example Source',
      source_published_at: '2026-10-01T00:00:00Z',
    },
  }, 'article_repeat');
  assert.ok(result.claims.filter((claim) => claim.claim_text !== `${headline}.`).length <= 18, 'body claims stay within the budget');
  assert.ok(result.claims.some((claim) => claim.numeric_value === 700), 'the headline claim survives');
});

test('a boilerplate headline yields no claim', () => {
  const result = buildClaimLedger({
    cluster_id: 'sig_boilerplate',
    representative_source: {
      title: 'Want more data center reporting for 30 days',
      cleaned_text: 'The operator filed its interconnection request with the regional utility on Monday afternoon.',
      source_url: 'https://example.com/boilerplate',
      source_name: 'Example Source',
      source_published_at: '2026-10-01T00:00:00Z',
    },
  }, 'article_boilerplate');
  assert.ok(!result.claims.some((claim) => claim.numeric_value === 30));
});

test('a terse numeric headline keeps its claim', () => {
  const result = buildClaimLedger({
    cluster_id: 'sig_terse',
    representative_source: {
      title: '5 GW deal',
      cleaned_text: 'The parties signed the agreement at a ceremony in the state capital on Tuesday afternoon.',
      source_url: 'https://example.com/terse',
      source_name: 'Example Source',
      source_published_at: '2026-10-01T00:00:00Z',
    },
  }, 'article_terse');
  assert.ok(result.claims.some((claim) => claim.numeric_value === 5 && /GW/.test(claim.unit)));
});
