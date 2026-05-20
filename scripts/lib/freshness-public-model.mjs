import { buildFreshnessStatus } from './freshness-monitor.mjs';

export function buildFreshnessPublicModel(inputs = {}) {
  const status = buildFreshnessStatus(inputs);
  return {
    label: status.label,
    state: status.freshness_state,
    last_pipeline_run_at: status.last_pipeline_run_at,
    latest_source_scanned_at: status.last_source_item_seen_at,
    latest_qualifying_signal_at: status.last_qualifying_signal_at,
    latest_published_analysis_at: status.last_analysis_published_at,
    stale_publication_warning: status.stale_publication_warning,
  };
}
