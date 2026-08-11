import { articleDetailQualityResult } from './article-detail-quality-gate.mjs';
import { copyrightSafeCopyGuard } from './copyright-safe-copy-guard.mjs';
import { quarantineArticle } from './content-quarantine.mjs';
import { analyzeArticleRepetition } from './repetition-detector.mjs';
import { checkClaimsAgainstEvidence, seoMetadataClaimsSupported } from './source-fidelity-claim-check.mjs';
import { unsupportedClaimGuard } from './unsupported-claim-guard.mjs';
import { validateExtractionArtifact } from './extraction-artifact.mjs';
import { hasPublishedArticlePage } from './article-publication-state.mjs';
import { currentSourceTextAuthorization } from './source-text-publication-authorization.mjs';

function bodyFor(article = {}) {
  return String(article.expertLensFull?.finalArticleBody || article.finalArticleBody || '').trim();
}

function verifiedClaimsForArtifact(article = {}, artifact = {}) {
  const sourceEvidence = artifact.cleaned_extracted_text || '';
  const sourceUrl = artifact.source_url || '';
  const valid = [];
  const invalid = [];
  for (const claim of article.claim_ledger || []) {
    if (claim.verification_status !== 'verified_primary') continue;
    const quote = String(claim.source_quote_or_summary || '').trim();
    const supported = quote && seoMetadataClaimsSupported({ deck: quote }, { evidenceText: sourceEvidence }).ok;
    if (claim.source_url === sourceUrl && supported) valid.push(claim);
    else invalid.push(claim);
  }
  return { valid, invalid };
}

function evidencePackFor(article = {}, sourceEvidence = '', verifiedClaims = []) {
  return {
    evidenceText: [sourceEvidence, ...verifiedClaims.map((claim) => claim.claim_text)].filter(Boolean).join(' '),
    facts: verifiedClaims.map((claim) => claim.claim_text),
    namedActors: [],
  };
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function persistedExtractionReasons(artifact = {}) {
  const qa = artifact.extraction_qa || {};
  const reasons = [];
  if (qa.public_publishable === false) reasons.push('public_publishable_false');
  if (qa.can_generate_longform !== true) reasons.push('can_generate_longform_not_true');
  if (qa.sentence_completion_score !== undefined && Number(qa.sentence_completion_score) < 0.92) {
    reasons.push('sentence_completion_score_below_0.92');
  }
  return reasons;
}

export function marksFinalBodyPublic(article = {}) {
  const body = bodyFor(article);
  if (!body || !hasPublishedArticlePage(article)) return false;
  if (article.archiveOnly === true || article.public_status === 'quarantined') return false;
  return true;
}

function requiresFinalBodyReview(article = {}) {
  const body = bodyFor(article);
  if (!body || article.archiveOnly === true || article.public_status === 'quarantined') return false;
  if (article.articlePagePublished === false) return false;
  return hasPublishedArticlePage(article) || article.public_status === 'published';
}

export function finalPublicationIntegrityResult(article = {}, recentRecords = [], options = {}) {
  if (!requiresFinalBodyReview(article)) return { ok: true, reasons: [], skipped: true };

  const body = bodyFor(article);
  const artifactValidation = validateExtractionArtifact(article.extraction_artifact);
  const artifact = artifactValidation.ok ? article.extraction_artifact : {};
  const sourceRights = currentSourceTextAuthorization(article, artifact, options);
  const sourceEvidence = artifact.cleaned_extracted_text || '';
  const verifiedClaims = verifiedClaimsForArtifact(article, artifact);
  const evidencePack = evidencePackFor(article, sourceEvidence, verifiedClaims.valid);
  const detail = articleDetailQualityResult({ ...article, rawText: sourceEvidence, articleText: sourceEvidence });
  const fidelity = checkClaimsAgainstEvidence(body, evidencePack);
  const seoFidelity = seoMetadataClaimsSupported(article, evidencePack);
  const unsupported = unsupportedClaimGuard(body, article.claim_ledger || []);
  const repetition = analyzeArticleRepetition(article, recentRecords);
  const copyright = copyrightSafeCopyGuard({ generatedText: body, sourceText: sourceEvidence });
  const extractionMetadataReasons = persistedExtractionReasons(article.extraction_artifact);
  const reasons = unique([
    ...(sourceRights.ok ? [] : [`source_rights:${sourceRights.detail}`]),
    ...detail.reasons.map((reason) => `article_detail:${reason}`),
    ...extractionMetadataReasons.map((reason) => `extraction_qa:${reason}`),
    ...(artifactValidation.ok ? [] : ['extraction_artifact:missing_or_invalid']),
    ...(verifiedClaims.invalid.length ? [`source_fidelity:invalid_verified_claim_provenance:${verifiedClaims.invalid.length}`] : []),
    ...(fidelity.unsupportedClaims.length ? [`source_fidelity:unsupported_claims:${fidelity.unsupportedClaims.length}`] : []),
    ...(seoFidelity.unsupportedClaims.length ? [`source_fidelity:unsupported_metadata_claims:${seoFidelity.unsupportedClaims.length}`] : []),
    ...unsupported.reasons.map((reason) => `unsupported_claim:${reason}`),
    ...repetition.reasons.map((reason) => `repetition:${reason}`),
    ...copyright.reasons.map((reason) => `copyright:${reason}`),
  ]);

  return {
    ok: detail.ok
      && sourceRights.ok
      && extractionMetadataReasons.length === 0
      && artifactValidation.ok
      && verifiedClaims.invalid.length === 0
      && fidelity.unsupportedClaims.length === 0
      && seoFidelity.ok
      && unsupported.ok
      && !repetition.blocked
      && copyright.ok,
    reasons,
    skipped: false,
    checks: { sourceRights, artifactValidation, detail, fidelity, seoFidelity, verifiedClaims, unsupported, repetition, copyright },
  };
}

export function publicationIntegritySnapshot(result = {}) {
  return {
    ok: result.ok === true,
    reasons: result.reasons || [],
    checked_gates: [
      'extraction_qa',
      'current_source_text_authorization',
      'article_detail_quality',
      'source_fidelity',
      'unsupported_claims',
      'repetition',
      'copyright_safe_copy',
    ],
    source_text_authorization: result.checks?.sourceRights || null,
  };
}

export function enforceFinalPublicationIntegrity(articles = [], recentRecords = [], options = {}) {
  const accepted = [];
  const blocked = [];
  const comparisonWindow = [...recentRecords];

  for (const article of articles) {
    const integrity = finalPublicationIntegrityResult(article, comparisonWindow, options);
    if (!integrity.ok) {
      const quarantined = quarantineArticle({
        ...article,
        publication_integrity: publicationIntegritySnapshot(integrity),
      }, integrity.reasons, { force: true });
      accepted.push(quarantined);
      blocked.push(quarantined);
      continue;
    }
    const checked = integrity.skipped ? article : {
      ...article,
      publication_integrity: publicationIntegritySnapshot(integrity),
    };
    accepted.push(checked);
    if (marksFinalBodyPublic(checked)) comparisonWindow.unshift(checked);
  }

  return { articles: accepted, blocked };
}
