import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { PublicationRow } from "@cc/shared";
import { legacyUuid, mapLegacyCollections, mapLegacyColumn, mapLegacyNews } from "../src/lib/legacy-json.ts";
import { createLegacyJsonRepo, createPublicationsRepo, createSupabaseRepo, resolveDataSource } from "../src/lib/publications.ts";
import type { SiteSupabaseLike, SiteSupabaseQuery } from "../src/lib/publications.ts";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");

const validRow = {
  id: "7d7f0d6e-3e7e-4a39-9a2e-1b2c3d4e5f60",
  draft_id: null,
  slug: "news/0123456789abcdef",
  content_type: "news_brief",
  title: "발행된 브리프",
  body: { summary_ko: "요약" },
  image: null,
  sources: [],
  published_at: "2026-10-18T00:00:00+00:00",
  updated_at: "2026-10-18T00:00:00+00:00",
  publisher: "pipeline",
  status: "published",
  legacy_id: null,
  noindex: false,
  tags: ["power"],
  category: null,
  region: null,
};

function fakeSupabase(rows: unknown[], error: { message: string } | null = null): { client: SiteSupabaseLike; calls: string[] } {
  const calls: string[] = [];
  const query = (): SiteSupabaseQuery => {
    const q: SiteSupabaseQuery = {
      eq: (column, value) => {
        calls.push(`eq:${column}=${String(value)}`);
        return q;
      },
      order: (column, options) => {
        calls.push(`order:${column}:${options.ascending ? "asc" : "desc"}`);
        return q;
      },
      limit: (count) => {
        calls.push(`limit:${count}`);
        return q;
      },
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error }),
      then: (onfulfilled) => Promise.resolve({ data: error ? null : rows, error }).then(onfulfilled),
    };
    return q;
  };
  return { client: { from: (table) => ({ select: (columns) => (calls.push(`select:${table}:${columns.split(",").length} cols`), query()) }) }, calls };
}

test("resolveDataSource defaults to legacy_json and rejects unknown values", () => {
  assert.equal(resolveDataSource({}), "legacy_json");
  assert.equal(resolveDataSource({ SITE_DATA_SOURCE: "empty" }), "empty");
  assert.throws(() => resolveDataSource({ SITE_DATA_SOURCE: "sqlite" }), /SITE_DATA_SOURCE/);
});

test("empty source serves nothing and reports healthy", async () => {
  const repo = createPublicationsRepo({ SITE_DATA_SOURCE: "empty" });
  assert.deepEqual(await repo.list(), []);
  assert.equal(await repo.get("news/x"), null);
  assert.deepEqual(await repo.health(), { ok: true, source: "empty", publishedCount: 0 });
});

test("supabase source without credentials degrades to empty with a detail message", async () => {
  const repo = createPublicationsRepo({ SITE_DATA_SOURCE: "supabase" });
  assert.equal(repo.source, "empty");
  assert.match((await repo.health()).detail ?? "", /SUPABASE_URL/);
});

test("supabase repo reads published rows only, drops invalid rows and never throws", async () => {
  const { client, calls } = fakeSupabase([validRow, { id: "broken" }]);
  const repo = createSupabaseRepo(client);
  const rows = await repo.list({ limit: 10 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.slug, "news/0123456789abcdef");
  assert.ok(calls.includes("eq:status=published"));
  assert.ok(calls.includes("order:published_at:desc"));
  assert.ok(calls.includes("limit:10"));
  assert.ok(calls[0]?.startsWith("select:publications:"));
  assert.equal((await repo.get("news/0123456789abcdef"))?.title, "발행된 브리프");
  const health = await repo.health();
  assert.equal(health.ok, true);
  assert.match(health.detail ?? "", /1 row\(s\) failed/);

  const failing = createSupabaseRepo(fakeSupabase([], { message: "connection refused" }).client);
  assert.deepEqual(await failing.list(), []);
  assert.equal(await failing.get("news/x"), null);
  assert.equal((await failing.health()).ok, false);

  const throwing = createSupabaseRepo({
    from: () => {
      throw new Error("boom");
    },
  });
  assert.deepEqual(await throwing.list(), []);
});

test("legacyUuid is deterministic and RFC 4122 shaped", () => {
  const a = legacyUuid("news:eia-data-center-load-timing");
  assert.equal(a, legacyUuid("news:eia-data-center-load-timing"));
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(a, legacyUuid("column:x"));
});

test("legacy mappers keep reader pages only and produce valid PublicationRow values", () => {
  const news = {
    id: "eia-x",
    title: "Data-center load",
    publishedAt: "2026-10-01T00:00:00.000Z",
    articlePagePublished: true,
    archiveOnly: false,
    public_status: "published",
    deck: "Deck",
    articleText: "Para one.\n\nPara two.",
    sourceUrl: "https://www.eia.gov/todayinenergy/detail.php?id=1",
    source: "EIA",
    tags: ["power", 1],
    heroImage: "/generated/articles/x/hero.webp",
    imageAlt: "alt",
    primary_category: "Power",
  };
  const mapped = mapLegacyNews(news);
  assert.ok(mapped);
  assert.equal(mapped.slug, "news/eia-x");
  assert.equal(mapped.content_type, "legacy_analysis");
  assert.deepEqual(mapped.tags, ["power"]);
  assert.equal(mapped.sources[0]?.name, "EIA");
  assert.equal(mapped.image?.path, "/generated/articles/x/hero.webp");
  assert.equal(PublicationRow.safeParse(mapped).success, true);

  const column = {
    id: "col_1",
    slug: "my-column-2026-10-04",
    title: "My column",
    publishedAt: "2026-10-04T00:00:00.000Z",
    articlePagePublished: true,
    public_status: "published",
    sources: [{ name: "Epoch AI", url: "https://epoch.ai/x", publishedAt: "2026-10-03T00:00:00.000Z" }, { name: "bad", url: "not a url" }],
  };
  const mappedColumn = mapLegacyColumn(column);
  assert.ok(mappedColumn);
  assert.equal(mappedColumn.slug, "column/my-column-2026-10-04");
  assert.equal(mappedColumn.content_type, "insight_essay");
  assert.equal(mappedColumn.sources.length, 1);

  const result = mapLegacyCollections(
    [news, { ...news, id: "archived", archiveOnly: true }, { ...news, id: "quarantined", public_status: "quarantined" }],
    [column, { ...column, id: "col_2", slug: "q", public_status: "quarantined" }, { ...column, id: "col_3", slug: "", title: "" }],
  );
  assert.deepEqual(
    result.rows.map((r) => r.slug),
    ["column/my-column-2026-10-04", "news/eia-x"],
  );
  assert.equal(result.skipped, 1, "a reader-page record that cannot be mapped is counted, not silently dropped");
});

test("legacy_json repo maps the committed reader pages from the real src/data files", async () => {
  const repo = createLegacyJsonRepo(resolve(REPO_ROOT, "src/data"));
  const rows = await repo.list({ limit: 500 });
  const news = rows.filter((r) => r.slug.startsWith("news/"));
  const columns = rows.filter((r) => r.slug.startsWith("column/"));
  assert.ok(news.length >= 1, "at least one legacy news reader page maps");
  assert.ok(columns.length >= 1, "at least one legacy column maps");
  assert.ok(rows.every((r) => PublicationRow.safeParse(r).success));
  assert.ok(rows.every((r) => r.publisher === "legacy" && r.legacy_id));
  const first = rows[0]!;
  assert.deepEqual(await repo.get(first.slug), first);
  const health = await repo.health();
  assert.equal(health.ok, true);
  assert.equal(health.publishedCount, rows.length);
});

test("legacy_json repo with a missing directory serves empty and reports it", async () => {
  const repo = createLegacyJsonRepo(resolve(REPO_ROOT, "does-not-exist"));
  assert.deepEqual(await repo.list(), []);
  assert.equal(await repo.get("news/x"), null);
  const health = await repo.health();
  assert.equal(health.ok, false);
  assert.match(health.detail ?? "", /legacy data unavailable/);
});

test("createPublicationsRepo wires legacy_json to the repo root by default", async () => {
  const repo = createPublicationsRepo({ SITE_DATA_SOURCE: "legacy_json" }, { repoRoot: REPO_ROOT });
  assert.equal(repo.source, "legacy_json");
  assert.ok((await repo.list()).length >= 1);
});
