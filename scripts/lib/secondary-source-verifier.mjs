export function attachSecondaryVerification(claims = [], cluster = {}) {
  const secondary = cluster.supporting_sources?.[0] || null;
  return claims.map((claim) => {
    if (!secondary || secondary.source_url === claim.source_url) return claim;
    // A claim with no named entity has nothing to match, and every text
    // "includes" the empty string, so such claims were credited to the
    // secondary source unconditionally.
    const entity = String(claim.entities?.[0] || '').trim().toLowerCase();
    if (entity && String(secondary.cleaned_text || '').toLowerCase().includes(entity)) {
      // The secondary source is recorded alongside the claim, which keeps its
      // status: the numeric gate accepts only verified_primary, and
      // corroboration must not remove a source-quoted claim from it.
      return {
        ...claim,
        secondary_source_url: secondary.source_url,
        secondary_source_name: secondary.source_name,
        confidence: Math.max(claim.confidence || 0, 0.9),
      };
    }
    return claim;
  });
}
