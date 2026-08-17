// Quality contract for The Current — the authored analyst column.
//
// Columns bypass the source-extraction gates (they are original essays, not
// extracted articles), so this policy must be at least as rigorous as the
// composite gate that governs source-derived longform. Every check reuses an
// existing guard module where one exists. There is deliberately no fallback:
// a column that fails here is not published.
import { bannedPhraseMatches } from './banned-phrases.mjs';
import { guardPublicCopy } from './copy-quality-guard.mjs';
import { guardPublicTemplatePhrases } from './public-template-phrase-guard.mjs';
import { hasInternalPublicLanguage } from './internal-language-guard.mjs';
import { containsTemplateLanguage } from './editorial-humanizer.mjs';
import { detectTruncationArtifacts } from './truncation-detector.mjs';
import { copyrightSafeCopyGuard } from './copyright-safe-copy-guard.mjs';
import { sourceSummaryRatio } from './source-summary-ratio.mjs';
import { humanStyleScore } from './human-style-score.mjs';
import { insightDensityScore } from './insight-density-score.mjs';
import { unsupportedClaimGuard } from './unsupported-claim-guard.mjs';
import { analyzeArticleRepetition } from './repetition-detector.mjs';
import {
  headingSequence,
  paragraphCount,
  visibleBodyText,
  wordCount,
} from './visible-body-length.mjs';

export const AUTHORED_GENERATION_VERSION = 'authored_column_v1';
export const AUTHORED_COLUMN_TIER = 'authored_column';
// Note: the site-wide heading heuristic (visible-body-length isHeading) does
// not admit apostrophes, so the closing heading must stay apostrophe-free.
export const WATCHLIST_HEADING = 'On My Watchlist';

const COUNTERARGUMENT_HEADING_PATTERN = /(wrong|bear case|against|other side|pushback|counter)/i;

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function tokensOf(text = '') {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 3)
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
}

export function isAuthoredColumn(record = {}) {
  return record?.content_origin === 'authored'
    || record?.generation_version === AUTHORED_GENERATION_VERSION
    || record?.public_content_tier === AUTHORED_COLUMN_TIER;
}

export function authoredColumnPublicEligible(record = {}) {
  return isAuthoredColumn(record)
    && Boolean(record.slug)
    && Boolean(record.title)
    && Boolean(record.expertLensFull?.finalArticleBody)
    && record.draft !== true
    && record.public_status !== 'hidden'
    && record.public_status !== 'draft'
    && record.noindex !== true
    && record.seo_noindex !== true
    && record.authored_quality?.ok === true;
}

export function authoredColumnQualityResult({
  body = '',
  title = '',
  deck = '',
  summary = '',
  thesis = '',
  ledgerClaims = [],
  sourceText = '',
  recentRecords = [],
  recentTheses = [],
} = {}) {
  const reasons = [];
  const visible = visibleBodyText(body);
  const words = wordCount(body);
  const headings = headingSequence(body);
  const paragraphs = paragraphCount(body);

  const minChars = envNumber('AUTHORED_MIN_CHARS', 4500);
  const maxChars = envNumber('AUTHORED_MAX_CHARS', 16000);
  const minWords = envNumber('AUTHORED_MIN_WORDS', 1000);
  const maxWords = envNumber('AUTHORED_MAX_WORDS', 2200);
  const minHumanStyle = envNumber('AUTHORED_MIN_HUMAN_STYLE', 0.84);
  const minInsightDensity = envNumber('AUTHORED_MIN_INSIGHT_DENSITY', 0.78);

  // 1. Length
  if (visible.length < minChars) reasons.push(`body_below_${minChars}_chars`);
  if (visible.length > maxChars) reasons.push(`body_above_${maxChars}_chars`);
  if (words < minWords) reasons.push(`words_below_${minWords}`);
  if (words > maxWords) reasons.push(`words_above_${maxWords}`);

  // 2. Structure
  if (paragraphs < 6) reasons.push('fewer_than_6_paragraphs');
  if (headings.length < 4) reasons.push('fewer_than_4_sections');
  if (headings.length > 7) reasons.push('more_than_7_sections');
  const hasWatchlist = headings.some((heading) => heading.toLowerCase() === WATCHLIST_HEADING.toLowerCase());
  if (!hasWatchlist) reasons.push('missing_watchlist_section');
  const hasCounterargument = headings.some((heading) => COUNTERARGUMENT_HEADING_PATTERN.test(heading));
  if (!hasCounterargument) reasons.push('missing_counterargument_section');

  // 3-5. Language guards (banned phrases, public copy, template language)
  const fullText = [title, deck, summary, body].filter(Boolean).join('\n\n');
  const banned = bannedPhraseMatches(fullText);
  if (banned.length) reasons.push(`banned_phrases:${banned.slice(0, 3).join('|')}`);
  const copyGuard = guardPublicCopy(body);
  if (!copyGuard.ok) reasons.push(...copyGuard.reasons.slice(0, 3));
  const templateGuard = guardPublicTemplatePhrases(fullText);
  if (!templateGuard.ok) reasons.push(...templateGuard.reasons.slice(0, 3));
  if (hasInternalPublicLanguage(fullText)) reasons.push('internal_language_detected');
  if (containsTemplateLanguage(body)) reasons.push('template_language_detected');

  // 6. Truncation artifacts — columns must not contain ellipses at all.
  const truncation = detectTruncationArtifacts(body);
  if (!truncation.ok) reasons.push(...truncation.artifacts.slice(0, 3));

  // 7. Numeric claims must be backed by the source-derived ledger. The
  // offending figures ride along in the reason so the retry pass knows
  // exactly which numbers to remove.
  const claims = unsupportedClaimGuard(body, ledgerClaims);
  if (!claims.ok) {
    const offenders = (claims.unsupportedNumbers || []).slice(0, 5).map((claim) => claim.raw).join(',');
    reasons.push(offenders ? `unsupported_numeric_claims:${offenders}` : 'unsupported_numeric_claims');
  }

  // 8-9. Copyright shingle overlap + summary ratio against source texts.
  const copyright = copyrightSafeCopyGuard({ generatedText: body, sourceText });
  if (!copyright.ok) reasons.push(...copyright.reasons.slice(0, 2));
  const summaryRatio = sourceSummaryRatio(body, sourceText).source_summary_ratio;
  if (summaryRatio > 0.35) reasons.push('source_summary_ratio_above_0.35');

  // 10-11. Style scores (both helpers return { score, reasons } objects).
  const humanStyle = Number(humanStyleScore(body)?.human_style_score ?? 0);
  if (humanStyle < minHumanStyle) reasons.push(`human_style_below_${minHumanStyle}`);
  const insightDensity = Number(insightDensityScore(body)?.insight_density_score ?? 0);
  if (insightDensity < minInsightDensity) reasons.push(`insight_density_below_${minInsightDensity}`);

  // 12. Repetition versus recent columns and recent wire articles.
  const repetition = analyzeArticleRepetition(
    { id: 'authored-candidate', title, expertLensFull: { finalArticleBody: body } },
    recentRecords
  );
  if (repetition.blocked) reasons.push(...repetition.reasons.slice(0, 3));

  // 13. Headline / deck / summary windows.
  if (!title || title.length < 20 || title.length > 110) reasons.push('title_length_out_of_range');
  if (!deck || deck.length < 60 || deck.length > 260) reasons.push('deck_length_out_of_range');
  if (summary && summary.length > 170) reasons.push('summary_above_170_chars');

  // 14. Thesis novelty versus recent column theses.
  const thesisTokens = tokensOf(thesis);
  const maxThesisOverlap = recentTheses.reduce(
    (max, prior) => Math.max(max, jaccard(thesisTokens, tokensOf(prior))),
    0
  );
  if (thesis && maxThesisOverlap > 0.7) reasons.push('thesis_repeats_recent_column');

  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    metrics: {
      chars: visible.length,
      words,
      sections: headings.length,
      paragraphs,
      human_style_score: humanStyle,
      insight_density_score: insightDensity,
      source_summary_ratio: Number(summaryRatio.toFixed(3)),
      copyright_overlap_score: copyright.overlap_score ?? 0,
      unsupported_claim_count: claims.unsupportedNumbers?.length ?? 0,
      banned_phrase_count: banned.length,
      repeated_sentence_ratio: Number((repetition.repeated_sentence_ratio ?? 0).toFixed(3)),
      heading_sequence_similarity: Number((repetition.heading_sequence_similarity ?? 0).toFixed(3)),
      conclusion_similarity: Number((repetition.conclusion_similarity ?? 0).toFixed(3)),
      thesis_overlap: Number(maxThesisOverlap.toFixed(3)),
    },
  };
}
