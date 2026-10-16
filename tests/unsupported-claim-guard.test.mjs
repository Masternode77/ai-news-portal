import assert from 'node:assert/strict';
import test from 'node:test';
import { unsupportedClaimGuard } from '../scripts/lib/unsupported-claim-guard.mjs';

test('unsupported claim guard accepts repeated use of a verified number with equivalent units', () => {
  const article = Array.from({ length: 8 }, (_, index) => `Paragraph ${index + 1} says the 200 MW capacity claim changes planning.`).join(' ');
  const result = unsupportedClaimGuard(article, [{
    numeric_value: 200,
    unit: 'megawatts',
    verification_status: 'verified_primary',
    source_url: 'https://example.com/source',
    source_quote_or_summary: 'The filing specifies 200 MW of capacity.',
  }]);
  assert.equal(result.ok, true);
});

test('unsupported claim guard rejects malformed verified numeric ledger entries', () => {
  // Given: public copy contains a numeric claim and the ledger labels an unparsed value verified.
  const body = 'The campus requires 200 MW before commissioning can begin.';
  const ledger = [{ numeric_value: '200', unit: '', verification_status: 'verified_primary' }];

  // When: the final numeric-claim guard validates the body and ledger.
  const result = unsupportedClaimGuard(body, ledger);

  // Then: malformed provenance cannot authorize the numeric claim.
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('malformed_verified_numeric_claim_records:1'));
});

test('unsupported claim guard accepts a short nonnumeric claim without an arbitrary sentence minimum', () => {
  // Given: concise public copy with no numeric claims.
  const body = 'Utility interconnection timing remains the controlling campus milestone.';

  // When: the unsupported numeric-claim guard runs.
  const result = unsupportedClaimGuard(body, []);

  // Then: length policy is left to the detail-quality boundary.
  assert.equal(result.ok, true);
  assert.deepEqual(result.reasons, []);
});

test('legacy ledgers recover equivalent less-than qualifiers from their primary quote', () => {
  const legacyLedger = [{
    numeric_value: 1,
    unit: 'USD',
    verification_status: 'verified_primary',
    source_url: 'https://example.com/source',
    source_quote_or_summary: 'Usage was under $1 per day.',
  }];

  assert.equal(unsupportedClaimGuard('Usage was under $1 per day.', legacyLedger).ok, true);
  assert.equal(unsupportedClaimGuard('Usage was less than $1 per day.', legacyLedger).ok, true);
});

test('comparison direction and exactness cannot be changed by a verified numeric value', () => {
  const ledger = [{
    numeric_value: 1,
    unit: 'USD',
    verification_status: 'verified_primary',
    source_url: 'https://example.com/source',
    source_quote_or_summary: 'Usage was under $1 per day.',
  }];

  for (const article of ['Usage was over $1 per day.', 'Usage was $1 per day.']) {
    const result = unsupportedClaimGuard(article, ledger);
    assert.equal(result.ok, false, article);
    assert.equal(result.unsupportedNumbers.length, 1, article);
  }
});

test('approximate, exact, and scaled-currency relations remain distinct', () => {
  const approximateLedger = [{
    numeric_value: 2,
    unit: 'USD million',
    verification_status: 'verified_primary',
    source_url: 'https://example.com/source',
    source_quote_or_summary: 'Annualized use was around $2 million.',
  }];

  assert.equal(unsupportedClaimGuard('Annualized use was about $2 million.', approximateLedger).ok, true);
  assert.equal(unsupportedClaimGuard('Annualized use was $2 million.', approximateLedger).ok, false);
  assert.equal(unsupportedClaimGuard('Daily use was around $2.', approximateLedger).ok, false);
});

test('legacy nearly and almost evidence cannot authorize an exact value', () => {
  for (const comparator of ['nearly', 'almost']) {
    const ledger = [{
      numeric_value: 1,
      unit: 'USD',
      verification_status: 'verified_primary',
      source_url: 'https://example.com/source',
      source_quote_or_summary: `Usage was ${comparator} $1 per day.`,
    }];

    assert.equal(unsupportedClaimGuard('Usage was around $1 per day.', ledger).ok, true, comparator);
    assert.equal(unsupportedClaimGuard('Usage was $1 per day.', ledger).ok, false, comparator);
  }
});

test('negated comparisons retain their direction and reject the opposite relation', () => {
  const atMost = [{
    numeric_value: 1,
    unit: 'USD',
    verification_status: 'verified_primary',
    source_url: 'https://example.com/source',
    source_quote_or_summary: 'Usage was no more than $1 per day.',
  }];
  const atLeast = [{
    numeric_value: 1,
    unit: 'USD',
    verification_status: 'verified_primary',
    source_url: 'https://example.com/source',
    source_quote_or_summary: 'Usage was no less than $1 per day.',
  }];

  assert.equal(unsupportedClaimGuard('Usage was at most $1 per day.', atMost).ok, true);
  assert.equal(unsupportedClaimGuard('Usage was over $1 per day.', atMost).ok, false);
  assert.equal(unsupportedClaimGuard('Usage was at least $1 per day.', atLeast).ok, true);
  assert.equal(unsupportedClaimGuard('Usage was under $1 per day.', atLeast).ok, false);
});

test('unsupported negative modifiers fail closed instead of authorizing their inner comparator', () => {
  const ledger = [{
    numeric_value: 1,
    unit: 'USD',
    verification_status: 'verified_primary',
    source_url: 'https://example.com/source',
    source_quote_or_summary: 'Usage was not approximately $1 per day.',
  }];

  const result = unsupportedClaimGuard('Usage was $1 per day.', ledger);
  assert.equal(result.ok, false);
  assert.equal(result.malformedVerifiedNumeric.length, 1);
});

test('percent figures in article copy need a verified ledger entry', () => {
  const ledger = [{
    numeric_value: 1.9,
    unit: '%',
    verification_status: 'verified_primary',
    source_url: 'https://example.com/source',
    source_quote_or_summary: 'The utility forecasts load growth of 1.9% in 2026.',
  }, {
    numeric_value: 2026,
    unit: 'year',
    verification_status: 'verified_primary',
    source_url: 'https://example.com/source',
    source_quote_or_summary: 'The utility forecasts load growth of 1.9% in 2026.',
  }];

  const result = unsupportedClaimGuard(
    'The utility expects load growth of 1.9% in 2026, a 50% increase over plan, with utilization at 79%, above the reserve target.',
    ledger,
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.malformedVerifiedNumeric, []);
  assert.deepEqual(result.unsupportedNumbers.map((claim) => claim.raw), ['50%', '79%']);
  assert.match(result.reasons[0], /^unsupported_numeric_claims:50%,79%$/);
});

test('a percent sign and the word percent verify each other but not a changed qualifier', () => {
  const ledgerFor = (quote, value) => [{
    numeric_value: value,
    unit: '%',
    verification_status: 'verified_primary',
    source_url: 'https://example.com/source',
    source_quote_or_summary: quote,
  }];
  const exact = ledgerFor('Commercial demand rose 12 percent last year.', 12);
  const approximate = ledgerFor('Data centers used about 10% of the load.', 10);

  assert.equal(unsupportedClaimGuard('Commercial demand rose 12% last year.', exact).ok, true);
  assert.equal(unsupportedClaimGuard('Commercial demand rose about 12% last year.', exact).ok, false);
  assert.equal(unsupportedClaimGuard('Data centers used around 10% of the load.', approximate).ok, true);
  assert.equal(unsupportedClaimGuard('Data centers used 10% of the load.', approximate).ok, false);
});
