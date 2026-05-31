function extractClaims(body = '', { minLength = 60 } = {}) {
  return String(body || '')
    .split(/(?<=[.!?])\s+/)
    .map((claim) => claim.trim())
    .filter((claim) => claim.length > minLength)
    .slice(0, 30);
}

function checkExtractedClaimsAgainstEvidence(claims = [], evidencePack = {}) {
  const evidence = [
    evidencePack.evidenceText,
    ...(evidencePack.facts || []),
    ...(evidencePack.namedActors || []),
  ].join(' ').toLowerCase();
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

export function checkClaimsAgainstEvidence(body = '', evidencePack = {}) {
  return checkExtractedClaimsAgainstEvidence(extractClaims(body), evidencePack);
}

export function seoMetadataClaimsSupported(article = {}, evidencePack = {}) {
  const seoText = [
    article.title,
    article.deck,
    article.summary,
    article.snippet,
    article.why_it_matters,
    article.public_presentation?.deck,
    article.public_presentation?.why_it_matters,
    article.expertLensFull?.metaDescription,
  ].filter(Boolean).join('. ');
  const result = checkExtractedClaimsAgainstEvidence(
    extractClaims(seoText, { minLength: 20 }),
    evidencePack
  );
  return {
    ...result,
    ok: result.unsupportedClaims.length === 0,
  };
}
