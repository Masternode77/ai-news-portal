/**
 * Presentation helpers for the D3 design (docs/design/d2-direction.md): pure,
 * Node-testable functions that decide what a card, row, hero or article header
 * shows from a publications row. Nothing here reads data or changes a route.
 *
 * The site and every article are English (Josh 2026-11-03 for the chrome;
 * ADR-009, 2026-11-04, for the articles). contentLang() still derives the
 * language from the title, so a brief published in Korean before the switch
 * carries lang="ko" until it is regenerated in English.
 */
import type { PublicationRow } from "@cc/shared";
import { AUTHOR } from "./author.ts";
import { isColumn } from "./listing.ts";
import { bodySections } from "./render.ts";
import { matchesTerm, taxonomyTerms } from "./taxonomy.ts";
import type { TaxonomyTerm } from "./taxonomy.ts";

export type ContentLang = "ko" | "en";

const HANGUL = /[가-힣]/gu;
const LATIN = /[A-Za-z]/gu;
/**
 * A text is Korean when Hangul makes up at least this share of its letters (Hangul + Latin). One Korean
 * word inside an English paragraph (a source name such as 디일렉) no longer turns the section Korean
 * (2026-11-08: a restored English brief showed the "요약" kicker); a Korean paragraph that carries Latin
 * company names stays Korean.
 */
const KOREAN_MIN_SHARE = 0.2;

/** Korean when the title has Hangul; the legacy catalog and policy pages are English. */
export function contentLang(row: Pick<PublicationRow, "title">): ContentLang {
  return textLang(row.title);
}

/** Section-level language: a legacy English article can still carry a Korean summary field. */
export function textLang(text: string): ContentLang {
  const hangul = text.match(HANGUL)?.length ?? 0;
  if (hangul === 0) return "en";
  const latin = text.match(LATIN)?.length ?? 0;
  return hangul / (hangul + latin) >= KOREAN_MIN_SHARE ? "ko" : "en";
}

/** The Current columns and insight essays: the rows that lead the home page. */
export function isEssay(row: Pick<PublicationRow, "slug" | "content_type">): boolean {
  return isColumn(row) || row.content_type === "insight_essay";
}

export interface DisplayImage {
  path: string;
  alt: string;
}

/**
 * The image to show, or null. A placeholder is never shown as if it were
 * article artwork (AGENTS.md): cards and heroes fall back to their text form.
 */
export function displayImage(row: Pick<PublicationRow, "image" | "title">): DisplayImage | null {
  const image = row.image;
  if (!image || image.placeholder || image.path.trim().length === 0) return null;
  return { path: image.path, alt: image.alt.trim() };
}

/** First category term the row matches, in taxonomy order; null rather than a guess. */
export function primaryCategory(row: Pick<PublicationRow, "title" | "tags" | "category" | "region">): TaxonomyTerm | null {
  return taxonomyTerms("category").find((term) => matchesTerm(row, term)) ?? null;
}

const EXCERPT_KEYS = ["deck", "thesis", "thesis_ko", "summary", "summary_ko", "article_body", "body_ko", "why_it_matters", "why_it_matters_ko"];

/** A one-paragraph teaser: the first paragraph of the first known summary-like field, cut at a word boundary. */
export function excerpt(row: Pick<PublicationRow, "body">, max: number = 220): string {
  const sections = bodySections(row.body);
  for (const key of EXCERPT_KEYS) {
    const section = sections.find((s) => s.key === key);
    const first = section?.paragraphs[0];
    if (first) return clip(first, max);
  }
  return "";
}

export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:·—-]+$/u, "")}…`;
}

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Seoul" });
const DATE_LONG = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Seoul" });

/**
 * "Nov 3, 2026" in KST. Absolute dates only: ISR can serve a cached page for a
 * while, so a relative "2 hours ago" would drift into a false statement.
 */
export function displayDate(iso: string, style: "short" | "long" = "short"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return (style === "long" ? DATE_LONG : DATE).format(date);
}

export interface Byline {
  name: string;
  role: string;
  href: string | null;
  initials: string;
}

export function byline(row: Pick<PublicationRow, "slug" | "content_type" | "sources">): Byline {
  if (isEssay(row)) {
    return { name: AUTHOR.name, role: AUTHOR.role, href: `/author/${AUTHOR.slug}/`, initials: "JI" };
  }
  const count = row.sources.length;
  const role = count === 0 ? "AI-assisted brief" : `AI-assisted brief · ${count} source${count === 1 ? "" : "s"}`;
  return { name: "Compute Current", role, href: null, initials: "CC" };
}

const SECTION_HEADINGS: Record<string, { en: string; ko: string }> = {
  thesis: { en: "Key argument", ko: "핵심 주장" },
  thesis_ko: { en: "Key argument", ko: "핵심 주장" },
  summary: { en: "Summary", ko: "요약" },
  summary_ko: { en: "Summary", ko: "요약" },
  why_it_matters: { en: "Why it matters", ko: "왜 중요한가" },
  why_it_matters_ko: { en: "Why it matters", ko: "왜 중요한가" },
  expert_lens: { en: "Expert Lens", ko: "Expert Lens" },
  expert_lens_ko: { en: "Expert Lens", ko: "Expert Lens" },
  counterpoint: { en: "Counterpoint", ko: "반론" },
  counterpoint_ko: { en: "Counterpoint", ko: "반론" },
  implications: { en: "Implications", ko: "시사점" },
  implications_ko: { en: "Implications", ko: "시사점" },
};

/** Body section headings follow the article's language, so a Korean brief does not get English headings mid-text. */
export function sectionHeading(key: string, fallback: string | null, lang: ContentLang): string | null {
  const known = SECTION_HEADINGS[key];
  if (!known) return fallback;
  return known[lang];
}

/**
 * Long-form bodies (legacy analysis and columns) store subheadings as their own
 * short paragraph with no closing punctuation ("ERCOT exposes the timing risk").
 * The article template renders those as h3; the stored text is unchanged.
 */
export function isSubheading(paragraph: string, next: string | undefined): boolean {
  const text = paragraph.trim();
  if (next === undefined || text.length === 0 || text.length > 90) return false;
  if (/[.!?:;,"'”’)\]…다요]$/u.test(text)) return false;
  return text.split(/\s+/).length <= 12;
}

export const LONGFORM_SECTION_KEYS: readonly string[] = ["article_body", "body_ko"];

/** Summary-like sections render as the boxed lead; the rest flow as prose. */
export const LEAD_SECTION_KEYS: readonly string[] = ["thesis", "thesis_ko", "summary", "summary_ko"];
export const LENS_SECTION_KEYS: readonly string[] = ["expert_lens", "expert_lens_ko"];

export interface HomeSections<T> {
  hero: T | null;
  briefs: T[];
  recentColumns: T[];
  columnCards: T[];
  more: T[];
}

/**
 * Splits the newest-first catalog into the home page modules without showing
 * a row twice. The hero is the newest essay or column; with none, the home
 * page starts at the briefs.
 */
export function homeSections<T extends Pick<PublicationRow, "slug" | "content_type">>(rows: readonly T[]): HomeSections<T> {
  const used = new Set<string>();
  const take = (candidates: readonly T[], n: number): T[] => {
    const picked = candidates.filter((row) => !used.has(row.slug)).slice(0, n);
    for (const row of picked) used.add(row.slug);
    return picked;
  };
  const essays = rows.filter(isEssay);
  const hero = take(essays, 1)[0] ?? null;
  const briefs = take(
    rows.filter((row) => row.content_type === "news_brief" && !isEssay(row)),
    6,
  );
  const recentColumns = take(essays, 3);
  const columnCards = take(essays, 3);
  const more = take(rows, 6);
  return { hero, briefs, recentColumns, columnCards, more };
}

/** Up to n other rows sharing the article's primary category, newest first; essays fill in when none share it. */
export function relatedRows<T extends Pick<PublicationRow, "slug" | "content_type" | "title" | "tags" | "category" | "region">>(
  rows: readonly T[],
  current: T,
  n: number = 3,
): T[] {
  const others = rows.filter((row) => row.slug !== current.slug);
  const term = primaryCategory(current);
  const same = term ? others.filter((row) => matchesTerm(row, term)) : [];
  const picked = same.slice(0, n);
  if (picked.length < n) {
    for (const row of others.filter(isEssay)) {
      if (picked.length >= n) break;
      if (!picked.includes(row)) picked.push(row);
    }
  }
  return picked;
}

/** One-line descriptions for the category pages (draft copy, reviewed in the D3 PR). */
export const CATEGORY_BLURB: Readonly<Record<string, string>> = {
  "power-grid": "Interconnection queues, power procurement and grid investment: the electricity questions that decide where data centers can be built.",
  "data-centers": "Campus development, leasing, ready-for-service schedules and the operators building AI-scale capacity.",
  "cloud-capacity": "Cloud and GPU-cloud capacity: where it is added, how it is priced, and what constrains it.",
  semiconductors: "Accelerators, HBM and memory, foundry capacity, and how chip supply sets the pace of AI build-outs.",
  cooling: "Liquid and air cooling, rack density and heat reuse, and what they change in site design and contracts.",
  "capital-markets": "Financing, valuations, M&A and the credit terms behind data center and AI infrastructure projects.",
  regulation: "Permitting, energy policy and the rules that shape siting and operation of AI infrastructure.",
  "supply-chain": "Trade flows, export controls and the equipment lead times behind AI capacity.",
  "ai-infrastructure": "Training and inference demand and the infrastructure it pulls behind it.",
};

export function termBlurb(term: TaxonomyTerm): string {
  if (term.kind === "category") return CATEGORY_BLURB[term.slug] ?? `Publications on ${term.label}.`;
  if (term.kind === "region") return `Publications on AI infrastructure in ${term.label}.`;
  return `Publications that mention ${term.label}.`;
}

export const TERM_KIND_LABEL: Readonly<Record<TaxonomyTerm["kind"], string>> = {
  category: "Topic",
  region: "Region",
  company: "Company",
};
