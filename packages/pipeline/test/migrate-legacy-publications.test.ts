import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { PublicationRow } from "@cc/shared";
import { loadAndPlan, parseCsv, parsePreserveList, planLegacyMigration, slugFromPreservedUrl } from "../tools/migrate-legacy-publications.ts";
import { REPO_ROOT } from "./helpers.ts";

test("preserve-list CSV: quoted cells with commas survive, slugs derive from the URL path", () => {
  const rows = parseCsv('url,type,record_id,label\n/news/a/,news_page,a,"measured(x, y)"\n/column/b-2026-10-04/,column_page,col_b,plain\n');
  assert.deepEqual(rows[1], ["/news/a/", "news_page", "a", "measured(x, y)"]);
  const list = parsePreserveList('url,type,source_file,record_id,indexable,label\n/news/a/,news_page,f,a,index,"q, r"\n');
  assert.deepEqual(list, [{ url: "/news/a/", type: "news_page", record_id: "a", indexable: "index" }]);
  assert.equal(slugFromPreservedUrl("/news/eia-texas-large-loads/"), "news/eia-texas-large-loads");
  assert.equal(slugFromPreservedUrl("/column/x-2026-10-04"), "column/x-2026-10-04");
  assert.equal(slugFromPreservedUrl("/author/josh-inn/"), null);
});

test("plan: a public record is ready, a quarantined one is not_public with its status, an unknown id is missing, quarantined CSV rows are the expected 404s", () => {
  const news = [
    { id: "n1", title: "Public news", publishedAt: "2026-08-12T02:00:00Z", articlePagePublished: true, public_status: "published", archiveOnly: false, expertLensFull: { finalArticleBody: "Body text." }, sourceUrl: "https://eia.gov/x", source: "EIA" },
    { id: "n2", title: "Quarantined", publishedAt: "2026-08-12T02:00:00Z", articlePagePublished: false, public_status: "quarantined" },
  ];
  const columns = [{ id: "c1", slug: "c-one-2026-10-04", title: "Column", publishedAt: "2026-10-04T00:00:00Z", articlePagePublished: true, public_status: "published", expertLensFull: { finalArticleBody: "Column body." }, sources: [] }];
  const preserve = parsePreserveList(["url,type,source_file,record_id,indexable,label", "/news/n1/,news_page,f,n1,index,x", "/news/n2/,news_page,f,n2,index,x", "/news/n3/,news_page,f,n3,index,x", "/column/c-one-2026-10-04/,column_page,f,c1,index,x", "/column/q-2026-08-20/,column_page_quarantined,f,cq,404,x", "/author/rowan-hale,redirect,vercel.json,/author/josh-inn/,n/a,x"].join("\n"));
  const plan = planLegacyMigration({ news, columns, preserve });
  assert.deepEqual(plan.entries.map((e) => [e.slug, e.status, e.public_status]), [["news/n1", "ready", null], ["news/n2", "not_public", "quarantined"], ["news/n3", "missing", null], ["column/c-one-2026-10-04", "ready", null]]);
  assert.deepEqual(plan.counts, { news_public: 1, column_public: 1, skipped: 0, without_body: 0, preserved: 4, ready: 2, not_public: 1, missing: 1, expected_404: 1, legacy_image_paths: 0 });
  assert.equal(plan.rows.length, 2);
});

test("dry-run over the committed legacy JSON and the real preserve list: every preserved URL is accounted for, the 5 EIA news pages are ready, every ready row is a valid publications row", async () => {
  const plan = await loadAndPlan({ news: resolve(REPO_ROOT, "src/data/latest-news.json"), columns: resolve(REPO_ROOT, "src/data/authored-columns.json"), preserve: resolve(REPO_ROOT, "docs/diagnosis/05-preserve-list.csv") });
  assert.equal(plan.counts.preserved, 25, "5 news + 20 columns in the preserve list");
  assert.equal(plan.counts.expected_404, 2);
  assert.equal(plan.counts.missing, 0, JSON.stringify(plan.entries.filter((e) => e.status === "missing")));
  assert.equal(plan.counts.ready + plan.counts.not_public, 25);
  assert.equal(plan.entries.filter((e) => e.type === "news_page" && e.status === "ready").length, 5, "the 5 EIA long-form pages");
  assert.ok(plan.counts.column_public >= 1);
  assert.equal(plan.counts.ready, plan.counts.news_public + plan.entries.filter((e) => e.type === "column_page" && e.status === "ready").length);
  for (const row of plan.rows) assert.equal(PublicationRow.safeParse(row).success, true, row.slug);
  for (const entry of plan.entries.filter((e) => e.status === "not_public")) assert.ok(entry.public_status, `${entry.slug} should report the legacy public_status`);
  assert.ok(plan.counts.legacy_image_paths >= 5, "legacy hero images live under /generated/** (404 on the new site until M5 asset migration)");
});
