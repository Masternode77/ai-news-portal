import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BRIEF_TEXT_FIELDS,
  FUNNEL_COLUMNS,
  Funnel,
  NewsBrief,
  NewsBriefDraft,
  PublicationRow,
  PublicationSlug,
  PUBLICATION_COLUMNS,
  RawItemInsert,
  STAGE_NAMES,
  TABLE_NAMES,
  storedBriefField,
} from "../src/index.ts";

const validBrief = {
  title: "Why data center power contracts are changing",
  summary: "a".repeat(320),
  why_it_matters: "b".repeat(220),
  expert_lens: "c".repeat(320),
  source_url: "https://www.eia.gov/todayinenergy/detail.php?id=1",
  source_name: "EIA",
  published_at_source: "2026-10-17T12:00:00Z",
  tags: ["power", "grid"],
  slug: "news/0123456789abcdef",
};

test("NewsBrief accepts a conforming brief and rejects extra keys", () => {
  assert.equal(NewsBrief.safeParse(validBrief).success, true);
  const extra = NewsBrief.safeParse({ ...validBrief, unexpected: 1 });
  assert.equal(extra.success, false);
});

test("NewsBrief enforces slug, length and source fields", () => {
  assert.equal(NewsBrief.safeParse({ ...validBrief, slug: "news/short" }).success, false);
  assert.equal(NewsBrief.safeParse({ ...validBrief, summary: "too short" }).success, false);
  assert.equal(NewsBrief.safeParse({ ...validBrief, summary: "a".repeat(2401) }).success, false, "English summaries are capped at 2,400 characters");
  const { source_url: _omit, ...withoutSource } = validBrief;
  assert.equal(NewsBrief.safeParse(withoutSource).success, false);
});

test("English reader fields (ADR-009): the Korean-era *_ko keys are no longer accepted, but stored rows still read through storedBriefField", () => {
  assert.deepEqual([...BRIEF_TEXT_FIELDS], ["title", "summary", "why_it_matters", "expert_lens"]);
  const { title, summary, why_it_matters, expert_lens, ...rest } = validBrief;
  const korean = { ...rest, title_ko: title, summary_ko: summary, why_it_matters_ko: why_it_matters, expert_lens_ko: expert_lens };
  assert.equal(NewsBrief.safeParse(korean).success, false);
  assert.deepEqual(Object.keys(NewsBriefDraft.shape).sort(), ["expert_lens", "summary", "tags", "title", "why_it_matters"]);
  assert.equal(storedBriefField(validBrief, "title"), "Why data center power contracts are changing");
  assert.equal(storedBriefField({ title_ko: "한전, 새만금 변전소 가동" }, "title"), "한전, 새만금 변전소 가동", "a row written before the switch still reads");
  assert.equal(storedBriefField({ title: "English", title_ko: "한국어" }, "title"), "English", "the current key wins");
  assert.equal(storedBriefField({ title: 3 }, "title"), null);
  assert.equal(storedBriefField(null, "summary"), null);
});

test("PublicationSlug keeps legacy news and column paths", () => {
  assert.equal(PublicationSlug.safeParse("news/eia-data-center-load-timing").success, true);
  assert.equal(PublicationSlug.safeParse("column/malaysia-server-trade-gap-permit-enforcement-2026-10-04").success, true);
  assert.equal(PublicationSlug.safeParse("/news/x").success, false);
  assert.equal(PublicationSlug.safeParse("blog/x").success, false);
});

test("Funnel has exactly the 13 Phase 0 columns in order", () => {
  assert.deepEqual(FUNNEL_COLUMNS, [
    "run_id",
    "started_at",
    "sources_configured",
    "sources_ok",
    "sources_failed",
    "items_fetched",
    "items_new",
    "items_scored",
    "passed_gate",
    "drafts",
    "qa_passed",
    "published",
    "top_error",
  ]);
  const parsed = Funnel.safeParse({
    run_id: "7d7f0d6e-3e7e-4a39-9a2e-1b2c3d4e5f60",
    started_at: "2026-10-18T00:45:00Z",
    sources_configured: 0,
    sources_ok: 0,
    sources_failed: 0,
    items_fetched: 0,
    items_new: 0,
    items_scored: 0,
    passed_gate: 0,
    drafts: 0,
    qa_passed: 0,
    published: 0,
    top_error: null,
  });
  assert.equal(parsed.success, true);
});

test("Row schemas are strict and inserts allow optional columns", () => {
  const insert = RawItemInsert.safeParse({
    source_id: "eia-today-in-energy",
    canonical_url: "https://www.eia.gov/todayinenergy/detail.php?id=2",
    title: "x",
    fetched_at: "2026-10-18T00:45:00+00:00",
  });
  assert.equal(insert.success, true);
  const row = PublicationRow.safeParse({ id: "not-a-uuid" });
  assert.equal(row.success, false);
  assert.ok(PUBLICATION_COLUMNS.includes("slug"));
  assert.ok(!PUBLICATION_COLUMNS.includes("search" as never));
});

test("stage and table name lists match the ADRs", () => {
  assert.deepEqual([...STAGE_NAMES], ["ingest", "normalize", "score", "generate", "qa", "image", "publish"]);
  assert.equal(TABLE_NAMES.length, 10);
});
