import { test } from "node:test";
import assert from "node:assert/strict";
import { ARCHIVE_PAGE_SIZE, archivePath, archiveRoute, contentLabel, indexableRows, pageCount, paginate } from "../src/lib/listing.ts";

test("archive keeps the legacy page size and redirects past the last page", () => {
  assert.equal(ARCHIVE_PAGE_SIZE, 18);
  assert.equal(pageCount(0), 1);
  assert.equal(pageCount(37), 3);
  assert.deepEqual(archiveRoute("2", 37), { kind: "page", page: 2 });
  assert.deepEqual(archiveRoute("3", 37), { kind: "page", page: 3 });
  assert.deepEqual(archiveRoute("4", 37), { kind: "redirect", location: "/archive/" }, "past the end (the legacy site had 28 pages)");
  assert.deepEqual(archiveRoute("28", 12), { kind: "redirect", location: "/archive/" });
  assert.deepEqual(archiveRoute("1", 37), { kind: "redirect", location: "/archive/" }, "page 1 lives at /archive/");
  for (const bad of ["0", "-1", "abc", "02", "1.5", undefined]) assert.deepEqual(archiveRoute(bad, 37), { kind: "not_found" });
  assert.equal(archivePath(1), "/archive/");
  assert.equal(archivePath(3), "/archive/3/");
});

test("paginate slices by page", () => {
  const rows = Array.from({ length: 20 }, (_, i) => i);
  assert.deepEqual(paginate(rows, 2), { items: [18, 19], page: 2, pages: 2 });
});

test("labels and indexable filter", () => {
  assert.equal(contentLabel({ content_type: "news_brief", slug: "news/abc" }), "브리프");
  assert.equal(contentLabel({ content_type: "insight_essay", slug: "column/x-2026-10-01" }), "The Current");
  assert.equal(contentLabel({ content_type: "legacy_analysis", slug: "news/eia-x" }), "분석");
  assert.deepEqual(indexableRows([{ noindex: false }, { noindex: true }]), [{ noindex: false }]);
});
