import { dateMs } from './autonomous-desk-utils.mjs';

export function editorialCyclePublicStatus(cycle = {}, now = new Date()) {
  if (!cycle) {
    return {
      freshness_state: 'stale_pipeline',
      label: 'Pipeline has not produced an editorial cycle yet.',
      latest_analysis_published_at: null,
    };
  }
  const nowMs = new Date(now).getTime();
  const runAgeHours = cycle.cycle_completed_at ? (nowMs - dateMs(cycle.cycle_completed_at)) / 36e5 : Infinity;
  const analysisAgeHours = cycle.latest_analysis_published_at ? (nowMs - dateMs(cycle.latest_analysis_published_at)) / 36e5 : Infinity;
  if (cycle.status === 'failed') {
    return { freshness_state: 'failed_pipeline', label: 'Latest editorial cycle failed.', latest_analysis_published_at: cycle.latest_analysis_published_at || null };
  }
  if (runAgeHours > 8) {
    return { freshness_state: 'stale_pipeline', label: 'Pipeline has not completed within the latest 8-hour window.', latest_analysis_published_at: cycle.latest_analysis_published_at || null };
  }
  if (cycle.status === 'completed_no_qualifying_signals' || !cycle.published_analyses?.length) {
    return { freshness_state: 'cycle_no_publish', label: 'No new qualifying signals in the latest 8-hour cycle.', latest_analysis_published_at: cycle.latest_analysis_published_at || null };
  }
  if (analysisAgeHours > 24) {
    return { freshness_state: 'stale_analysis', label: 'Latest published analysis is older than 24 hours.', latest_analysis_published_at: cycle.latest_analysis_published_at || null };
  }
  return { freshness_state: 'fresh', label: 'Latest editorial cycle published qualifying analysis.', latest_analysis_published_at: cycle.latest_analysis_published_at || null };
}
