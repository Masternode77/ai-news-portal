import { buildAdminQualityModel as buildBaseAdminQualityModel } from '../../scripts/lib/admin-quality-model.mjs';
import { sourceScopePolicyResult } from '../../scripts/lib/source-scope-policy.mjs';

export function buildAdminQualityModel(article = {}) {
  const base = buildBaseAdminQualityModel(article);
  const evidence = article.expertLensFull?.evidenceBox || {
    verifiedFacts: article.evidence_pack?.verified_facts || article.evidence_pack?.facts || [],
    keyNumbers: (article.claim_ledger || []).filter((claim) => claim.numeric_value !== null && claim.numeric_value !== undefined),
    sourceCount: article.evidence_pack?.source_links?.length || article.source_count || 1,
    uncertainty: article.evidence_pack?.uncertainty?.[0] || article.evidence_pack?.source_limitations || '',
  };
  return {
    ...base,
    evidence,
    claim_ledger: article.claim_ledger || [],
    claim_ledger_summary: article.claim_ledger_summary || {},
    source_scope_policy: sourceScopePolicyResult(article),
    backfilledAnalysis: article.backfilledAnalysis === true,
  };
}
