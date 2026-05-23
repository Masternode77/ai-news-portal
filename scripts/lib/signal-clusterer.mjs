import { mergeSignalItems, signalKeyFor } from './signal-deduper.mjs';
import { summarizeSignalCluster } from './signal-cluster-summary.mjs';
import { dateMs, hash } from './autonomous-desk-utils.mjs';

export function buildSignalCluster(items = [], key = '') {
  const sorted = [...items].sort((a, b) => dateMs(b.source_published_at) - dateMs(a.source_published_at));
  const summary = summarizeSignalCluster(sorted);
  const firstSeen = Math.min(...sorted.map((item) => dateMs(item.source_published_at)).filter(Boolean));
  const lastSeen = Math.max(...sorted.map((item) => dateMs(item.source_published_at)).filter(Boolean));
  const sources = [...new Set(sorted.map((item) => item.source_name).filter(Boolean))];
  return {
    cluster_id: `sig_${key || hash(sorted.map((item) => item.id).join('|'))}`,
    ...summary,
    sources,
    source_count: sources.length,
    first_seen_at: firstSeen ? new Date(firstSeen).toISOString() : null,
    last_seen_at: lastSeen ? new Date(lastSeen).toISOString() : null,
    source_published_range: {
      start: firstSeen ? new Date(firstSeen).toISOString() : null,
      end: lastSeen ? new Date(lastSeen).toISOString() : null,
    },
    representative_source: sorted[0] || null,
    supporting_sources: sorted.slice(1, 6),
    conflicting_sources: [],
    extracted_facts: [...new Set(sorted.flatMap((item) => item.extracted_facts || []))].slice(0, 12),
    numeric_claims: [...new Map(sorted.flatMap((item) => item.numeric_claims || []).map((claim) => [claim.raw, claim])).values()],
    source_items: sorted,
    verification_status: 'pending',
    editorial_route: 'internal_archive',
    publish_decision: 'pending',
    clustering_reason: sorted.length > 1
      ? 'Grouped by shared infrastructure layer, company/topic tokens, region, and recency window.'
      : 'Single-source signal retained as a cluster so it can be scored against the same editorial desk policy.',
  };
}

export function clusterSignalItems(items = []) {
  const groups = mergeSignalItems(items);
  return [...groups.entries()].map(([key, rows]) => buildSignalCluster(rows, key));
}

export { signalKeyFor };
