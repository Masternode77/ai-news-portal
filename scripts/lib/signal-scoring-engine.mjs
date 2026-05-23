import { dateMs } from './autonomous-desk-utils.mjs';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function scoreSignalCluster(cluster = {}, options = {}) {
  const rep = cluster.representative_source || {};
  const relevance = clamp(Number(rep.relevance_score || rep.original?.infrastructure_relevance_score || 0) * 20, 0, 20);
  const now = options.now ? new Date(options.now).getTime() : Date.now();
  const ageHours = cluster.last_seen_at ? (now - dateMs(cluster.last_seen_at)) / 36e5 : 999;
  const novelty = ageHours <= 8 ? 10 : ageHours <= 24 ? 7 : ageHours <= 168 ? 4 : 2;
  const evidenceQuality = clamp((Number(rep.extraction_quality || 0.8) * 10) + Math.min(cluster.extracted_facts?.length || 0, 5), 0, 15);
  const numericSpecificity = Math.min(cluster.numeric_claims?.length || 0, 2) * 5;
  const text = [cluster.cluster_title, cluster.cluster_topic, cluster.primary_infrastructure_layer].join(' ');
  const commercialImpact = /(capital|finance|reit|ipo|lease|customer|contract|cost|price|buyer|market)/i.test(text) ? 10 : 6;
  const operatingImpact = /(power|grid|capacity|cooling|site|platform|memory|storage|network|facility|deployment)/i.test(text) ? 10 : 6;
  const urgency = ageHours <= 24 ? 8 : 5;
  const multiSource = Math.min(cluster.source_count || 1, 3) >= 2 ? 5 : 2;
  const readerDecision = (cluster.extracted_facts?.length || 0) >= 4 && cluster.primary_infrastructure_layer ? 10 : 5;
  const total = Math.round(relevance + novelty + evidenceQuality + numericSpecificity + commercialImpact + operatingImpact + urgency + multiSource + readerDecision);
  return {
    score: clamp(total, 0, 100),
    dimensions: {
      infrastructure_relevance: Number(relevance.toFixed(1)),
      novelty,
      evidence_quality: Number(evidenceQuality.toFixed(1)),
      numeric_specificity: numericSpecificity,
      commercial_impact: commercialImpact,
      operating_impact: operatingImpact,
      urgency,
      multi_source_corroboration: multiSource,
      reader_decision_value: readerDecision,
    },
  };
}

export function scoreSignalClusters(clusters = [], options = {}) {
  return clusters.map((cluster) => {
    const scoring = scoreSignalCluster(cluster, options);
    return { ...cluster, signal_score: scoring.score, score_dimensions: scoring.dimensions };
  });
}
