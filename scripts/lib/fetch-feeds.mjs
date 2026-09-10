import Parser from 'rss-parser';
import {
  MAX_ITEMS_FETCHED,
  MAX_ITEMS_PER_SOURCE_IN_POOL,
  MIN_ITEMS_PER_SOURCE_IN_POOL,
  POOL_MAX_AGE_DAYS,
} from './constants.mjs';
import { guessLanguage, safeHttpUrl, stableArticleId, stripHtml, truncate } from './normalize.mjs';
import {
  classifyAiTopicRelevance,
  classifyInfrastructureRelevance,
  proceduralDocketWithoutComputeContext,
} from './relevance-classifier.mjs';
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

// rss-parser hands back an xml2js object instead of a string when a feed puts
// markup inside a text element (ACER wraps every item title in an anchor).
// Flatten it to its text so a decorated title cannot crash the whole feed.
export function textValue(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    const parts = [];
    if (typeof value._ === 'string') parts.push(value._);
    for (const [key, child] of Object.entries(value)) {
      if (key === '_' || key === '$') continue;
      parts.push(textValue(child));
    }
    return parts.filter(Boolean).join(' ');
  }
  return '';
}

function firstImage(item) {
  if (item.enclosure?.url && item.enclosure?.type?.startsWith('image')) return safeHttpUrl(item.enclosure.url) || null;
  const media = item.mediaContent?.[0]?.$?.url;
  if (media) return safeHttpUrl(media) || null;
  const html = textValue(item.contentEncoded || item.content || item.summary || '');
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return safeHttpUrl(match?.[1]) || null;
}

// Some Drupal feeds ship an escaped anchor tag where the item link belongs
// ("https://host/%3Ca%20href%3D%22/news/slug%22 ..."), which resolves to a
// 404. Recover the href so the item points at the article page.
export function repairFeedLink(raw = '', feedUrl = '') {
  const value = String(raw || '').trim();
  if (!value) return '';
  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return value;
  }
  const anchor = decoded.match(/<a\s[^>]*href=["']([^"']+)["']/i);
  if (!anchor) return value;
  try {
    return new URL(anchor[1], feedUrl || value).toString();
  } catch {
    return '';
  }
}

const DRUPAL_DATE_PATTERN = /^(?:[A-Za-z]{3},\s*)?(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2}):(\d{2})$/;

// rss-parser only fills isoDate when the feed date parses. Drupal's default
// "D, m/d/Y - H:i" format does not, and an Invalid Date would throw from
// toISOString() and take the whole feed down with it.
export function publishedAtIso(item = {}, now = new Date()) {
  for (const candidate of [item.isoDate, item.pubDate, item.published, item.updated, item.date]) {
    const raw = String(candidate || '').trim();
    if (!raw) continue;
    const parsed = new Date(raw);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
    const drupal = raw.match(DRUPAL_DATE_PATTERN);
    if (drupal) {
      const [, month, day, year, hour, minute] = drupal.map(Number);
      const stamp = Date.UTC(year, month - 1, day, hour, minute);
      if (Number.isFinite(stamp)) return new Date(stamp).toISOString();
    }
  }
  return new Date(now).toISOString();
}

// The source-text gate only fetches https article URLs, so an item whose feed
// still carries an http link would be dropped silently. Every authorized
// publisher serves https; try the upgraded scheme and let the gate decide.
export function httpsItemUrl(url = '') {
  const safe = safeHttpUrl(url);
  if (!safe) return '';
  try {
    const parsed = new URL(safe);
    if (parsed.protocol === 'http:') parsed.protocol = 'https:';
    return parsed.toString();
  } catch {
    return '';
  }
}

export function parseFeedItem(feed, item, now = new Date()) {
  const title = textValue(item.title).replace(/\s+/g, ' ').trim();
  const url = httpsItemUrl(repairFeedLink(textValue(item.link) || textValue(item.guid) || '', feed.url));
  if (!title || !url) return null;

  const rawBody = stripHtml(textValue(item.contentEncoded || item.content || item.summary || item.contentSnippet || ''));
  const rawSnippet = stripHtml(textValue(item.contentSnippet || item.summary || rawBody || ''));

  const baseItem = {
    id: stableArticleId(url, title),
    sourceRegistryId: feed.sourceRegistryId,
    source: feed.source,
    url,
    title,
    snippet: truncate(rawSnippet || rawBody, 220),
    contentText: truncate(rawBody, 800),
    publishedAt: publishedAtIso(item, now),
    sourceImage: firstImage(item),
    region: feed.region || 'Global',
    language: feed.language || guessLanguage(`${title} ${rawSnippet}`),
    defaultCategory: feed.defaultCategory || null,
    ...(feed.textScope ? { source_text_scope: feed.textScope } : {}),
  };
  const infrastructureRelevance = classifyInfrastructureRelevance(baseItem);
  const aiTopic = classifyAiTopicRelevance(baseItem);
  const taxonomy = classifyTaxonomy({ ...baseItem, ...infrastructureRelevance });

  return {
    ...baseItem,
    ai_topic_score: aiTopic.ai_topic_score,
    ai_topic_reasons: aiTopic.ai_topic_reasons,
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
  const now = networkOptions.now || new Date();
  return (parsed.items || [])
    .map((item) => parseFeedItem(feed, item, now))
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

function registrySourceFor(record = {}, sources = []) {
  const id = String(record.sourceRegistryId || '').trim().toLowerCase();
  if (id) {
    const byId = sources.find((source) => String(source.id || '').trim().toLowerCase() === id);
    if (byId) return byId;
  }
  const name = String(record.source || '').trim().toLowerCase();
  return sources.find((source) => String(source.name || '').trim().toLowerCase() === name) || null;
}

// Cached and legacy pool records were classified before their registry row
// carried text_scope (or by an older build), so a fallback run would still
// route an abstract-only item to long-form generation. Re-stamp the scope from
// the registry and reclassify so the cap applies on every acquisition path.
function restampRelevance(record, relevance) {
  return {
    ...record,
    infrastructure_relevance_score: relevance.infrastructure_relevance_score,
    infrastructure_relevance_tier: relevance.infrastructure_relevance_tier,
    infrastructure_relevance_action: relevance.infrastructure_relevance_action,
    infrastructure_relevance_reasons: relevance.infrastructure_relevance_reasons,
    infrastructureRelevanceAction: relevance.infrastructureRelevanceAction,
    articlePagePublished: relevance.articlePagePublished,
    homepagePublished: relevance.homepagePublished,
    archiveOnly: relevance.archiveOnly,
    archiveOnlyReason: relevance.archiveOnlyReason,
    infrastructure_relevance: relevance,
  };
}

export function hydrateSourceTextScope(records = [], sources = []) {
  return records.map((record) => {
    const source = registrySourceFor(record, sources);
    const scope = String(source?.text_scope || '').trim().toLowerCase();
    if (!scope || record.source_text_scope === scope) return record;
    const next = { ...record, source_text_scope: scope };
    return restampRelevance(next, classifyInfrastructureRelevance(next));
  });
}

// A cached or legacy record keeps the classification it was written with,
// which can predate the procedural docket guard: run #3199's hydro notice sits
// in the pool as a 0.615 signal card. Demote such a record here so a fallback
// run (PIPELINE_USE_EXISTING_POOL, live-fetch failure, a curation-model outage
// that hands selection to the deterministic ranker) never enriches a notice
// the live classifier would archive. Records the guard does not catch are
// returned as-is; the classification is never raised here.
export function demoteCachedDocketNotices(records = []) {
  return records.map((record) => {
    if (!record || record.infrastructure_relevance_tier === 'archive_only') return record;
    if (!proceduralDocketWithoutComputeContext(record)) return record;
    return restampRelevance(record, classifyInfrastructureRelevance(record));
  });
}

// Every seam that reads stored records instead of the live wire (fallback
// pool, column candidates, autonomous scan, regenerators) refreshes them here.
export function refreshCachedRelevance(records = [], sources = []) {
  return demoteCachedDocketNotices(hydrateSourceTextScope(records, sources));
}

// A source only reserves its representation slot with an item that is at
// least signal-card relevant. An off-beat top item (hydro licence notices,
// enforcement actions, proclamations) is left to the relevance-ordered pass,
// so registering more government feeds does not push on-beat items out.
function reservesSourceSlot(item) {
  return item.infrastructure_relevance_tier !== 'archive_only';
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
      if (count >= minPerSource || !reservesSourceSlot(item)) continue;

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
