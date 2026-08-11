const UNIT_ALIASES = new Map([
  ['mw', 'mw'], ['megawatt', 'mw'], ['megawatts', 'mw'],
  ['gw', 'gw'], ['gigawatt', 'gw'], ['gigawatts', 'gw'],
  ['kw', 'kw'], ['kilowatt', 'kw'], ['kilowatts', 'kw'],
  ['%', '%'], ['percent', '%'],
  ['billion', 'billion'], ['million', 'million'],
  ['year', 'year'], ['years', 'year'], ['month', 'month'], ['months', 'month'],
  ['day', 'day'], ['days', 'day'], ['sq ft', 'sq ft'], ['sq. ft', 'sq ft'],
]);

export function canonicalNumericUnit(unit = '') {
  return UNIT_ALIASES.get(String(unit || '').toLowerCase().replace(/\s+/g, ' ').trim()) || '';
}

export function numericClaimKey(claim = {}) {
  const value = Number(claim.numeric_value);
  const unit = canonicalNumericUnit(claim.unit);
  return Number.isFinite(value) && unit ? `${value}|${unit}` : '';
}
