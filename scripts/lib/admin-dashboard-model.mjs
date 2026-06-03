import { buildAdminDashboardLogs } from './admin-dashboard-logs.mjs';

const LOW_RELEVANCE_THRESHOLD = 0.55;
const FILTER_ORDER = ['q', 'status', 'category', 'source', 'from', 'to', 'quality'];

function text(value) {
  return String(value ?? '').trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function score(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstDate(...values) {
  for (const value of values) {
    const candidate = text(value);
    if (!candidate) continue;
    const time = Date.parse(candidate);
    if (Number.isFinite(time)) return new Date(time).toISOString();
  }
  return '';
}

function timestamp(value) {
  const time = Date.parse(text(value));
  return Number.isFinite(time) ? time : 0;
}

function sortRows(a, b) {
  return timestamp(b.publishedAt || b.updatedAt || b.generatedAt) - timestamp(a.publishedAt || a.updatedAt || a.generatedAt)
    || timestamp(b.updatedAt) - timestamp(a.updatedAt)
    || a.title.localeCompare(b.title)
    || a.id.localeCompare(b.id);
}

function imageValue(article = {}) {
  const nested = [article.heroImage?.src, article.thumbnailImage?.src, article.ogImage?.src];
  const direct = [article.heroImage, article.thumbnailImage, article.ogImage, article.generatedImage, article.image, article.sourceImage];
  return [...nested, ...direct].find((value) => typeof value === 'string' && value.trim());
}

function relevanceScore(article = {}) {
  return score(article.infrastructure_relevance_score)
    ?? score(article.infrastructure_relevance?.infrastructure_relevance_score)
    ?? score(article.score);
}

function extractionScore(article = {}) {
  return score(article.extraction_quality_score)
    ?? score(article.extraction_qa?.extraction_quality_score);
}

function isHidden(article = {}) {
  return article.hidden === true
    || article.noindex === true
    || article.seo_noindex === true
    || lower(article.public_status) === 'hidden';
}

function isDraft(article = {}) {
  const status = lower(article.public_status || article.status || article.editorial_status);
  return article.draft === true || ['draft', 'queued', 'pending', 'review'].includes(status);
}

function isPublished(article = {}) {
  if (isHidden(article) || isDraft(article)) return false;
  return article.homepagePublished === true
    || article.articlePagePublished === true
    || lower(article.public_status) === 'published'
    || Boolean(text(article.publishedAt));
}

function failedExtraction(article = {}) {
  return Boolean(article.extraction_failed)
    || Boolean(text(article.extraction_qa?.extraction_failure_reason))
    || (extractionScore(article) !== null && extractionScore(article) < 0.5);
}

function missingImage(article = {}) {
  return !imageValue(article) || Boolean(article.imageError);
}

function lowRelevance(article = {}) {
  const value = relevanceScore(article);
  return value !== null && value < LOW_RELEVANCE_THRESHOLD;
}

function regenerationNeeded(article = {}) {
  return article.stale_generation === true
    || article.public_copy_stale === true
    || Boolean(text(article.stale_generation_reason))
    || Boolean(text(article.regeneration_needed_reason));
}

function articleStatus(article = {}) {
  if (isHidden(article)) return 'hidden';
  if (isDraft(article)) return 'draft';
  if (isPublished(article)) return 'published';
  return 'queued';
}

function flagsFor(article = {}) {
  return [
    failedExtraction(article) ? 'failed-extraction' : '',
    missingImage(article) ? 'missing-image' : '',
    lowRelevance(article) ? 'low-relevance' : '',
    regenerationNeeded(article) ? 'regeneration-needed' : '',
  ].filter(Boolean);
}

function articleRow(article = {}, sourceBucket = 'archive') {
  const id = text(article.id || article.slug || article.url);
  const status = articleStatus(article);
  const publishedAt = firstDate(article.publishedAt, article.analysisPublishedAt, article.createdAt);
  const updatedAt = firstDate(article.updatedAt, article.editedAt, article.lastEditedAt);
  const generatedAt = firstDate(article.generatedAt, article.analysisPublishedAt, article.publishedAt);
  const reviewFlags = flagsFor(article);
  const category = text(article.category || article.primary_category || article.defaultCategory || 'Uncategorized');
  const source = text(article.source || article.sourceName || 'Unknown source');
  return {
    id,
    title: text(article.expertLensFull?.finalHeadline || article.title || id),
    source,
    category,
    status,
    publishedAt,
    updatedAt,
    generatedAt,
    sourceBucket,
    relevanceScore: relevanceScore(article),
    extractionQualityScore: extractionScore(article),
    qualityStatus: reviewFlags.length ? reviewFlags.join(', ') : 'ready',
    reviewFlags,
    sourceUrl: text(article.sourceUrl || article.url),
    publicHref: id ? '/news/' + id + '/' : '',
    editHref: id ? '/admin/edit/' + id + '/' : '',
    qualityHref: id ? '/admin/content-quality/' + id + '/' : '',
    imageProvider: text(article.generatedImageProvider || article.generatedImageModel),
    imageError: text(article.imageError),
  };
}

function uniqueSorted(values) {
  return [...new Set(values.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function queue(rows, flag) {
  const items = rows.filter((row) => row.reviewFlags.includes(flag)).sort(sortRows);
  return { count: items.length, items: items.slice(0, 20) };
}

export function parseAdminArticleFilters(searchParams = new URLSearchParams()) {
  const entries = {};
  for (const key of FILTER_ORDER) {
    const value = text(searchParams.get(key));
    if (value) entries[key] = value;
  }
  return entries;
}

export function buildAdminArticleListUrl(filters = {}, basePath = '/admin/dashboard/') {
  const params = new URLSearchParams();
  for (const key of FILTER_ORDER) {
    const value = text(filters[key]);
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? basePath + '?' + query : basePath;
}

export function filterAdminArticleRows(rows = [], filters = {}) {
  const q = lower(filters.q);
  const status = lower(filters.status);
  const category = lower(filters.category);
  const source = lower(filters.source);
  const quality = lower(filters.quality);
  const from = timestamp(filters.from);
  const to = timestamp(filters.to);
  return rows.filter((row) => {
    const haystack = lower([row.id, row.title, row.source, row.category].join(' '));
    if (q && !haystack.includes(q)) return false;
    if (category && lower(row.category) !== category) return false;
    if (source && lower(row.source) !== source) return false;
    if (status && row.status !== status && !row.reviewFlags.includes(status)) return false;
    if (quality && row.qualityStatus !== quality && !row.reviewFlags.includes(quality)) return false;
    const date = timestamp(row.publishedAt || row.updatedAt);
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  }).sort(sortRows);
}

export function buildAdminDashboardModel({ latestNews = [], archivedNews = [], editorialCycles = [], claimLedger = [], sourceHealth = [] } = {}) {
  const articles = [
    ...latestNews.map((article) => articleRow(article, 'latest')),
    ...archivedNews.map((article) => articleRow(article, 'archive')),
  ].filter((row) => row.id).sort(sortRows);
  const latestEdited = articles.filter((row) => row.updatedAt).sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt)).slice(0, 20);
  const logs = buildAdminDashboardLogs({ rows: articles, editorialCycles, claimLedger, sourceHealth });
  const reviewQueues = {
    failedExtraction: queue(articles, 'failed-extraction'),
    lowRelevance: queue(articles, 'low-relevance'),
    missingImage: queue(articles, 'missing-image'),
    regenerationNeeded: queue(articles, 'regeneration-needed'),
  };
  return {
    counts: {
      total: articles.length,
      published: articles.filter((row) => row.status === 'published').length,
      drafts: articles.filter((row) => row.status === 'draft').length,
      hidden: articles.filter((row) => row.status === 'hidden').length,
      failedExtraction: reviewQueues.failedExtraction.count,
      missingImage: reviewQueues.missingImage.count,
      lowRelevance: reviewQueues.lowRelevance.count,
      regenerationNeeded: reviewQueues.regenerationNeeded.count,
      latestGenerated: logs.image.length,
      latestEdited: latestEdited.length,
    },
    facets: {
      categories: uniqueSorted(articles.map((row) => row.category)),
      sources: uniqueSorted(articles.map((row) => row.source)),
      statuses: ['published', 'draft', 'hidden', 'queued', 'failed-extraction', 'missing-image', 'low-relevance', 'regeneration-needed'],
    },
    reviewQueues,
    latestGenerated: logs.image,
    latestEdited,
    logs,
    articles,
  };
}
