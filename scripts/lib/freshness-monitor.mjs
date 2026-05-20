import { editorialCyclePublicStatus } from './editorial-cycle-status.mjs';
import { latestEditorialCycle } from './editorial-cycle-store.mjs';

export function buildFreshnessStatus({ cycles = [], rssItems = [], sitemapLastmod = null, sourceHealth = [] } = {}, now = new Date()) {
  const latest = latestEditorialCycle(cycles);
  const status = editorialCyclePublicStatus(latest, now);
  return {
    last_pipeline_run_at: latest?.cycle_completed_at || null,
    last_successful_crawl_at: latest?.cycle_completed_at || null,
    last_source_item_seen_at: latest?.latest_source_published_at || null,
    last_qualifying_signal_at: latest?.latest_qualifying_signal_at || null,
    last_analysis_published_at: latest?.latest_analysis_published_at || null,
    latest_rss_item_date: rssItems[0]?.publishedAt || rssItems[0]?.pubDate || null,
    latest_sitemap_lastmod: sitemapLastmod,
    stale_source_count: sourceHealth.filter((source) => source.stale || source.status === 'stale').length,
    stale_publication_warning: ['stale_analysis', 'stale_pipeline', 'failed_pipeline'].includes(status.freshness_state),
    ...status,
  };
}
