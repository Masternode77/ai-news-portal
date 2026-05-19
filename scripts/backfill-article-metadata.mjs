import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARCHIVE_NEWS_PATH,
  LATEST_NEWS_PATH,
  SEARCH_INDEX_PATH,
} from './lib/constants.mjs';
import {
  ARTICLE_PAGE_QUALITY_THRESHOLD,
  analyzeExtractionQuality,
} from './lib/quality-gate.mjs';
import {
  FULL_MEMO_RELEVANCE_THRESHOLD,
  classifyInfrastructureRelevance,
} from './lib/relevance-classifier.mjs';
import {
  blueprintSnapshot,
  selectArticleBlueprint,
} from './lib/article-blueprints.mjs';
import { classifyTaxonomy, taxonomySearchFields } from './lib/taxonomy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ADAPTERS = new Map([
  ['datacenterknowledge.com', 'datacenterknowledge'],
  ['bloomberg.com', 'bloomberg'],
  ['storagereview.com', 'storagereview'],
  ['datacenterfrontier.com', 'datacenterfrontier'],
  ['semiengineering.com', 'semiengineering'],
  ['cloud.google.com', 'googlecloud'],
  ['techcrunch.com', 'techcrunch'],
  ['servethehome.com', 'servethehome'],
  ['datacenterpost.com', 'datacenterpost'],
]);

const absPath = (relativePath) => path.join(ROOT, relativePath);

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(absPath(relativePath), 'utf8'));
}

async function writeJson(relativePath, value) {
  await fs.writeFile(absPath(relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

function sourceUrlFor(article = {}) {
  return article.expertLensFull?.sourceLink
    || article.sourceCanonicalUrl
    || article.canonicalSourceUrl
    || article.originalSourceUrl
    || article.sourceUrl
    || article.url
    || '';
}

function sourceDomain(url = '') {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function adapterForUrl(url = '') {
  const hostname = sourceDomain(url);
  for (const [domain, id] of ADAPTERS.entries()) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) return id;
  }
  return hostname ? 'generic' : 'historical_snapshot';
}

function sourceTextForExtraction(article = {}) {
  return [
    article.articleText,
    article.contentText,
    article.snippet,
    article.summary,
  ].filter(Boolean).join(' ');
}

function searchTextForArticle(article = {}) {
  return [
    article.title,
    article.source,
    article.primary_category,
    article.secondary_category,
    article.infrastructure_layer,
    article.article_type,
    ...(article.affected_stakeholders || []),
    ...(article.tags || []),
    article.category,
    article.region,
    article.summary,
    article.snippet,
    article.expertLensShort,
    article.expertLens,
    article.expertLensFull?.finalHeadline,
    article.expertLensFull?.thesis,
    article.expertLensFull?.whyThisMatters,
    article.expertLensFull?.watchNext,
    ...taxonomySearchFields(article),
  ].filter(Boolean).join(' ');
}

function seoNoindexReasons({ extractionQa, relevance, article }) {
  const reasons = [];
  const add = (reason) => {
    if (reason && !reasons.includes(reason)) reasons.push(reason);
  };

  if (!Number.isFinite(Number(extractionQa?.extraction_quality_score))) {
    add('missing_extraction_quality_score');
  } else if (Number(extractionQa.extraction_quality_score) < ARTICLE_PAGE_QUALITY_THRESHOLD) {
    add(`extraction_quality_below_${ARTICLE_PAGE_QUALITY_THRESHOLD}`);
  }

  if (!Number.isFinite(Number(relevance?.infrastructure_relevance_score))) {
    add('missing_infrastructure_relevance_score');
  } else if (Number(relevance.infrastructure_relevance_score) < FULL_MEMO_RELEVANCE_THRESHOLD) {
    add(`infrastructure_relevance_below_${FULL_MEMO_RELEVANCE_THRESHOLD}`);
  }

  if (article.articlePagePublished === false) {
    add('article_page_not_published');
  }

  if (relevance?.infrastructure_relevance_action === 'archive_only') {
    add('archive_only_relevance_action');
  }

  return reasons;
}

function enrichArticle(article, blueprint) {
  const sourceUrl = sourceUrlFor(article);
  const sourceDomainAdapter = article.source_domain_adapter || article.extraction_qa?.source_domain_adapter || adapterForUrl(sourceUrl);
  const articleText = sourceTextForExtraction(article);
  const extractionQa = analyzeExtractionQuality({
    title: article.title,
    articleText,
    fallbackSnippet: article.snippet || article.summary || '',
    sourceUrl,
    sourceDomainAdapter,
    rawText: article.contentText || article.articleText || article.snippet || article.summary || '',
  });

  const relevance = classifyInfrastructureRelevance({
    ...article,
    ...extractionQa,
  });
  const taxonomy = classifyTaxonomy({
    ...article,
    ...extractionQa,
    ...relevance,
  });
  const blueprintData = blueprintSnapshot(blueprint);
  const noindexReasons = seoNoindexReasons({ extractionQa, relevance, article });
  const archiveOnly = relevance.infrastructure_relevance_tier === 'archive_only';

  const enriched = {
    ...article,
    category: taxonomy.primary_category,
    primary_category: taxonomy.primary_category,
    secondary_category: taxonomy.secondary_category,
    infrastructure_layer: taxonomy.infrastructure_layer,
    affected_stakeholders: taxonomy.affected_stakeholders,
    article_type: taxonomy.article_type,
    region: taxonomy.region,
    urgency_score: taxonomy.urgency_score,
    taxonomy_confidence: taxonomy.taxonomy_confidence,
    taxonomy_reasons: taxonomy.taxonomy_reasons,
    content_length: extractionQa.content_length,
    boilerplate_ratio: extractionQa.boilerplate_ratio,
    title_body_similarity: extractionQa.title_body_similarity,
    copyright_footer_detected: extractionQa.copyright_footer_detected,
    nav_or_cta_detected: extractionQa.nav_or_cta_detected,
    sentence_completion_score: extractionQa.sentence_completion_score,
    source_domain_adapter: extractionQa.source_domain_adapter,
    extraction_quality_score: extractionQa.extraction_quality_score,
    extraction_qa: extractionQa,
    direct_ai_infrastructure_relevance: relevance.direct_ai_infrastructure_relevance,
    data_center_relevance: relevance.data_center_relevance,
    cloud_capacity_relevance: relevance.cloud_capacity_relevance,
    semiconductor_relevance: relevance.semiconductor_relevance,
    power_grid_relevance: relevance.power_grid_relevance,
    cooling_relevance: relevance.cooling_relevance,
    capital_markets_relevance: relevance.capital_markets_relevance,
    enterprise_ai_infrastructure_relevance: relevance.enterprise_ai_infrastructure_relevance,
    infrastructure_relevance_score: relevance.infrastructure_relevance_score,
    infrastructure_relevance_tier: relevance.infrastructure_relevance_tier,
    infrastructure_relevance_action: relevance.infrastructure_relevance_action,
    infrastructure_relevance_reasons: relevance.infrastructure_relevance_reasons,
    infrastructure_relevance: relevance,
    homepagePublished: archiveOnly ? false : article.homepagePublished !== false,
    archiveOnly: archiveOnly || article.archiveOnly === true,
    archiveOnlyReason: archiveOnly
      ? 'infrastructure_relevance_below_signal_threshold'
      : article.archiveOnlyReason || null,
    article_blueprint: blueprint.id,
    articleBlueprint: blueprintData,
    seo_noindex: noindexReasons.length > 0,
    seo_noindex_reasons: noindexReasons,
    seo_backfill_version: 1,
  };

  if (enriched.expertLensFull && typeof enriched.expertLensFull === 'object') {
    enriched.expertLensFull = {
      ...enriched.expertLensFull,
      blueprintId: enriched.expertLensFull.blueprintId || blueprint.id,
    };
  }

  enriched.searchText = searchTextForArticle(enriched);
  return enriched;
}

function selectBlueprintsInPublishOrder(articles) {
  const ordered = [...articles].sort(
    (a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
  );
  const selected = new Map();
  const recentBlueprintIds = [];

  for (const article of ordered) {
    const blueprint = selectArticleBlueprint(article, recentBlueprintIds);
    selected.set(article.id, blueprint);
    recentBlueprintIds.unshift(blueprint.id);
  }

  return selected;
}

function mergeById(records, enrichedById) {
  return records.map((record) => enrichedById.get(record.id) || record);
}

function summarize(articles) {
  const counts = {
    total: articles.length,
    fullMemo: 0,
    signalCard: 0,
    archiveOnly: 0,
    noindex: 0,
    extractionFail: 0,
    missingScore: 0,
  };

  for (const article of articles) {
    if (article.infrastructure_relevance_tier === 'full_memo') counts.fullMemo += 1;
    if (article.infrastructure_relevance_tier === 'signal_card') counts.signalCard += 1;
    if (article.infrastructure_relevance_tier === 'archive_only') counts.archiveOnly += 1;
    if (article.seo_noindex === true) counts.noindex += 1;
    if (Number(article.extraction_quality_score) < ARTICLE_PAGE_QUALITY_THRESHOLD) counts.extractionFail += 1;
    if (
      !Number.isFinite(Number(article.extraction_quality_score))
      || !Number.isFinite(Number(article.infrastructure_relevance_score))
      || !article.article_blueprint
    ) {
      counts.missingScore += 1;
    }
  }

  return counts;
}

const latest = await readJson(LATEST_NEWS_PATH);
const archive = await readJson(ARCHIVE_NEWS_PATH);
const allById = new Map();
for (const article of [...latest, ...archive]) {
  if (!article?.id || allById.has(article.id)) continue;
  allById.set(article.id, article);
}

const uniqueArticles = [...allById.values()];
const blueprintById = selectBlueprintsInPublishOrder(uniqueArticles);
const enrichedById = new Map(
  uniqueArticles.map((article) => [
    article.id,
    enrichArticle(article, blueprintById.get(article.id)),
  ])
);

const enrichedLatest = mergeById(latest, enrichedById);
const enrichedArchive = mergeById(archive, enrichedById);
const searchIndex = [...enrichedLatest, ...enrichedArchive]
  .filter((article, index, list) => list.findIndex((candidate) => candidate.id === article.id) === index)
  .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime());

await writeJson(LATEST_NEWS_PATH, enrichedLatest);
await writeJson(ARCHIVE_NEWS_PATH, enrichedArchive);
await writeJson(SEARCH_INDEX_PATH, searchIndex);

console.log(JSON.stringify(summarize(searchIndex), null, 2));
