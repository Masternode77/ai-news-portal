import {
  ARCHIVE_NEWS_PATH,
  LATEST_NEWS_PATH,
  SEARCH_INDEX_PATH,
} from './lib/constants.mjs';
import {
  buildHumanizedArticleBody,
  containsTemplateLanguage,
  humanizedFallbackSections,
  normalizeEditorialParagraphs,
  normalizeEditorialVoice,
} from './lib/editorial-humanizer.mjs';
import { readJsonFile, writeJsonFile } from './lib/state-store.mjs';
import { slugify, truncate, unique } from './lib/normalize.mjs';

const DRY_RUN = process.argv.includes('--dry-run');

function normalizeLens(article = {}) {
  const lens = article.expertLensFull;
  if (!lens || typeof lens !== 'object') return lens || null;

  const normalized = { ...lens };
  const fallback = humanizedFallbackSections(
    article,
    normalizeEditorialVoice(lens.marketMissing || 'Execution risk is still the variable worth watching.')
  );
  for (const key of [
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
  ]) {
    normalized[key] = normalizeEditorialVoice(normalized[key] || '');
  }

  normalized.thesis = fallback.thesis;
  if (containsTemplateLanguage(normalized.whyThisMatters)) normalized.whyThisMatters = fallback.whyThisMatters;
  if (containsTemplateLanguage(normalized.investors)) normalized.investors = fallback.investors;
  if (containsTemplateLanguage(normalized.operators)) normalized.operators = fallback.operators;
  if (containsTemplateLanguage(normalized.hyperscalers)) normalized.hyperscalers = fallback.hyperscalers;

  normalized.executiveSummary = Array.isArray(lens.executiveSummary)
    ? lens.executiveSummary.map(normalizeEditorialVoice).filter(Boolean).slice(0, 3)
    : [];
  normalized.executiveSummary = normalized.executiveSummary.map((line, index) => (
    containsTemplateLanguage(line) ? fallback.executiveSummary[index] || fallback.thesis : line
  )).slice(0, 3);
  normalized.headlineOptions = Array.isArray(lens.headlineOptions)
    ? lens.headlineOptions.map(normalizeEditorialVoice).filter(Boolean).slice(0, 5)
    : [];
  normalized.headlineOptions = normalized.headlineOptions.map((headline) => (
    containsTemplateLanguage(headline) || /capacity question/i.test(headline) ? article.title : headline
  ));

  normalized.finalArticleBody = buildHumanizedArticleBody(article, {
    ...normalized,
    summary: article.summary || article.snippet || article.articleText || article.title,
    category: article.category,
  });

  normalized.metaDescription = truncate(
    containsTemplateLanguage(normalized.metaDescription)
      ? normalized.thesis || article.summary || article.snippet || article.title
      : normalized.metaDescription || normalized.thesis || article.summary || article.snippet || article.title,
    170
  );
  normalized.finalHeadline = truncate(
    containsTemplateLanguage(normalized.finalHeadline) || /capacity question/i.test(normalized.finalHeadline)
      ? article.title
      : normalized.finalHeadline || article.title,
    120
  );

  return normalized;
}

function normalizeArticle(article = {}) {
  const normalized = {
    ...article,
    summary: normalizeEditorialVoice(article.summary || ''),
    snippet: normalizeEditorialVoice(article.snippet || ''),
    insight: normalizeEditorialVoice(article.insight || ''),
    articleText: normalizeEditorialVoice(article.articleText || ''),
    expertLensShort: normalizeEditorialVoice(article.expertLensShort || article.expertLens || ''),
    expertLens: normalizeEditorialVoice(article.expertLens || article.expertLensShort || ''),
  };

  normalized.expertLensFull = normalizeLens(normalized);
  if (normalized.expertLensFull) {
    normalized.expertLensShort = truncate(
      normalized.expertLensFull.thesis || normalized.expertLensShort || normalized.summary,
      220
    );
    normalized.expertLens = normalized.expertLensShort;
  }

  return normalized;
}

function toSearchableArticle(article = {}) {
  const fullLens = article.expertLensFull || {};
  return {
    ...article,
    slug: article.slug || slugify(article.title || ''),
    searchText: unique(
      [
        article.title,
        article.source,
        article.category,
        article.region,
        article.summary,
        article.expertLensShort,
        fullLens.thesis,
        fullLens.whatHappened,
        fullLens.whyThisMatters,
        fullLens.marketMissing,
        fullLens.investors,
        fullLens.operators,
        fullLens.hyperscalers,
        fullLens.watchNext,
        fullLens.finalHeadline,
        fullLens.metaDescription,
        article.articleText,
        ...(article.tags || []),
      ].filter(Boolean)
    ).join(' '),
  };
}

function countTemplateArticles(articles = []) {
  return articles.filter((article) => {
    const lens = article.expertLensFull || {};
    return containsTemplateLanguage(
      [
        article.insight,
        article.expertLensShort,
        lens.thesis,
        lens.whatHappened,
        lens.whyThisMatters,
        lens.finalArticleBody,
      ].filter(Boolean).join(' ')
    );
  }).length;
}

const latest = await readJsonFile(LATEST_NEWS_PATH, []);
const archive = await readJsonFile(ARCHIVE_NEWS_PATH, []);
const beforeCount = countTemplateArticles([...latest, ...archive]);

const normalizedLatest = latest.map(normalizeArticle);
const normalizedArchive = archive.map(normalizeArticle);
const afterCount = countTemplateArticles([...normalizedLatest, ...normalizedArchive]);
const searchableLatest = normalizedLatest.map(toSearchableArticle);
const searchableArchive = normalizedArchive.map(toSearchableArticle);
const searchIndex = [...searchableLatest, ...searchableArchive];

if (!DRY_RUN) {
  await writeJsonFile(LATEST_NEWS_PATH, normalizedLatest);
  await writeJsonFile(ARCHIVE_NEWS_PATH, searchableArchive);
  await writeJsonFile(SEARCH_INDEX_PATH, searchIndex);
}

console.log(JSON.stringify({
  dryRun: DRY_RUN,
  latest: normalizedLatest.length,
  archive: normalizedArchive.length,
  searchIndex: searchIndex.length,
  templateLanguageBefore: beforeCount,
  templateLanguageAfter: afterCount,
}, null, 2));
