export const COLUMN_COVERAGE_BEATS = [
  'ai_business',
  'data_center_operators',
  'compute_hardware',
  'power_cooling',
  'policy',
  'other_infrastructure',
];

// Classify the news angle, not every subject mentioned in the source body.
export function columnCoverageBeat(article = {}) {
  const title = String(article.title || '').toLowerCase();
  if (/\b(policy|regulat\w*|legislation|law|permit\w*|zoning|export controls?|sanctions?|commission|congress|government)\b/.test(title)
    || /\b(?:eu|european)\b.*\b(?:ratings?|standards?)\b/.test(title)) return 'policy';
  if (/\b(power|grid|electricity|energy|cooling|heat reuse|thermal|diesel|substation|interconnection|cdu)\b/.test(title)) return 'power_cooling';
  if (/\b(gpu\w*|chip\w*|semiconductor\w*|hbm|memory|networking|interconnect\w*|silicon|wafer\w*|packaging|accelerators?)\b/.test(title)) return 'compute_hardware';
  if (/^google cloud ai:|\b(openai|anthropic|deepmind|claude|gemini|foundation models?)\b/.test(title)) return 'ai_business';
  if (/\b(data[ -]?cent(?:er|re)s?|colocation|neocloud|hyperscaler\w*|cloud|equinix|digital realty|coreweave|qts|vantage|cyrusone|switch|campus|campuses)\b/.test(title)) return 'data_center_operators';
  if (/\b(ai|artificial intelligence|openai|anthropic|deepmind|llm\w*|inference|foundation models?|model serving)\b/.test(title)) return 'ai_business';
  const category = String(article.primary_category || article.category || '').toLowerCase();
  if (/policy|regulat|siting/.test(category)) return 'policy';
  if (/power|energy|grid|cooling/.test(category)) return 'power_cooling';
  if (/semiconductor|hardware|network|memory/.test(category)) return 'compute_hardware';
  if (/data center|colocation|cloud/.test(category)) return 'data_center_operators';
  return 'other_infrastructure';
}

export function recentColumnCoverage(columns = [], now = new Date()) {
  const end = now.getTime();
  const recent = columns
    .filter(column => {
      const stamp = Date.parse(column.publishedAt || column.analysisPublishedAt || '');
      return stamp <= end && stamp >= end - 30 * 86_400_000;
    })
    .sort((a, b) => Date.parse(b.publishedAt || b.analysisPublishedAt) - Date.parse(a.publishedAt || a.analysisPublishedAt))
    .slice(0, 5);
  const counts = Object.fromEntries(COLUMN_COVERAGE_BEATS.map(beat => [beat, 0]));
  const beats = recent.map(column => COLUMN_COVERAGE_BEATS.includes(column.coverage_beat)
    ? column.coverage_beat : columnCoverageBeat(column));
  for (const beat of beats) counts[beat] += 1;
  return { counts, lastBeat: beats[0] || null, total: recent.length };
}
