import Parser from 'rss-parser';
import {
  MAX_ITEMS_FETCHED,
  MAX_ITEMS_PER_SOURCE_IN_POOL,
  MIN_ITEMS_PER_SOURCE_IN_POOL,
  POOL_MAX_AGE_DAYS,
} from './constants.mjs';
import { guessLanguage, safeHttpUrl, stableArticleId, stripHtml, truncate } from './normalize.mjs';
import { classifyInfrastructureRelevance } from './relevance-classifier.mjs';
import { classifyTaxonomy } from './taxonomy.mjs';
import { fetchPublicResource } from './public-network-fetcher.mjs';
import { activeRegistryFeeds, loadSourceRegistry } from './source-registry.mjs';
import { sourceTextTargetDecision } from './source-text-fetcher.mjs';

const FEED_CONTENT_TYPES = [
  'application/atom+xml',
  'application/rss+xml',
  'application/xml',
  'text/html',
  'text/xml',
];

const parser = new Parser({
  timeout: 20000,
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['content:encoded', 'contentEncoded'],
    ],
  },
});

function firstImage(item) {
  if (item.enclosure?.url && item.enclosure?.type?.startsWith('image')) return safeHttpUrl(item.enclosure.url) || null;
  const media = item.mediaContent?.[0]?.$?.url;
  if (media) return safeHttpUrl(media) || null;
  const html = item.contentEncoded || item.content || item.summary || '';
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return safeHttpUrl(match?.[1]) || null;
}

export function parseFeedItem(feed, item) {
  const title = (item.title || '').trim();
  const url = safeHttpUrl(item.link || item.guid || '');
  if (!title || !url) return null;

  const rawBody = stripHtml(item.contentEncoded || item.content || item.summary || item.contentSnippet || '');
  const rawSnippet = stripHtml(item.contentSnippet || item.summary || rawBody || '');
  const publishedAt = item.isoDate || item.pubDate || new Date().toISOString();

  const baseItem = {
    id: stableArticleId(url, title),
    sourceRegistryId: feed.sourceRegistryId,
    source: feed.source,
    url,
    title,
    snippet: truncate(rawSnippet || rawBody, 220),
    contentText: truncate(rawBody, 800),
    publishedAt: new Date(publishedAt).toISOString(),
    sourceImage: firstImage(item),
    region: feed.region || 'Global',
    language: feed.language || guessLanguage(`${title} ${rawSnippet}`),
    defaultCategory: feed.defaultCategory || null,
  };
  const infrastructureRelevance = classifyInfrastructureRelevance(baseItem);
  const taxonomy = classifyTaxonomy({ ...baseItem, ...infrastructureRelevance });

  return {
    ...baseItem,
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
    direct_ai_infrastructure_relevance: infrastructureRelevance.direct_ai_infrastructure_relevance,
    data_center_relevance: infrastructureRelevance.data_center_relevance,
    cloud_capacity_relevance: infrastructureRelevance.cloud_capacity_relevance,
    semiconductor_relevance: infrastructureRelevance.semiconductor_relevance,
    power_grid_relevance: infrastructureRelevance.power_grid_relevance,
    cooling_relevance: infrastructureRelevance.cooling_relevance,
    capital_markets_relevance: infrastructureRelevance.capital_markets_relevance,
    enterprise_ai_infrastructure_relevance: infrastructureRelevance.enterprise_ai_infrastructure_relevance,
    infrastructure_relevance_score: infrastructureRelevance.infrastructure_relevance_score,
    infrastructure_relevance_tier: infrastructureRelevance.infrastructure_relevance_tier,
    infrastructure_relevance_action: infrastructureRelevance.infrastructure_relevance_action,
    infrastructure_relevance_reasons: infrastructureRelevance.infrastructure_relevance_reasons,
    infrastructure_relevance: infrastructureRelevance,
  };
}

async function fetchFeedItems(feed, networkOptions = {}) {
  const feedUrl = new URL(feed.url);
  const response = await fetchPublicResource(feed.url, {
    allowedHosts: [feedUrl.hostname],
    contentTypes: FEED_CONTENT_TYPES,
    headers: {
      accept: 'application/rss+xml,application/atom+xml,application/xml,text/xml',
      'user-agent': 'Mozilla/5.0 (compatible; ComputeCurrentBot/1.0)',
    },
    maxBytes: networkOptions.maxBytes || 2 * 1024 * 1024,
    request: networkOptions.request,
    resolveHost: networkOptions.resolveHost,
    timeoutMs: networkOptions.timeoutMs || 20_000,
  });
  const parsed = await parser.parseString(response.bytes.toString('utf8'));
  return (parsed.items || [])
    .map((item) => parseFeedItem(feed, item))
    .filter(Boolean);
}

function relevanceThenRecency(a, b) {
  const scoreGap = (Number(b.infrastructure_relevance_score) || 0) - (Number(a.infrastructure_relevance_score) || 0);
  if (scoreGap !== 0) return scoreGap;
  return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
}

function isFresh(item, now) {
  const stamp = new Date(item.publishedAt).getTime();
  return Number.isFinite(stamp) && now - stamp <= POOL_MAX_AGE_DAYS * 86_400_000;
}

// The pool is capped, and several authorized sources publish far more
// off-beat items than on-beat ones (audit reports, enforcement actions,
// months-deep archives). Three rules keep it a news pool: items older than
// POOL_MAX_AGE_DAYS are dropped whenever anything fresh exists, no source
// takes more than MAX_ITEMS_PER_SOURCE_IN_POOL slots, and ordering is by
// fetch-time relevance first with recency breaking ties.
export function selectPoolItems(fetched = [], now = Date.now()) {
  const fresh = fetched.filter((item) => isFresh(item, now));
  const candidates = fresh.length ? fresh : fetched;
  candidates.sort(relevanceThenRecency);

  const dedupedByRecency = [];
  const seenIds = new Set();
  const seenTitles = new Set();
  const perSource = new Map();
  const maxPerSource = Math.max(1, MAX_ITEMS_PER_SOURCE_IN_POOL);

  for (const item of candidates) {
    if (seenIds.has(item.id)) continue;
    const sourceTally = perSource.get(item.source) || 0;
    if (sourceTally >= maxPerSource) continue;

    const titleKey = item.title.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
    if (seenTitles.has(titleKey)) continue;

    seenIds.add(item.id);
    seenTitles.add(titleKey);
    perSource.set(item.source, sourceTally + 1);
    dedupedByRecency.push(item);
  }

  const selected = [];
  const selectedIds = new Set();
  const sourceCount = new Map();
  const minPerSource = Math.max(0, MIN_ITEMS_PER_SOURCE_IN_POOL);

  if (minPerSource > 0) {
    for (const item of dedupedByRecency) {
      if (selected.length >= MAX_ITEMS_FETCHED) break;
      const count = sourceCount.get(item.source) || 0;
      if (count >= minPerSource) continue;

      selected.push(item);
      selectedIds.add(item.id);
      sourceCount.set(item.source, count + 1);
    }
  }

  for (const item of dedupedByRecency) {
    if (selected.length >= MAX_ITEMS_FETCHED) break;
    if (selectedIds.has(item.id)) continue;
    selected.push(item);
  }

  return selected;
}

export async function fetchNewsPoolResult(options = {}) {
  const sources = options.sources || await loadSourceRegistry(options.registryPath);
  const now = options.now || new Date();
  const feeds = activeRegistryFeeds(sources, now);
  const fetchFeed = options.fetchFeed || ((feed) => fetchFeedItems(feed, options.feedNetworkOptions));
  if (!feeds.length) {
    return { status: 'no_authorized_sources', items: [], authorizedSourceCount: 0, failedSourceCount: 0 };
  }

  const attempts = await Promise.all(feeds.map(async (feed) => {
    try {
      const fetched = await fetchFeed(feed);
      const items = fetched.filter((item) => sourceTextTargetDecision(item, sources, now).authorized);
      return { ok: true, items };
    } catch (error) {
      console.error(`[pipeline] feed failed: ${feed.source} -> ${error.message}`);
      return { ok: false, items: [] };
    }
  }));
  const failedSourceCount = attempts.filter((attempt) => !attempt.ok).length;
  const items = selectPoolItems(attempts.flatMap((attempt) => attempt.items), now.getTime());
  const status = items.length
    ? 'fetched'
    : failedSourceCount > 0
      ? 'transient_fetch_failure'
      : 'authorized_sources_empty';
  return { status, items, authorizedSourceCount: feeds.length, failedSourceCount };
}

export async function fetchNewsPool(options = {}) {
  return (await fetchNewsPoolResult(options)).items;
}
