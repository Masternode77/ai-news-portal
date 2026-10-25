import { extractNumericClaims } from './autonomous-desk-utils.mjs';
import { numericClaimKey } from './numeric-claim-policy.mjs';

// A source corroborates a figure only when it states the same value, unit and
// qualifier. A digit substring is not a figure: "4" occurs in "2014", so "$4"
// used to count as stated by every source that printed a year.
function sourceStatesFigure(item = {}, key = '') {
  const text = [item.title, item.cleaned_text].filter(Boolean).join(' ');
  return extractNumericClaims(text).some((numeric) => numericClaimKey(numeric) === key);
}

export function verifyNumericClaim(claim = {}, cluster = {}) {
  if (claim.numeric_value === null || claim.numeric_value === undefined) {
    return { verification_status: 'verified_primary', confidence: 0.88 };
  }
  const key = numericClaimKey(claim);
  const supportCount = key
    ? [cluster.representative_source, ...(cluster.supporting_sources || [])]
      .filter(Boolean)
      .filter((item) => sourceStatesFigure(item, key)).length
    : 0;
  // A claim quoted from the source it cites stays verified_primary when other
  // sources state the same figure. The numeric gate accepts only that status,
  // so ranking corroboration above it removed the best-supported figures from
  // the gate. Corroboration raises confidence instead.
  if (claim.source_url) return { verification_status: 'verified_primary', confidence: supportCount > 1 ? 0.94 : 0.88 };
  if (supportCount > 1) return { verification_status: 'verified_multi_source', confidence: 0.94 };
  return { verification_status: 'insufficient_evidence', confidence: 0.45 };
}

export function numericVerificationSummary(claims = []) {
  const numeric = claims.filter((claim) => claim.numeric_value !== null && claim.numeric_value !== undefined);
  const verified = numeric.filter((claim) => ['verified_primary', 'verified_secondary', 'verified_multi_source'].includes(claim.verification_status));
  return {
    numeric_claim_count: numeric.length,
    verified_numeric_claim_count: verified.length,
    verified_numeric_ratio: numeric.length ? verified.length / numeric.length : 1,
    ok: numeric.length ? verified.length / numeric.length >= 0.75 : true,
  };
}
