/**
 * Deterministic text measures the QA rules share (Phase 3g). Drafts are English
 * since ADR-009 (2026-11-04); the measures stay script-aware because sources
 * can be Korean: sentences end at `.`, `!`, `?` or the Korean period, words are
 * runs of letters/digits (Hangul syllables count as letters), and script
 * shares are computed over letters only so digits, units and punctuation do
 * not dilute them.
 */
import { BRIEF_TEXT_FIELDS, NewsBrief } from "@cc/shared";
import type { DraftInsert } from "@cc/shared";

/** The reader-facing fields of a news_brief draft, or null when body.brief is not a valid NewsBrief. */
export function briefOf(draft: DraftInsert): NewsBrief | null {
  const result = NewsBrief.safeParse(draft.body["brief"]);
  return result.success ? result.data : null;
}

export const READER_FIELDS = BRIEF_TEXT_FIELDS;
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

/** Share of Latin-script letters among letters; 1 when there are no letters. */
export function latinRatio(text: string): number {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return 1;
  const latin = text.match(/\p{Script=Latin}/gu) ?? [];
  return latin.length / letters.length;
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
/** Calendar words are dates, not names: "October" or "Tuesday" never needs a source match (UNGROUNDED_NUMBER grounds the date). */
const CALENDAR = new Set(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);

export interface ProperNounOptions {
  /**
   * English prose capitalises the first word of every sentence, so a plain
   * capitalised word there ("Operators", "Meanwhile") is not evidence of a
   * name. With `skipSentenceInitial` that first word is dropped from its run;
   * a mixed-case or digit-bearing token ("OpenAI", "xAI", "H100") is kept.
   */
  skipSentenceInitial?: boolean;
}

function atSentenceStart(text: string, index: number): boolean {
  const before = text.slice(0, index).replace(/[\s"“‘'(\[]+$/u, "");
  return before.length === 0 || /[.!?:\n。]$/u.test(before) || /\n\s*$/u.test(text.slice(0, index));
}

/** A plain capitalised word ("A", "Operators", "Gigawatt-scale"): at a sentence start it carries no evidence of a name. */
const PLAIN_CAPITALISED = /^[A-Z][a-z]*(?:-[a-z]+)*$/u;
/** A lowercase hyphen suffix is not part of the name: "Brussels-run" is Brussels, "AI-era" is AI (staging run 2026-11-04). */
const LOWERCASE_SUFFIX = /(?:-[a-z][a-z-]*)+(?=$|[ \t])/gu;

export function latinProperNouns(text: string, minChars: number, options: ProperNounOptions = {}): string[] {
  const out = new Set<string>();
  const add = (candidate: string, sentenceStart: boolean): void => {
    let run = candidate;
    if (options.skipSentenceInitial && sentenceStart) {
      const [first, ...rest] = run.split(/[ \t]+/u);
      if (first !== undefined && PLAIN_CAPITALISED.test(first)) run = rest.join(" ");
    }
    const token = run.replace(LOWERCASE_SUFFIX, "").replace(/[.]+$/u, "");
    if (token.length < minChars) return;
    if (LATIN_STOP.has(token.toLowerCase()) || CALENDAR.has(token.toLowerCase())) return;
    if (/^\d/.test(token)) return;
    out.add(token);
  };
  // Horizontal whitespace only: readerText() joins the fields with newlines, and a name at the end of the
  // title must never fuse with a name at the start of the summary (Codex PR #72 P2).
  for (const match of text.matchAll(/\b([A-Z][A-Za-z0-9&.-]*(?:[ \t]+[A-Z][A-Za-z0-9&.-]*)*)\b/gu)) {
    // A run never crosses a sentence end: "Monday. Delivery" is two runs, the second at a sentence start
    // (English drafts, ADR-009; an abbreviation such as "U.S." splits the same way — a documented limit).
    const pieces = match[1]!.split(/(?<=\.)[ \t]+/u);
    pieces.forEach((piece, index) => add(piece, index > 0 || atSentenceStart(text, match.index ?? 0)));
  }
  return [...out];
}

/** Concrete tokens: numbers (with units or scale words) and Latin proper nouns (an English sentence's capitalised first word is not one). */
export function concreteTokens(text: string): string[] {
  const numbers = text.match(/\d+(?:[.,]\d+)*\s*(?:%|GW|MW|kW|kV|MWh|GWh|TWh|USD|\$|₩|원|억|조|만|천|년|월|일|개|곳|명|건)?/gu) ?? [];
  return [...numbers.map((n) => n.trim()), ...latinProperNouns(text, 3, { skipSentenceInitial: true })];
}
