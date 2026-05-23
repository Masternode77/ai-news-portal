import { extractNumericClaims, splitSentences } from './autonomous-desk-utils.mjs';

function canonicalUnit(unit = '') {
  const normalized = String(unit || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (/^megawatts?$|^mw$/.test(normalized)) return 'mw';
  if (/^gigawatts?$|^gw$/.test(normalized)) return 'gw';
  if (/^kilowatts?$|^kw$/.test(normalized)) return 'kw';
  if (/^percent$|^%$/.test(normalized)) return '%';
  return normalized;
}

function claimKey(claim = {}) {
  return `${claim.numeric_value}|${canonicalUnit(claim.unit)}`;
}

export function unsupportedClaimGuard(articleText = '', ledger = []) {
  const numericClaims = extractNumericClaims(articleText);
  const ledgerKeys = new Set(ledger.map(claimKey));
  const unsupportedNumbers = numericClaims.filter((claim) => !ledgerKeys.has(claimKey(claim)));
  const unsupportedLedger = ledger.filter((claim) => claim.verification_status === 'unsupported');
  const hasBody = splitSentences(articleText).length >= 8;
  const reasons = [];
  if (unsupportedNumbers.length) reasons.push(`unsupported_numeric_claims:${unsupportedNumbers.map((claim) => claim.raw).join(',')}`);
  if (unsupportedLedger.length) reasons.push(`unsupported_claim_records:${unsupportedLedger.length}`);
  if (!hasBody) reasons.push('body_too_thin_for_claim_review');
  return {
    ok: reasons.length === 0,
    unsupportedNumbers,
    unsupportedLedger,
    reasons,
  };
}
