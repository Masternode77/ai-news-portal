/**
 * Dependency-free text similarity for Phase 3b normalize: title keys and token
 * Dice for "same story", word-shingle Jaccard for "same body". Rules rewritten
 * from the legacy ideas (normalizedTitleKey, industry-headlines `similar`,
 * near-duplicate-phrase-detector window Jaccard) against the ADR-004 thresholds.
 */

/** Function words dropped from title keys and title token sets (English only; Korean particles are handled by bigrams). */
const STOPWORDS = new Set([
  "the", "a", "an", "to", "for", "and", "with", "from", "by", "on", "of", "in", "at", "as", "is", "are", "its", "it", "this", "that", "be",
  "will", "has", "have", "after", "over", "into", "up", "out", "vs", "amid", "than", "about", "more", "says", "said", "how", "why", "what",
]);

const HANGUL = /[가-힣]/;

/** Lowercase, `&` → and, letters/digits/Hangul only, single spaces. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/&amp;|&/g, " and ")
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9가-힣\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Words of a text in order, without stopword removal (used for body shingles). */
export function textTokens(text: string): string[] {
  return normalizeText(text).split(" ").filter(Boolean);
}

/**
 * Title tokens in order: Latin/digit runs of two or more characters minus
 * stopwords; a Hangul run contributes its character bigrams (a one-character
 * run itself) so attached particles do not break the match.
 */
export function titleTokenList(title: string): string[] {
  const out: string[] = [];
  for (const word of textTokens(title)) {
    // A mixed word such as 삼성SDS splits into its Hangul and Latin runs.
    for (const run of word.match(/[가-힣]+|[a-z0-9]+/g) ?? []) {
      if (HANGUL.test(run)) {
        const chars = [...run];
        if (chars.length === 1) out.push(run);
        for (let i = 0; i + 1 < chars.length; i += 1) out.push(`${chars[i]}${chars[i + 1]}`);
        continue;
      }
      if (run.length < 2 || STOPWORDS.has(run)) continue;
      out.push(run);
    }
  }
  return out;
}

export function titleTokens(title: string): Set<string> {
  return new Set(titleTokenList(title));
}

/** Exact-match key for "the same headline with different punctuation or function words". */
export function titleKey(title: string): string {
  return titleTokenList(title).join(" ");
}

export function dice(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

export function titleSimilarity(a: string, b: string): number {
  return dice(titleTokens(a), titleTokens(b));
}

/** Word n-gram shingles; a text shorter than `n` tokens yields the empty set. */
export function shingles(tokens: readonly string[], n = 5): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + n <= tokens.length; i += 1) out.add(tokens.slice(i, i + n).join(" "));
  return out;
}

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
}

export function bodySimilarity(a: string, b: string, n = 5): number {
  return jaccard(shingles(textTokens(a), n), shingles(textTokens(b), n));
}
