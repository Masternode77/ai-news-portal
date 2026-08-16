import { editorialCyclePublicStatus } from './editorial-cycle-status.mjs';
import { latestEditorialCycle } from './editorial-cycle-store.mjs';

function heartbeatPublicStatus(heartbeat = {}, now = new Date()) {
  if (!heartbeat?.last_pipeline_run_at) return null;
  if (heartbeat.status === 'failed') {
    return {
      freshness_state: 'failed_pipeline',
      label: 'The most recent scheduled update failed.',
      latest_analysis_published_at: null,
    };
  }
  const runAgeHours = (new Date(now).getTime() - new Date(heartbeat.last_pipeline_run_at).getTime()) / 36e5;
  if (runAgeHours > 8) {
    return {
      freshness_state: 'stale_pipeline',
      label: 'The scheduled update is overdue.',
      latest_analysis_published_at: null,
    };
  }
  return {
    freshness_state: 'pipeline_current',
    label: 'The latest scheduled update completed successfully.',
    latest_analysis_published_at: null,
  };
}

export function buildFreshnessStatus({ cycles = [], rssItems = [], sitemapLastmod = null, sourceHealth = [], heartbeat = {} } = {}, now = new Date()) {
  const latest = latestEditorialCycle(cycles);
  const status = heartbeatPublicStatus(heartbeat, now) || editorialCyclePublicStatus(latest, now);
  const lastPipelineRunAt = heartbeat.last_pipeline_run_at || latest?.cycle_completed_at || null;
  const lastSuccessfulPipelineAt = heartbeat.last_successful_pipeline_at
    || (heartbeat.status === 'ok' ? heartbeat.last_pipeline_run_at : null)
    || latest?.cycle_completed_at
    || null;
  return {
    last_pipeline_run_at: lastPipelineRunAt,
    last_successful_pipeline_at: lastSuccessfulPipelineAt,
    last_successful_crawl_at: lastSuccessfulPipelineAt,
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
