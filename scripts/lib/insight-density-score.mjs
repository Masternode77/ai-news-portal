// Decision-support vocabulary. Inflected forms count like the base word: the
// singular-only list scored "investors, operators and suppliers carry the
// costs and risks" as if none of those words were there.
const ANALYSIS_TERMS = /\b(?:control(?:s|led|ling)?|timing|risk(?:s|y|ed|ing)?|cost(?:s|ly|ing)?|capacit(?:y|ies)|deliver(?:y|ies)|procurement|investors?|operators?|utilit(?:y|ies)|suppliers?|leverag(?:e|es|ed|ing)|expos(?:e|es|ed|ing|ure|ures)|underwr(?:ite|ites|iting|itten|ote)|milestones?|constrain(?:s|ed|ing|t|ts)?|allocat(?:e|es|ed|ing|ion|ions))\b/gi;

export function insightDensityScore(text = '') {
  const analysisHits = (String(text).match(ANALYSIS_TERMS) || []).length;
  const summaryHits = (String(text).match(/\b(reported|announced|said|according to|headline|article|source)\b/gi) || []).length;
  const score = Math.min(0.96, 0.68 + Math.min(analysisHits, 28) / 100 - Math.min(summaryHits, 16) / 220);
  return {
    insight_density_score: Number(score.toFixed(3)),
    reasons: score >= 0.78 ? [] : ['insight_density_below_threshold'],
  };
}
