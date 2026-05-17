import { EXPERT_LENS_VERSION } from './constants.mjs';
import {
  EDITORIAL_HUMANIZER_MODE,
  EDITORIAL_HUMANIZER_PROMPT,
  HUMANIZED_ARTICLE_MIN_CHARS,
  containsTemplateLanguage,
  humanizedFallbackSections,
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
import { safeJsonParse, sanitizeGeneratedText, slugify, truncate } from './normalize.mjs';

const EXPERT_LENS_MODE = EDITORIAL_HUMANIZER_MODE;

function splitParagraphs(text = '') {
  return normalizeEditorialParagraphs(sanitizeGeneratedText(text));
}

function inferSignal(article) {
  const text = `${article.title} ${article.summary || ''} ${article.articleText || ''}`.toLowerCase();
  if (/(power|grid|utility|substation|energy|ppa|transformer)/.test(text)) {
    return 'Power access and interconnection timing are likely to matter more than the announced demand signal itself.';
  }
  if (/(cooling|thermal|liquid|cdu|rack|density)/.test(text)) {
    return 'Cooling design standardization may determine who can actually monetize higher-density deployments on schedule.';
  }
  if (/(nvidia|gpu|hbm|inference|training|semiconductor|chip|silicon)/.test(text)) {
    return 'The underappreciated variable is deployment readiness across networking, power, and packaging, not just chip availability.';
  }
  if (/(funding|bond|financing|acquisition|merger|valuation|capital)/.test(text)) {
    return 'Capital formation here should be read as a proxy for who is being trusted to secure future capacity, not only as a balance-sheet event.';
  }
  return 'Execution speed, supply-chain coordination, and regional delivery risk remain more important than headline ambition.';
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
  const minChars = enforceBlueprint ? blueprint?.minChars || HUMANIZED_ARTICLE_MIN_CHARS : HUMANIZED_ARTICLE_MIN_CHARS;
  const maxChars = blueprint?.maxChars ? blueprint.maxChars + 400 : Number.POSITIVE_INFINITY;
  if (
    body.length >= minChars &&
    (!enforceBlueprint || body.length <= maxChars) &&
    (!enforceBlueprint || bodyUsesBlueprint(body, blueprint)) &&
    (!enforceBlueprint || !articleHasExpertInsight(article) || expertInsightUsageScore(body, article.expert_insight || article.expertInsight) >= 0.55) &&
    !containsTemplateLanguage(body)
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
  const humanized = humanizedFallbackSections(article, inferSignal(article));
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
    finalArticleBody: finalArticleBody(article, sections, '', blueprint, true),
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
  }

  normalized.headlineOptions = normalized.headlineOptions.map((headline) => normalizeEditorialVoice(sanitizeGeneratedText(headline))).filter(Boolean);

  normalized.finalArticleBody = finalArticleBody(
    article,
    normalized,
    parsed.finalArticleBody || fallback.finalArticleBody || '',
    selectedBlueprint,
    options.enforceBlueprint || Boolean(parsed.blueprintId || article.article_blueprint || article.articleBlueprint?.id)
  );

  if (!normalized.finalArticleBody) {
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

async function generateExpertLensFull(article, blueprint) {
  if (!articleHasExpertInsight(article)) {
    throw new Error('expert insight fields are incomplete; refusing generic long-form article generation');
  }
  const fallback = fallbackExpertLensFull(article, blueprint);
  const expertInsight = article.expert_insight || article.expertInsight || {};
  const content = await callExpertLensText({
    systemPrompt: [
      'You are the editorial voice for an AI infrastructure intelligence publication.',
      'Write like a top-tier business technology editor covering AI, data centers, power, semiconductors, and cloud infrastructure.',
      EDITORIAL_HUMANIZER_PROMPT,
      'The output must be decision-grade, accurate, skeptical, and free of generic hype or unsupported certainty.',
      'Use this logic in order: report what changed, explain why the development matters now, identify 1-2 underappreciated constraints, name practical implications for the most relevant audience, then end with what to watch next.',
      'The article must use the extracted expert insight fields. Do not substitute generic infrastructure analysis for missing details.',
      'Every finalArticleBody must explicitly use at least one concrete fact, one named company, the infrastructure layer, bottleneck type, leverage holder, execution-risk holder, timing dependency, counterargument, and next observable signal.',
      blueprintPrompt(blueprint),
      'Return strict JSON only with keys: blueprintId, thesis, whatHappened, whyThisMatters, marketMissing, investors, operators, hyperscalers, watchNext, executiveSummary, headlineOptions, finalHeadline, metaDescription, finalArticleBody, sourceLink.',
      `blueprintId must be "${blueprint.id}".`,
      'executiveSummary must be exactly 3 short lines for busy readers: what changed, why it matters, and what to watch.',
      'headlineOptions must be an array of exactly 5 concise headline ideas written in English, each with a concrete hook that invites a click without hype.',
      'finalHeadline must use the strongest hook while preserving the source facts.',
      'Keep each section concise but substantive. Do not invent facts or numbers not grounded in the provided context.',
      `The finalArticleBody is the primary deliverable. It must include the selected blueprint headings as standalone lines and otherwise be reported analysis, not bullets and not a repeated section template.`,
      'Do not include the headings "Why it matters", "Pressure points", "Market implications", or "What to watch" anywhere in reader-facing copy.',
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
    }),
    maxTokens: 2600,
  }).catch(() => '');

  return normalizeExpertLensFull(article, content || fallback, blueprint, { enforceBlueprint: true });
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

export function expertLensBodyParagraphs(article = {}) {
  return splitParagraphs(article?.expertLensFull?.finalArticleBody || article?.articleText || '');
}

export { blueprintHistoryFromRecords };
