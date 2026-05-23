import { fetchNewsPool } from './fetch-feeds.mjs';
import { loadSourceRegistry } from './source-registry.mjs';
import { dedupeSourceItems } from './source-deduplication.mjs';
import { sourceCredibilityTier } from './source-priority-policy.mjs';
import { buildSourceHealthReport } from './source-health-monitor.mjs';
import { readJsonFile } from './state-store.mjs';
import {
  ARCHIVE_NEWS_PATH,
  LATEST_NEWS_PATH,
  NEWS_POOL_PATH,
} from './constants.mjs';
import {
  compact,
  domainFor,
  evidenceTextFor,
  extractCompanies,
  extractNumericClaims,
  hash,
  inferInfrastructureLayer,
  publicSourceUrl,
  verifiedFactSentences,
} from './autonomous-desk-utils.mjs';

function cleanScanItem(item = {}) {
  const url = publicSourceUrl(item);
  const evidence = evidenceTextFor(item);
  const facts = verifiedFactSentences(item, 6);
  const sourceDomain = domainFor(url);
  return {
    id: item.id || hash([url, item.title].join('|')),
    source_name: item.source || item.source_name || sourceDomain || 'Unknown source',
    source: item.source || item.source_name || sourceDomain || 'Unknown source',
    source_url: url,
    url,
    source_published_at: item.publishedAt || item.source_published_at || new Date().toISOString(),
    source_fetched_at: item.fetchedAt || item.updatedAt || new Date().toISOString(),
    title: compact(item.title),
    cleaned_text: evidence,
    extracted_facts: facts,
    source_domain: sourceDomain,
    source_credibility_tier: sourceCredibilityTier({ ...item, domain: sourceDomain }),
    extraction_quality: Number(item.extraction_quality_score ?? item.extraction_qa?.extraction_quality_score ?? 0.9),
    relevance_score: Number(item.infrastructure_relevance_score ?? item.relevance_score ?? item.public_routing?.score ?? 0),
    crawl_status: evidence.length >= 160 ? 'clean' : 'thin_evidence',
    infrastructure_layer: item.infrastructure_layer || inferInfrastructureLayer([item.title, evidence].join(' ')),
    companies: extractCompanies([item.title, evidence].join(' ')),
    numeric_claims: extractNumericClaims([item.title, evidence].join(' ')),
    original: item,
  };
}

function sourceLikeItem(item = {}) {
  if (!item || typeof item !== 'object') return false;
  if (item.generation_version || item.public_generation_version || item.stale_generation) return false;
  if (item.expertLensFull?.finalArticleBody || item.articlePagePublished === true) return false;
  if (['published', 'watchlist', 'archive_only_noindex', 'quarantined'].includes(item.public_status)) return false;
  return Boolean(item.url || item.sourceUrl);
}

export async function runGlobalSourceScan(options = {}) {
  const sources = await loadSourceRegistry();
  let fetched = [];
  if (options.useLive !== false) {
    fetched = await fetchNewsPool().catch(() => []);
  }
  if (!fetched.length) {
    const [pool, latest, archived] = await Promise.all([
      readJsonFile(NEWS_POOL_PATH, []),
      readJsonFile(LATEST_NEWS_PATH, []),
      readJsonFile(ARCHIVE_NEWS_PATH, []),
    ]);
    fetched = [
      ...pool,
      ...latest.filter(sourceLikeItem),
      ...archived.filter(sourceLikeItem),
    ];
  }

  const source_items = dedupeSourceItems(fetched.map(cleanScanItem));
  const latest_source_published_at = Math.max(0, ...source_items.map((item) => new Date(item.source_published_at).getTime()));
  const clean_items = source_items.filter((item) => item.extraction_quality >= 0.8 && item.cleaned_text.length >= 160 && item.crawl_status === 'clean');
  const source_health = buildSourceHealthReport(sources, source_items);

  return {
    scan_started_at: options.now || new Date().toISOString(),
    scan_completed_at: new Date().toISOString(),
    source_items,
    clean_items,
    source_health,
    latest_source_published_at: latest_source_published_at ? new Date(latest_source_published_at).toISOString() : null,
    active_source_count: source_health.filter((source) => ['active', 'active_feed', 'active_sitemap'].includes(source.status)).length,
  };
}
