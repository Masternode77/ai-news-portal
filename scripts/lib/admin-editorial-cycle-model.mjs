import { latestEditorialCycle } from './editorial-cycle-store.mjs';

export function buildAdminEditorialCycleModel({ cycles = [], clusters = [], claims = [], sourceHealth = [] } = {}) {
  const latest = latestEditorialCycle(cycles);
  const clusterById = new Map(clusters.map((cluster) => [cluster.cluster_id, cluster]));
  return {
    latest,
    cycles: cycles.slice(0, 50),
    selectedClusters: (latest?.selected_for_analysis || []).map((id) => clusterById.get(id)).filter(Boolean),
    heldClusters: (latest?.held_signals || []).map((id) => clusterById.get(id)).filter(Boolean),
    rejectedClusters: (latest?.rejected_signals || []).map((id) => clusterById.get(id)).filter(Boolean),
    claims,
    unsupportedClaims: claims.filter((claim) => claim.verification_status === 'unsupported'),
    sourceHealth,
    qualityGateFailures: clusters.filter((cluster) => cluster.publish_decision === 'rejected' || cluster.verification_status === 'insufficient_evidence'),
  };
}
