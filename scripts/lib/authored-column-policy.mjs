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
// Headings that earlier engine versions mandated verbatim. They read as an
// AI template when repeated across columns, so they are now banned outright;
// every column must invent its own section headings.
export const LEGACY_TEMPLATE_HEADINGS = [
  'on my watchlist',
  'where i could be wrong',
  "what i'm watching",
  'what im watching',
];
const HEADING_REUSE_JACCARD = 0.75;
const LEAD_REUSE_JACCARD = 0.7;
export const RECENT_HEADING_WINDOW = 15;

function normalizedHeading(heading = '') {
  return String(heading || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function recentHeadingsFromColumns(columns = [], limit = RECENT_HEADING_WINDOW) {
  return columns
    .slice(0, limit)
    .flatMap((column) => headingSequence(column?.expertLensFull?.finalArticleBody || ''));
}

export function recentLeadsFromColumns(columns = [], limit = RECENT_HEADING_WINDOW) {
  return columns
    .slice(0, limit)
    .map((column) => firstSentenceOf(column?.expertLensFull?.finalArticleBody || ''))
    .filter(Boolean);
}

function firstSentenceOf(body = '') {
  const headings = new Set(headingSequence(body));
  const firstParagraph = String(body || '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .find((block) => block && !headings.has(block));
  if (!firstParagraph) return '';
  return (firstParagraph.split(/(?<=[.!?])\s+/)[0] || '').trim();
}

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
  recentHeadings = [],
  recentLeads = [],
  figures = null,
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

  // 2b. Structural freshness — headings and the lead must not echo recent
  // columns. Repeated scaffolding is what makes a column read machine-made.
  const legacyHits = headings.filter((heading) => LEGACY_TEMPLATE_HEADINGS.includes(normalizedHeading(heading)));
  if (legacyHits.length) reasons.push(`legacy_template_heading:${legacyHits.slice(0, 2).join('|')}`);
  const priorHeadings = recentHeadings.map((heading) => ({
    normalized: normalizedHeading(heading),
    tokens: tokensOf(heading),
  }));
  let headingReuseMax = 0;
  const reusedHeadings = headings.filter((heading) => {
    const normalized = normalizedHeading(heading);
    const tokens = tokensOf(heading);
    return priorHeadings.some((prior) => {
      const overlap = prior.normalized === normalized ? 1 : jaccard(tokens, prior.tokens);
      headingReuseMax = Math.max(headingReuseMax, overlap);
      return overlap >= HEADING_REUSE_JACCARD;
    });
  });
  if (reusedHeadings.length) reasons.push(`heading_reused_recently:${reusedHeadings.slice(0, 2).join('|')}`);
  const lead = firstSentenceOf(body);
  const leadTokens = tokensOf(lead);
  const leadReuseMax = recentLeads.reduce(
    (max, prior) => Math.max(max, jaccard(leadTokens, tokensOf(prior))),
    0
  );
  if (lead && leadReuseMax >= LEAD_REUSE_JACCARD) reasons.push('lead_repeats_recent_column');

  // 2c. Figures — every column ships 1-3 evidence-backed visual elements.
  // `null` means the caller manages figures elsewhere (legacy call sites).
  if (Array.isArray(figures)) {
    if (figures.length < 1) reasons.push('figures_missing');
    if (figures.length > 3) reasons.push('figures_excess');
    const figureTitleText = figures.map((figure) => figure?.title || '').join('\n');
    const figureBanned = bannedPhraseMatches(figureTitleText);
    if (figureBanned.length) reasons.push(`figure_title_banned_phrase:${figureBanned[0]}`);
  }

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
      heading_reuse_max: Number(headingReuseMax.toFixed(3)),
      lead_reuse_max: Number(leadReuseMax.toFixed(3)),
      figure_count: Array.isArray(figures) ? figures.length : 0,
    },
  };
}
