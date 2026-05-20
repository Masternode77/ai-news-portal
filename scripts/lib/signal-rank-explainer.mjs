export function explainSignalRank(cluster = {}) {
  const reasons = [];
  if ((cluster.signal_score || 0) >= 82) reasons.push('high signal score');
  if ((cluster.extracted_facts || []).length >= 4) reasons.push('at least four source-backed facts');
  if ((cluster.numeric_claims || []).length) reasons.push('numeric or operational anchor present');
  if ((cluster.source_count || 0) > 1) reasons.push('multi-source corroboration');
  if (cluster.primary_infrastructure_layer) reasons.push(`clear infrastructure layer: ${cluster.primary_infrastructure_layer}`);
  return reasons.length ? reasons : ['held for more evidence'];
}
