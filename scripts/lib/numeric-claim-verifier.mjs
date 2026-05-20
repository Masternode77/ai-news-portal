export function verifyNumericClaim(claim = {}, cluster = {}) {
  if (claim.numeric_value === null || claim.numeric_value === undefined) {
    return { verification_status: 'verified_primary', confidence: 0.88 };
  }
  const supportCount = [cluster.representative_source, ...(cluster.supporting_sources || [])]
    .filter(Boolean)
    .filter((item) => String(item.cleaned_text || item.title || '').includes(String(claim.numeric_value))).length;
  if (supportCount > 1) return { verification_status: 'verified_multi_source', confidence: 0.94 };
  if (claim.source_url) return { verification_status: 'verified_primary', confidence: 0.88 };
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
