export function checkClaimsAgainstEvidence(body = '', evidencePack = {}) {
  const evidence = [
    evidencePack.evidenceText,
    ...(evidencePack.facts || []),
    ...(evidencePack.namedActors || []),
  ].join(' ').toLowerCase();
  const claims = String(body || '')
    .split(/(?<=[.!?])\s+/)
    .filter((claim) => claim.length > 60)
    .slice(0, 30);
  const unsupported = claims.filter((claim) => {
    const terms = claim.toLowerCase().split(/\W+/).filter((word) => word.length > 6).slice(0, 4);
    return terms.length && !terms.some((term) => evidence.includes(term));
  });
  return {
    ok: unsupported.length <= Math.max(2, claims.length * 0.35),
    totalClaims: claims.length,
    unsupportedClaims: unsupported,
  };
}
