import assert from 'node:assert/strict';
import test from 'node:test';
import { extractNumericClaims } from '../scripts/lib/autonomous-desk-utils.mjs';
import { numericClaimKey } from '../scripts/lib/numeric-claim-policy.mjs';
import { verifyNumericClaim } from '../scripts/lib/numeric-claim-verifier.mjs';

test('numeric verifier marks sourced numeric claims as primary verified', () => {
  const verification = verifyNumericClaim({ numeric_value: 300, source_url: 'https://example.com' }, {
    representative_source: { cleaned_text: 'The project totals 300 MW.' },
  });
  assert.equal(verification.verification_status, 'verified_primary');
});

test('numeric extraction sees percent figures followed by a space, punctuation, or the end of text', () => {
  const cases = [
    ['load growth of 1.9% in 2026', [['1.9%', 1.9, '%', ''], ['2026', 2026, 'year', '']]],
    ['a 50% increase', [['50%', 50, '%', '']]],
    ['utilization reached 79%, above plan', [['79%', 79, '%', '']]],
    ['about 10% of new load', [['about 10%', 10, '%', 'about']]],
    ['rose 12 percent last year', [['12 percent', 12, 'percent', '']]],
    ['vacancy fell to 2.8%.', [['2.8%', 2.8, '%', '']]],
    ['the share was 30%', [['30%', 30, '%', '']]],
  ];
  for (const [text, expected] of cases) {
    assert.deepEqual(
      extractNumericClaims(text).map(({ raw, numeric_value, unit, comparator }) => [raw, numeric_value, unit, comparator]),
      expected,
      text,
    );
  }
  // Word forms that only begin with "percent" are not percentages.
  assert.deepEqual(extractNumericClaims('the 12 percentile and 2 percentage points'), []);
});

test('percent keys treat the sign and the word alike and keep qualifiers distinct', () => {
  const keyOf = (text) => extractNumericClaims(text).map(numericClaimKey);
  assert.deepEqual(keyOf('1.9% and 12 percent and 12%'), ['1.9|%|=', '12|%|=', '12|%|=']);
  assert.deepEqual(keyOf('about 10% versus 10%'), ['10|%|~', '10|%|=']);
});

test('EIA billion-kilowatthour figures share the key of the spelled-out form', () => {
  const keyOf = (text) => extractNumericClaims(text).map(numericClaimKey);
  assert.deepEqual(keyOf('the two-year increase would rise to 7.3% (123 BkWh).'), ['7.3|%|=', '123|billion|=']);
  assert.deepEqual(keyOf('gas generation rises 7.3% (123 billion kWh)'), ['7.3|%|=', '123|billion|=']);
  assert.deepEqual(keyOf('a 5 kWh battery'), []);
});

test('a digit inside another number does not corroborate a figure', () => {
  const verification = verifyNumericClaim({ numeric_value: 4, unit: 'USD', comparator: '', source_url: 'https://example.com/prices' }, {
    representative_source: { cleaned_text: 'Daily price swings averaged $4 a barrel in the quarter.' },
    supporting_sources: [{ cleaned_text: 'Imports fell to their lowest level since 2014, below 8.4 million barrels a day.' }],
  });
  assert.deepEqual(verification, { verification_status: 'verified_primary', confidence: 0.88 });
});

test('a sourced figure that several sources state stays verified_primary with higher confidence', () => {
  const verification = verifyNumericClaim({ numeric_value: 2026, unit: 'year', comparator: '', source_url: 'https://example.com/prices' }, {
    representative_source: { cleaned_text: 'Brent prices swung widely in the second quarter of 2026.' },
    supporting_sources: [{ cleaned_text: 'China imported less crude oil in the second quarter of 2026.' }],
  });
  assert.deepEqual(verification, { verification_status: 'verified_primary', confidence: 0.94 });
});

test('without a source url a figure needs two sources stating the same value and unit', () => {
  const claim = { numeric_value: 300, unit: 'MW', comparator: '' };
  const twoSources = {
    representative_source: { cleaned_text: 'The campus adds 300 MW of load.' },
    supporting_sources: [{ cleaned_text: 'A second filing also lists 300 MW for the campus.' }],
  };
  assert.equal(verifyNumericClaim(claim, twoSources).verification_status, 'verified_multi_source');
  const otherUnit = {
    representative_source: { cleaned_text: 'The campus adds 300 MW of load.' },
    supporting_sources: [{ cleaned_text: 'The operator spent $300 million on the site.' }],
  };
  assert.equal(verifyNumericClaim(claim, otherUnit).verification_status, 'insufficient_evidence');
});
