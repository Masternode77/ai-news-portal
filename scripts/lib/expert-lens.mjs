import { EXPERT_LENS_VERSION } from './constants.mjs';
import {
  EDITORIAL_HUMANIZER_MODE,
  EDITORIAL_HUMANIZER_PROMPT,
  HUMANIZED_ARTICLE_MIN_CHARS,
  containsTemplateLanguage,
  normalizeEditorialParagraphs,
  normalizeEditorialVoice,
} from './editorial-humanizer.mjs';
import {
  bodyUsesBlueprint,
  blueprintFallbackBody,
  blueprintHistoryFromRecords,
  blueprintPrompt,
  blueprintSnapshot,
  getArticleBlueprint,
  selectArticleBlueprint,
} from './article-blueprints.mjs';
import {
  articleHasExpertInsight,
  expertInsightUsageScore,
  insightFieldSummary,
} from './expert-insight-engine.mjs';
import { callExpertLensText } from './openrouter.mjs';
import { BANNED_PHRASES, BLOCKED_HOOK_STARTS, hasBannedPhrase } from './banned-phrases.mjs';
import {
  GENERATION_VERSION,
  buildNarrativeLensFields,
  extractNarrativeDNA,
} from './narrative-dna.mjs';
import { safeJsonParse, sanitizeGeneratedText, slugify, truncate } from './normalize.mjs';

const EXPERT_LENS_MODE = EDITORIAL_HUMANIZER_MODE;

function splitParagraphs(text = '') {
  return normalizeEditorialParagraphs(sanitizeGeneratedText(text));
}

function buildHeadlineOptions(article) {
  const source = article.source || 'market';
  const category = article.category || 'AI infrastructure';
  return [
    `${article.title}`,
    `${source}: the execution test behind the latest ${category.toLowerCase()} move`,
    `The bottleneck behind ${article.title}`,
    `${article.title} puts execution back in focus`,
    `What to watch after ${article.title}`,
  ].map((headline) => truncate(headline, 110));
}

function finalArticleBody(article, sections, candidate = '', blueprint, enforceBlueprint = false) {
  const body = normalizeEditorialParagraphs(candidate)
    .filter((paragraph) => !/^(why it matters|pressure points|market implications|what to watch)$/i.test(paragraph))
    .join('\n\n');
  const minChars = enforceBlueprint ? blueprint?.minChars || HUMANIZED_ARTICLE_MIN_CHARS : Math.min(HUMANIZED_ARTICLE_MIN_CHARS, 850);
  const maxChars = blueprint?.maxChars ? blueprint.maxChars + 400 : Number.POSITIVE_INFINITY;
  if (
    body.length >= minChars &&
    (!enforceBlueprint || body.length <= maxChars) &&
    (!enforceBlueprint || bodyUsesBlueprint(body, blueprint)) &&
    (!enforceBlueprint || !articleHasExpertInsight(article) || expertInsightUsageScore(body, article.expert_insight || article.expertInsight) >= 0.55) &&
    !containsTemplateLanguage(body) &&
    !hasBannedPhrase(body)
  ) {
    return body;
  }
  return blueprintFallbackBody(article, sections, blueprint);
}

function normalizeExecutiveSummary(value = [], fallback = []) {
  const source = Array.isArray(value) ? value : String(value || '').split(/\n+/);
  return [...source, ...fallback]
    .map((line) => sanitizeGeneratedText(String(line || '').replace(/^[-•\d.\s]+/, '')))
    .map((line) => normalizeEditorialVoice(line))
    .filter(Boolean)
    .slice(0, 3);
}

function resolveArticleBlueprint(article = {}, recentBlueprintIds = []) {
  return getArticleBlueprint(
    article.article_blueprint || article.articleBlueprint?.id || article.expertLensFull?.blueprintId
  ) || selectArticleBlueprint(article, recentBlueprintIds);
}

function withBlueprintFields(article = {}, blueprint) {
  const selected = blueprint || resolveArticleBlueprint(article);
  return {
    ...article,
    article_blueprint: selected.id,
    articleBlueprint: blueprintSnapshot(selected),
  };
}

function fallbackExpertLensFull(article, blueprint = resolveArticleBlueprint(article)) {
  const humanized = buildNarrativeLensFields(article);
  const thesis = truncate(humanized.thesis, 160);
  const whatHappened = truncate(humanized.whatHappened, 500);
  const whyThisMatters = truncate(humanized.whyThisMatters, 500);
  const marketMissing = truncate(humanized.marketMissing, 500);
  const investors = truncate(humanized.investors, 500);
  const operators = truncate(humanized.operators, 500);
  const hyperscalers = truncate(humanized.hyperscalers, 500);
  const watchNext = truncate(humanized.watchNext, 500);
  const executiveSummary = normalizeExecutiveSummary(humanized.executiveSummary, [
    thesis,
    whyThisMatters,
    watchNext,
  ]);
  const headlineOptions = buildHeadlineOptions(article);
  const finalHeadline = headlineOptions[0];
  const metaDescription = truncate(
    `${whatHappened} ${whyThisMatters}`,
    160
  );

  const sections = {
    thesis,
    whatHappened,
    whyThisMatters,
    marketMissing,
    investors,
    operators,
    hyperscalers,
    watchNext,
    summary: humanized.summary,
    category: humanized.category,
  };

  return {
    version: EXPERT_LENS_VERSION,
    mode: EXPERT_LENS_MODE,
    generatedAt: new Date().toISOString(),
    generation_version: GENERATION_VERSION,
    narrative_dna: humanized.narrative_dna,
    dynamicBriefLabel: humanized.dynamicBriefLabel,
    blueprintId: blueprint.id,
    blueprintName: blueprint.name,
    blueprint: blueprintSnapshot(blueprint),
    thesis,
    whatHappened,
    whyThisMatters,
    marketMissing,
    investors,
    operators,
    hyperscalers,
    watchNext,
    executiveSummary,
    headlineOptions,
    finalHeadline,
    metaDescription,
    finalArticleBody: finalArticleBody(article, sections, humanized.finalArticleBody, blueprint, false),
    sourceLink: article.sourceUrl || article.url || '',
  };
}

function normalizeHeadlineOptions(headlineOptions = [], fallback = []) {
  const cleaned = [...headlineOptions, ...fallback]
    .map((value) => truncate(String(value || '').trim(), 110))
    .filter(Boolean);

  return cleaned.slice(0, 5);
}

function normalizeExpertLensFull(article, payload, blueprint = resolveArticleBlueprint(article), options = {}) {
  const fallback = fallbackExpertLensFull(article, blueprint);
  const parsed = typeof payload === 'string' ? safeJsonParse(payload, null) : payload;
  if (!parsed || typeof parsed !== 'object') {
    return fallback;
  }
  const selectedBlueprint = getArticleBlueprint(parsed.blueprintId) || blueprint;

  const normalized = {
    version: EXPERT_LENS_VERSION,
    mode: parsed.mode || fallback.mode,
    generatedAt: parsed.generatedAt || new Date().toISOString(),
    generation_version: GENERATION_VERSION,
    narrative_dna: parsed.narrative_dna || fallback.narrative_dna || extractNarrativeDNA(article),
    dynamicBriefLabel: parsed.dynamicBriefLabel || parsed.briefLabel || fallback.dynamicBriefLabel || fallback.narrative_dna?.brief_label,
    blueprintId: selectedBlueprint.id,
    blueprintName: selectedBlueprint.name,
    blueprint: blueprintSnapshot(selectedBlueprint),
    thesis: truncate(parsed.thesis || fallback.thesis, 160),
    whatHappened: truncate(parsed.whatHappened || fallback.whatHappened, 500),
    whyThisMatters: truncate(parsed.whyThisMatters || fallback.whyThisMatters, 500),
    marketMissing: truncate(parsed.marketMissing || fallback.marketMissing, 500),
    investors: truncate(parsed.investors || fallback.investors, 500),
    operators: truncate(parsed.operators || fallback.operators, 500),
    hyperscalers: truncate(parsed.hyperscalers || fallback.hyperscalers, 500),
    watchNext: truncate(parsed.watchNext || fallback.watchNext, 500),
    executiveSummary: normalizeExecutiveSummary(parsed.executiveSummary, fallback.executiveSummary),
    headlineOptions: normalizeHeadlineOptions(parsed.headlineOptions, fallback.headlineOptions),
    finalHeadline: truncate(parsed.finalHeadline || fallback.finalHeadline || article.title, 120),
    metaDescription: truncate(parsed.metaDescription || fallback.metaDescription, 170),
    finalArticleBody: '',
    sourceLink: parsed.sourceLink || fallback.sourceLink,
  };

  for (const key of ['thesis', 'whatHappened', 'whyThisMatters', 'marketMissing', 'investors', 'operators', 'hyperscalers', 'watchNext', 'finalHeadline', 'metaDescription']) {
    normalized[key] = normalizeEditorialVoice(sanitizeGeneratedText(normalized[key]));
    if (hasBannedPhrase(normalized[key])) {
      normalized[key] = fallback[key] || '';
    }
  }

  normalized.headlineOptions = normalized.headlineOptions
    .map((headline) => normalizeEditorialVoice(sanitizeGeneratedText(headline)))
    .filter((headline) => headline && !hasBannedPhrase(headline));

  normalized.finalArticleBody = finalArticleBody(
    article,
    normalized,
    parsed.finalArticleBody || fallback.finalArticleBody || '',
    selectedBlueprint,
    parsed.generation_version === GENERATION_VERSION || parsed.narrative_dna
      ? false
      : options.enforceBlueprint || Boolean(parsed.blueprintId || article.article_blueprint || article.articleBlueprint?.id)
  );

  if (!normalized.finalArticleBody) {
    normalized.finalArticleBody = fallback.finalArticleBody;
  }

  if (hasBannedPhrase(normalized.finalArticleBody)) {
    normalized.finalArticleBody = fallback.finalArticleBody;
  }

  if (normalized.headlineOptions.length < 5) {
    normalized.headlineOptions = normalizeHeadlineOptions(normalized.headlineOptions, fallback.headlineOptions);
  }

  return normalized;
}

function buildExpertLensShort(fullLens, fallbackShort = '') {
  return truncate(
    fullLens?.thesis || fullLens?.whyThisMatters || fallbackShort,
    220
  );
}

export function hydrateExpertLens(article = {}) {
  const existingBlueprint = getArticleBlueprint(
    article.article_blueprint || article.articleBlueprint?.id || article.expertLensFull?.blueprintId
  );
  const blueprint = existingBlueprint || resolveArticleBlueprint(article);
  const short = truncate(article.expertLensShort || article.expertLens || '', 220) || null;
  const full = article.expertLensFull && typeof article.expertLensFull === 'object'
    ? normalizeExpertLensFull(article, article.expertLensFull, blueprint)
    : null;
  const persistedBlueprint = existingBlueprint || (full ? getArticleBlueprint(full.blueprintId) : null);

  return {
    ...article,
    article_blueprint: article.article_blueprint || full?.blueprintId || null,
    articleBlueprint: article.articleBlueprint || full?.blueprint || (persistedBlueprint ? blueprintSnapshot(persistedBlueprint) : null),
    expertLensShort: short || (full ? buildExpertLensShort(full) : null),
    expertLensFull: full,
    expertLens: short || (full ? buildExpertLensShort(full) : null),
  };
}

export function mergeArticleRecords(primary = {}, secondary = {}) {
  const left = hydrateExpertLens(primary);
  const right = hydrateExpertLens(secondary);
  const merged = {
    ...right,
    ...left,
  };

  for (const [key, value] of Object.entries(right)) {
    const current = merged[key];
    if (current === undefined || current === null || current === '' || (Array.isArray(current) && !current.length)) {
      merged[key] = value;
    }
  }

  const mergedFull = left.expertLensFull || right.expertLensFull || null;
  const mergedShort = left.expertLensShort || right.expertLensShort || buildExpertLensShort(mergedFull, '');

  return {
    ...merged,
    slug: merged.slug || slugify(merged.title || ''),
    expertLensShort: mergedShort || null,
    expertLensFull: mergedFull,
    expertLens: mergedShort || null,
    article_blueprint: merged.article_blueprint || mergedFull?.blueprintId || null,
    articleBlueprint: merged.articleBlueprint || mergedFull?.blueprint || null,
  };
}

function needsExpertLens(article) {
  const hydrated = hydrateExpertLens(article);
  return !hydrated.expertLensFull || !hydrated.expertLensShort;
}

function strictGenerationError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.retryable = code === 'editorial_service_unavailable';
  return error;
}

const STRICT_LENS_TEXT_FIELDS = Object.freeze([
  'dynamicBriefLabel',
  'thesis',
  'whatHappened',
  'whyThisMatters',
  'marketMissing',
  'investors',
  'operators',
  'hyperscalers',
  'watchNext',
  'finalHeadline',
  'metaDescription',
]);

const STRICT_NARRATIVE_FIELDS = Object.freeze([
  'protagonist',
  'antagonist_or_constraint',
  'core_tension',
  'reader_role',
  'infrastructure_layer',
  'time_horizon',
  'story_archetype',
  'hook_style',
  'evidence_anchor',
  'counterpoint',
  'next_observable_signal',
]);

function strictText(value, maxLength = 0) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const cleaned = normalizeEditorialVoice(sanitizeGeneratedText(value));
  if (!cleaned || hasBannedPhrase(cleaned)) return '';
  return maxLength ? truncate(cleaned, maxLength) : cleaned;
}

function strictTextArray(value, { minimum, maximum, maxLength }) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) return null;
  const cleaned = value.map((entry) => strictText(entry, maxLength));
  return cleaned.every(Boolean) ? cleaned : null;
}

export function validateStrictExpertLensPayload(payload, {
  blueprintId,
  generationVersion = GENERATION_VERSION,
  sourceLink,
} = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (payload.blueprintId !== blueprintId || payload.generation_version !== generationVersion) return null;
  if (!payload.narrative_dna
    || typeof payload.narrative_dna !== 'object'
    || Array.isArray(payload.narrative_dna)
    || STRICT_NARRATIVE_FIELDS.some((field) => !strictText(payload.narrative_dna[field], 240))) {
    return null;
  }
  const expectedSourceLink = String(sourceLink || '').trim();
  const returnedSourceLink = String(payload.sourceLink || '').trim();
  if (!expectedSourceLink || returnedSourceLink !== expectedSourceLink) return null;
  const normalized = {};
  const limits = {
    dynamicBriefLabel: 80,
    thesis: 160,
    whatHappened: 500,
    whyThisMatters: 500,
    marketMissing: 500,
    investors: 500,
    operators: 500,
    hyperscalers: 500,
    watchNext: 500,
    finalHeadline: 120,
    metaDescription: 170,
  };
  for (const field of STRICT_LENS_TEXT_FIELDS) {
    normalized[field] = strictText(payload[field], limits[field]);
    if (!normalized[field]) return null;
  }
  const executiveSummary = strictTextArray(payload.executiveSummary, {
    minimum: 2,
    maximum: 3,
    maxLength: 220,
  });
  const headlineOptions = strictTextArray(payload.headlineOptions, {
    minimum: 3,
    maximum: 5,
    maxLength: 110,
  });
  const finalArticleBody = normalizeEditorialParagraphs(
    sanitizeGeneratedText(payload.finalArticleBody || ''),
  ).join('\n\n');
  if (!executiveSummary || !headlineOptions || !finalArticleBody || hasBannedPhrase(finalArticleBody)) {
    return null;
  }
  return {
    ...normalized,
    blueprintId,
    generation_version: generationVersion,
    narrative_dna: structuredClone(payload.narrative_dna),
    executiveSummary,
    headlineOptions,
    finalArticleBody,
    sourceLink: expectedSourceLink,
  };
}

async function generateExpertLensFull(article, blueprint) {
  if (!articleHasExpertInsight(article)) {
    throw strictGenerationError(
      'expert_insight_incomplete',
      'expert insight fields are incomplete; refusing long-form generation',
    );
  }
  const expertInsight = article.expert_insight || article.expertInsight || {};
  const content = await callExpertLensText({
    systemPrompt: [
      'You are the editorial voice for an AI infrastructure intelligence publication.',
      'Write like a top-tier business technology editor covering AI, data centers, power, semiconductors, and cloud infrastructure.',
      EDITORIAL_HUMANIZER_PROMPT,
      `Use NarrativeDNA before writing: protagonist, antagonist_or_constraint, core_tension, reader_role, infrastructure_layer, time_horizon, story_archetype, hook_style, evidence_anchor, counterpoint, next_observable_signal.`,
      `Do not use any banned phrase: ${BANNED_PHRASES.join(' | ')}.`,
      `No hook or lead sentence may begin with: ${BLOCKED_HOOK_STARTS.join(' | ')}.`,
      'The output must be decision-grade, accurate, skeptical, and free of generic hype or unsupported certainty.',
      'Use the extracted expert insight fields and do not substitute generic infrastructure analysis.',
      blueprintPrompt(blueprint),
      'Return strict JSON only with keys: blueprintId, generation_version, narrative_dna, dynamicBriefLabel, thesis, whatHappened, whyThisMatters, marketMissing, investors, operators, hyperscalers, watchNext, executiveSummary, headlineOptions, finalHeadline, metaDescription, finalArticleBody, sourceLink.',
      `generation_version must be "${GENERATION_VERSION}" and blueprintId must be "${blueprint.id}".`,
      'The finalArticleBody must use the selected blueprint headings, preserve uncertainty, and contain no unsupported claims.',
    ].join(' '),
    userPrompt: JSON.stringify({
      selectedBlueprint: blueprintSnapshot(blueprint),
      title: article.title,
      source: article.source,
      category: article.category,
      region: article.region,
      publishedAt: article.publishedAt,
      summary: article.summary,
      snippet: article.snippet,
      articleText: article.articleText,
      sourceLink: article.sourceUrl || article.url,
      expertInsight,
      expertInsightFieldSummary: insightFieldSummary(expertInsight),
      narrativeDNA: extractNarrativeDNA(article),
    }),
    maxTokens: 2600,
  }).catch(() => '');

  if (!content) {
    throw strictGenerationError(
      'editorial_service_unavailable',
      'editorial service returned no long-form response; downgrade to Source Signal',
    );
  }
  const parsed = safeJsonParse(content, null);
  const strict = validateStrictExpertLensPayload(parsed, {
    blueprintId: blueprint.id,
    sourceLink: article.sourceUrl || article.url,
  });
  const body = strict?.finalArticleBody || '';
  if (
    !strict
    || body.length < (blueprint.minChars || HUMANIZED_ARTICLE_MIN_CHARS)
    || body.length > (blueprint.maxChars || Number.POSITIVE_INFINITY) + 400
    || !bodyUsesBlueprint(body, blueprint)
    || expertInsightUsageScore(body, expertInsight) < 0.55
    || containsTemplateLanguage(body)
    || hasBannedPhrase(body)
  ) {
    throw strictGenerationError(
      'editorial_generation_invalid',
      'editorial response failed long-form structure, evidence, or diversity validation',
    );
  }
  return {
    version: EXPERT_LENS_VERSION,
    mode: EXPERT_LENS_MODE,
    generatedAt: new Date().toISOString(),
    ...strict,
    blueprintName: blueprint.name,
    blueprint: blueprintSnapshot(blueprint),
  };
}

async function enrichSingleArticle(article, options = {}) {
  const hydrated = hydrateExpertLens(article);
  const blueprint = resolveArticleBlueprint(hydrated, options.recentBlueprintIds || []);
  const articleWithBlueprint = withBlueprintFields(hydrated, blueprint);
  if (!needsExpertLens(hydrated)) {
    return articleWithBlueprint;
  }

  const full = articleWithBlueprint.expertLensFull || await generateExpertLensFull(articleWithBlueprint, blueprint);
  const short = articleWithBlueprint.expertLensShort || buildExpertLensShort(full, hydrated.summary || hydrated.snippet || hydrated.title);

  return {
    ...articleWithBlueprint,
    expertLensShort: short,
    expertLensFull: full,
    expertLens: short,
    generation_version: GENERATION_VERSION,
    narrative_dna: full.narrative_dna || extractNarrativeDNA(articleWithBlueprint),
    dynamic_brief_label: full.dynamicBriefLabel || full.narrative_dna?.brief_label || null,
    article_blueprint: full.blueprintId || blueprint.id,
    articleBlueprint: full.blueprint || blueprintSnapshot(blueprint),
  };
}

export async function attachExpertLens(articles = [], options = {}) {
  const results = [];
  const recentBlueprintIds = [...(options.recentBlueprintIds || [])];

  for (const article of articles) {
    const enriched = await enrichSingleArticle(article, { recentBlueprintIds });
    results.push(enriched);
    if (enriched.article_blueprint) {
      recentBlueprintIds.unshift(enriched.article_blueprint);
    }
  }

  return results;
}

export async function attachExpertLensStrict(articles = [], options = {}) {
  const results = [];
  const recentBlueprintIds = [...(options.recentBlueprintIds || [])];
  for (const article of articles) {
    // Strict generation never hydrates persisted lens data because legacy hydration is
    // intentionally fallback-capable. A candidate must earn a fresh validated draft.
    const cleanCandidate = {
      ...article,
      expertLens: null,
      expertLensShort: null,
      expertLensFull: null,
    };
    const blueprint = resolveArticleBlueprint(cleanCandidate, recentBlueprintIds);
    const articleWithBlueprint = withBlueprintFields(cleanCandidate, blueprint);
    const full = await generateExpertLensFull(articleWithBlueprint, blueprint);
    const short = buildExpertLensShort(full, articleWithBlueprint.summary || articleWithBlueprint.snippet || articleWithBlueprint.title);
    const enriched = {
      ...articleWithBlueprint,
      expertLensShort: short,
      expertLensFull: full,
      expertLens: short,
      generation_version: GENERATION_VERSION,
      narrative_dna: full.narrative_dna || extractNarrativeDNA(articleWithBlueprint),
      dynamic_brief_label: full.dynamicBriefLabel || full.narrative_dna?.brief_label || null,
      article_blueprint: full.blueprintId || blueprint.id,
      articleBlueprint: full.blueprint || blueprintSnapshot(blueprint),
    };
    results.push(enriched);
    if (enriched.article_blueprint) recentBlueprintIds.unshift(enriched.article_blueprint);
  }
  return results;
}

export function expertLensBodyParagraphs(article = {}) {
  return splitParagraphs(article?.expertLensFull?.finalArticleBody || article?.articleText || '');
}

export { blueprintHistoryFromRecords };
