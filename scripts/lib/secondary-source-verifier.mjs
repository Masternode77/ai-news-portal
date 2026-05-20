export function attachSecondaryVerification(claims = [], cluster = {}) {
  const secondary = cluster.supporting_sources?.[0] || null;
  return claims.map((claim) => {
    if (!secondary || secondary.source_url === claim.source_url) return claim;
    if (String(secondary.cleaned_text || '').toLowerCase().includes(String(claim.entities?.[0] || '').toLowerCase())) {
      return {
        ...claim,
        secondary_source_url: secondary.source_url,
        secondary_source_name: secondary.source_name,
        verification_status: claim.verification_status === 'verified_primary' ? 'verified_secondary' : claim.verification_status,
        confidence: Math.max(claim.confidence || 0, 0.9),
      };
    }
    return claim;
  });
}
