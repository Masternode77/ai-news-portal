/**
 * Published-date parsing for feed items. Unlike the legacy pipeline
 * (fetch-feeds.mjs:107), an unparseable or missing date is reported as such
 * instead of being replaced by "now", so DATE_INVALID (ADR-004) can act on it.
 */

const DRUPAL_DATE = /^(?:[A-Za-z]{3},\s*)?(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2}):(\d{2})$/;
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const MONTH_NAME_DATE = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/;

export type DateProblem = "missing" | "unparseable" | "future";

export interface ParsedDate {
  iso: string | null;
  problem: DateProblem | null;
}

const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

const DATE_ONLY_NAMED = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})$/;

/** The calendar day a string names, in the shapes the feeds use (ISO, "Feb 31, 2026", RFC 822 "31 Feb 2026", Drupal "02/31/2026"). */
const CALENDAR_SHAPES: { re: RegExp; pick: (m: RegExpMatchArray) => { year: number; month: number | undefined; day: number } }[] = [
  { re: /\b(20\d{2})-(\d{2})-(\d{2})(?!\d)/, pick: (m) => ({ year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]) }) },
  { re: MONTH_NAME_DATE, pick: (m) => ({ year: Number(m[3]), month: MONTHS[m[1]!.toLowerCase()], day: Number(m[2]) }) },
  { re: /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)[a-z]*\.?,?\s+(20\d{2})\b/, pick: (m) => ({ year: Number(m[3]), month: MONTHS[m[2]!.toLowerCase()], day: Number(m[1]) }) },
  { re: /\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/, pick: (m) => ({ year: Number(m[3]), month: Number(m[1]) - 1, day: Number(m[2]) }) },
];

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * True when the string names a day that does not exist in its month ("Feb 31, 2026", "2026-02-31", "Feb 29, 2026").
 * The Date constructor would roll such a day into the next month and the item would carry a fabricated date; the
 * caller reports it as unparseable instead (DATE_INVALID, ADR-004).
 */
export function namesImpossibleDay(value: string): boolean {
  for (const { re, pick } of CALENDAR_SHAPES) {
    const match = value.match(re);
    if (!match) continue;
    const { year, month, day } = pick(match);
    return month === undefined || month < 0 || month > 11 || day < 1 || day > daysInMonth(year, month);
  }
  return false;
}

export function parseDateCandidate(raw: string): Date | null {
  const value = raw.trim();
  if (!value) return null;
  if (namesImpossibleDay(value)) return null;
  // A bare "Oct 7, 2026" has no timezone; pin it to noon UTC so the result does not depend on the machine's zone.
  const dateOnly = value.match(DATE_ONLY_NAMED);
  if (dateOnly) {
    const month = MONTHS[dateOnly[1]!.toLowerCase()];
    const day = Number(dateOnly[2]);
    const year = Number(dateOnly[3]);
    if (month !== undefined && day >= 1 && day <= 31) return new Date(Date.UTC(year, month, day, 12));
  }
  const direct = new Date(value);
  if (Number.isFinite(direct.getTime())) return direct;
  const drupal = value.match(DRUPAL_DATE);
  if (drupal) {
    const [month, day, year, hour, minute] = drupal.slice(1).map(Number);
    const stamp = Date.UTC(year!, month! - 1, day!, hour!, minute!);
    return Number.isFinite(stamp) ? new Date(stamp) : null;
  }
  const named = value.match(MONTH_NAME_DATE);
  if (named) {
    const month = MONTHS[named[1]!.toLowerCase()];
    const day = Number(named[2]);
    const year = Number(named[3]);
    if (month !== undefined && day >= 1 && day <= 31) return new Date(Date.UTC(year, month, day, 12));
  }
  return null;
}

/** First parseable candidate wins; a date more than a day in the future is a problem, not a fresh item. */
export function parsePublishedAt(candidates: ReadonlyArray<string | null | undefined>, now: Date): ParsedDate {
  const present = candidates.filter((c): c is string => typeof c === "string" && c.trim().length > 0);
  if (present.length === 0) return { iso: null, problem: "missing" };
  for (const candidate of present) {
    const date = parseDateCandidate(candidate);
    if (!date) continue;
    if (date.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) return { iso: date.toISOString(), problem: "future" };
    return { iso: date.toISOString(), problem: null };
  }
  return { iso: null, problem: "unparseable" };
}

/** The same tolerance the feed path applies: more than a day ahead of `now` is malformed metadata, not a fresh item. */
export function isFutureDate(iso: string, now: Date): boolean {
  return Date.parse(iso) > now.getTime() + FUTURE_TOLERANCE_MS;
}

export function olderThanDays(iso: string, days: number, now: Date): boolean {
  return now.getTime() - Date.parse(iso) > days * 24 * 60 * 60 * 1000;
}
