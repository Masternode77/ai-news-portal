import { extractNumericClaims } from './autonomous-desk-utils.mjs';
import { numericClaimKey } from './numeric-claim-policy.mjs';

export function unsupportedClaimGuard(articleText = '', ledger = []) {
  const numericClaims = extractNumericClaims(articleText);
  const verifiedLedger = ledger.filter((claim) => claim.verification_status === 'verified_primary');
  const malformedVerifiedNumeric = verifiedLedger.filter((claim) => {
    const declaresNumeric = claim.numeric_value !== null && claim.numeric_value !== undefined;
    if (!declaresNumeric) return false;
    const key = numericClaimKey(claim);
    const quoteKeys = new Set(extractNumericClaims(claim.source_quote_or_summary || '').map(numericClaimKey));
    return !key || !quoteKeys.has(key) || !String(claim.source_url || '').trim();
  });
  const ledgerKeys = new Set(verifiedLedger.map(numericClaimKey).filter(Boolean));
  const unsupportedNumbers = numericClaims.filter((claim) => !ledgerKeys.has(numericClaimKey(claim)));
  const unsupportedLedger = ledger.filter((claim) => claim.verification_status === 'unsupported');
  const reasons = [];
  if (unsupportedNumbers.length) reasons.push(`unsupported_numeric_claims:${unsupportedNumbers.map((claim) => claim.raw).join(',')}`);
  if (unsupportedLedger.length) reasons.push(`unsupported_claim_records:${unsupportedLedger.length}`);
  if (malformedVerifiedNumeric.length) reasons.push(`malformed_verified_numeric_claim_records:${malformedVerifiedNumeric.length}`);
  return {
    ok: reasons.length === 0,
    unsupportedNumbers,
    unsupportedLedger,
    malformedVerifiedNumeric,
    reasons,
  };
}
