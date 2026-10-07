import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractNumericClaims, splitSentences } from '../scripts/lib/autonomous-desk-utils.mjs';
import { buildClaimLedger } from '../scripts/lib/claim-ledger.mjs';
import { canonicalNumericComparator, numericClaimKey } from '../scripts/lib/numeric-claim-policy.mjs';
import { unsupportedClaimGuard } from '../scripts/lib/unsupported-claim-guard.mjs';

test('numeric extraction preserves currency scale, qualifiers, ordinals, multipliers, and shared time units', () => {
  const claims = extractNumericClaims(
    'Usage rose from under $1 to $601. The 90th percentile exceeded over $7,000, or around $2 million per year. Growth was 1.8× and 2.2× per month, with doubling times of 34 and 27 days.',
  );
  const byRaw = new Map(claims.map((claim) => [claim.raw, claim]));

  assert.deepEqual(
    ['under $1', '$601', '90th', 'over $7,000', 'around $2 million', '1.8×', '2.2×', '34', '27 days'].filter((raw) => !byRaw.has(raw)),
    [],
  );
  assert.deepEqual(
    { value: byRaw.get('under $1').numeric_value, unit: byRaw.get('under $1').unit, comparator: byRaw.get('under $1').comparator },
    { value: 1, unit: 'USD', comparator: 'under' },
  );
  assert.deepEqual(
    { value: byRaw.get('around $2 million').numeric_value, unit: byRaw.get('around $2 million').unit, comparator: byRaw.get('around $2 million').comparator },
    { value: 2, unit: 'USD million', comparator: 'around' },
  );
  assert.equal(byRaw.get('90th').unit, 'ordinal');
  assert.equal(byRaw.get('1.8×').unit, 'times');
  assert.equal(byRaw.get('34').unit, 'days');
  assert.equal(byRaw.get('27 days').unit, 'days');
});

test('unsupported claim guard rejects currency and multiplier values absent from its primary ledger', () => {
  const result = unsupportedClaimGuard(
    'Daily use reached $601 while the measured monthly rate reached 2.2×.',
    [{
      numeric_value: 601,
      unit: 'USD',
      verification_status: 'verified_primary',
      source_url: 'https://example.com/source',
      source_quote_or_summary: 'Daily use reached $601.',
    }],
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.unsupportedNumbers.map((claim) => claim.raw), ['2.2×']);
  assert.match(result.reasons[0], /unsupported_numeric_claims:2\.2×/);
});

test('numeric keys canonicalize equivalent qualifiers without collapsing different relations', () => {
  const aliases = new Map([
    ['less than', '<'], ['under', '<'], ['more than', '>'], ['over', '>'],
    ['at least', '>='], ['no less than', '>='], ['not less than', '>='], ['not under', '>='],
    ['at most', '<='], ['up to', '<='], ['no more than', '<='], ['not more than', '<='], ['not over', '<='],
    ['less than or equal', '<='], ['less than or equal to', '<='],
    ['more than or equal', '>='], ['more than or equal to', '>='],
    ['not <', '>='], ['not >', '<='], ['not <=', '>'], ['not >=', '<'],
    ['approximately', '~'], ['nearly', '~'], ['almost', '~'], ['around', '~'],
  ]);
  for (const [alias, expected] of aliases) assert.equal(canonicalNumericComparator(alias), expected, alias);
  assert.equal(numericClaimKey({ numeric_value: 1, unit: 'USD', comparator: 'under' }), '1|usd|<');
  assert.notEqual(
    numericClaimKey({ numeric_value: 1, unit: 'USD', comparator: 'under' }),
    numericClaimKey({ numeric_value: 1, unit: 'USD', comparator: 'over' }),
  );
  assert.notEqual(
    numericClaimKey({ numeric_value: 1, unit: 'USD', comparator: 'under' }),
    numericClaimKey({ numeric_value: 1, unit: 'USD', comparator: '' }),
  );
  assert.deepEqual(
    extractNumericClaims('<$1 >$2 >=$3 <=$4 ~$5 exactly $6 nearly $7 almost $8 no more than $9 no less than $10 less than or equal to $11 more than or equal $12 not under $13 not over $14').map(({ numeric_value, comparator }) => [numeric_value, comparator]),
    [[1, '<'], [2, '>'], [3, '>='], [4, '<='], [5, '~'], [6, 'exactly'], [7, 'nearly'], [8, 'almost'], [9, 'no more than'], [10, 'no less than'], [11, 'less than or equal to'], [12, 'more than or equal'], [13, 'not under'], [14, 'not over']],
  );
});

test('long factual source sentences remain eligible evidence', () => {
  const longSentence = `The filing explains ${'operational context '.repeat(16)}and reports around $2 million per year.`;
  assert.ok(longSentence.length > 320);
  const sentences = splitSentences(longSentence);

  assert.equal(sentences.length, 1);
  assert.equal(extractNumericClaims(sentences[0])[0].raw, 'around $2 million');
});

test('the archived OpenAI usage source yields a provenance ledger for every supported numeric form', () => {
  const archive = JSON.parse(readFileSync(new URL('../src/data/archived-news.json', import.meta.url), 'utf8'));
  const source = archive.find((item) => item.id === '8c015ec83cbadc52');
  assert.ok(source, 'expected the archived Epoch AI source fixture');

  const result = buildClaimLedger({
    cluster_id: 'sig_openai_usage_regression',
    representative_source: {
      title: source.title,
      cleaned_text: source.cleaned_source_text,
      source_url: source.sourceUrl,
      source_name: source.source,
      source_published_at: source.publishedAt,
    },
  }, 'article_openai_usage_regression');
  const numeric = result.claims.filter((claim) => claim.numeric_value !== null);
  const keys = new Set(numeric.map((claim) => `${claim.numeric_value}|${claim.unit}|${claim.comparator || ''}`));

  assert.equal(result.summary.numeric_claim_count, 15);
  assert.equal(result.summary.verified_numeric_claim_count, 15);
  for (const key of ['1|USD|under', '601|USD|', '90|ordinal|', '7000|USD|over', '2|USD million|around', '1.8|times|', '2.2|times|', '34|days|', '27|days|']) {
    assert.ok(keys.has(key), `missing source-derived numeric claim ${key}`);
  }
  assert.ok(result.claims.some((claim) => claim.claim_text.length > 320 && claim.numeric_value === 2 && claim.unit === 'USD million'));
});
