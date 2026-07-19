import { generateEditorialMetadata } from './content.mjs';
import { attachExpertLensStrict } from './expert-lens.mjs';
import { publicSurfaceDecision } from './public-surface-eligibility.mjs';
import { splitByRepetitionGate } from './repetition-detector.mjs';
import { sourceFidelityCheck } from './source-fidelity-check.mjs';
import {
  checkClaimsAgainstEvidence,
  seoMetadataClaimsSupported,
} from './source-fidelity-claim-check.mjs';

async function withTimeout(label, fn, timeoutMs) {
  let timeoutId;
  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function generateEditorialCandidate(article, recentBlueprintIds = [], dependencies = {}) {
  const generateMetadata = dependencies.generateMetadata || generateEditorialMetadata;
  const attachLens = dependencies.attachLens || attachExpertLensStrict;
  if (article.evidence_pack?.ok !== true || article.evidence_pack?.origin !== 'extraction_only') {
    throw Object.assign(new Error('source evidence pack is missing or invalid'), {
      code: 'editorial_generation_invalid',
    });
  }
  const frozenEvidencePack = structuredClone(article.evidence_pack);
  const metadata = await generateMetadata(article);
  if (!metadata.ok) {
    throw Object.assign(new Error(metadata.error.code), metadata.error, { retryable: metadata.retryable });
  }
  const draftInput = dependencies.transformDraftInput
    ? await dependencies.transformDraftInput(metadata.article)
    : metadata.article;
  const [draft] = await withTimeout(
    `generate editorial draft ${article.id}`,
    () => attachLens([draftInput], { recentBlueprintIds }),
    90_000,
  );
  return { ...draft, evidence_pack: frozenEvidencePack };
}

export function reviewCandidateFidelity(article) {
  const body = article.expertLensFull?.finalArticleBody || '';
  const evidence = article.evidence_pack;
  if (evidence?.ok !== true || evidence?.origin !== 'extraction_only') {
    return {
      ok: false,
      source: { ok: false, unsupported: ['missing_extraction_evidence_pack'] },
      claims: { ok: false, totalClaims: 0, unsupportedClaims: ['missing_extraction_evidence_pack'] },
      seo: { ok: false, totalClaims: 0, unsupportedClaims: ['missing_extraction_evidence_pack'] },
    };
  }
  const source = sourceFidelityCheck(article, evidence, body);
  const claims = checkClaimsAgainstEvidence(body, evidence);
  const seo = seoMetadataClaimsSupported(article, evidence);
  const ok = source.ok === true
    && claims.ok === true
    && (claims.unsupportedClaims?.length || 0) === 0
    && seo.ok === true;
  return { ok, source, claims, seo };
}

export function reviewGeneratedCandidate(article = {}, recentRecords = []) {
  const fidelity = reviewCandidateFidelity(article);
  const reviewed = {
    ...article,
    source_fidelity: fidelity.source,
    claim_fidelity: fidelity.claims,
    seo_fidelity: fidelity.seo,
  };
  if (!fidelity.ok) {
    return { ok: false, code: 'source_fidelity_failed', article: reviewed };
  }
  const { passed, blocked } = splitByRepetitionGate([reviewed], recentRecords);
  if (!passed.length) {
    return {
      ok: false,
      code: 'repetition_gate_failed',
      article: blocked[0] || reviewed,
    };
  }
  const decision = publicSurfaceDecision(passed[0]);
  const publiclyReviewed = {
    ...passed[0],
    public_eligibility: {
      detailPage: decision.detailPage,
      homepage: decision.homepage,
      archive: decision.archive,
      rss: decision.rss,
      sourceRelevant: decision.sourceRelevant,
    },
  };
  if (!decision.detailPage) {
    return { ok: false, code: 'public_longform_ineligible', article: publiclyReviewed };
  }
  return { ok: true, article: publiclyReviewed };
}
