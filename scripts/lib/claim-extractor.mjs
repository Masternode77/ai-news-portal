import {
  compact,
  extractCompanies,
  extractNumericClaims,
  sentence,
  splitSentences,
} from './autonomous-desk-utils.mjs';
import { stripHtml } from './normalize.mjs';

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

function claimRowsFor(text, item) {
  const row = (claimType, numericValue, unit) => ({
    claim_text: compact(text),
    claim_type: claimType,
    entities: extractCompanies(text),
    numeric_value: numericValue,
    unit,
    source_url: item.source_url || item.url,
    source_name: item.source_name || item.source,
    source_published_at: item.source_published_at,
    source_quote_or_summary: compact(text),
    is_inference: false,
  });
  const numerics = extractNumericClaims(text);
  if (!numerics.length) return [row(claimTypeFor(text), null, '')];
  return numerics.map((numeric) => row(claimTypeFor(text, numeric), numeric.numeric_value, numeric.unit));
}

// A headline usually has no closing punctuation, so joining it to the body
// with a space glued it onto the first sentence ("...via Malaysia Between
// April 2024 and June 2025, China recorded...") and every figure label drawn
// from that claim led with the headline. Each source's headline is now one
// sentence of its own, kept even when it is shorter than the body-sentence
// minimum, so a number it carries ("Firm plans 300 MW data center") stays a
// claim.
function headlineSentence(item = {}) {
  const headline = sentence(stripHtml(String(item.title || '')));
  if (headline.length < 12 || headline.length > 320) return '';
  return /(copyright|privacy policy|terms of use|newsletter|advertisement)/i.test(headline) ? '' : headline;
}

export function extractClaimsFromCluster(cluster = {}) {
  const sourceItems = [cluster.representative_source, ...(cluster.supporting_sources || [])].filter(Boolean);
  const bodyRows = [];
  const headlineRows = [];
  for (const item of sourceItems) {
    const headline = headlineSentence(item);
    if (headline) headlineRows.push(...claimRowsFor(headline, item));
    for (const text of splitSentences(item.cleaned_text || '').slice(0, 8)) bodyRows.push(...claimRowsFor(text, item));
  }
  const seen = new Set();
  const unique = (row) => {
    const key = [row.claim_text.toLowerCase(), row.numeric_value, row.unit].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
  // Body claims keep the eight-sentence, eighteen-claim budget they had before
  // headlines were split out, so a third corroborating source still reaches
  // the ledger; headline claims (one sentence per source) come on top.
  const body = bodyRows.filter(unique).slice(0, 18);
  return [...body, ...headlineRows.filter(unique)];
}
