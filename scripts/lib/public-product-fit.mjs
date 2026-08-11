import { hasSourceBackedCardProductFit } from './card-copy-product-fit.mjs';
import { guardPublicCopy } from './copy-quality-guard.mjs';
import { hasInternalPublicLanguage } from './internal-language-guard.mjs';
import { classifyInfrastructureRelevance } from './relevance-classifier.mjs';
import { routeStrictInfrastructureRelevance } from './strict-infrastructure-relevance-router.mjs';
import { validateExtractionArtifact } from './extraction-artifact.mjs';

const PUBLIC_RELEVANCE_THRESHOLD = 0.55;
const PUBLIC_COPY_QUALIFICATION_PATTERN = /\b(?:before it becomes a full Compute Current analysis|needs evidence|source-backed facts|watchlist|qualification|routing decision|publish decision)\b/i;

const DECISIVE_SOURCE_PATTERNS = [
  /\b(?:data centers?|datacenters?|colocation|hyperscale(?:r|rs)?|server farms?)\b/i,
  /\b(?:compute express link|cxl(?:\s+[1-9](?:\.\d)?)?|high-bandwidth memory|hbm|advanced packaging)\b/i,
  /\b(?:semiconductor|wafer fab|chip fabrication|chip supply|chip industry|IC funding|accelerator cluster|gpu cluster)\b/i,
  /\b(?:GPU|accelerator|HBM|semiconductor|chip)\b.{0,100}\b(?:supply|rack|capacity|server|memory|deployment|procurement)\b/i,
  /\b(?:supply|rack|capacity|server|memory|deployment|procurement)\b.{0,100}\b(?:GPU|accelerator|HBM|semiconductor|chip)\b/i,
  /\b(?:direct-to-chip|liquid cooling|rack density|cooling distribution unit|cdu)\b/i,
  /\b(?:cloud capacity|availability zone|cloud region|inference capacity|training capacity)\b/i,
  /\b(?:grid|utility|substation|transmission|interconnection)\b.{0,160}\b(?:data center|datacenter|AI campus|compute capacity|large load)\b/i,
  /\b(?:data center|datacenter|AI campus|compute capacity|large load)\b.{0,160}\b(?:grid|utility|substation|transmission|interconnection)\b/i,
];

function cleanSourceValue(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizedSourceUrl(value = '') {
  try {
    const url = new URL(String(value || ''));
    if (!/^https?:$/.test(url.protocol)) return '';
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

function verifiedClaimEvidence(article = {}, artifactText = '', sourceUrl = '') {
  const normalizedArtifact = cleanSourceValue(artifactText).toLowerCase();
  return (article.claim_ledger || []).flatMap((claim) => {
    const quote = cleanSourceValue(claim.source_quote_or_summary);
    const verified = claim.verification_status === 'verified_primary'
      && normalizedSourceUrl(claim.source_url) === sourceUrl
      && quote.length >= 20
      && normalizedArtifact.includes(quote.toLowerCase());
    return verified ? [quote] : [];
  });
}

function sourceEvidenceResult(article = {}) {
  const title = cleanSourceValue(article.title);
  const artifact = validateExtractionArtifact(article.extraction_artifact);
  const articleUrl = normalizedSourceUrl(article.sourceUrl || article.canonicalUrl || article.url || article.link);
  const artifactUrl = normalizedSourceUrl(artifact.sourceUrl);
  const verifiedArtifact = artifact.ok && articleUrl && artifactUrl === articleUrl;
  const extractedText = verifiedArtifact ? cleanSourceValue(artifact.text) : '';
  const extractedFacts = verifiedArtifact
    ? verifiedClaimEvidence(article, extractedText, artifactUrl)
    : [];
  const projection = {
    ...(title ? { title } : {}),
    ...(extractedText ? { articleText: extractedText } : {}),
    ...(extractedFacts.length ? { extracted_facts: extractedFacts } : {}),
  };
  return {
    projection,
    text: [title, extractedText, ...extractedFacts].filter(Boolean).join(' '),
    verifiedArtifact: Boolean(verifiedArtifact),
  };
}

export function publicSourceEvidence(article = {}) {
  return sourceEvidenceResult(article).projection;
}

function sourceProductFit(article = {}) {
  const evidence = sourceEvidenceResult(article);
  const { projection, text } = evidence;
  const relevance = classifyInfrastructureRelevance(projection);
  const route = routeStrictInfrastructureRelevance(projection);
  const hardBoundary = route.blocked_reasons?.some((reason) => [
    'outside_compute_current_product_boundary',
    'generic_non_infrastructure_topic',
  ].includes(reason));
  const decisiveMatch = DECISIVE_SOURCE_PATTERNS.some((pattern) => pattern.test(text));
  const sourceBacked = hasSourceBackedCardProductFit(projection);
  return {
    ok: Boolean(
      text
        && sourceBacked
        && !hardBoundary
        && (evidence.verifiedArtifact
          ? relevance.infrastructure_relevance_score >= PUBLIC_RELEVANCE_THRESHOLD || decisiveMatch
          : decisiveMatch)
    ),
    decisiveMatch,
    relevance,
    route,
    sourceBacked,
    verifiedArtifact: evidence.verifiedArtifact,
  };
}

export function publicProductFitResult(article = {}, copy = undefined) {
  const source = sourceProductFit(article);
  const reasons = [];
  if (!source.verifiedArtifact && !source.ok) reasons.push('missing_verified_source_evidence');
  if (!source.sourceBacked) reasons.push('missing_source_backed_infrastructure_signal');
  if (source.route.blocked_reasons?.some((reason) => reason === 'outside_compute_current_product_boundary')) {
    reasons.push('outside_compute_current_product_boundary');
  }
  if (source.route.blocked_reasons?.some((reason) => reason === 'generic_non_infrastructure_topic')) {
    reasons.push('generic_non_infrastructure_topic');
  }
  if (!source.ok && !reasons.length) reasons.push('source_relevance_below_public_threshold');

  if (copy?.deck || copy?.why_it_matters) {
    const copyText = [copy.deck, copy.why_it_matters].filter(Boolean).join(' ');
    const copyGuard = guardPublicCopy(copyText);
    reasons.push(...copyGuard.reasons);
    if (hasInternalPublicLanguage(copyText)) reasons.push('internal_public_language');
    if (PUBLIC_COPY_QUALIFICATION_PATTERN.test(copyText)) reasons.push('synthetic_operational_copy');
  }

  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    source_relevance_score: source.relevance.infrastructure_relevance_score,
    source_relevance_tier: source.relevance.infrastructure_relevance_tier,
    decisive_source_match: source.decisiveMatch,
  };
}

export function isPublicProductFit(article = {}, copy = undefined) {
  return publicProductFitResult(article, copy).ok;
}
