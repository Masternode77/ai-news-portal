import { hash } from './autonomous-desk-utils.mjs';
import { extractClaimsFromCluster } from './claim-extractor.mjs';
import { verifyNumericClaim, numericVerificationSummary } from './numeric-claim-verifier.mjs';
import { attachSecondaryVerification } from './secondary-source-verifier.mjs';
import { readJsonFile, writeJsonFile } from './state-store.mjs';

export const CLAIM_LEDGER_STORE_PATH = 'src/data/claim-ledger.json';

export function buildClaimLedger(cluster = {}, articleId = '') {
  const rawClaims = extractClaimsFromCluster(cluster);
  const verified = rawClaims.map((claim, index) => {
    const verification = verifyNumericClaim(claim, cluster);
    return {
      claim_id: `clm_${hash([cluster.cluster_id, articleId, index, claim.claim_text].join('|'))}`,
      cluster_id: cluster.cluster_id,
      article_id: articleId,
      ...claim,
      secondary_source_url: '',
      secondary_source_name: '',
      ...verification,
      used_in_article: false,
      article_sentence: '',
      inference_basis: claim.is_inference ? claim.source_quote_or_summary : '',
      notes: '',
    };
  });
  const ledger = attachSecondaryVerification(verified, cluster);
  return {
    claims: ledger,
    summary: {
      ...numericVerificationSummary(ledger),
      unsupported_claim_count: ledger.filter((claim) => claim.verification_status === 'unsupported').length,
      verified_fact_count: ledger.filter((claim) => ['verified_primary', 'verified_secondary', 'verified_multi_source', 'inference_supported'].includes(claim.verification_status)).length,
    },
  };
}

export async function readClaimLedger(filePath = CLAIM_LEDGER_STORE_PATH) {
  return readJsonFile(filePath, []);
}

export async function writeClaimLedger(claims = [], filePath = CLAIM_LEDGER_STORE_PATH) {
  await writeJsonFile(filePath, claims);
  return claims;
}
