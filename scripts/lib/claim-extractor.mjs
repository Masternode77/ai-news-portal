import {
  compact,
  extractCompanies,
  extractNumericClaims,
  splitSentences,
} from './autonomous-desk-utils.mjs';

function claimTypeFor(sentence = '', numeric = null) {
  if (numeric) {
    if (/gw|mw|kw|megawatts|gigawatts/i.test(numeric.unit)) return 'power';
    if (/billion|million/i.test(numeric.unit)) return 'financial';
    if (/%|percent/i.test(numeric.unit)) return 'numeric';
    return 'numeric';
  }
  if (/\b(permit|zoning|moratorium|regulation|policy)\b/i.test(sentence)) return 'policy';
  if (/\b(capacity|data center|facility|campus|cloud region)\b/i.test(sentence)) return 'capacity';
  if (/\b(chip|hbm|gpu|memory|network|storage|platform)\b/i.test(sentence)) return 'technology';
  return 'company_action';
}

export function extractClaimsFromCluster(cluster = {}) {
  const sourceItems = [cluster.representative_source, ...(cluster.supporting_sources || [])].filter(Boolean);
  const rows = [];
  for (const item of sourceItems) {
    const sentences = splitSentences([item.title, item.cleaned_text].filter(Boolean).join(' ')).slice(0, 8);
    for (const sentence of sentences) {
      const numerics = extractNumericClaims(sentence);
      if (numerics.length) {
        for (const numeric of numerics) {
          rows.push({
            claim_text: compact(sentence),
            claim_type: claimTypeFor(sentence, numeric),
            entities: extractCompanies(sentence),
            numeric_value: numeric.numeric_value,
            unit: numeric.unit,
            source_url: item.source_url || item.url,
            source_name: item.source_name || item.source,
            source_published_at: item.source_published_at,
            source_quote_or_summary: compact(sentence),
            is_inference: false,
          });
        }
      } else {
        rows.push({
          claim_text: compact(sentence),
          claim_type: claimTypeFor(sentence),
          entities: extractCompanies(sentence),
          numeric_value: null,
          unit: '',
          source_url: item.source_url || item.url,
          source_name: item.source_name || item.source,
          source_published_at: item.source_published_at,
          source_quote_or_summary: compact(sentence),
          is_inference: false,
        });
      }
    }
  }
  const seen = new Set();
  return rows.filter((row) => {
    const key = [row.claim_text.toLowerCase(), row.numeric_value, row.unit].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 18);
}
