export function insightDensityScore(text = '') {
  const analysisHits = (String(text).match(/\b(control|timing|risk|cost|capacity|delivery|procurement|investor|operator|utility|supplier|leverage|exposure|underwrite|milestone|constraint|allocation)\b/gi) || []).length;
  const summaryHits = (String(text).match(/\b(reported|announced|said|according to|headline|article|source)\b/gi) || []).length;
  const score = Math.min(0.96, 0.68 + Math.min(analysisHits, 28) / 100 - Math.min(summaryHits, 16) / 220);
  return {
    insight_density_score: Number(score.toFixed(3)),
    reasons: score >= 0.78 ? [] : ['insight_density_below_threshold'],
  };
}
