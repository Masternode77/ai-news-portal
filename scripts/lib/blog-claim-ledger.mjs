import { extractNumericClaims } from './autonomous-desk-utils.mjs';
import { canonicalNumericUnit } from './numeric-claim-policy.mjs';
import { seoMetadataClaimsSupported } from './source-fidelity-claim-check.mjs';

export function buildBlogClaimLedger({ article = {}, extractionArtifact = {}, verifiedFacts = [], sourceName = '' } = {}) {
  const sourceUrl = extractionArtifact.source_url || '';
  const ledger = [];
  const supportedFacts = verifiedFacts.filter((fact) => seoMetadataClaimsSupported(
    { deck: fact },
    { evidenceText: extractionArtifact.cleaned_extracted_text || '' }
  ).ok);
  for (const [factIndex, fact] of supportedFacts.slice(0, 5).entries()) {
    const numericClaims = extractNumericClaims(fact);
    const rows = numericClaims.length ? numericClaims : [{ numeric_value: null, unit: '' }];
    for (const [numericIndex, numeric] of rows.entries()) {
      ledger.push({
        claim_id: `clm_${article.id || 'blog'}_${factIndex + 1}_${numericIndex + 1}`,
        article_id: article.id || '',
        claim_text: fact,
        source_quote_or_summary: fact,
        source_url: sourceUrl,
        source_name: sourceName || article.source || 'Original source',
        secondary_source_url: '',
        secondary_source_name: '',
        numeric_value: numeric.numeric_value,
        unit: numeric.numeric_value === null ? '' : canonicalNumericUnit(numeric.unit),
        verification_status: 'verified_primary',
        used_in_article: true,
        article_sentence: fact,
        inference_basis: '',
        notes: '',
      });
    }
  }
  return ledger;
}

export function buildClaimLedgerSummary(claimLedger = []) {
  return {
    total_claim_count: claimLedger.length,
    numeric_claim_count: claimLedger.filter((claim) => claim.numeric_value !== null && claim.numeric_value !== undefined).length,
    unsupported_claim_count: claimLedger.filter((claim) => claim.verification_status === 'unsupported').length,
    verified_fact_count: claimLedger.filter((claim) => claim.verification_status !== 'unsupported').length,
  };
}
