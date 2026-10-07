import { extractNumericClaims } from './autonomous-desk-utils.mjs';

const UNIT_ALIASES = new Map([
  ['mw', 'mw'], ['megawatt', 'mw'], ['megawatts', 'mw'],
  ['gw', 'gw'], ['gigawatt', 'gw'], ['gigawatts', 'gw'],
  ['kw', 'kw'], ['kilowatt', 'kw'], ['kilowatts', 'kw'],
  ['%', '%'], ['percent', '%'],
  ['billion', 'billion'], ['million', 'million'],
  ['usd', 'usd'], ['usd thousand', 'usd thousand'], ['usd million', 'usd million'],
  ['usd billion', 'usd billion'], ['usd trillion', 'usd trillion'],
  ['times', 'times'], ['time', 'times'], ['multiplier', 'times'],
  ['ordinal', 'ordinal'],
  ['year', 'year'], ['years', 'year'], ['month', 'month'], ['months', 'month'],
  ['day', 'day'], ['days', 'day'], ['sq ft', 'sq ft'], ['sq. ft', 'sq ft'],
]);

export function canonicalNumericUnit(unit = '') {
  return UNIT_ALIASES.get(String(unit || '').toLowerCase().replace(/\s+/g, ' ').trim()) || '';
}

const COMPARATOR_ALIASES = new Map([
  ['', '='], ['=', '='], ['exactly', '='],
  ['under', '<'], ['less than', '<'], ['<', '<'], ['not over', '<='], ['no over', '<='],
  ['over', '>'], ['more than', '>'], ['>', '>'], ['not under', '>='], ['no under', '>='],
  ['less than or equal', '<='], ['less than or equal to', '<='],
  ['more than or equal', '>='], ['more than or equal to', '>='],
  ['at least', '>='], ['no less than', '>='], ['not less than', '>='], ['>=', '>='], ['≥', '>='],
  ['at most', '<='], ['up to', '<='], ['no more than', '<='], ['not more than', '<='], ['<=', '<='], ['≤', '<='],
  ['not <', '>='], ['not >', '<='], ['not <=', '>'], ['not >=', '<'],
  ['no <', '>='], ['no >', '<='], ['no <=', '>'], ['no >=', '<'],
  ['around', '~'], ['about', '~'], ['approximately', '~'], ['roughly', '~'],
  ['nearly', '~'], ['almost', '~'], ['~', '~'],
]);

export function canonicalNumericComparator(comparator = '') {
  return COMPARATOR_ALIASES.get(String(comparator ?? '').toLowerCase().replace(/\s+/g, ' ').trim()) ?? null;
}

function comparatorForClaim(claim, value, unit) {
  if (Object.hasOwn(claim, 'comparator') && claim.comparator !== undefined && claim.comparator !== null) {
    return canonicalNumericComparator(claim.comparator);
  }
  const context = claim.source_quote_or_summary || claim.claim_text || claim.article_sentence || '';
  const matches = extractNumericClaims(context).filter((candidate) => (
    Number(candidate.numeric_value) === value && canonicalNumericUnit(candidate.unit) === unit
  ));
  const comparators = new Set(matches.map((candidate) => canonicalNumericComparator(candidate.comparator)).filter(Boolean));
  return comparators.size === 1 ? [...comparators][0] : null;
}

export function numericClaimKey(claim = {}) {
  const value = Number(claim.numeric_value);
  const unit = canonicalNumericUnit(claim.unit);
  const comparator = comparatorForClaim(claim, value, unit);
  return Number.isFinite(value) && unit && comparator ? `${value}|${unit}|${comparator}` : '';
}
