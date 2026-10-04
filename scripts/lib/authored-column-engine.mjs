// The Current — authored column engine.
//
// Selects the single most consequential story of the run window and writes an
// opinionated first-person essay under the persona charter, grounded in the
// evidence pack of the source articles. Three LLM passes (thesis, draft,
// voice) followed by a deterministic verification gate. There is no fallback
// path in this module by design: if generation or verification fails, the run
// publishes no column and records why.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUTHORED_COLUMN_ENABLED,
  AUTHORED_COLUMN_MIN_GAP_HOURS,
  AUTHORED_COLUMN_MODEL,
  AUTHORED_COLUMNS_PER_DAY,
  PIPELINE_OFFLINE,
} from './constants.mjs';
import { callOpenRouterText } from './openrouter.mjs';
import { LlmBudgetExceededError, llmUsageSummary } from './llm-budget.mjs';
import { buildEvidencePack } from './evidence-pack-builder.mjs';
import { findCorroboratingSources } from './multi-source-corroboration.mjs';
import { buildClaimLedger } from './claim-ledger.mjs';
import { safeJsonParse, slugify, stableArticleId, truncate } from './normalize.mjs';
import { BANNED_PHRASES, BLOCKED_HOOK_STARTS } from './banned-phrases.mjs';
import {
  AUTHORED_COLUMN_TIER,
  AUTHORED_GENERATION_VERSION,
  authoredColumnQualityResult,
  recentHeadingsFromColumns,
  recentLeadsFromColumns,
} from './authored-column-policy.mjs';
import { isHeading, headingSequence } from './visible-body-length.mjs';
import { buildColumnFigures } from './authored-column-figures.mjs';
import { classifyAiTopicRelevance } from './relevance-classifier.mjs';
import { extractExpertInsight } from './expert-insight-engine.mjs';
import { abstractOnlyTextScope, sourceUsageDecision } from './source-registry.mjs';
import { sourceExtractionPassesLongformGate } from './source-extraction-fail-closed.mjs';
import { validateExtractionArtifact } from './extraction-artifact.mjs';
import { COLUMN_COVERAGE_BEATS, columnCoverageBeat, recentColumnCoverage } from './column-coverage.mjs';
import { googleReleaseNoteTarget } from './google-cloud-release-notes.mjs';

const CHARTER_RELATIVE_PATH = 'config/editorial/persona-charter.json';
const STORY_KEY_WINDOW_HOURS = 72;
// Either lane at 0.75 or above anchors a column on relevance alone. Between
// the relaxed floor (0.6) and 0.75 the source itself must name the compute
// side (data centers, AI, cloud, chips, large loads): a generic power or
// policy story is never forced into a data-center frame. Extraction, rights,
// evidence, numeric provenance, repetition and source-fidelity gates are
// unchanged.
export const MIN_STORY_RELEVANCE = numberFromEnv('AUTHORED_COLUMN_MIN_RELEVANCE', 0.6);
export const STRONG_STORY_RELEVANCE = 0.75;
const COMPUTE_ANCHOR_PATTERN = /\b(?:data[- ]?cent(?:er|re)s?|hyperscal\w*|colocation|large[- ]loads?|artificial intelligence|machine learning|generative ai|gpus?|accelerators?|semiconductors?|chips?|chipmakers?|cloud|compute|computing|servers?|inference|supercomput\w*|hpc|llms?|foundation models?|frontier models?)\b/i;
const AI_TOKEN_PATTERN = /\bAI\b/;

export function computeAnchored(article = {}) {
  const text = `${article.title || ''}\n${columnSourceText(article)}`;
  return COMPUTE_ANCHOR_PATTERN.test(text) || AI_TOKEN_PATTERN.test(text);
}

export function columnRelevanceQualifies(article = {}) {
  const relevance = columnStoryRelevance(article);
  if (relevance >= STRONG_STORY_RELEVANCE) return true;
  return relevance >= MIN_STORY_RELEVANCE && computeAnchored(article);
}
// When generation or verification rejects the top story, the run tries the
// next-ranked qualifying story instead of publishing nothing.
const MAX_STORY_ATTEMPTS_PER_RUN = Math.max(1, Math.floor(numberFromEnv('AUTHORED_COLUMN_MAX_STORY_ATTEMPTS', 2)));
// A column argues a current development. A record older than this (by its own
// publication or restoration date) may carry figures that are years old, so it
// can corroborate but cannot anchor a column.
export const MAX_ANCHOR_AGE_DAYS = numberFromEnv('AUTHORED_COLUMN_MAX_ANCHOR_AGE_DAYS', 21);
// A full attempt (thesis, draft, up to two revisions) takes about two to four
// minutes of model time.
const MIN_ATTEMPT_TIME_MS = 240_000;
const POLICY_ACTOR_PATTERN = /\b(?:commission|department|agency|authority|administration|ministry|parliament|congress|regulator|council|government|bureau|office)\b/i;
const POLICY_CONTEXT_PATTERN = /\b(?:policy|regulation|regulatory|government|permitting|siting)\b/i;
const SELECTION_REJECTION_KEYS = [
  'invalid_identity',
  'text_rights_unauthorized',
  'abstract_only',
  'extraction_ineligible',
  'expert_insight_incomplete',
  'relevance_below_threshold',
  'already_covered',
  'stale_story',
  'digest_roundup',
  'unclean_evidence',
  'insufficient_facts',
];

// A column can argue either lane: an infrastructure story or an AI story
// (frontier models, labs, policy, security, compute demand) read through
// the desk's infrastructure lens. The floor applies to whichever lane the
// story is strongest in.
function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function columnStoryRelevance(article = {}) {
  const infrastructure = Number(article.infrastructure_relevance_score || 0);
  const aiTopic = Number.isFinite(Number(article.ai_topic_score))
    ? Number(article.ai_topic_score)
    : classifyAiTopicRelevance(article).ai_topic_score;
  return Math.max(infrastructure, aiTopic);
}
export const MIN_STORY_FACTS = numberFromEnv('AUTHORED_COLUMN_MIN_FACTS', 3);

// An abstract-only source (arXiv: CC0 metadata, never the e-print) is capped
// at the signal-card lane on the wire; it cannot anchor a column either. It may
// still corroborate a column whose primary source is a full document. Legacy
// records predate the stamped field, so the registry row is consulted too.
export function abstractOnlySource(article = {}, sources = []) {
  return abstractOnlyTextScope(article, sources);
}

function columnSourceText(article = {}) {
  return article.extraction_artifact?.cleaned_extracted_text
    || article.cleaned_source_text
    || article.articleText
    || article.contentText
    || '';
}

function strictExtractionQaPasses(qa) {
  return Boolean(qa)
    && typeof qa === 'object'
    && !Array.isArray(qa)
    && qa.public_publishable === true
    && qa.can_generate_longform === true
    && Array.isArray(qa.block_reasons)
    && qa.block_reasons.length === 0;
}

export function columnSourceLongformEligible(article = {}) {
  if (article.extraction_artifact && !validateExtractionArtifact(article.extraction_artifact).ok) return false;
  if (article.extraction_qa?.extraction_failure_reason) return false;
  const qaEntries = [];
  if (Object.hasOwn(article, 'extraction_qa')) qaEntries.push(article.extraction_qa);
  if (article.extraction_artifact && Object.hasOwn(article.extraction_artifact, 'extraction_qa')) {
    qaEntries.push(article.extraction_artifact.extraction_qa);
  }
  if (!qaEntries.length || !qaEntries.every(strictExtractionQaPasses)) return false;
  return sourceExtractionPassesLongformGate({
    ...article,
    rawText: columnSourceText(article),
  }).ok;
}

function articleExpertInsight(article = {}) {
  return article.expert_insight || article.expertInsight || {};
}

function buildColumnEvidencePack(article = {}) {
  return buildEvidencePack({
    ...article,
    cleaned_source_text: columnSourceText(article),
    source_evidence_text: '',
    articleText: '',
    contentText: '',
    fullArticleText: '',
    summary: '',
    snippet: '',
  });
}

function namedPolicyActor(article = {}, evidencePack = {}) {
  const policyContext = [
    article.article_type,
    article.primary_category,
    article.secondary_category,
    article.category,
    article.infrastructure_layer,
  ].filter(Boolean).join(' ');
  if (!POLICY_CONTEXT_PATTERN.test(policyContext)) return '';

  const evidenceText = String(evidencePack.evidenceText || columnSourceText(article));
  const candidates = [article.source, ...(evidencePack.namedActors || [])]
    .map((value) => String(value || '').trim())
    .filter((value) => value.length >= 6 && POLICY_ACTOR_PATTERN.test(value));
  return candidates.find((actor) => actor === article.source || evidenceText.toLowerCase().includes(actor.toLowerCase())) || '';
}

// The column's own evidence pack enforces the fact floor, and a policy,
// market or system story can be argued without a named company. Those two
// heuristic fields therefore never block a column on their own. The
// substantive fields (infrastructure layer, bottleneck, leverage, execution
// risk, timing, counterargument, next signal) still must be present, so every
// column keeps a concrete bottleneck or decision point to argue. A record
// enriched before the insight engine existed is assessed from its saved text.
const NON_BLOCKING_INSIGHT_FIELDS = new Set(['named_companies', 'concrete_facts']);

function columnInsight(article = {}) {
  const insight = articleExpertInsight(article);
  if (insight.expert_insight_complete === true || Array.isArray(insight.expert_insight_missing_fields)) return insight;
  if (article.expert_insight_complete === true || Array.isArray(article.expert_insight_missing_fields)) {
    return {
      ...insight,
      expert_insight_complete: article.expert_insight_complete === true,
      expert_insight_missing_fields: article.expert_insight_missing_fields || [],
    };
  }
  const text = columnSourceText(article);
  return text ? extractExpertInsight({ ...article, cleaned_source_text: text, articleText: text }) : insight;
}

export function authoredInsightEligible(article = {}, evidencePack = buildColumnEvidencePack(article)) {
  const insight = columnInsight(article);
  if (article.expert_insight_complete === true || insight.expert_insight_complete === true) return true;
  const missing = Array.isArray(insight.expert_insight_missing_fields) ? insight.expert_insight_missing_fields : null;
  if (!missing) return false;
  if (missing.every((field) => NON_BLOCKING_INSIGHT_FIELDS.has(field))) return true;
  // Legacy narrow case kept for records whose only gap is the company field.
  return missing.length === 1
    && missing[0] === 'named_companies'
    && Boolean(namedPolicyActor(article, evidencePack));
}

// Resolves from the working directory first (the pipeline, Astro build, and
// CI all run from the repo root); the module-relative path only backs up
// direct Node invocations from elsewhere. Bundled page code must NOT call
// this — pages import the charter JSON statically instead.
export function loadPersonaCharter() {
  const cwdPath = path.join(process.cwd(), CHARTER_RELATIVE_PATH);
  if (fs.existsSync(cwdPath)) {
    return JSON.parse(fs.readFileSync(cwdPath, 'utf8'));
  }
  const modulePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..', CHARTER_RELATIVE_PATH);
  return JSON.parse(fs.readFileSync(modulePath, 'utf8'));
}

// A model sometimes breaks strict JSON with a raw line break or tab inside a
// string value. Escaping control characters inside string literals is
// lossless; any other malformation still fails the parse.
function escapeControlCharactersInStrings(text) {
  let output = '';
  let inString = false;
  let escaped = false;
  for (const character of text) {
    if (!inString) {
      if (character === '"') inString = true;
      output += character;
      continue;
    }
    if (escaped) {
      output += character;
      escaped = false;
    } else if (character === '\\') {
      output += character;
      escaped = true;
    } else if (character === '"') {
      output += character;
      inString = false;
    } else if (character === '\n') {
      output += '\\n';
    } else if (character === '\r') {
      output += '\\r';
    } else if (character === '\t') {
      output += '\\t';
    } else if (character.charCodeAt(0) < 0x20) {
      output += `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;
    } else {
      output += character;
    }
  }
  return output;
}

function parseModelJson(content) {
  const trimmed = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const strict = safeJsonParse(trimmed, null);
  if (strict !== null) return strict;
  return safeJsonParse(escapeControlCharactersInStrings(trimmed), null);
}

// A reply wrapped in one envelope key ({"column": {...}}) or naming the
// headline "title" carries the same essay. Unwrap it without rewriting it.
function unwrapEssayObject(value, depth = 0) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  if (typeof value.headline === 'string' && value.headline.trim()) return value;
  const keys = Object.keys(value);
  const inner = keys.length === 1 ? value[keys[0]] : null;
  if (depth < 2 && inner && typeof inner === 'object' && !Array.isArray(inner)) return unwrapEssayObject(inner, depth + 1);
  if (typeof value.title === 'string' && value.title.trim()) {
    const { title, ...rest } = value;
    return { ...rest, headline: title };
  }
  return value;
}

class EssayStructureError extends Error {}

export function parseModelEssay(content, { recoverFormat = false, requireSections = false } = {}) {
  const essay = unwrapEssayObject(parseModelJson(content));
  if (!essay || typeof essay !== 'object' || Array.isArray(essay)
    || typeof essay.headline !== 'string' || !essay.headline.trim()) {
    throw new EssayStructureError('invalid_structured_essay');
  }
  if (!Object.hasOwn(essay, 'sections')) {
    if (requireSections) throw new EssayStructureError('invalid_structured_sections');
    if (typeof essay.body !== 'string' || !essay.body.trim()) throw new EssayStructureError('invalid_structured_essay');
    return essay;
  }
  const paragraphs = (values, allowEmpty = false) => {
    if (!Array.isArray(values) || (!allowEmpty && !values.length)
      || values.some(value => typeof value !== 'string' || !value.trim() || /[\r\n]/.test(value))) {
      throw new EssayStructureError('invalid_structured_paragraphs');
    }
    return values.map(value => value.trim());
  };
  if (!Array.isArray(essay.sections) || !essay.sections.length) {
    throw new EssayStructureError('invalid_structured_sections');
  }
  const formatIssues = [];
  if (essay.sections.length < 4 || essay.sections.length > 6) {
    if (!recoverFormat) throw new EssayStructureError('invalid_structured_sections');
    formatIssues.push('invalid_structured_sections: Restructure the draft into exactly 4-6 section objects without omitting substantive analysis.');
  }
  const blocks = paragraphs(essay.opening_paragraphs, true);
  for (const [index, section] of essay.sections.entries()) {
    let heading = typeof section?.heading === 'string' ? section.heading.trim() : '';
    if (!heading || /[\r\n]/.test(heading)) throw new EssayStructureError('invalid_structured_heading');
    heading = stripInlineMarkdown(heading.replace(/^#{1,6}\s+/, ''))
      .replace(/[\u2010-\u2015]/g, '-').replace(/\s+/g, ' ').replace(/^[a-z]/, letter => letter.toUpperCase());
    if (!isHeading(heading) || /[<>]/.test(heading)) {
      if (!recoverFormat) throw new EssayStructureError('invalid_structured_heading');
      formatIssues.push(`invalid_structured_heading: Rewrite section ${index + 1}'s heading ${JSON.stringify(heading)}. Start with an uppercase letter or digit, keep it under 87 characters, and use ASCII letters, digits, spaces or &:/+- only. Rephrase apostrophes, quotes and other unsupported punctuation while preserving the meaning.`);
    }
    blocks.push(heading, ...paragraphs(section.paragraphs));
  }
  // Serialize explicit model-written sections; never infer or invent headings
  // from prose. The unchanged final gate still checks section count and quality.
  return {
    headline: essay.headline, deck: essay.deck, body: blocks.join('\n\n'), figures: essay.figures,
    ...(formatIssues.length ? { formatIssues } : {}),
  };
}

function stripInlineMarkdown(line) {
  return line
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,;:!?])/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1');
}

// The site's heading detector only recognizes plain standalone lines, so a
// model that answers in markdown (## headings, **bold** lines, headings glued
// to their paragraph by a single newline) fails the structure gates even when
// the sections exist. This deterministic cleanup converts those formatting
// habits into the expected shape without touching the wording itself.
export function normalizeAuthoredBody(body = '') {
  const lines = String(body || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  for (const rawLine of lines) {
    if (/^\s*```/.test(rawLine)) continue;
    let line = rawLine;
    const markedHeading = line.match(/^\s*#{1,6}\s+(.*)$/);
    if (markedHeading) line = markedHeading[1];
    line = stripInlineMarkdown(line);
    const trimmed = line.trim();
    const candidate = trimmed.replace(/:$/, '');
    if (trimmed && (markedHeading || isHeading(candidate)) && candidate.length <= 86) {
      while (out.length && out[out.length - 1].trim() === '') out.pop();
      if (out.length) out.push('');
      out.push(candidate);
      out.push('');
    } else {
      out.push(line);
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Verification reason codes are compact for state records but cryptic as
// revision instructions. Translate the common ones into directives the voice
// pass can actually act on; unknown codes pass through verbatim.
const FEEDBACK_HINTS = [
  [/^fewer_than_4_sections$|^more_than_7_sections$/, () =>
    'Return 4 to 6 objects in the sections array, each with a heading and substantive paragraph strings. Every heading must be 2-6 words, start with an uppercase letter and contain only ASCII letters, digits and spaces. The publisher renders each heading as a standalone plain-text line with blank lines; do not embed headings inside paragraph strings.'],
  [/^legacy_template_heading(?::(.+))?$/, (match) =>
    `Replace ${match[1] ? `the heading(s) ${match[1]}` : 'the retired template headings'} with headings invented for this specific argument — the phrases "On My Watchlist" and "Where I Could Be Wrong" are permanently retired.`],
  [/^heading_reused_recently(?::(.+))?$/, (match) =>
    `Rewrite ${match[1] ? `these headings: ${match[1]}` : 'the flagged headings'} — they repeat headings from recent columns. Invent fresh phrasings drawn from this column's own argument and evidence.`],
  [/^lead_repeats_recent_column$/, () =>
    'Rewrite the opening sentence with a different device than recent columns used — open on a scene, a specific number, a contradiction, a filing detail, or a deadline instead.'],
  [/^figures_missing$/, () =>
    'The column must carry 1-3 evidence figures; keep the prose intact.'],
  [/^unsupported_numeric_claims(?::(.+))?$/, (match) =>
    `Remove or rewrite around these numbers, which are not in the verified claims${match[1] ? `: ${match[1]}` : ''}. Cite only numbers from verified_claims, keeping the exact value and unit as given — never convert units or aggregate figures.`],
  [/^copied_source_sentence$/, () =>
    'At least one sentence reproduces the source coverage nearly verbatim. Rewrite every sentence in your own words and structure; only short quoted fragments inside quotation marks may repeat source wording.'],
  [/^source_overlap_above_threshold$/, () =>
    'The essay tracks the source text too closely. Restructure the argument and rephrase in your own words so the wording diverges from the coverage.'],
  [/^deck_length_out_of_range$/, () =>
    'Rewrite the deck as a single standfirst sentence between 80 and 240 characters.'],
  [/^title_length_out_of_range$/, () =>
    'Rewrite the headline to between 40 and 105 characters, specific and first-person friendly.'],
  [/^summary_above_170_chars$/, () =>
    'Shorten the deck so its first 170 characters stand alone as a summary.'],
  [/^words_below_(\d+)$/, (match) =>
    `Lengthen the essay to at least ${match[1]} words by deepening the analysis — no padding or repetition.`],
  [/^words_above_(\d+)$|^body_above_(\d+)_chars$/, () =>
    'Tighten the essay by cutting repetition and hedging, not substance.'],
  [/^human_style_below_/, () =>
    'Vary sentence rhythm and vocabulary; remove formulaic transitions and symmetrical sentence patterns.'],
  [/^insight_density_below_/, () =>
    'Make the decision analysis explicit: say which operators, suppliers, investors or utilities carry the cost, risk, timing and capacity exposure, who gains or loses leverage, and which constraint, allocation or milestone decides it. Use fewer reporting verbs such as said, reported or announced, keeping each source attribution once. Add specific, falsifiable claims and cut generic observations.'],
];

export function verificationFeedback(reasons = []) {
  return reasons.map((reason) => {
    for (const [pattern, hint] of FEEDBACK_HINTS) {
      const match = String(reason).match(pattern);
      if (match) return hint(match);
    }
    return String(reason);
  });
}

// The source's own publication date: a wire record processed today about a
// month-old article must not look like a current development.
function anchorDateMs(article = {}) {
  const stamp = new Date(article.publishedAt || article.analysisPublishedAt || 0).getTime();
  return Number.isFinite(stamp) ? stamp : 0;
}

function articleDateMs(article = {}) {
  const stamp = new Date(article.analysisPublishedAt || article.publishedAt || 0).getTime();
  return Number.isFinite(stamp) ? stamp : 0;
}

export function storyKeyFor(article = {}) {
  const raw = String(article.sourceUrl || article.url || article.title || '').trim();
  try {
    const parsed = new URL(raw);
    if (googleReleaseNoteTarget(raw)) return `${parsed.origin}${parsed.pathname}${parsed.hash}`.toLowerCase();
    if (parsed.hostname === 'www.eia.gov' && parsed.pathname === '/todayinenergy/detail.php') {
      const id = parsed.searchParams.get('id');
      if (id) return `${parsed.origin}${parsed.pathname}?id=${id}`.toLowerCase();
    }
  } catch {
    // Preserve the existing string fallback for non-URL story keys.
  }
  return raw.toLowerCase().replace(/[?#].*$/, '');
}

// A daily digest bundles unrelated items; its lead item usually has its own
// press release. It can corroborate but cannot anchor a single-thesis column.
const DIGEST_TITLE_PATTERN = /^\s*(?:daily news|daily briefing|news digest|news roundup|weekly (?:news|roundup|digest|briefing)|week in review)\b/i;

export function digestRoundup(article = {}) {
  if (DIGEST_TITLE_PATTERN.test(String(article.title || ''))) return true;
  try {
    const url = new URL(String(article.sourceUrl || article.url || ''));
    return url.hostname === 'ec.europa.eu' && /\/presscorner\/detail\/[a-z]{2}\/mex_\d+/i.test(url.pathname);
  } catch {
    return false;
  }
}

function normalizedHeadline(value = '') {
  return String(value || '').toLowerCase().replace(/&[a-z]+;/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}

// Source headlines of columns from the last 30 days. A candidate that carries
// one of them as its own title, or inside its lead text (a digest or a second
// outlet's copy of the same announcement), covers a story already argued.
export function recentColumnSourceHeadlines(existingColumns = [], now = new Date()) {
  const cutoff = now.getTime() - 30 * 86_400_000;
  const headlines = new Set();
  for (const column of existingColumns || []) {
    const stamp = new Date(column?.publishedAt || column?.analysisPublishedAt || 0).getTime();
    if (Number.isFinite(stamp) && stamp && stamp < cutoff) continue;
    for (const source of column?.sources || []) {
      const headline = normalizedHeadline(source?.title);
      if (headline.split(' ').length >= 5) headlines.add(headline);
    }
  }
  return headlines;
}

function repeatsRecentColumnSource(article = {}, headlines = new Set()) {
  if (!headlines.size) return false;
  const title = normalizedHeadline(article.title);
  const lead = normalizedHeadline(columnSourceText(article).slice(0, 800));
  for (const headline of headlines) {
    if (title === headline || lead.includes(headline)) return true;
  }
  return false;
}

function authoredState(state = {}) {
  if (!state.authored) {
    state.authored = { lastColumnAt: null, columnsByDay: {}, recentStoryKeys: [], lastFailure: null };
  }
  return state.authored;
}

function recentStoryKeySet(authored, now) {
  const cutoff = now.getTime() - STORY_KEY_WINDOW_HOURS * 3600 * 1000;
  authored.recentStoryKeys = (authored.recentStoryKeys || []).filter((entry) => new Date(entry.at).getTime() >= cutoff);
  return new Set(authored.recentStoryKeys.map((entry) => entry.key));
}

function frequencyCheck(authored, now, { force = false } = {}) {
  if (force) return { ok: true };
  const dayKey = now.toISOString().slice(0, 10);
  const publishedToday = authored.columnsByDay?.[dayKey] || 0;
  if (publishedToday >= AUTHORED_COLUMNS_PER_DAY) {
    return { ok: false, reason: `daily_cap_reached:${publishedToday}/${AUTHORED_COLUMNS_PER_DAY}` };
  }
  if (authored.lastColumnAt) {
    const hoursSince = (now.getTime() - new Date(authored.lastColumnAt).getTime()) / 3_600_000;
    if (hoursSince < AUTHORED_COLUMN_MIN_GAP_HOURS) {
      return { ok: false, reason: `min_gap_not_reached:${hoursSince.toFixed(1)}h<${AUTHORED_COLUMN_MIN_GAP_HOURS}h` };
    }
  }
  return { ok: true };
}

// Pass 0 — deterministic story selection. No LLM: relevance x evidence depth
// x corroboration x freshness, with a hard floor so weak news never earns a
// column. Returning null here is a normal outcome, not a failure.
export function selectColumnStoryWithDiagnostics({ candidates = [], pool = [], excludedStoryKeys = new Set(), now = new Date(), sources = [], existingColumns = [] } = {}) {
  const counts = Object.fromEntries([...SELECTION_REJECTION_KEYS, 'qualifying'].map((key) => [key, 0]));
  const byBeat = Object.fromEntries(COLUMN_COVERAGE_BEATS.map(beat => [beat, { candidates: 0, qualifying: 0, rejections: {} }]));
  const recentCoverage = recentColumnCoverage(existingColumns, now);
  const coveredHeadlines = recentColumnSourceHeadlines(existingColumns, now);
  const scored = [];

  for (const article of candidates) {
    const beat = columnCoverageBeat(article || {});
    byBeat[beat].candidates += 1;
    let rejection = '';
    let evidencePack = null;
    if (!article?.id || !article.title) rejection = 'invalid_identity';
    else if (!sourceUsageDecision(article, sources, 'text', now).authorized) rejection = 'text_rights_unauthorized';
    else if (abstractOnlySource(article, sources)) rejection = 'abstract_only';
    else if (!columnSourceLongformEligible(article)) rejection = 'extraction_ineligible';
    else {
      evidencePack = buildColumnEvidencePack(article);
      if (!authoredInsightEligible(article, evidencePack)) rejection = 'expert_insight_incomplete';
      else if (!columnRelevanceQualifies(article)) rejection = 'relevance_below_threshold';
      else if (excludedStoryKeys.has(storyKeyFor(article))) rejection = 'already_covered';
      else if (repeatsRecentColumnSource(article, coveredHeadlines)) rejection = 'already_covered';
      else if (now.getTime() - anchorDateMs(article) > MAX_ANCHOR_AGE_DAYS * 86_400_000) rejection = 'stale_story';
      else if (digestRoundup(article)) rejection = 'digest_roundup';
      else if (!evidencePack.ok) rejection = 'unclean_evidence';
      else if ((evidencePack.facts?.length || 0) < MIN_STORY_FACTS) rejection = 'insufficient_facts';
    }

    if (rejection) {
      counts[rejection] += 1;
      byBeat[beat].rejections[rejection] = (byBeat[beat].rejections[rejection] || 0) + 1;
      continue;
    }

    counts.qualifying += 1;
    byBeat[beat].qualifying += 1;
    const corroborating = findCorroboratingSources(article, pool)
      .filter((candidate) => sourceUsageDecision(candidate, sources, 'text', now).authorized)
      .filter((candidate) => !abstractOnlySource(candidate, sources))
      .filter(columnSourceLongformEligible)
      .filter((candidate) => buildColumnEvidencePack(candidate).ok)
      .slice(0, 2);
    const ageHours = Math.max(1, (now.getTime() - articleDateMs(article)) / 3_600_000);
    const freshness = Math.max(0.25, Math.min(1, 30 / ageHours));
    const score = columnStoryRelevance(article)
      * Math.min(evidencePack.facts.length, 10)
      * (1 + 0.25 * corroborating.length)
      * freshness;
    scored.push({ article, evidencePack, corroborating, score, beat });
  }

  scored.sort((a, b) => b.score - a.score || String(a.article.id).localeCompare(String(b.article.id)));
  // Diversity only breaks a near tie among fully eligible stories. A thin
  // source or a materially weaker story cannot win to fill a topic quota.
  const contenders = scored.filter(item => item.score >= scored[0].score * 0.85);
  if (recentCoverage.total) contenders.sort((a, b) =>
    recentCoverage.counts[a.beat] - recentCoverage.counts[b.beat]
    || Number(a.beat === recentCoverage.lastBeat) - Number(b.beat === recentCoverage.lastBeat)
    || b.score - a.score
    || String(a.article.id).localeCompare(String(b.article.id)));
  const selection = contenders[0] || null;
  // Fallback order for this run: the chosen story first, then every other
  // qualifying story by evidence score, one per story key.
  const ranked = [];
  const rankedKeys = new Set();
  for (const item of [selection, ...scored].filter(Boolean)) {
    const key = storyKeyFor(item.article);
    if (rankedKeys.has(key)) continue;
    rankedKeys.add(key);
    ranked.push(item);
  }
  return {
    selection,
    ranked,
    diagnostics: {
      total_candidates: candidates.length,
      counts,
      selected_id: selection?.article?.id || null,
      selected_beat: selection?.beat || null,
      selection_reason: selection ? (selection === scored[0] ? 'highest_evidence_score' : 'coverage_near_tie') : 'no_qualifying_story',
      by_beat: byBeat,
      recent_coverage: recentCoverage,
    },
  };
}

export function selectColumnStory(options = {}) {
  return selectColumnStoryWithDiagnostics(options).selection;
}

function clusterFor(selection) {
  const toSource = (article) => ({
    source_url: article.sourceUrl || article.url || '',
    source_name: article.source || '',
    source_published_at: article.publishedAt || '',
    title: article.title || '',
    cleaned_text: columnSourceText(article),
  });
  return {
    cluster_id: `authored_${selection.article.id}`,
    representative_source: toSource(selection.article),
    supporting_sources: selection.corroborating.map(toSource),
  };
}

function sourceTextFor(selection) {
  return [selection.article, ...selection.corroborating]
    .map((article) => [article.title, columnSourceText(article)].filter(Boolean).join('\n'))
    .join('\n\n');
}

function sourcesFor(selection) {
  return [selection.article, ...selection.corroborating].map((article) => ({
    name: article.source || 'Source',
    url: article.sourceUrl || article.url || '',
    title: article.title || '',
    publishedAt: article.publishedAt || '',
  }));
}

function personaSystemPrompt(charter) {
  const positions = charter.standing_positions.map((entry) => `- ${entry.position}`).join('\n');
  return [
    `You write "${charter.column.name}", the analysis column of Compute Current, as ${charter.persona.name}, its founder and editor, in his own name.`,
    charter.column.mission,
    `Voice: ${charter.voice.person}. Register: ${charter.voice.register}.`,
    'Standing analytical positions (argue from these when they genuinely apply, and say so):',
    positions,
    'Hard rules:',
    '- Separate reported facts from analysis in the headline, deck, thesis and body. A proposal, rating, consultation or policy ambition is not evidence of an enacted permit condition, mandatory contract, deadline or capacity-recognition rule. Do not invent legal mechanisms. Mark unsupported future effects as conditional analysis, not obligations already in force. Standing positions and expert_insight are analytical context, not verified source facts.',
    ...charter.persona.honesty_rules.map((rule) => `- ${rule}`),
    ...charter.voice.dos.map((rule) => `- ${rule}`),
    ...charter.voice.donts.map((rule) => `- ${rule}`),
    `Never use any of these phrases: ${BANNED_PHRASES.join(' | ')}.`,
    `Never begin the opening sentence with: ${BLOCKED_HOOK_STARTS.join(' | ')}.`,
  ].join('\n');
}

function evidencePayload(selection, ledger) {
  return {
    coverage_beat: selection.beat,
    primary_source: {
      title: selection.article.title,
      source: selection.article.source,
      published_at: selection.article.publishedAt,
      url: selection.article.sourceUrl || selection.article.url,
    },
    corroborating_sources: selection.corroborating.map((article) => ({
      title: article.title,
      source: article.source,
      url: article.sourceUrl || article.url,
    })),
    facts: selection.evidencePack.facts,
    source_text: sourceTextFor(selection),
    expert_insight: columnInsight(selection.article),
    // The numeric gate accepts only verified_primary claims. Full source
    // context preserves meaning and status, not permission to derive values.
    verified_claims: ledger.claims
      .filter((claim) => claim.verification_status === 'verified_primary')
      .map((claim) => ({ text: claim.claim_text, value: claim.numeric_value, unit: claim.unit, source: claim.source_name })),
  };
}

async function thesisPass({ charter, selection, ledger, recentTheses, callModel }) {
  const content = await callModel({
    model: AUTHORED_COLUMN_MODEL,
    temperature: 0.5,
    maxTokens: 800,
    timeoutMs: 75_000,
    systemPrompt: [
      personaSystemPrompt(charter),
      'Task: choose the stance for today\'s column. Return strict JSON only with keys:',
      '{ "thesis": string (<=200 chars, a falsifiable position in my voice),',
      '  "angle": string (one line on the underappreciated dynamic),',
      '  "standing_position_ids": string[] (ids of standing positions that genuinely apply, may be empty),',
      '  "counterargument": string (the strongest honest case against the thesis),',
      '  "watch_items": string[2-3] (concrete observables tied to events such as the next filing or regulatory review; never invent numeric timelines),',
      '  "working_headlines": string[3] (first-person-friendly, specific, 40-90 chars) }',
      'Use numbers, dates and durations only when explicitly present in verified_claims. This applies to forecasts and personal watch horizons too; otherwise use nonnumeric event-based timing.',
    ].join('\n'),
    userPrompt: JSON.stringify({
      evidence: evidencePayload(selection, ledger),
      standing_position_ids: charter.standing_positions.map((entry) => entry.id),
      avoid_repeating_these_theses: recentTheses,
    }),
  });
  return parseModelJson(content);
}

async function draftPass({ charter, selection, ledger, stance, recentHeadings = [], recentLeads = [], feedback = [], callModel }) {
  const content = await callModel({
    model: AUTHORED_COLUMN_MODEL,
    temperature: 0.7,
    maxTokens: 3400,
    timeoutMs: 75_000,
    systemPrompt: [
      personaSystemPrompt(charter),
      'Task: write the full column as strict JSON only:',
      '{ "headline": string (40-105 chars), "deck": string (one standfirst sentence, 80-240 chars), "opening_paragraphs": string[], "sections": [{ "heading": string, "paragraphs": string[] }], "figures": FigureSpec[] }',
      'FigureSpec (1 to 3 of them, drawn ONLY from the verified_claims array): { "type": "stat-row"|"table"|"bar", "title": string (8-60 chars, specific to this argument — never a generic label like "By the numbers"), "claim_indexes": int[] (0-based indexes into verified_claims; a bar needs 3+ claims sharing one unit), "anchor": int (the figure renders after this section, 1-based) }',
      'Essay contract:',
      '- Return exactly 4 to 6 objects in sections, each with its own heading and at least one substantive paragraph. The complete essay must have at least six substantive paragraphs. Put any unheaded opening paragraphs in opening_paragraphs (an empty array is allowed). Do not return a body string: the publisher assembles the paragraph arrays and headings with blank lines.',
      '- 1200 to 1800 words, written in the first person, committed to the thesis by the third paragraph.',
      '- Plain text only — no markdown of any kind (no #, ##, **, *, _, backticks, or bullet markers anywhere in the body).',
      '- Each paragraph array item is a single unwrapped plain-text paragraph with no newline characters. Do not put section headings into paragraph strings.',
      '- Section headings: invented for THIS argument — never generic labels, never headings any recent column used (the avoid list is in the payload). Prefer 2-6 words. Each heading starts with an uppercase letter or digit, is under 87 characters, and uses only ASCII letters, digits, spaces or &:/+- (no apostrophes, quotes, commas, periods or markdown).',
      '- One section must present the honest case against the thesis, under a heading phrased from this column\'s specifics (the words "wrong", "watchlist" and other retired template phrasings are forbidden).',
      '- The final section looks forward: name two or three concrete observables tied to events such as the next filing or regulatory review, under a fresh heading. Use no numeric forecast horizon, date or duration unless it is in verified_claims. Stance/watch_items are analytical proposals, not verified evidence.',
      '- Open with a different device than the recent leads shown in the payload: a scene, a specific number, a contradiction, a filing detail, or a deadline.',
      '- Attribute every number inline to its source publication by name. Cite only numbers present in verified_claims, copied exactly — same value, same unit; never convert units (do not turn 2,500 MW into 2.5 GW) and never derive new figures.',
      '- Write every sentence in your own words: never reproduce a sentence or long phrase from the source coverage. Short quoted fragments inside quotation marks are the only exception.',
      '- No ellipsis characters. No bullet lists; write prose.',
      ...(feedback.length ? [`Repair: ${feedback.join(' | ')}`] : []),
    ].join('\n'),
    userPrompt: JSON.stringify({
      stance,
      evidence: evidencePayload(selection, ledger),
      headings_to_avoid: recentHeadings,
      recent_leads_to_avoid: recentLeads,
    }),
  });
  return parseModelEssay(content, { recoverFormat: true });
}

async function voicePass({ charter, draft, evidence, feedback = [], callModel }) {
  const content = await callModel({
    model: AUTHORED_COLUMN_MODEL,
    temperature: 0.4,
    maxTokens: 3400,
    timeoutMs: 75_000,
    systemPrompt: [
      personaSystemPrompt(charter),
      'Task: revise the column below against verified_claims. Preserve supported facts, numbers and attributions exactly, but remove unsupported numeric claims and invented timelines, including those already in the draft or stance. Correcting evidence failures takes priority over preserving draft wording. Return this strict JSON shape:',
      '{ "headline": string, "deck": string, "opening_paragraphs": string[], "sections": [{ "heading": string, "paragraphs": string[] }] }',
      'Tighten the prose toward the persona voice: varied sentence rhythm, concrete verbs, no throat-clearing, no corporate filler.',
      'Formatting contract: return exactly 4-6 section objects with at least one substantive paragraph each, and at least six substantive paragraphs in the complete essay. Prefer 2-6 words per heading. Each heading starts with an uppercase letter or digit, is under 87 characters, and uses ASCII letters, digits, spaces or &:/+- only; rephrase apostrophes, quotes and other unsupported punctuation. Each paragraph is a single unwrapped string with no newline or markdown symbols. Keep any unheaded opening in opening_paragraphs (an empty array is allowed). Do not return a body string; the publisher assembles the headings and paragraphs. Keep the draft\'s own headings (or sharpen them), never template headings like "On My Watchlist" or "Where I Could Be Wrong". Retain 1200-1800 total words and the full argument, not a summary.',
      'Numeric evidence contract: the draft is not an authority for numbers. Every retained numeric value and unit must appear in verified_claims with matching attribution; do not convert or derive values. Remove unsupported numbers rather than spelling them out, replacing them with synonyms, or inventing a citation. For forward-looking analysis use nonnumeric event-based observables instead of unsupported month counts or dates.',
      'Source fidelity contract: use evidence.source_text to check nonnumeric claims too. Correct overstatement of legal status, causality or required actions in the headline and deck as well as the prose. A prior draft or thesis does not establish a fact. If the source does not establish a binding rule, remove the assertion or make the potential consequence explicitly conditional.',
      feedback.length
        ? `The previous version failed these checks — fix every one without weakening the argument: ${feedback.join(' | ')}`
        : 'Polish only; keep structure and headings.',
    ].join('\n'),
    userPrompt: JSON.stringify({ ...draft, evidence, verified_claims: evidence.verified_claims }),
  });
  return parseModelEssay(content, { recoverFormat: true, requireSections: Boolean(draft.formatIssues?.length) });
}

function columnRecord({ charter, selection, stance, essay, quality, figures = [], now, model = AUTHORED_COLUMN_MODEL }) {
  const publishedAt = now.toISOString();
  const dateSlug = publishedAt.slice(0, 10);
  const slug = `${slugify(essay.headline).slice(0, 64).replace(/-+$/, '')}-${dateSlug}`;
  const primaryImage = [selection.article.generatedImage, selection.article.heroImage, selection.article.thumbnailImage]
    .find((image) => typeof image === 'string' && image.startsWith('/generated/'))
    || '/generated/fallbacks/ai-infrastructure.svg';
  return {
    id: `col_${stableArticleId(slug, essay.headline)}`,
    content_origin: 'authored',
    generation_version: AUTHORED_GENERATION_VERSION,
    public_content_tier: AUTHORED_COLUMN_TIER,
    slug,
    title: truncate(essay.headline, 110),
    deck: truncate(essay.deck, 260),
    summary: truncate(essay.deck, 170),
    expertLensFull: {
      finalHeadline: truncate(essay.headline, 110),
      metaDescription: truncate(essay.deck, 170),
      finalArticleBody: essay.body,
      sourceLink: '',
    },
    author: {
      name: charter.persona.name,
      slug: charter.persona.slug,
      role: charter.persona.role,
      type: charter.persona.type,
    },
    publishedAt,
    analysisPublishedAt: publishedAt,
    updatedAt: publishedAt,
    category: selection.article.primary_category || selection.article.category || 'AI Infrastructure',
    coverage_beat: selection.beat,
    primary_category: selection.article.primary_category || selection.article.category || 'AI Infrastructure',
    tags: Array.isArray(selection.article.tags) ? selection.article.tags.slice(0, 6) : [],
    figures,
    sources: sourcesFor(selection),
    based_on_article_ids: [selection.article.id, ...selection.corroborating.map((article) => article.id)],
    story_key: storyKeyFor(selection.article),
    stance: {
      thesis: truncate(stance.thesis, 200),
      angle: truncate(stance.angle || '', 200),
      standing_position_ids: Array.isArray(stance.standing_position_ids) ? stance.standing_position_ids.slice(0, 3) : [],
    },
    authored_quality: {
      ok: true,
      generatedAt: publishedAt,
      model,
      attempts: quality.attempts,
      metrics: quality.metrics,
    },
    llm_usage: llmUsageSummary(),
    heroImage: primaryImage,
    generatedImage: primaryImage,
    imageAlt: `${truncate(essay.headline, 90)} column illustration`,
    articlePagePublished: true,
    homepagePublished: true,
    public_status: 'published',
    draft: false,
    noindex: false,
    seo_noindex: false,
    archiveOnly: false,
  };
}

// Main entry. Returns { column, skipReason, failure } — exactly one of
// column/skipReason/failure is meaningful. Mutates `state.authored` only when
// a column is produced (callers persist state).
export async function generateAuthoredColumn({
  candidates = [],
  pool = [],
  recentRecords = [],
  existingColumns = [],
  state = {},
  now = new Date(),
  force = false,
  sources = [],
  callModel = callOpenRouterText,
  model = AUTHORED_COLUMN_MODEL,
  deadlineMs = Number.POSITIVE_INFINITY,
} = {}) {
  if (!AUTHORED_COLUMN_ENABLED) return { column: null, skipReason: 'disabled' };
  const explicitModel = callModel !== callOpenRouterText;
  if ((!process.env.OPENROUTER_API_KEY && !explicitModel) || (PIPELINE_OFFLINE && !explicitModel)) {
    return { column: null, skipReason: 'llm_disabled' };
  }

  const authored = authoredState(state);
  const frequency = frequencyCheck(authored, now, { force });
  if (!frequency.ok) return { column: null, skipReason: frequency.reason };

  const excluded = recentStoryKeySet(authored, now);
  for (const column of existingColumns) {
    if (column.story_key) excluded.add(column.story_key);
  }

  const charter = loadPersonaCharter();
  const selectionResult = selectColumnStoryWithDiagnostics({ candidates, pool, excludedStoryKeys: excluded, now, sources, existingColumns });
  const { selection, diagnostics: selectionDiagnostics } = selectionResult;
  const ranked = selectionResult.ranked?.length ? selectionResult.ranked : (selection ? [selection] : []);
  authored.lastSelection = {
    at: now.toISOString(),
    outcome: selection ? 'selected' : 'no_qualifying_story',
    selectedId: selection?.article?.id || null,
    diagnostics: selectionDiagnostics,
  };
  if (!selection) return { column: null, skipReason: 'no_qualifying_story', selectionDiagnostics };

  const recentTheses = existingColumns.slice(0, 10).map((column) => column.stance?.thesis).filter(Boolean);
  const recentHeadings = recentHeadingsFromColumns(existingColumns);
  const recentLeads = recentLeadsFromColumns(existingColumns);
  const repetitionCorpus = [...existingColumns.slice(0, 20), ...recentRecords.slice(0, 50)];
  const attemptsLog = [];
  let lastFailure = null;

  for (const contender of ranked.slice(0, MAX_STORY_ATTEMPTS_PER_RUN)) {
    // A further story starts only with time for a full attempt left.
    if (attemptsLog.length && Date.now() + MIN_ATTEMPT_TIME_MS > deadlineMs) {
      attemptsLog.push({ id: contender.article.id, outcome: 'skipped:time_budget' });
      break;
    }
    const outcome = await attemptColumnForSelection({
      charter,
      selection: contender,
      recentTheses,
      recentHeadings,
      recentLeads,
      repetitionCorpus,
      callModel,
      model,
      now,
    });
    attemptsLog.push({ id: contender.article.id, outcome: outcome.column ? 'published' : `${outcome.stage}:${outcome.detail}` });
    if (outcome.column) {
      const column = outcome.column;
      const dayKey = now.toISOString().slice(0, 10);
      authored.lastColumnAt = now.toISOString();
      authored.columnsByDay = { ...(authored.columnsByDay || {}), [dayKey]: (authored.columnsByDay?.[dayKey] || 0) + 1 };
      authored.recentStoryKeys = [...(authored.recentStoryKeys || []), { key: column.story_key, at: now.toISOString() }].slice(-30);
      authored.lastFailure = null;
      authored.lastSelection = { ...authored.lastSelection, selectedId: contender.article.id, attempts: attemptsLog };
      return { column, selectionDiagnostics: { ...selectionDiagnostics, selected_id: contender.article.id, attempts: attemptsLog } };
    }
    lastFailure = outcome;
    // A spent run budget cannot be fixed by switching stories.
    if (outcome.budgetExhausted) break;
  }

  authored.lastFailure = {
    at: now.toISOString(),
    stage: lastFailure.stage,
    detail: lastFailure.detail,
    ...(lastFailure.metrics ? { metrics: lastFailure.metrics } : {}),
    attempts: attemptsLog,
  };
  authored.lastSelection = { ...authored.lastSelection, attempts: attemptsLog };
  return {
    column: null,
    failure: `${lastFailure.stage}:${lastFailure.detail}`,
    selectionDiagnostics: { ...selectionDiagnostics, attempts: attemptsLog },
  };
}

// One full generation attempt (thesis, draft, up to two revisions, verification)
// for one selected story. Returns { column } or { stage, detail, metrics }.
async function attemptColumnForSelection({
  charter,
  selection,
  recentTheses,
  recentHeadings,
  recentLeads,
  repetitionCorpus,
  callModel,
  model,
  now,
}) {
  const ledger = buildClaimLedger(clusterFor(selection), selection.article.id);
  const sourceText = sourceTextFor(selection);
  const failWith = (stage, detail, metrics, error) => ({
    column: null,
    stage,
    detail,
    ...(metrics ? { metrics } : {}),
    budgetExhausted: error instanceof LlmBudgetExceededError,
  });

  let stance;
  try {
    stance = await thesisPass({ charter, selection, ledger, recentTheses, callModel });
  } catch (error) {
    return failWith('thesis', error.message, null, error);
  }
  if (!stance?.thesis) return failWith('thesis', 'no_parseable_thesis');

  // A draft reply that fails the JSON contract gets one repair attempt, as a
  // malformed revision already does: the 2026-10-04 run lost a qualifying
  // story to a single unparseable draft.
  let draft;
  let draftFeedback = [];
  for (let draftAttempt = 1; draftAttempt <= 2; draftAttempt += 1) {
    try {
      draft = await draftPass({ charter, selection, ledger, stance, recentHeadings, recentLeads, feedback: draftFeedback, callModel });
      break;
    } catch (error) {
      if (error instanceof EssayStructureError && draftAttempt < 2) {
        draftFeedback = [`The previous reply failed ${error.message}. Return exactly one JSON object with a nonempty "headline" string, a "deck" string, an "opening_paragraphs" array and 4 to 6 "sections" objects whose "paragraphs" are nonempty single-line strings, with no text or code fence outside the JSON.`];
        continue;
      }
      return failWith('draft', error.message, null, error);
    }
  }
  if (!draft?.body || !draft?.headline) return failWith('draft', 'no_parseable_draft');

  let attempts = 0;
  let essay = draft;
  let quality;
  let figures = [];
  let formatFeedback = draft.formatIssues || [];
  while (attempts < 2) {
    attempts += 1;
    let voiced;
    try {
      voiced = await voicePass({
        charter,
        draft: essay,
        evidence: evidencePayload(selection, ledger),
        feedback: [...verificationFeedback(quality?.reasons || []), ...formatFeedback],
        callModel,
      });
    } catch (error) {
      if (error instanceof EssayStructureError && attempts < 2) {
        formatFeedback = [...(essay.formatIssues || []), `The previous JSON failed ${error.message}. Return all required arrays with 4-6 valid section headings and nonempty single-line paragraph strings; preserve the complete essay.`];
        continue;
      }
      return failWith('voice', error.message, null, error);
    }
    if (voiced?.body && voiced?.headline) essay = voiced;
    formatFeedback = essay.formatIssues || [];
    essay = { ...essay, body: normalizeAuthoredBody(essay.body) };
    figures = buildColumnFigures({
      ledger,
      stance,
      headline: essay.headline,
      sectionCount: headingSequence(essay.body).length,
      modelSpec: essay.figures ?? draft.figures ?? null,
      facts: selection.evidencePack.facts || [],
      factSource: selection.article.source || '',
    }).figures;
    quality = authoredColumnQualityResult({
      body: essay.body,
      title: essay.headline,
      deck: essay.deck || '',
      summary: truncate(essay.deck || '', 170),
      thesis: stance.thesis,
      ledgerClaims: ledger.claims,
      sourceText,
      recentRecords: repetitionCorpus,
      recentTheses,
      recentHeadings,
      recentLeads,
      figures,
    });
    // A parseable failed revision is the next repair input, never a publishable
    // fallback. Check every explicit heading even when enough others are valid.
    if (formatFeedback.length) {
      quality.ok = false;
      quality.reasons = [...new Set([...quality.reasons, ...formatFeedback.map(issue => issue.split(':')[0])])];
    }
    if (quality.ok) break;
  }

  if (!quality?.ok) {
    return failWith('verify', (quality?.reasons || ['unknown']).slice(0, 6).join('|'), quality?.metrics);
  }

  const column = columnRecord({
    charter,
    selection,
    stance,
    essay,
    quality: { attempts, metrics: quality.metrics },
    figures,
    model,
    now,
  });
  return { column };
}
