import { buildSourceEvidencePack } from './evidence-pack-builder.mjs';
import { blueprintHistoryFromRecords } from './expert-lens.mjs';
import {
  generateEditorialCandidate,
  reviewGeneratedCandidate,
} from './editorial-candidate-lifecycle.mjs';

const MAX_EDITORIAL_DIRECTION_LENGTH = 2_000;

function text(value) {
  return String(value ?? '').trim();
}

function regenerationError(message, code, details = []) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function editorialDirection(value) {
  return text(value).slice(0, MAX_EDITORIAL_DIRECTION_LENGTH);
}

function generationPatch(article = {}, type) {
  const full = article.expertLensFull || {};
  const common = {
    summary: text(full.metaDescription || article.summary),
    dek: text(full.metaDescription || article.deck || article.summary),
    expertLensShort: text(article.expertLensShort),
    source_fidelity: article.source_fidelity,
    claim_fidelity: article.claim_fidelity,
    seo_fidelity: article.seo_fidelity,
    repetition_check: article.repetition_check,
    repetition_blocked: article.repetition_blocked,
    repetition_block_reasons: article.repetition_block_reasons,
    public_eligibility: article.public_eligibility,
    generation_version: article.generation_version,
    narrative_dna: article.narrative_dna,
    dynamic_brief_label: article.dynamic_brief_label,
    article_blueprint: article.article_blueprint,
    articleBlueprint: article.articleBlueprint,
  };
  if (type === 'brief') return common;
  return {
    ...common,
    title: text(full.finalHeadline || article.title),
    bodyMarkdown: text(full.finalArticleBody),
    expertLensFull: full,
  };
}

function persistedBody(article = {}) {
  return text(
    article.expertLensFull?.finalArticleBody
      || article.bodyMarkdown
      || article.fullArticleText
      || article.articleText
      || article.contentText
      || article.snippet,
  );
}

function briefCandidateForReview(original = {}, generated = {}) {
  const generatedFull = generated.expertLensFull || {};
  const originalFull = original.expertLensFull || {};
  const short = text(generated.expertLensShort);
  const summary = text(generatedFull.metaDescription || generated.summary);
  return {
    ...generated,
    title: text(original.title),
    summary,
    deck: summary,
    expertLensShort: short,
    expertLens: short,
    expertLensFull: {
      ...generatedFull,
      ...originalFull,
      finalHeadline: text(originalFull.finalHeadline || original.title),
      finalArticleBody: persistedBody(original),
      metaDescription: summary,
      thesis: short,
    },
  };
}

export async function regenerateAdminEditorial({
  article = {},
  type = 'article',
  prompt = '',
  recentArticles = [],
  dependencies = {},
} = {}) {
  if (!['article', 'brief'].includes(type)) {
    throw regenerationError('unsupported editorial regeneration type', 'invalid_regeneration_type');
  }
  const buildEvidence = dependencies.buildEvidence || buildSourceEvidencePack;
  const generate = dependencies.generate || generateEditorialCandidate;
  const review = dependencies.review || reviewGeneratedCandidate;
  const evidencePack = buildEvidence(article);
  if (!evidencePack.ok || evidencePack.origin !== 'extraction_only') {
    throw regenerationError(
      'source evidence is insufficient for editorial regeneration',
      'editorial_regeneration_source_blocked',
      evidencePack.blockReasons,
    );
  }
  const otherArticles = recentArticles.filter((record) => record?.id && record.id !== article.id);
  const candidate = await generate({
    ...article,
    evidence_pack: evidencePack,
    adminEditorialDirection: editorialDirection(prompt),
  }, blueprintHistoryFromRecords(otherArticles), { generateImage: false });
  const reviewCandidate = type === 'brief' ? briefCandidateForReview(article, candidate) : candidate;
  const reviewed = review(reviewCandidate, otherArticles);
  if (!reviewed.ok) {
    throw regenerationError(
      'generated editorial copy failed the canonical quality gates',
      'editorial_regeneration_quality_failed',
      [reviewed.code],
    );
  }
  return generationPatch(reviewed.article, type);
}
