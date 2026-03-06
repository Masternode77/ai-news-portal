import { CATEGORIES } from './constants.mjs';
import {
  buildFallbackTags,
  guessLanguage,
  inferCategory,
  inferRegion,
  slugify,
  truncate,
  unique,
} from './normalize.mjs';
import { callOpenRouterJson } from './openrouter.mjs';
import { fetchArticleExcerpt } from './source-fetch.mjs';

function fallbackSummary(item, articleText = '') {
  const base = articleText || item.snippet || item.title;
  return truncate(base, 180);
}

function inferTheme(text = '') {
  const lower = text.toLowerCase();
  if (/(gpu|nvidia|amd|inference|training|cluster|hbm)/.test(lower)) {
    return 'compute supply, deployment speed, and network orchestration';
  }
  if (/(power|grid|utility|substation|energy)/.test(lower)) {
    return 'time-to-power, campus sequencing, and capex timing';
  }
  if (/(cooling|thermal|liquid|mep|rack)/.test(lower)) {
    return 'rack-density readiness, fit-out complexity, and uptime discipline';
  }
  if (/(funding|financing|valuation|merger|acquisition|joint venture)/.test(lower)) {
    return 'pricing power, capital structure, and demand confidence';
  }
  if (/(policy|regulation|permit|korea|singapore|japan|malaysia|india)/.test(lower)) {
    return 'market access, permitting speed, and regional execution risk';
  }
  return 'AI infrastructure execution risk';
}

function fallbackInsight(item, articleText = '') {
  const theme = inferTheme(`${item.title} ${item.snippet} ${articleText}`);
  return truncate(
    `Expert lens: This signal matters because it changes ${theme}; operators and investors that align power, facility design, network topology, and silicon timing will compound the advantage faster than teams optimizing any single layer alone.`,
    260
  );
}

function fallbackImagePrompt(item, category, summary) {
  return [
    'Editorial hero image for enterprise technology news.',
    'No logos, no text, no watermark, no brand marks.',
    `Topic: ${item.title}.`,
    `Category: ${category}.`,
    `Mood: premium, cinematic, monochrome glass dashboard aesthetic.`,
    `Context: ${summary}.`,
    'Include modern data center, network, semiconductor, cloud, or grid motifs only when relevant.',
    '16:9 composition.',
  ].join(' ');
}

function normalizeAiPayload(aiPayload, fallback) {
  if (!aiPayload || typeof aiPayload !== 'object') return fallback;

  const summary = truncate(aiPayload.summary || fallback.summary, 180);
  const insight = truncate(aiPayload.insight || fallback.insight, 260);
  const category = CATEGORIES.includes(aiPayload.category) ? aiPayload.category : fallback.category;
  const tags = unique([...(Array.isArray(aiPayload.tags) ? aiPayload.tags : []), ...fallback.tags]).slice(0, 6);
  const region = aiPayload.region || fallback.region;
  const imagePrompt = aiPayload.imagePrompt || fallback.imagePrompt;
  return {
    ...fallback,
    summary,
    insight,
    category,
    tags,
    region,
    imagePrompt,
  };
}

export async function enrichContent(item) {
  const articleText = await fetchArticleExcerpt(item.url, item.snippet);
  const category = inferCategory(`${item.title} ${item.snippet} ${articleText}`, item.defaultCategory || item.categoryHint);
  const region = inferRegion(`${item.title} ${item.snippet} ${articleText}`, item.region || 'Global');
  const summary = fallbackSummary(item, articleText);
  const fallback = {
    summary,
    insight: fallbackInsight(item, articleText),
    category,
    tags: buildFallbackTags(`${item.title} ${item.snippet} ${articleText}`, category),
    region,
    imagePrompt: fallbackImagePrompt(item, category, summary),
  };

  const aiPayload = await callOpenRouterJson({
    systemPrompt: [
      'You are a veteran editor covering data centers, hyperscalers, cloud infrastructure, semiconductors, power markets, and AI deployment.',
      'Write like a senior operator and investor briefing analyst.',
      'Return JSON only with keys: summary, insight, category, tags, region, imagePrompt.',
      'summary: 1-2 sentences, 180 characters max, crisp and factual.',
      'insight: 2 sentences max, focused on why this matters for operators / investors / capacity planners.',
      `category must be one of: ${CATEGORIES.join(' | ')}`,
      'tags: array of up to 6 concise lowercase tags.',
      'region: short market label like Global, Korea, APAC, US, EU, MiddleEast.',
      'imagePrompt: premium editorial image prompt, 16:9, no logos, no text.',
      'Do not invent facts or numbers not supported by the source text.',
    ].join(' '),
    userPrompt: JSON.stringify({
      title: item.title,
      source: item.source,
      url: item.url,
      publishedAt: item.publishedAt,
      snippet: item.snippet,
      articleText,
      defaultCategory: item.defaultCategory || item.categoryHint || null,
      defaultRegion: item.region || null,
    }),
    maxTokens: 700,
  }).catch(() => null);

  const normalized = normalizeAiPayload(aiPayload, fallback);

  return {
    ...item,
    slug: slugify(item.title),
    summary: normalized.summary,
    insight: normalized.insight,
    category: normalized.category,
    tags: normalized.tags,
    region: normalized.region,
    imagePrompt: normalized.imagePrompt,
    lang: guessLanguage(`${item.title} ${item.snippet} ${articleText}`),
    articleText,
  };
}
