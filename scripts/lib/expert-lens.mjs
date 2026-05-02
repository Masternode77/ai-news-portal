import { EXPERT_LENS_VERSION } from './constants.mjs';
import {
  EDITORIAL_HUMANIZER_MODE,
  EDITORIAL_HUMANIZER_PROMPT,
  humanizedFallbackSections,
} from './editorial-humanizer.mjs';
import { callExpertLensText } from './openrouter.mjs';
import { safeJsonParse, sanitizeGeneratedText, slugify, truncate } from './normalize.mjs';

const EXPERT_LENS_MODE = EDITORIAL_HUMANIZER_MODE;

function splitParagraphs(text = '') {
  return sanitizeGeneratedText(text)
    .split(/\n{2,}/)
    .map((part) => sanitizeGeneratedText(part.replace(/\s+/g, ' ')))
    .filter(Boolean);
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
    `${article.title}: what it changes for ${category.toLowerCase()}`,
    `${source} signal: why this move matters beyond the headline`,
    `${article.title} raises the stakes for operators and investors`,
    `What ${article.title} says about the next bottleneck`,
    `${article.title}: the strategic read-through for cloud and infrastructure`,
  ].map((headline) => truncate(headline, 110));
}

function fallbackFinalArticleBody(article, sections) {
  return [
    sections.whatHappened,
    sections.whyThisMatters,
    sections.marketMissing,
    sections.investors,
    sections.operators,
    sections.hyperscalers,
    sections.watchNext,
  ]
    .filter(Boolean)
    .join('\n\n');
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
    headlineOptions,
    finalHeadline,
    metaDescription,
    finalArticleBody: fallbackFinalArticleBody(article, sections),
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
    headlineOptions: normalizeHeadlineOptions(parsed.headlineOptions, fallback.headlineOptions),
    finalHeadline: truncate(parsed.finalHeadline || fallback.finalHeadline || article.title, 120),
    metaDescription: truncate(parsed.metaDescription || fallback.metaDescription, 170),
    finalArticleBody: sanitizeGeneratedText((parsed.finalArticleBody || fallback.finalArticleBody || '').toString()),
    sourceLink: parsed.sourceLink || fallback.sourceLink,
  };

  for (const key of ['thesis', 'whatHappened', 'whyThisMatters', 'marketMissing', 'investors', 'operators', 'hyperscalers', 'watchNext', 'finalHeadline', 'metaDescription']) {
    normalized[key] = sanitizeGeneratedText(normalized[key]);
  }

  normalized.headlineOptions = normalized.headlineOptions.map((headline) => sanitizeGeneratedText(headline)).filter(Boolean);

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
      'Write like a top-tier industry editor and strategic analyst covering AI, data centers, power, semiconductors, and cloud infrastructure.',
      EDITORIAL_HUMANIZER_PROMPT,
      'The output must be decision-grade, accurate, skeptical, and free of generic hype or unsupported certainty.',
      'Use this logic in order: summarize what happened, explain why it matters, identify 1-2 underappreciated variables, include viewpoints for at least two of investors / operators / hyperscalers, then end with what to watch next.',
      'Return strict JSON only with keys: thesis, whatHappened, whyThisMatters, marketMissing, investors, operators, hyperscalers, watchNext, headlineOptions, finalHeadline, metaDescription, finalArticleBody, sourceLink.',
      'headlineOptions must be an array of exactly 5 concise headline ideas written in English.',
      'Keep each section concise but substantive. Do not invent facts or numbers not grounded in the provided context.',
      'The finalArticleBody should read like a polished final article built from the prior sections, in multiple paragraphs.',
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
