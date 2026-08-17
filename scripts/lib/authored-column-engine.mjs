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
  WATCHLIST_HEADING,
  authoredColumnQualityResult,
} from './authored-column-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHARTER_PATH = path.join(ROOT, 'config/editorial/persona-charter.json');
const STORY_KEY_WINDOW_HOURS = 72;
const MIN_STORY_RELEVANCE = 0.75;
const MIN_STORY_FACTS = 4;

export function loadPersonaCharter() {
  return JSON.parse(fs.readFileSync(CHARTER_PATH, 'utf8'));
}

function parseModelJson(content) {
  const trimmed = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return safeJsonParse(trimmed, null);
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
    verified_claims: ledger.claims
      .filter((claim) => claim.verification_status?.startsWith('verified') || claim.verification_status === 'inference_supported')
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

async function draftPass({ charter, selection, ledger, stance, callModel }) {
  const content = await callModel({
    model: AUTHORED_COLUMN_MODEL,
    temperature: 0.7,
    maxTokens: 3400,
    timeoutMs: 75_000,
    systemPrompt: [
      personaSystemPrompt(charter),
      'Task: write the full column as strict JSON only:',
      '{ "headline": string (40-105 chars), "deck": string (one standfirst sentence, 80-240 chars), "body": string }',
      'Body contract:',
      '- 1200 to 1800 words, written in the first person, committed to the thesis by the third paragraph.',
      '- Plain paragraphs separated by blank lines. Section headings are single short lines (2-6 words, no punctuation at the end), 4 to 6 of them, phrased in my own words — never generic labels.',
      '- One section must present the counterargument honestly (heading should signal it, e.g. "Where I could be wrong").',
      `- The final section heading must be exactly: ${WATCHLIST_HEADING}`,
      '- Attribute every number inline to its source publication by name. Use only numbers present in the verified claims.',
      '- No ellipsis characters. No bullet lists; write prose.',
    ].join('\n'),
    userPrompt: JSON.stringify({
      stance,
      evidence: evidencePayload(selection, ledger),
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
      feedback.length
        ? `The previous version failed these checks — fix every one without weakening the argument: ${feedback.join('; ')}`
        : 'Polish only; keep structure and headings.',
    ].join('\n'),
    userPrompt: JSON.stringify(draft),
  });
  return parseModelJson(content);
}

function columnRecord({ charter, selection, stance, essay, quality, now }) {
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
    draft = await draftPass({ charter, selection, ledger, stance, callModel });
  } catch (error) {
    return failWith('draft', error.message);
  }
  if (!draft?.body || !draft?.headline) return failWith('draft', 'no_parseable_draft');

  let attempts = 0;
  let essay = draft;
  let quality;
  while (attempts < 2) {
    attempts += 1;
    let voiced;
    try {
      voiced = await voicePass({
        charter,
        draft: essay,
        feedback: quality?.reasons || [],
        callModel,
      });
    } catch (error) {
      return failWith('voice', error.message);
    }
    if (voiced?.body && voiced?.headline) essay = voiced;
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
    now,
  });

  const dayKey = now.toISOString().slice(0, 10);
  authored.lastColumnAt = now.toISOString();
  authored.columnsByDay = { ...(authored.columnsByDay || {}), [dayKey]: (authored.columnsByDay?.[dayKey] || 0) + 1 };
  authored.recentStoryKeys = [...(authored.recentStoryKeys || []), { key: column.story_key, at: now.toISOString() }].slice(-30);
  authored.lastFailure = null;

  return { column };
}
