import {
  boilerplateSentence,
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
    if (/usd|billion|million/i.test(numeric.unit)) return 'financial';
    if (/%|percent/i.test(numeric.unit)) return 'numeric';
    return 'numeric';
  }
  if (/\b(permit|zoning|moratorium|regulation|policy)\b/i.test(sentence)) return 'policy';
  if (/\b(capacity|data center|facility|campus|cloud region)\b/i.test(sentence)) return 'capacity';
  if (/\b(chip|hbm|gpu|memory|network|storage|platform)\b/i.test(sentence)) return 'technology';
  return 'company_action';
}

function claimRowsFor(text, item) {
  const row = (claimType, numeric = null) => ({
    claim_text: compact(text),
    claim_type: claimType,
    entities: extractCompanies(text),
    numeric_value: numeric?.numeric_value ?? null,
    unit: numeric?.unit || '',
    comparator: numeric?.comparator || '',
    source_url: item.source_url || item.url,
    source_name: item.source_name || item.source,
    source_published_at: item.source_published_at,
    source_quote_or_summary: compact(text),
    is_inference: false,
  });
  const numerics = extractNumericClaims(text);
  if (!numerics.length) return [row(claimTypeFor(text))];
  return numerics.map((numeric) => row(claimTypeFor(text, numeric), numeric));
}

// A headline usually has no closing punctuation, so joining it to the body
// with a space glued it onto the first sentence ("...via Malaysia Between
// April 2024 and June 2025, China recorded...") and every figure label drawn
// from that claim led with the headline. Each source's headline is now one
// sentence of its own with no body-sentence length floor, so a number it
// carries ("5 GW deal") stays a claim. Only an empty title, page furniture, or
// a "title" longer than any headline (scraped page text) is skipped.
function headlineSentence(item = {}) {
  const headline = sentence(stripHtml(String(item.title || '')));
  if (!headline || headline.length > 320) return '';
  return boilerplateSentence(headline) ? '' : headline;
}

export function extractClaimsFromCluster(cluster = {}) {
  const sourceItems = [cluster.representative_source, ...(cluster.supporting_sources || [])].filter(Boolean);
  const bodyRows = [];
  const headlineRows = [];
  for (const item of sourceItems) {
    const headline = headlineSentence(item);
    if (headline) headlineRows.push(...claimRowsFor(headline, item));
    const sentences = splitSentences(item.cleaned_text || '');
    const prioritized = [...sentences]
      .sort((left, right) => Number(extractNumericClaims(right).length > 0) - Number(extractNumericClaims(left).length > 0))
      .slice(0, 8);
    const selected = new Set(prioritized);
    for (const text of sentences.filter((sentence) => selected.has(sentence))) bodyRows.push(...claimRowsFor(text, item));
  }
  const keyOf = (row) => [row.claim_text.toLowerCase(), row.numeric_value, row.unit, row.comparator].join('|');
  const firstOccurrences = (rows, seen) => rows.filter((row) => {
    const key = keyOf(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Body claims keep the eight-sentence, eighteen-claim budget they had before
  // headlines were split out, so a third corroborating source still reaches
  // the ledger; headline claims (one sentence per source) come on top. A
  // headline is compared only with the body claims actually kept, so a body
  // row cut by the budget never removes the headline that repeats it.
  const uniqueBody = firstOccurrences(bodyRows, new Set());
  const prioritizedBody = [...uniqueBody]
    .sort((left, right) => Number(right.numeric_value !== null) - Number(left.numeric_value !== null));
  const selectedBody = new Set(prioritizedBody.slice(0, 18));
  const body = uniqueBody.filter((row) => selectedBody.has(row));
  return [...body, ...firstOccurrences(headlineRows, new Set(body.map(keyOf)))];
}
