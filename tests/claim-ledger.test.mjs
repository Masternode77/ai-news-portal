import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClaimLedger } from '../scripts/lib/claim-ledger.mjs';
import { unsupportedClaimGuard } from '../scripts/lib/unsupported-claim-guard.mjs';

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

test('numeric rows receive the fixed claim budget before nonnumeric rows while output keeps source order', () => {
  const earlyFacts = Array.from({ length: 7 }, (_, index) => `Operational fact ${index + 1} describes the utility review and procurement sequence without publishing a measured quantity.`);
  const numericSentence = `The filing reports ${Array.from({ length: 20 }, (_, index) => `${index + 1} MW`).join(', ')} across measured phases.`;
  const result = buildClaimLedger({
    cluster_id: 'sig_numeric_budget',
    representative_source: {
      title: 'Utility filing publishes measured phases',
      cleaned_text: [...earlyFacts, numericSentence].join(' '),
      source_url: 'https://example.com/numeric-budget',
      source_name: 'Example Source',
      source_published_at: '2026-10-01T00:00:00Z',
    },
  }, 'article_numeric_budget');
  const body = result.claims.filter((claim) => claim.claim_text !== 'Utility filing publishes measured phases.');

  assert.equal(body.length, 18);
  assert.deepEqual(body.map((claim) => claim.numeric_value), Array.from({ length: 18 }, (_, index) => index + 1));
  assert.ok(body.every((claim) => claim.claim_text === numericSentence));
});

test('percent figures in source text become numeric ledger claims', () => {
  const result = buildClaimLedger({
    cluster_id: 'sig_percent',
    representative_source: {
      title: 'Utility raises its data center load forecast',
      cleaned_text: [
        'The utility now forecasts load growth of 1.9% in 2026 across its service territory.',
        'Contracted data center demand recorded a 50% increase over the prior filing period.',
        'Transformer utilization reached 79%, above the planning reserve the utility targets.',
        'Large-load customers account for about 10% of the queued interconnection capacity.',
        'Commercial electricity sales rose 12 percent last year in the same service territory.',
      ].join(' '),
      source_url: 'https://example.com/percent',
      source_name: 'Example Source',
      source_published_at: '2026-10-01T00:00:00Z',
    },
  }, 'article_percent');
  const percentKeys = result.claims
    .filter((claim) => /^(?:%|percent)$/.test(claim.unit))
    .map((claim) => `${claim.comparator ? `${claim.comparator} ` : ''}${claim.numeric_value}${claim.unit === '%' ? '%' : ' percent'}`);

  assert.deepEqual(percentKeys.sort(), ['1.9%', '12 percent', '50%', '79%', 'about 10%']);
  assert.equal(result.summary.unsupported_claim_count, 0);
});

test('figures that a second source corroborates stay available to the numeric gate', () => {
  const result = buildClaimLedger({
    cluster_id: 'sig_corroborated',
    representative_source: {
      title: 'Oil price swings widen',
      cleaned_text: [
        'Brent crude oil traded between $118 and $72 a barrel in the second quarter of 2026.',
        'Daily price changes averaged $4 a barrel, compared with $1 a barrel in 2025.',
      ].join(' '),
      source_url: 'https://example.com/prices',
      source_name: 'Price Source',
    },
    supporting_sources: [{
      title: 'Crude imports fall',
      cleaned_text: 'China imported 8.1 million barrels a day of crude oil in the second quarter of 2026, the least since 2014.',
      source_url: 'https://example.com/imports',
      source_name: 'Import Source',
    }],
  }, 'article_corroborated');
  const statusOf = (value, url) => result.claims
    .filter((claim) => claim.numeric_value === value && claim.source_url === url)
    .map((claim) => claim.verification_status);

  assert.deepEqual([...new Set(statusOf(2026, 'https://example.com/prices'))], ['verified_primary']);
  assert.deepEqual([...new Set(statusOf(4, 'https://example.com/prices'))], ['verified_primary']);
  assert.deepEqual([...new Set(statusOf(2026, 'https://example.com/imports'))], ['verified_primary']);

  const guard = (body) => unsupportedClaimGuard(body, result.claims);
  assert.equal(guard('In the second quarter of 2026 daily swings averaged $4 a barrel against $1 in 2025.').ok, true);
  // Corroboration does not let a figure the sources never state through.
  const derived = guard('The quarter spanned a $46 range in 2026.');
  assert.equal(derived.ok, false);
  assert.deepEqual(derived.unsupportedNumbers.map((claim) => claim.raw), ['$46']);
});

test('a secondary source is credited only for a claim whose named entity it mentions', () => {
  const representative_source = {
    title: 'Grid operator update',
    cleaned_text: 'ERCOT reported 12 GW of new large-load requests during the review period. In addition, 900 megawatts were still awaiting study during the same review period.',
    source_url: 'https://example.com/grid',
    source_name: 'Grid Source',
  };
  const credited = (supporting) => buildClaimLedger({ cluster_id: 'sig_secondary', representative_source, supporting_sources: [supporting] }, 'article_secondary')
    .claims.filter((claim) => claim.source_url === representative_source.source_url && claim.numeric_value !== null);

  const mentions = credited({ cleaned_text: 'ERCOT confirmed the totals in a later filing to regulators.', source_url: 'https://example.com/filing', source_name: 'Filing Source' });
  const gw = mentions.find((claim) => claim.numeric_value === 12);
  assert.equal(gw.verification_status, 'verified_primary');
  assert.equal(gw.secondary_source_url, 'https://example.com/filing');
  const unnamed = mentions.find((claim) => claim.numeric_value === 900);
  assert.deepEqual(unnamed.entities, []);
  assert.equal(unnamed.secondary_source_url, '');
  assert.equal(unnamed.verification_status, 'verified_primary');
});
