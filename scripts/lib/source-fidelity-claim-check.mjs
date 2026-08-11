import { extractNumericClaims } from './autonomous-desk-utils.mjs';
import { numericClaimKey } from './numeric-claim-policy.mjs';

const STOP_WORDS = new Set('a an and are as at be because been by can could did do does for from had has have if in into is it its may more most not of on or our should than that the their them then there these they this those to was were what when where which who will with would'.split(' '));

function extractClaims(body = '', { minLength = 60 } = {}) {
  return String(body || '')
    .split(/(?<=[.!?])\s+/)
    .map((claim) => claim.trim())
    .filter((claim) => claim.length > minLength)
    .slice(0, 30);
}

function contentWords(value = '') {
  return String(value || '').toLowerCase().match(/[a-z][a-z0-9-]{2,}/g)?.filter((word) => !STOP_WORDS.has(word)) || [];
}

function normalizedWord(word = '') {
  return word.replace(/(?:ing|ed|es|s)$/i, '');
}

function unsupportedActors(claim = '', evidence = '') {
  const afterFirstWord = String(claim).replace(/^\s*[A-Z][\w-]*\s*/, '');
  const actors = afterFirstWord.match(/\b[A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+){0,3}\b/g) || [];
  return actors.filter((actor) => !/^(AI|MW|GW|US|EU|APAC)$/.test(actor) && !evidence.toLowerCase().includes(actor.toLowerCase()));
}

function checkExtractedClaimsAgainstEvidence(claims = [], evidencePack = {}) {
  const evidence = [
    evidencePack.evidenceText,
    ...(evidencePack.facts || []),
    ...(evidencePack.namedActors || []),
  ].join(' ');
  const evidenceWords = new Set(contentWords(evidence).map(normalizedWord));
  const evidenceNumbers = new Set(extractNumericClaims(evidence).map(numericClaimKey));
  const unsupported = claims.filter((claim) => {
    const terms = [...new Set(contentWords(claim).map(normalizedWord))];
    const matched = terms.filter((term) => evidenceWords.has(term));
    const numericSupported = extractNumericClaims(claim).every((number) => evidenceNumbers.has(numericClaimKey(number)));
    const actorsSupported = unsupportedActors(claim, evidence).length === 0;
    const lexicalSupport = terms.length === 0 || matched.length >= Math.min(3, terms.length)
      && matched.length / terms.length >= 0.34;
    return !numericSupported || !actorsSupported || !lexicalSupport;
  });
  return {
    ok: unsupported.length === 0,
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
