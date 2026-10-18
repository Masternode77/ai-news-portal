import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FUNNEL_COLUMNS,
  Funnel,
  NewsBrief,
  PublicationRow,
  PublicationSlug,
  PUBLICATION_COLUMNS,
  RawItemInsert,
  STAGE_NAMES,
  TABLE_NAMES,
} from "../src/index.ts";

const validBrief = {
  title_ko: "데이터센터 전력 계약이 바뀌는 이유",
  summary_ko: "가".repeat(220),
  why_it_matters_ko: "나".repeat(120),
  expert_lens_ko: "다".repeat(160),
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
  assert.equal(NewsBrief.safeParse({ ...validBrief, summary_ko: "짧음" }).success, false);
  const { source_url: _omit, ...withoutSource } = validBrief;
  assert.equal(NewsBrief.safeParse(withoutSource).success, false);
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
