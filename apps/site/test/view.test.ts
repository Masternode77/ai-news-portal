import { test } from "node:test";
import assert from "node:assert/strict";
import { PublicationRow } from "@cc/shared";
import type { PublicationRow as Row } from "@cc/shared";
import {
  byline,
  clip,
  contentLang,
  displayDate,
  displayImage,
  excerpt,
  homeSections,
  isSubheading,
  isEssay,
  primaryCategory,
  relatedRows,
  sectionHeading,
  termBlurb,
  textLang,
} from "../src/lib/view.ts";
import { findTerm } from "../src/lib/taxonomy.ts";

let n = 0;
const row = (over: Partial<Row>): Row =>
  PublicationRow.parse({
    id: "7d7f0d6e-3e7e-4a39-9a2e-1b2c3d4e5f60",
    draft_id: null,
    slug: `news/brief${String(n++).padStart(6, "0")}`,
    content_type: "news_brief",
    title: "전력 계통 브리프",
    body: { summary_ko: "요약 문장입니다." },
    image: null,
    sources: [],
    published_at: "2026-10-30T00:00:00+00:00",
    updated_at: "2026-10-30T01:00:00+00:00",
    publisher: "pipeline",
    status: "published",
    legacy_id: null,
    noindex: false,
    tags: ["power", "grid"],
    category: null,
    region: null,
    ...over,
  });

const image = (placeholder: boolean) => ({
  path: placeholder ? "/images/placeholder-brief.svg" : "/generated/articles/x/hero.webp",
  alt: placeholder ? "Compute Current placeholder artwork" : "Substation at dusk",
  provenance: { provider: placeholder ? "placeholder" : "legacy", model: "static", prompt: "", generatedAt: "2026-10-30T00:00:00+00:00" },
  placeholder,
  costUsd: 0,
});

test("language follows the text: Hangul is Korean, everything else English", () => {
  assert.equal(contentLang(row({})), "ko");
  assert.equal(contentLang(row({ title: "Cooling Capacity Should Set the Envelope" })), "en");
  assert.equal(textLang("RFS 일정"), "ko");
  assert.equal(textLang("RFS schedule"), "en");
});

test("a placeholder is never shown as artwork", () => {
  assert.equal(displayImage(row({ image: image(true) })), null);
  assert.equal(displayImage(row({ image: null })), null);
  assert.deepEqual(displayImage(row({ image: image(false) })), { path: "/generated/articles/x/hero.webp", alt: "Substation at dusk" });
});

test("primary category follows taxonomy order and never guesses", () => {
  assert.equal(primaryCategory(row({ tags: ["grid", "cooling"] }))?.slug, "power-grid");
  assert.equal(primaryCategory(row({ tags: [], category: "Cooling" }))?.slug, "cooling");
  assert.equal(primaryCategory(row({ tags: ["saemangeum"], title: "제목" })), null);
});

test("excerpt prefers the deck, then summaries, and clips on a word boundary", () => {
  assert.equal(excerpt(row({ body: { deck: "Deck line.", summary_ko: "요약" } })), "Deck line.");
  assert.equal(excerpt(row({ body: { summary_ko: "첫 문단.\n\n둘째 문단." } })), "첫 문단.");
  assert.equal(excerpt(row({ body: { summary: "First paragraph.\n\nSecond paragraph." } })), "First paragraph.", "the English brief key (ADR-009)");
  assert.equal(excerpt(row({ body: {} })), "");
  assert.equal(clip("alpha beta gamma delta", 15), "alpha beta…");
  assert.equal(clip("short", 12), "short");
});

test("dates are absolute and in KST", () => {
  assert.equal(displayDate("2026-10-31T23:45:00Z"), "Nov 1, 2026", "23:45Z is the next morning in Seoul");
  assert.equal(displayDate("2026-09-16T18:47:02.256Z", "long"), "September 17, 2026");
  assert.equal(displayDate("not-a-date"), "not-a-date");
});

test("bylines: columns and essays are Josh, briefs are the desk with a source count", () => {
  assert.equal(byline(row({ slug: "column/a-2026-10-01" })).name, "Josh Jiwoon Inn");
  assert.equal(byline(row({ content_type: "insight_essay" })).href, "/author/josh-inn/");
  const source = { url: "https://example.com/a", name: "Example", published_at: null };
  assert.equal(byline(row({ sources: [source, source] })).role, "AI-assisted brief · 2 sources");
  assert.equal(byline(row({ sources: [source] })).role, "AI-assisted brief · 1 source");
});

test("section headings follow the section language", () => {
  assert.equal(sectionHeading("why_it_matters_ko", "왜 중요한가", "ko"), "왜 중요한가");
  assert.equal(sectionHeading("why_it_matters", "왜 중요한가", "en"), "Why it matters");
  assert.equal(sectionHeading("summary", "Summary", "en"), "Summary");
  assert.equal(sectionHeading("counterpoint", null, "en"), "Counterpoint");
  assert.equal(sectionHeading("unknown", null, "en"), null);
});

test("home sections never show a row twice and lead with the newest essay", () => {
  const rows = [
    row({ slug: "news/b1" }),
    row({ slug: "column/c1-2026-10-11" }),
    row({ slug: "news/b2" }),
    row({ slug: "column/c2-2026-10-06" }),
    row({ slug: "news/a1", content_type: "legacy_analysis", title: "Analysis" }),
    row({ slug: "column/c3-2026-10-04" }),
  ];
  const home = homeSections(rows);
  assert.equal(home.hero?.slug, "column/c1-2026-10-11");
  assert.deepEqual(
    home.briefs.map((r) => r.slug),
    ["news/b1", "news/b2"],
  );
  assert.deepEqual(
    home.recentColumns.map((r) => r.slug),
    ["column/c2-2026-10-06", "column/c3-2026-10-04"],
  );
  assert.deepEqual(home.columnCards, []);
  assert.deepEqual(
    home.more.map((r) => r.slug),
    ["news/a1"],
  );
  const all = [home.hero, ...home.briefs, ...home.recentColumns, ...home.columnCards, ...home.more].map((r) => r?.slug);
  assert.equal(new Set(all).size, all.length);
  assert.equal(homeSections([row({ slug: "news/only" })]).hero, null, "no essay: no hero");
  assert.ok(isEssay(row({ content_type: "insight_essay" })));
});

test("related rows share the category, exclude the article, and fall back to essays", () => {
  const current = row({ slug: "news/cur", tags: ["grid"] });
  const rows = [current, row({ slug: "news/p1", tags: ["power"] }), row({ slug: "news/c1", tags: ["cooling"] }), row({ slug: "column/e1-2026-10-01", tags: [] })];
  assert.deepEqual(
    relatedRows(rows, current).map((r) => r.slug),
    ["news/p1", "column/e1-2026-10-01"],
  );
});

test("term blurbs exist for every category and fall back by kind", () => {
  assert.match(termBlurb(findTerm("category", "power-grid")!), /Interconnection/);
  assert.equal(termBlurb(findTerm("region", "korea")!), "Publications on AI infrastructure in Korea.");
  assert.equal(termBlurb(findTerm("company", "nvidia")!), "Publications that mention NVIDIA.");
});

test("short unpunctuated lines inside long-form bodies read as subheadings", () => {
  assert.ok(isSubheading("ERCOT exposes the timing risk", "Next paragraph."));
  assert.ok(isSubheading("Bottom Line", "The decision turns on timing."));
  assert.ok(!isSubheading("The decision turns on timing.", "x"), "a sentence");
  assert.ok(!isSubheading("Last line", undefined), "nothing follows");
  assert.ok(!isSubheading("한전은 보강이 끝나기 전까지 접속을 받기 어렵다고 설명했다", "x"), "Korean sentence ending");
  assert.ok(!isSubheading("x".repeat(95), "x"), "too long");
});
