import { hash } from './autonomous-desk-utils.mjs';
import { runGlobalSourceScan } from './global-source-scan.mjs';
import { clusterSignalItems } from './signal-clusterer.mjs';
import { scoreSignalClusters } from './signal-scoring-engine.mjs';
import { selectEditorialSignals } from './editorial-selection-engine.mjs';
import { writeAutonomousBlogArticle } from './autonomous-blog-writer-v1.mjs';

export function newEditorialCycleId(date = new Date()) {
  const iso = new Date(date).toISOString();
  return `cycle_${iso.slice(0, 13).replace(/[-:T]/g, '')}_${hash(iso).slice(0, 6)}`;
}

export async function runEditorialCycle(options = {}) {
  const cycle_started_at = options.now || new Date().toISOString();
  const cycle_id = options.cycleId || newEditorialCycleId(cycle_started_at);
  const errors = [];
  let scan;
  try {
    scan = await runGlobalSourceScan({ useLive: options.useLive, now: cycle_started_at });
  } catch (error) {
    errors.push(error.message);
    scan = { source_items: [], clean_items: [], source_health: [], latest_source_published_at: null };
  }

  const clusters = scoreSignalClusters(clusterSignalItems(scan.clean_items), { now: cycle_started_at });
  const freshCutoff = new Date(cycle_started_at).getTime() - Number(options.freshWindowHours || 8) * 60 * 60 * 1000;
  const selectionPool = options.includeHistorical === true
    ? clusters
    : clusters.filter((cluster) => new Date(cluster.last_seen_at || 0).getTime() >= freshCutoff);
  const selection = selectEditorialSignals(selectionPool, { maxLongform: options.maxLongform ?? 3 });
  const published = [];
  const claimLedgers = [];
  const recent = options.recent || [];

  for (const [index, cluster] of selection.selected_for_analysis.entries()) {
    const route = index === 0 && (cluster.signal_score || 0) >= 82 ? 'Featured Analysis' : 'Standard Analysis';
    const result = writeAutonomousBlogArticle(
      { ...cluster, editorial_route: route },
      {
        cycleId: cycle_id,
        index,
        recent: [...recent, ...published],
        homepagePublished: true,
        backfilled: options.backfilled === true,
      }
    );
    if (result.ok) {
      published.push(result.article);
      claimLedgers.push(...result.ledger);
    } else {
      errors.push(`${cluster.cluster_id}: ${result.reasons.join(',')}`);
    }
  }

  const status = errors.length && !published.length
    ? 'completed_with_errors'
    : published.length
      ? 'completed_with_published_analyses'
      : 'completed_no_qualifying_signals';

  const cycle = {
    cycle_id,
    cycle_started_at,
    cycle_completed_at: new Date().toISOString(),
    status,
    source_items_scanned: scan.source_items.length,
    clean_items: scan.clean_items.length,
    signal_clusters_created: clusters.length,
    candidate_signals: selection.ranked_candidates.map((cluster) => cluster.cluster_id),
    selected_for_analysis: selection.selected_for_analysis.map((cluster) => cluster.cluster_id),
    published_analyses: published.map((article) => article.id),
    held_signals: selection.held_signals.map((cluster) => cluster.cluster_id),
    rejected_signals: selection.rejected_signals.map((cluster) => cluster.cluster_id),
    no_qualifying_signal_reason: published.length
      ? ''
      : (selectionPool.length ? selection.no_qualifying_signal_reason : 'No clean source item in the latest 8-hour window met the editorial desk freshness requirement.'),
    latest_source_published_at: scan.latest_source_published_at,
    latest_qualifying_signal_at: selection.selected_for_analysis[0]?.last_seen_at || null,
    latest_analysis_published_at: published[0]?.analysisPublishedAt || null,
    errors,
    audit_summary: {
      published_count: published.length,
      held_count: selection.held_signals.length,
      rejected_count: selection.rejected_signals.length,
      source_health_count: scan.source_health.length,
    },
    source_health: scan.source_health,
  };

  return {
    cycle,
    scan,
    clusters,
    selection,
    publishedAnalyses: published,
    claimLedgers,
  };
}
