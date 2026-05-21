import { detectTruncationArtifacts } from './truncation-detector.mjs';

export const FULL_ARTICLE_SOURCE_MIN_CHARS = 280;

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
];

function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function analyzeSourceTextCompleteness(article = {}) {
  const sourceText = compact(article.articleText || article.contentText || article.fullArticleText || '');
  const rawText = compact(article.rawText || sourceText);
  const truncation = detectTruncationArtifacts(sourceText);
  const boilerplateMatches = SOURCE_BOILERPLATE_PATTERNS
    .filter((pattern) => pattern.test(rawText))
    .map((pattern) => pattern.source);
  const sourceEvidenceLength = sourceText.length;
  const reasons = [];

  if (sourceEvidenceLength < FULL_ARTICLE_SOURCE_MIN_CHARS) {
    reasons.push(`source_evidence_length_below_${FULL_ARTICLE_SOURCE_MIN_CHARS}`);
  }
  if (!truncation.ok) {
    reasons.push(...truncation.artifacts);
  }
  if (boilerplateMatches.length >= 2) {
    reasons.push('source_boilerplate_detected');
  }

  return {
    ok: reasons.length === 0,
    source_evidence_length: sourceEvidenceLength,
    truncation,
    boilerplate_matches: boilerplateMatches,
    reasons,
  };
}

export function sourceTextCompleteForFullArticle(article = {}) {
  return analyzeSourceTextCompleteness(article).ok;
}
