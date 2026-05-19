import { detectBoilerplate } from './boilerplate-detector.mjs';
import { detectTruncationArtifacts, sentenceCompletionScore } from './truncation-detector.mjs';

export const PUBLIC_ARTICLE_SOURCE_MIN_CHARS = 500;
export const FULL_ARTICLE_SOURCE_MIN_CHARS = 1200;

export const SOURCE_BOILERPLATE_PATTERNS = [
  /\bcookie(?:s)?\b/i,
  /\bsubscribe\b/i,
  /\badvertisement\b/i,
  /\bprivacy policy\b/i,
  /\bterms of use\b/i,
  /\ball rights reserved\b/i,
  /\bsite feedback\b/i,
  /\btake our survey\b/i,
  /\bsign up\b/i,
  /\bnewsletter\b/i,
  /\bmost popular\b/i,
  /\brelated articles?\b/i,
  /\bshare this article\b/i,
  /\bauthor bio\b/i,
  /\bcopyright\b/i,
  /\bowned and operated by\b/i,
  /\binforma techtarget\b/i,
  /\bcontact us\b/i,
  /\bgift this article\b/i,
  /\blinkedin\b/i,
  /\bfacebook\b/i,
  /\babout the author\b/i,
  /\bmore from this author\b/i,
  /\brecommended for you\b/i,
  /\bcontinue reading\b/i,
  /\bdownload our app\b/i,
  /\bregister now\b/i,
  /\bjoin our community\b/i,
  /\ball trademarks\b/i,
  /\b©\s?\d{4}\b/i,
];

function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function analyzeSourceTextCompleteness(article = {}) {
  const sourceText = compact(article.articleText || article.contentText || article.fullArticleText || '');
  const rawText = compact(article.rawText || sourceText);
  const boilerplate = detectBoilerplate(rawText || sourceText);
  const cleanedSourceText = compact(boilerplate.cleaned_text || sourceText);
  const truncation = detectTruncationArtifacts(sourceText);
  const cleanedTruncation = detectTruncationArtifacts(cleanedSourceText);
  const completionScore = sentenceCompletionScore(cleanedSourceText || sourceText);
  const boilerplateMatches = SOURCE_BOILERPLATE_PATTERNS
    .filter((pattern) => pattern.test(rawText))
    .map((pattern) => pattern.source);
  const sourceEvidenceLength = cleanedSourceText.length;
  const reasons = [];

  if (sourceEvidenceLength < PUBLIC_ARTICLE_SOURCE_MIN_CHARS) {
    reasons.push(`source_evidence_length_below_${PUBLIC_ARTICLE_SOURCE_MIN_CHARS}`);
  }
  if (sourceEvidenceLength < FULL_ARTICLE_SOURCE_MIN_CHARS) {
    reasons.push(`source_evidence_length_below_${FULL_ARTICLE_SOURCE_MIN_CHARS}`);
  }
  if (!truncation.ok) {
    reasons.push(...truncation.artifacts);
  }
  if (!cleanedTruncation.ok) {
    reasons.push(...cleanedTruncation.artifacts);
  }
  if (boilerplateMatches.length >= 2 || boilerplate.boilerplate_ratio > 0.08) {
    reasons.push('source_boilerplate_detected');
  }
  if (boilerplate.copyright_footer_detected) {
    reasons.push('copyright_footer_detected');
  }
  if (boilerplate.nav_or_cta_detected && sourceEvidenceLength < FULL_ARTICLE_SOURCE_MIN_CHARS) {
    reasons.push('nav_or_cta_detected_with_weak_evidence');
  }
  if (completionScore < 0.92) {
    reasons.push(`sentence_completion_score_below_0.92:${completionScore}`);
  }

  return {
    ok: reasons.length === 0,
    source_evidence_length: sourceEvidenceLength,
    cleaned_source_text: cleanedSourceText,
    sentence_completion_score: completionScore,
    truncation,
    cleaned_truncation: cleanedTruncation,
    boilerplate_matches: [...new Set([...boilerplateMatches, ...boilerplate.boilerplate_matches])],
    boilerplate,
    reasons,
  };
}

export function sourceTextCompleteForFullArticle(article = {}) {
  return analyzeSourceTextCompleteness(article).ok;
}
