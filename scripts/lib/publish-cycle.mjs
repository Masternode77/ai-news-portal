import fs from 'node:fs/promises';
import path from 'node:path';
import { buildRssItems } from './rss-builder.mjs';
import { buildSitemapEntries } from './sitemap-builder.mjs';
import { buildCategoryPages, archivePages } from './taxonomy-page-builder.mjs';
import { buildAdminReviewQueueEntry, mergeAdminReviewQueue } from './admin-review-queue.mjs';

function clean(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanArticleBody(value = '') {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map(clean)
    .filter(Boolean)
    .join('\n\n');
}

function slugify(value = '') {
  return clean(value).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 96);
}

function uniqueById(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function imagePaths(article = {}) {
  const slug = `${clean(article.id)}-${slugify(article.title)}`;
  const base = `/generated/articles/${slug}`;
  return {
    heroImage: `${base}/hero.webp`,
    thumbnailImage: `${base}/thumbnail.webp`,
    ogImage: `${base}/og.webp`,
  };
}

function publicRoutingFor(result = {}) {
  const visibility = result.tier === 'editorial_brief' ? 'adjacent' : 'core';
  return {
    visibility,
    score: result.relevance?.score ?? 0,
    laneKey: result.relevance?.laneKey || result.tier || 'content-cycle',
    blocked_reasons: [],
  };
}

function editorialGatesPass(result = {}) {
  return result.source_fidelity?.ok === true
    && result.claim_fidelity?.ok === true
    && (result.claim_fidelity?.unsupportedClaims?.length || 0) === 0
    && result.seo_fidelity?.ok === true;
}

function failClosedPublishResult(result = {}) {
  if (result.tier !== 'longform_analysis' || editorialGatesPass(result)) return result;
  return {
    ...result,
    tier: 'editorial_brief',
    detailPage: false,
    finalArticleBody: result.brief || '',
    reasons: [...new Set([...(result.reasons || []), 'longform_editorial_fidelity_failed'])],
  };
}

function materializeArticle(source = {}, result = {}, now = new Date().toISOString()) {
  const images = imagePaths(source);
  const body = cleanArticleBody(result.finalArticleBody || result.longformBody || result.brief || source.articleText || source.summary);
  const deck = clean(source.summary || result.brief || result.reasons?.[0]);
  const articlePagePublished = result.detailPage === true;
  return {
    id: clean(source.id || result.id),
    title: clean(source.title || result.title),
    deck,
    summary: deck,
    source: clean(source.source),
    sourceUrl: clean(source.sourceUrl || source.url),
    primaryHref: articlePagePublished ? `/news/${clean(source.id || result.id)}/` : clean(source.sourceUrl || source.url),
    publishedAt: source.publishedAt || now,
    analysisPublishedAt: now,
    updatedAt: now,
    category: clean(source.category || source.primary_category || 'AI Infrastructure'),
    primary_category: clean(source.primary_category || source.category || 'AI Infrastructure'),
    infrastructure_layer: clean(source.infrastructure_layer),
    extraction_quality_score: source.extraction_quality_score ?? (result.public_extraction_passed ? 0.9 : 0),
    infrastructure_relevance_score: source.infrastructure_relevance_score ?? result.relevance?.score ?? 0,
    tags: [...new Set([source.infrastructure_layer, source.primary_category, source.category].map(clean).filter(Boolean))],
    public_status: 'published',
    public_content_tier: result.tier,
    articleText: clean(source.articleText || source.cleaned_source_text),
    cleaned_source_text: clean(source.cleaned_source_text || source.articleText),
    articlePagePublished,
    homepagePublished: true,
    archiveOnly: false,
    noindex: false,
    seo_noindex: false,
    imageAlt: `${clean(source.title || result.title)} editorial visual`,
    imageStatus: 'queued',
    imageProvider: 'image2',
    ...images,
    public_routing: publicRoutingFor(result),
    expertLensShort: deck,
    expertLensFull: {
      finalHeadline: clean(source.title || result.title),
      metaDescription: deck,
      finalArticleBody: body,
    },
    ...(result.source_fidelity ? { source_fidelity: result.source_fidelity } : {}),
    ...(result.claim_fidelity ? { claim_fidelity: result.claim_fidelity } : {}),
    ...(result.seo_fidelity ? { seo_fidelity: result.seo_fidelity } : {}),
  };
}

function searchText(article = {}) {
  return [
    article.title,
    article.deck,
    article.source,
    article.sourceUrl,
    article.category,
    article.primary_category,
    article.infrastructure_layer,
    article.expertLensFull?.finalArticleBody,
    ...(article.tags || []),
  ].filter(Boolean).join(' ');
}

function buildImageManifest(items = []) {
  return items.map((article) => ({
    articleId: article.id,
    heroImage: article.heroImage,
    thumbnailImage: article.thumbnailImage,
    ogImage: article.ogImage,
    status: article.imageStatus,
    provider: article.imageProvider,
  }));
}

export async function runPublishCycle({ articles = [], routeArticle, now = new Date().toISOString(), existing = {} } = {}) {
  if (typeof routeArticle !== 'function') throw new TypeError('runPublishCycle requires routeArticle');
  const published = [];
  const reviewEntries = [];
  const results = [];

  for (const article of articles) {
    const result = failClosedPublishResult(await routeArticle(article));
    results.push(result);
    if (result.coreFeedEligible && result.tier !== 'hidden' && result.tier !== 'source_only') {
      published.push(materializeArticle(article, result, now));
    } else {
      const entry = buildAdminReviewQueueEntry(article, result, now);
      if (entry) reviewEntries.push(entry);
    }
  }

  const latestNews = uniqueById([...published, ...(existing.latestNews || [])]).slice(0, 50);
  const searchIndex = uniqueById([...latestNews, ...(existing.searchIndex || [])])
    .map((article) => ({ ...article, searchText: searchText(article) }));
  const taxonomyPages = {
    categories: buildCategoryPages(latestNews),
    archive: archivePages(latestNews),
  };
  const rssItems = buildRssItems(latestNews);
  const sitemapEntries = buildSitemapEntries(latestNews);
  const imageManifest = buildImageManifest(published);
  const adminReviewQueue = mergeAdminReviewQueue(existing.adminReviewQueue || [], reviewEntries);
  const cacheReport = {
    generatedAt: now,
    published: published.length,
    reviewQueue: adminReviewQueue.length,
    updatedArtifacts: ['latestNews', 'searchIndex', 'taxonomyPages', 'rssItems', 'sitemapEntries', 'imageManifest', 'adminReviewQueue'],
  };

  return {
    mode: 'full-cycle',
    summary: { processed: articles.length, published: published.length, reviewQueue: adminReviewQueue.length },
    results,
    artifacts: { latestNews, searchIndex, taxonomyPages, rssItems, sitemapEntries, imageManifest, adminReviewQueue, cacheReport },
  };
}

export async function writePublishCycleArtifacts(artifacts = {}, outDir = '.cache/content-cycle') {
  await fs.mkdir(outDir, { recursive: true });
  const files = {
    'latest-news.json': artifacts.latestNews || [],
    'search-index.json': artifacts.searchIndex || [],
    'taxonomy-pages.json': artifacts.taxonomyPages || {},
    'rss-items.json': artifacts.rssItems || [],
    'sitemap-entries.json': artifacts.sitemapEntries || [],
    'image-manifest.json': artifacts.imageManifest || [],
    'admin-review-queue.json': artifacts.adminReviewQueue || [],
    'cache-report.json': artifacts.cacheReport || {},
  };
  const written = [];
  for (const [name, value] of Object.entries(files)) {
    const file = path.join(outDir, name);
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    written.push(file);
  }
  return written;
}
