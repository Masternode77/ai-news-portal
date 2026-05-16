import { EXPERT_LENS_VERSION } from './constants.mjs';
import {
  EDITORIAL_HUMANIZER_MODE,
  EDITORIAL_HUMANIZER_PROMPT,
  buildHumanizedArticleBody,
  containsTemplateLanguage,
  humanizedFallbackSections,
  normalizeEditorialParagraphs,
  normalizeEditorialVoice,
} from './editorial-humanizer.mjs';
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

function finalArticleBody(article, sections, candidate = '') {
  const body = normalizeEditorialParagraphs(candidate).join('\n\n');
  if (body && !containsTemplateLanguage(body)) {
    return body;
  }
  return buildHumanizedArticleBody(article, sections);
}

function normalizeExecutiveSummary(value = [], fallback = []) {
  const source = Array.isArray(value) ? value : String(value || '').split(/\n+/);
  return [...source, ...fallback]
    .map((line) => sanitizeGeneratedText(String(line || '').replace(/^[-•\d.\s]+/, '')))
    .map((line) => normalizeEditorialVoice(line))
    .filter(Boolean)
    .slice(0, 3);
}

function fallbackExpertLensFull(article) {
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
    finalArticleBody: finalArticleBody(article, sections),
    sourceLink: article.sourceUrl || article.url || '',
  };
}

function normalizeHeadlineOptions(headlineOptions = [], fallback = []) {
  const cleaned = [...headlineOptions, ...fallback]
    .map((value) => truncate(String(value || '').trim(), 110))
    .filter(Boolean);

  return cleaned.slice(0, 5);
}

function normalizeExpertLensFull(article, payload) {
  const fallback = fallbackExpertLensFull(article);
  const parsed = typeof payload === 'string' ? safeJsonParse(payload, null) : payload;
  if (!parsed || typeof parsed !== 'object') {
    return fallback;
  }

  const normalized = {
    version: EXPERT_LENS_VERSION,
    mode: parsed.mode || fallback.mode,
    generatedAt: parsed.generatedAt || new Date().toISOString(),
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

  normalized.finalArticleBody = finalArticleBody(article, normalized, parsed.finalArticleBody || fallback.finalArticleBody || '');

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
  const short = truncate(article.expertLensShort || article.expertLens || '', 220) || null;
  const full = article.expertLensFull && typeof article.expertLensFull === 'object'
    ? normalizeExpertLensFull(article, article.expertLensFull)
    : null;

  return {
    ...article,
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
  };
}

function needsExpertLens(article) {
  const hydrated = hydrateExpertLens(article);
  return !hydrated.expertLensFull || !hydrated.expertLensShort;
}

async function generateExpertLensFull(article) {
  const fallback = fallbackExpertLensFull(article);
  const content = await callExpertLensText({
    systemPrompt: [
      'You are the editorial voice for an AI infrastructure intelligence publication.',
      'Write like a top-tier business technology editor covering AI, data centers, power, semiconductors, and cloud infrastructure.',
      EDITORIAL_HUMANIZER_PROMPT,
      'The output must be decision-grade, accurate, skeptical, and free of generic hype or unsupported certainty.',
      'Use this logic in order: report what changed, explain why the development matters now, identify 1-2 underappreciated constraints, name practical implications for the most relevant audience, then end with what to watch next.',
      'Return strict JSON only with keys: thesis, whatHappened, whyThisMatters, marketMissing, investors, operators, hyperscalers, watchNext, executiveSummary, headlineOptions, finalHeadline, metaDescription, finalArticleBody, sourceLink.',
      'executiveSummary must be exactly 3 short lines for busy readers: what changed, why it matters, and what to watch.',
      'headlineOptions must be an array of exactly 5 concise headline ideas written in English, each with a concrete hook that invites a click without hype.',
      'finalHeadline must use the strongest hook while preserving the source facts.',
      'Keep each section concise but substantive. Do not invent facts or numbers not grounded in the provided context.',
      'The finalArticleBody is the primary deliverable. Write 4-6 short paragraphs of reported analysis, not bullets, not a memo, and not a repeated section template.',
    ].join(' '),
    userPrompt: JSON.stringify({
      title: article.title,
      source: article.source,
      category: article.category,
      region: article.region,
      publishedAt: article.publishedAt,
      summary: article.summary,
      snippet: article.snippet,
      articleText: article.articleText,
      sourceLink: article.sourceUrl || article.url,
    }),
    maxTokens: 1600,
  }).catch(() => '');

  return normalizeExpertLensFull(article, content || fallback);
}

async function enrichSingleArticle(article) {
  const hydrated = hydrateExpertLens(article);
  if (!needsExpertLens(hydrated)) {
    return hydrated;
  }

  const full = hydrated.expertLensFull || await generateExpertLensFull(hydrated);
  const short = hydrated.expertLensShort || buildExpertLensShort(full, hydrated.summary || hydrated.snippet || hydrated.title);

  return {
    ...hydrated,
    expertLensShort: short,
    expertLensFull: full,
    expertLens: short,
  };
}

export async function attachExpertLens(articles = []) {
  return Promise.all(articles.map((article) => enrichSingleArticle(article)));
}

export function expertLensBodyParagraphs(article = {}) {
  return splitParagraphs(article?.expertLensFull?.finalArticleBody || article?.articleText || '');
}
