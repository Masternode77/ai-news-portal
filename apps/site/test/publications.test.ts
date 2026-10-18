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
  const query = (head: boolean): SiteSupabaseQuery => {
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
      then: (onfulfilled) => Promise.resolve(head ? { data: null, error, count: error ? null : rows.length } : { data: error ? null : rows, error }).then(onfulfilled),
    };
    return q;
  };
  return {
    client: {
      from: (table) => ({
        select: (columns, options) => {
          calls.push(`select:${table}:${options?.head ? "count" : `${columns.split(",").length} cols`}`);
          return query(options?.head === true);
        },
      }),
    },
    calls,
  };
}

test("resolveDataSource defaults to empty and rejects unknown values", () => {
  assert.equal(resolveDataSource({}), "empty");
  assert.equal(resolveDataSource({ SITE_DATA_SOURCE: "legacy_json" }), "legacy_json");
  assert.throws(() => resolveDataSource({ SITE_DATA_SOURCE: "sqlite" }), /SITE_DATA_SOURCE/);
});

test("empty source serves nothing and reports healthy; an unset source says so", async () => {
  const repo = createPublicationsRepo({ SITE_DATA_SOURCE: "empty" });
  assert.deepEqual(await repo.list(), []);
  assert.equal(await repo.get("news/x"), null);
  assert.deepEqual(await repo.health(), { ok: true, source: "empty", publishedCount: 0 });
  assert.match((await createPublicationsRepo({}).health()).detail ?? "", /SITE_DATA_SOURCE unset/);
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
  assert.equal(health.publishedCount, 2, "count comes from the head-only query");
  assert.match(health.detail ?? "", /1 of the latest rows failed/);
  assert.ok(calls.includes("select:publications:count"));

  const failing = createSupabaseRepo(fakeSupabase([], { message: "connection refused" }).client);
  assert.deepEqual(await failing.list(), []);
  assert.equal(await failing.get("news/x"), null);
  const failingHealth = await failing.health();
  assert.equal(failingHealth.ok, false);
  assert.match(failingHealth.detail ?? "", /connection refused/);

  const throwing = createSupabaseRepo({
    from: () => {
      throw new Error("boom");
    },
  });
  assert.deepEqual(await throwing.list(), []);
  assert.equal((await throwing.health()).ok, false);
});

test("legacyUuid is deterministic and RFC 4122 shaped", () => {
  const a = legacyUuid("news:eia-data-center-load-timing");
  assert.equal(a, legacyUuid("news:eia-data-center-load-timing"));
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(a, legacyUuid("column:x"));
});

test("legacy news mapper uses the editorial body and never copies the source extraction", () => {
  const news = {
    id: "eia-x",
    title: "Data-center load",
    publishedAt: "2026-10-01T00:00:00.000Z",
    articlePagePublished: true,
    archiveOnly: false,
    public_status: "published",
    deck: "Deck",
    articleText: "THIRD PARTY SOURCE TEXT",
    cleaned_source_text: "THIRD PARTY SOURCE TEXT",
    expertLensShort: "Deck",
    expertLensFull: { finalHeadline: "Final headline", metaDescription: "Meta", finalArticleBody: "Para one.\n\nPara two." },
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
  assert.equal(mapped.body["article_body"], "Para one.\n\nPara two.");
  assert.equal(mapped.body["meta_description"], "Meta");
  assert.ok(!("article_text" in mapped.body) && !("expert_lens" in mapped.body));
  assert.ok(!JSON.stringify(mapped).includes("THIRD PARTY SOURCE TEXT"));
  assert.deepEqual(mapped.tags, ["power"]);
  assert.equal(mapped.sources[0]?.name, "EIA");
  assert.equal(mapped.image?.path, "/generated/articles/x/hero.webp");
  assert.equal(PublicationRow.safeParse(mapped).success, true);
});

test("legacy column mapper reads the editorial body and the stance thesis", () => {
  const column = {
    id: "col_1",
    slug: "my-column-2026-10-04",
    title: "My column",
    publishedAt: "2026-10-04T00:00:00.000Z",
    articlePagePublished: true,
    public_status: "published",
    draft: false,
    stance: { thesis: "The thesis.", angle: "contrarian" },
    expertLensFull: { finalHeadline: "My column", metaDescription: "Meta", finalArticleBody: "Body para." },
    sources: [{ name: "Epoch AI", url: "https://epoch.ai/x", publishedAt: "2026-10-03T00:00:00.000Z" }, { name: "bad", url: "not a url" }],
  };
  const mapped = mapLegacyColumn(column);
  assert.ok(mapped);
  assert.equal(mapped.slug, "column/my-column-2026-10-04");
  assert.equal(mapped.content_type, "insight_essay");
  assert.equal(mapped.body["article_body"], "Body para.");
  assert.equal(mapped.body["thesis"], "The thesis.");
  assert.equal(mapped.sources.length, 1);

  const result = mapLegacyCollections(
    [{ ...column, id: "n1", archiveOnly: true }, { ...column, id: "quarantined", public_status: "quarantined" }],
    [column, { ...column, id: "col_2", slug: "q", public_status: "quarantined" }, { ...column, id: "col_3", slug: "", title: "" }, { ...column, id: "col_4", slug: "no-body", expertLensFull: null }],
  );
  assert.deepEqual(
    result.rows.map((r) => r.slug),
    ["column/my-column-2026-10-04", "column/no-body"],
  );
  assert.equal(result.skipped, 1, "a reader-page record that cannot be mapped is counted, not silently dropped");
  assert.equal(result.withoutBody, 1);
});

test("legacy_json repo maps the committed reader pages from the real src/data files with editorial bodies", async () => {
  const repo = createLegacyJsonRepo(resolve(REPO_ROOT, "src/data"));
  const rows = await repo.list({ limit: 500 });
  const news = rows.filter((r) => r.slug.startsWith("news/"));
  const columns = rows.filter((r) => r.slug.startsWith("column/"));
  assert.ok(news.length >= 1, "at least one legacy news reader page maps");
  assert.ok(columns.length >= 1, "at least one legacy column maps");
  assert.ok(rows.every((r) => PublicationRow.safeParse(r).success));
  assert.ok(rows.every((r) => r.publisher === "legacy" && r.legacy_id));
  assert.ok(rows.every((r) => typeof r.body["article_body"] === "string" && (r.body["article_body"] as string).length > 500), "every legacy reader page carries its editorial body");
  assert.ok(rows.every((r) => !("article_text" in r.body)));
  const first = rows[0]!;
  assert.deepEqual(await repo.get(first.slug), first);
  const health = await repo.health();
  assert.equal(health.ok, true);
  assert.equal(health.publishedCount, rows.length);
});

test("legacy_json repo with a missing directory serves empty, reports it and retries on the next call", async () => {
  let attempts = 0;
  const repo = createLegacyJsonRepo(resolve(REPO_ROOT, "does-not-exist"), {
    readFile: (async () => {
      attempts += 1;
      throw new Error("ENOENT");
    }) as never,
  });
  assert.deepEqual(await repo.list(), []);
  assert.equal(await repo.get("news/x"), null);
  const health = await repo.health();
  assert.equal(health.ok, false);
  assert.match(health.detail ?? "", /legacy data unavailable/);
  assert.ok(attempts >= 3, "a failed load is not cached");
});

test("createPublicationsRepo wires legacy_json to the repo root when asked", async () => {
  const repo = createPublicationsRepo({ SITE_DATA_SOURCE: "legacy_json" }, { repoRoot: REPO_ROOT });
  assert.equal(repo.source, "legacy_json");
  assert.ok((await repo.list()).length >= 1);
});
