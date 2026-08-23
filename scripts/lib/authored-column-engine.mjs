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
import { llmUsageSummary } from './llm-budget.mjs';
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

const CHARTER_RELATIVE_PATH = 'config/editorial/persona-charter.json';
const STORY_KEY_WINDOW_HOURS = 72;
const MIN_STORY_RELEVANCE = 0.75;
const MIN_STORY_FACTS = 4;

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

function parseModelJson(content) {
  const trimmed = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return safeJsonParse(trimmed, null);
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
    'Structure the essay into 4 to 6 sections. Every section heading must be a standalone plain-text line of 2-6 words (letters, digits and spaces only — no markdown symbols, no punctuation) with a blank line before and after it.'],
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
  [/^words_below_(\d+)$/, (match) =>
    `Lengthen the essay to at least ${match[1]} words by deepening the analysis — no padding or repetition.`],
  [/^words_above_(\d+)$|^body_above_(\d+)_chars$/, () =>
    'Tighten the essay by cutting repetition and hedging, not substance.'],
  [/^human_style_below_/, () =>
    'Vary sentence rhythm and vocabulary; remove formulaic transitions and symmetrical sentence patterns.'],
  [/^insight_density_below_/, () =>
    'Add more specific, falsifiable analytical claims; cut generic observations.'],
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

function articleDateMs(article = {}) {
  const stamp = new Date(article.analysisPublishedAt || article.publishedAt || 0).getTime();
  return Number.isFinite(stamp) ? stamp : 0;
}

function storyKeyFor(article = {}) {
  return String(article.sourceUrl || article.url || article.title || '').trim().toLowerCase().replace(/[?#].*$/, '');
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
export function selectColumnStory({ candidates = [], pool = [], excludedStoryKeys = new Set(), now = new Date() } = {}) {
  const scored = candidates
    .filter((article) => article?.id && article.title)
    .filter((article) => article.expert_insight_complete === true || article.expert_insight?.expert_insight_complete === true)
    .filter((article) => Number(article.infrastructure_relevance_score || 0) >= MIN_STORY_RELEVANCE)
    .filter((article) => !excludedStoryKeys.has(storyKeyFor(article)))
    .map((article) => {
      const evidencePack = buildEvidencePack(article);
      if ((evidencePack.facts?.length || 0) < MIN_STORY_FACTS) return null;
      const corroborating = findCorroboratingSources(article, pool).slice(0, 2);
      const ageHours = Math.max(1, (now.getTime() - articleDateMs(article)) / 3_600_000);
      const freshness = Math.max(0.25, Math.min(1, 30 / ageHours));
      const score = Number(article.infrastructure_relevance_score || 0)
        * Math.min(evidencePack.facts.length, 10)
        * (1 + 0.25 * corroborating.length)
        * freshness;
      return { article, evidencePack, corroborating, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return scored[0] || null;
}

function clusterFor(selection) {
  const toSource = (article) => ({
    source_url: article.sourceUrl || article.url || '',
    source_name: article.source || '',
    source_published_at: article.publishedAt || '',
    title: article.title || '',
    cleaned_text: article.cleaned_source_text || article.articleText || article.contentText || article.snippet || '',
  });
  return {
    cluster_id: `authored_${selection.article.id}`,
    representative_source: toSource(selection.article),
    supporting_sources: selection.corroborating.map(toSource),
  };
}

function sourceTextFor(selection) {
  return [selection.article, ...selection.corroborating]
    .map((article) => [article.title, article.cleaned_source_text || article.articleText || article.contentText || article.snippet].filter(Boolean).join('\n'))
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
    `You write "${charter.column.name}", the analysis column of Compute Current, under the pen name ${charter.persona.pen_name}.`,
    charter.column.mission,
    `Voice: ${charter.voice.person}. Register: ${charter.voice.register}.`,
    'Standing analytical positions (argue from these when they genuinely apply, and say so):',
    positions,
    'Hard rules:',
    ...charter.persona.honesty_rules.map((rule) => `- ${rule}`),
    ...charter.voice.dos.map((rule) => `- ${rule}`),
    ...charter.voice.donts.map((rule) => `- ${rule}`),
    `Never use any of these phrases: ${BANNED_PHRASES.join(' | ')}.`,
    `Never begin the opening sentence with: ${BLOCKED_HOOK_STARTS.join(' | ')}.`,
  ].join('\n');
}

function evidencePayload(selection, ledger) {
  return {
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
    expert_insight: selection.article.expert_insight || selection.article.expertInsight || {},
    // Only verified_primary claims: the unsupported-claim gate accepts
    // exactly this set, so the model must never see numbers it cannot cite.
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
      '  "watch_items": string[2-3] (concrete observables with rough timeframes),',
      '  "working_headlines": string[3] (first-person-friendly, specific, 40-90 chars) }',
    ].join('\n'),
    userPrompt: JSON.stringify({
      evidence: evidencePayload(selection, ledger),
      standing_position_ids: charter.standing_positions.map((entry) => entry.id),
      avoid_repeating_these_theses: recentTheses,
    }),
  });
  return parseModelJson(content);
}

async function draftPass({ charter, selection, ledger, stance, recentHeadings = [], recentLeads = [], callModel }) {
  const content = await callModel({
    model: AUTHORED_COLUMN_MODEL,
    temperature: 0.7,
    maxTokens: 3400,
    timeoutMs: 75_000,
    systemPrompt: [
      personaSystemPrompt(charter),
      'Task: write the full column as strict JSON only:',
      '{ "headline": string (40-105 chars), "deck": string (one standfirst sentence, 80-240 chars), "body": string, "figures": FigureSpec[] }',
      'FigureSpec (1 to 3 of them, drawn ONLY from the verified_claims array): { "type": "stat-row"|"table"|"bar", "title": string (8-60 chars, specific to this argument — never a generic label like "By the numbers"), "claim_indexes": int[] (0-based indexes into verified_claims; a bar needs 3+ claims sharing one unit), "anchor": int (the figure renders after this section, 1-based) }',
      'Body contract:',
      '- 1200 to 1800 words, written in the first person, committed to the thesis by the third paragraph.',
      '- Plain text only — no markdown of any kind (no #, ##, **, *, _, backticks, or bullet markers anywhere in the body).',
      '- Plain paragraphs separated by blank lines; each paragraph is a single unwrapped line.',
      '- Section headings: 4 to 6 of them, invented for THIS argument — never generic labels, never headings any recent column used (the avoid list is in the payload). Each heading is a standalone line of 2-6 words with a blank line before and after it, containing only letters, digits and spaces (no apostrophes, quotes, commas, colons, dashes, or trailing punctuation).',
      '- One section must present the honest case against the thesis, under a heading phrased from this column\'s specifics (the words "wrong", "watchlist" and other retired template phrasings are forbidden).',
      '- The final section looks forward: name two or three concrete observables with rough timeframes, under a fresh heading of your own invention.',
      '- Open with a different device than the recent leads shown in the payload: a scene, a specific number, a contradiction, a filing detail, or a deadline.',
      '- Attribute every number inline to its source publication by name. Cite only numbers present in verified_claims, copied exactly — same value, same unit; never convert units (do not turn 2,500 MW into 2.5 GW) and never derive new figures.',
      '- No ellipsis characters. No bullet lists; write prose.',
    ].join('\n'),
    userPrompt: JSON.stringify({
      stance,
      evidence: evidencePayload(selection, ledger),
      headings_to_avoid: recentHeadings,
      recent_leads_to_avoid: recentLeads,
    }),
  });
  return parseModelJson(content);
}

async function voicePass({ charter, draft, feedback = [], callModel }) {
  const content = await callModel({
    model: AUTHORED_COLUMN_MODEL,
    temperature: 0.4,
    maxTokens: 3400,
    timeoutMs: 75_000,
    systemPrompt: [
      personaSystemPrompt(charter),
      'Task: revise the column below. Preserve every fact, number, and attribution exactly. Keep the same JSON shape:',
      '{ "headline": string, "deck": string, "body": string }',
      'Tighten the prose toward the persona voice: varied sentence rhythm, concrete verbs, no throat-clearing, no corporate filler.',
      'Formatting contract (must hold after revision): plain text only with no markdown symbols; paragraphs separated by blank lines; 4-6 standalone plain-text section headings (2-6 words, letters/digits/spaces only) each surrounded by blank lines; keep the draft\'s own section headings (or sharpen them) — never substitute template headings like "On My Watchlist" or "Where I Could Be Wrong"; numbers unchanged from the draft.',
      feedback.length
        ? `The previous version failed these checks — fix every one without weakening the argument: ${feedback.join(' | ')}`
        : 'Polish only; keep structure and headings.',
    ].join('\n'),
    userPrompt: JSON.stringify(draft),
  });
  return parseModelJson(content);
}

function columnRecord({ charter, selection, stance, essay, quality, figures = [], now }) {
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
      name: charter.persona.pen_name,
      slug: charter.persona.slug,
      role: charter.persona.role,
      type: charter.persona.type,
    },
    publishedAt,
    analysisPublishedAt: publishedAt,
    updatedAt: publishedAt,
    category: selection.article.primary_category || selection.article.category || 'AI Infrastructure',
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
      model: AUTHORED_COLUMN_MODEL,
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
  callModel = callOpenRouterText,
} = {}) {
  if (!AUTHORED_COLUMN_ENABLED) return { column: null, skipReason: 'disabled' };
  if (!process.env.OPENROUTER_API_KEY || PIPELINE_OFFLINE) return { column: null, skipReason: 'llm_disabled' };

  const authored = authoredState(state);
  const frequency = frequencyCheck(authored, now, { force });
  if (!frequency.ok) return { column: null, skipReason: frequency.reason };

  const excluded = recentStoryKeySet(authored, now);
  for (const column of existingColumns) {
    if (column.story_key) excluded.add(column.story_key);
  }

  const charter = loadPersonaCharter();
  const selection = selectColumnStory({ candidates, pool, excludedStoryKeys: excluded, now });
  if (!selection) return { column: null, skipReason: 'no_qualifying_story' };

  const ledger = buildClaimLedger(clusterFor(selection), selection.article.id);
  const sourceText = sourceTextFor(selection);
  const recentTheses = existingColumns.slice(0, 10).map((column) => column.stance?.thesis).filter(Boolean);
  const recentHeadings = recentHeadingsFromColumns(existingColumns);
  const recentLeads = recentLeadsFromColumns(existingColumns);
  const repetitionCorpus = [...existingColumns.slice(0, 20), ...recentRecords.slice(0, 50)];

  const failWith = (stage, detail) => {
    authored.lastFailure = { at: now.toISOString(), stage, detail };
    return { column: null, failure: `${stage}:${detail}` };
  };

  let stance;
  try {
    stance = await thesisPass({ charter, selection, ledger, recentTheses, callModel });
  } catch (error) {
    return failWith('thesis', error.message);
  }
  if (!stance?.thesis) return failWith('thesis', 'no_parseable_thesis');

  let draft;
  try {
    draft = await draftPass({ charter, selection, ledger, stance, recentHeadings, recentLeads, callModel });
  } catch (error) {
    return failWith('draft', error.message);
  }
  if (!draft?.body || !draft?.headline) return failWith('draft', 'no_parseable_draft');

  let attempts = 0;
  let essay = draft;
  let quality;
  let figures = [];
  while (attempts < 2) {
    attempts += 1;
    let voiced;
    try {
      voiced = await voicePass({
        charter,
        draft: essay,
        feedback: verificationFeedback(quality?.reasons || []),
        callModel,
      });
    } catch (error) {
      return failWith('voice', error.message);
    }
    if (voiced?.body && voiced?.headline) essay = voiced;
    essay = { ...essay, body: normalizeAuthoredBody(essay.body) };
    figures = buildColumnFigures({
      ledger,
      stance,
      headline: essay.headline,
      sectionCount: headingSequence(essay.body).length,
      modelSpec: essay.figures ?? draft.figures ?? null,
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
    if (quality.ok) break;
  }

  if (!quality?.ok) {
    return failWith('verify', (quality?.reasons || ['unknown']).slice(0, 6).join('|'));
  }

  const column = columnRecord({
    charter,
    selection,
    stance,
    essay,
    quality: { attempts, metrics: quality.metrics },
    figures,
    now,
  });

  const dayKey = now.toISOString().slice(0, 10);
  authored.lastColumnAt = now.toISOString();
  authored.columnsByDay = { ...(authored.columnsByDay || {}), [dayKey]: (authored.columnsByDay?.[dayKey] || 0) + 1 };
  authored.recentStoryKeys = [...(authored.recentStoryKeys || []), { key: column.story_key, at: now.toISOString() }].slice(-30);
  authored.lastFailure = null;

  return { column };
}
