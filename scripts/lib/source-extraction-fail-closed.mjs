import { detectBoilerplate } from './boilerplate-detector.mjs';
import { analyzeSourceTextCompleteness } from './source-text-completeness.mjs';
import { detectTruncationArtifacts, sentenceCompletionScore } from './truncation-detector.mjs';
import { createExtractionArtifact } from './extraction-artifact.mjs';

export const PUBLIC_ARTICLE_MIN_CLEAN_CHARS = 500;
export const LONGFORM_MIN_CLEAN_CHARS = 1200;

function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function analyzeSourceExtractionFailClosed(article = {}) {
  const rawText = compact(article.rawText || article.articleText || article.contentText || article.fullArticleText || article.summary || article.snippet || '');
  const boilerplate = detectBoilerplate(rawText);
  const cleaned_source_text = compact(boilerplate.cleaned_text || rawText);
  const truncation = detectTruncationArtifacts(cleaned_source_text || rawText);
  const sourceCompleteness = analyzeSourceTextCompleteness({
    ...article,
    articleText: cleaned_source_text || rawText,
    rawText,
  });
  const completion = sentenceCompletionScore(cleaned_source_text || rawText);
  const reasons = [];

  if (boilerplate.boilerplate_ratio > 0.08) reasons.push('boilerplate_ratio_above_0.08');
  if (boilerplate.copyright_footer_detected) reasons.push('copyright_footer_detected');
  if (boilerplate.nav_or_cta_detected && cleaned_source_text.length < LONGFORM_MIN_CLEAN_CHARS) {
    reasons.push('nav_or_cta_detected_with_weak_evidence');
  }
  if (!truncation.ok) reasons.push(...truncation.artifacts);
  if (completion < 0.92) reasons.push(`sentence_completion_score_below_0.92:${completion}`);
  if (cleaned_source_text.length < PUBLIC_ARTICLE_MIN_CLEAN_CHARS) {
    reasons.push(`cleaned_source_text_below_${PUBLIC_ARTICLE_MIN_CLEAN_CHARS}`);
  }
  if (cleaned_source_text.length < LONGFORM_MIN_CLEAN_CHARS) {
    reasons.push(`cleaned_source_text_below_${LONGFORM_MIN_CLEAN_CHARS}`);
  }
  if (!sourceCompleteness.ok) reasons.push(...sourceCompleteness.reasons);

  const uniqueReasons = [...new Set(reasons)];
  const canPublishLocalArticle = cleaned_source_text.length >= PUBLIC_ARTICLE_MIN_CLEAN_CHARS
    && !boilerplate.copyright_footer_detected
    && boilerplate.boilerplate_ratio <= 0.08
    && truncation.ok
    && completion >= 0.92;
  const canGenerateLongform = canPublishLocalArticle && cleaned_source_text.length >= LONGFORM_MIN_CLEAN_CHARS;

  const extraction_qa = {
    public_publishable: canPublishLocalArticle,
    can_generate_longform: canGenerateLongform,
    cleaned_source_length: cleaned_source_text.length,
    boilerplate_ratio: boilerplate.boilerplate_ratio,
    copyright_footer_detected: boilerplate.copyright_footer_detected,
    nav_or_cta_detected: boilerplate.nav_or_cta_detected,
    sentence_completion_score: completion,
    block_reasons: uniqueReasons,
  };

  return {
    ok: canGenerateLongform,
    can_publish_local_article: canPublishLocalArticle,
    can_generate_longform: canGenerateLongform,
    cleaned_source_text,
    cleaned_source_length: cleaned_source_text.length,
    boilerplate,
    truncation,
    sentence_completion_score: completion,
    source_completeness: sourceCompleteness,
    reasons: uniqueReasons,
    extraction_qa,
    extraction_artifact: createExtractionArtifact({
      sourceUrl: article.sourceUrl || article.url,
      cleanedExtractedText: cleaned_source_text,
      extractionQa: extraction_qa,
    }),
  };
}

export function sourceExtractionPassesPublicGate(article = {}) {
  const analysis = analyzeSourceExtractionFailClosed(article);
  return {
    ...analysis,
    ok: analysis.can_publish_local_article,
    block_reasons: analysis.can_publish_local_article ? [] : analysis.reasons,
  };
}

export function sourceExtractionPassesLongformGate(article = {}) {
  const analysis = analyzeSourceExtractionFailClosed(article);
  return {
    ...analysis,
    ok: analysis.can_generate_longform,
    block_reasons: analysis.can_generate_longform ? [] : analysis.reasons,
  };
}
