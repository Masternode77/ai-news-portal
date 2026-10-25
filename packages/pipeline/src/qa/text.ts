/**
 * Deterministic text measures the QA rules share (Phase 3g). Korean-aware where
 * it matters: sentences end at `.`, `!`, `?` or the Korean period, words are
 * runs of letters/digits (Hangul syllables count as letters), and the Hangul
 * share is computed over letters only so digits, units and punctuation do not
 * dilute it.
 */
import { NewsBrief } from "@cc/shared";
import type { DraftInsert } from "@cc/shared";

/** The reader-facing fields of a news_brief draft, or null when body.brief is not a valid NewsBrief. */
export function briefOf(draft: DraftInsert): NewsBrief | null {
  const result = NewsBrief.safeParse(draft.body["brief"]);
  return result.success ? result.data : null;
}

export const READER_FIELDS = ["title_ko", "summary_ko", "why_it_matters_ko", "expert_lens_ko"] as const;
export type ReaderField = (typeof READER_FIELDS)[number];

export function readerText(brief: NewsBrief): string {
  return READER_FIELDS.map((field) => brief[field]).join("\n");
}

/** Words: runs of letters and digits (apostrophes, periods and hyphens inside a token kept), lower-cased. */
export function words(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) ?? []).map((w) => w.replace(/[.'’-]+$/u, "")).filter(Boolean);
}

/** Sentences split on terminal punctuation followed by whitespace or end of text; empty pieces dropped. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。]|[다요죠]\.)\s+|\n+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function paragraphs(text: string): string[] {
  return text.split(/\n\s*\n/u).map((p) => p.trim()).filter((p) => p.length > 0);
}

/** Share of Hangul among letters (Hangul syllables + Latin/other letters); 1 when there are no letters. */
export function hangulRatio(text: string): number {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return 1;
  const hangul = text.match(/[가-힣]/gu) ?? [];
  return hangul.length / letters.length;
}

/** Word n-gram shingles of a text, as `a b c d` strings. */
export function shingles(text: string, n: number): string[] {
  const w = words(text);
  const out: string[] = [];
  for (let i = 0; i + n <= w.length; i += 1) out.push(w.slice(i, i + n).join(" "));
  return out;
}

/** Fraction of `text`'s shingles that also occur in `against` (0 when text has no shingle). */
export function shingleContainment(text: string, against: Set<string>, n: number): number {
  const own = shingles(text, n);
  if (own.length === 0) return 0;
  let hits = 0;
  for (const s of own) if (against.has(s)) hits += 1;
  return hits / own.length;
}

/** Double-quoted spans in a text (straight or curly quotes), trimmed, non-empty. */
export function quotedSpans(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/["“]([^"”]{2,})["”]/gu)) out.push(match[1]!.trim());
  return out;
}

/** Latin-script proper-noun candidates: capitalised words or all-caps acronyms of at least `minChars`, sentence-initial English stop words excluded. */
const LATIN_STOP = new Set(["the", "a", "an", "and", "or", "of", "in", "on", "at", "to", "for", "with", "by", "from", "as", "is", "are", "was", "were", "this", "that", "these", "those", "it", "its", "new", "but", "if", "not"]);
export function latinProperNouns(text: string, minChars: number): string[] {
  const out = new Set<string>();
  for (const match of text.matchAll(/\b([A-Z][A-Za-z0-9&.-]*(?:\s+[A-Z][A-Za-z0-9&.-]*)*)\b/gu)) {
    const token = match[1]!.replace(/[.]+$/u, "");
    if (token.length < minChars) continue;
    if (LATIN_STOP.has(token.toLowerCase())) continue;
    if (/^\d/.test(token)) continue;
    out.add(token);
  }
  return [...out];
}

/** Concrete tokens: numbers (with units or scale words) and Latin proper nouns. */
export function concreteTokens(text: string): string[] {
  const numbers = text.match(/\d+(?:[.,]\d+)*\s*(?:%|GW|MW|kW|kV|MWh|GWh|TWh|USD|\$|₩|원|억|조|만|천|년|월|일|개|곳|명|건)?/gu) ?? [];
  return [...numbers.map((n) => n.trim()), ...latinProperNouns(text, 3)];
}
