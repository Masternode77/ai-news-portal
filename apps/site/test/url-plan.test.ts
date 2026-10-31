import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadRedirectsConfig } from "@cc/shared";
import { expectedFor, locationPath, matches } from "../src/lib/url-plan.ts";
import { legacyPublishedSlugs, markdownReport, parsePreserveList, verify } from "../tools/verify-urls.ts";

const ROOT = resolve(import.meta.dirname, "../../..");

async function plan() {
  const urls = parsePreserveList(await readFile(resolve(ROOT, "docs/diagnosis/05-preserve-list.csv"), "utf8"));
  const redirects = await loadRedirectsConfig(resolve(ROOT, "config/redirects.yaml"));
  const publishedSlugs = await legacyPublishedSlugs(resolve(ROOT, "src/data"));
  return { urls, ctx: { redirects, publishedSlugs } };
}

test("R8 route coverage: every preserved URL ends in 200, 301 or 410, except the two columns quarantined before the list was taken (ADR-005)", async () => {
  const { urls, ctx } = await plan();
  assert.equal(urls.length, 136);
  assert.equal(ctx.publishedSlugs.size, 12, "the 12 public legacy pages the M5 migration publishes");
  const outcomes = urls.map((u) => ({ ...u, expected: expectedFor(u.url, ctx) }));
  const notFound = outcomes.filter((o) => o.expected.status === 404);
  assert.deepEqual(notFound.map((o) => o.type), ["column_page_quarantined", "column_page_quarantined"]);
  const tally: Record<string, number> = {};
  for (const o of outcomes) tally[String(o.expected.status)] = (tally[String(o.expected.status)] ?? 0) + 1;
  // 200: 12 content + 32 taxonomy + 11 static/listing + author + 5 feeds; 200|301: the 28 legacy archive pages (/archive/2/…/29/),
  // which redirect to /archive/ once past the rebuilt archive's end; 301: 5 legacy rules + 24 route-plan rows; 410: 13 columns + 3 CSV.
  assert.deepEqual(tally, { "200": 61, "200|301": 28, "301": 29, "410": 16, "404": 2 });
});

test("specific expectations", async () => {
  const { ctx } = await plan();
  assert.deepEqual(expectedFor("/author/rowan-hale", ctx), { status: 301, location: "/author/josh-inn/" });
  assert.deepEqual(expectedFor("/archive/1/", ctx), { status: 301, location: "/archive/" });
  assert.deepEqual(expectedFor("/archive/9/", ctx), { status: "200|301", location: "/archive/" });
  assert.deepEqual(expectedFor("/data/ercot.csv", ctx), { status: 410 });
  assert.deepEqual(expectedFor("/news/eia-texas-large-loads/", ctx), { status: 200 });
  assert.deepEqual(expectedFor("/news/eia-texas-large-loads/", { ...ctx, publishedSlugs: new Set() }).status, 404, "an empty target has no content pages");
  assert.deepEqual(expectedFor("/company/unknown/", ctx).status, 404);
  assert.equal(locationPath("https://www.computecurrent.com/about/", "https://x.test"), "/about/");
  assert.ok(matches({ status: "200|301", location: "/archive/" }, 301, "/archive/"));
  assert.ok(!matches({ status: 301, location: "/a/" }, 301, "/b/"));
});

test("verify-urls compares a deployment with the plan (fake fetch)", async () => {
  const { ctx } = await plan();
  const fakeFetch = (async (input: URL | RequestInfo) => {
    const path = new URL(String(input)).pathname;
    const e = expectedFor(path, ctx);
    if (e.status === 301 || e.status === "200|301") return new Response(null, { status: 301, headers: { location: `https://site.test${e.location}` } });
    return new Response("", { status: e.status });
  }) as typeof fetch;
  const results = await verify({ base: "https://site.test", content: "legacy", fetchImpl: fakeFetch });
  assert.equal(results.filter((r) => r.ok).length, 136);
  const broken = (async () => new Response("", { status: 404 })) as typeof fetch;
  const bad = await verify({ base: "https://site.test", content: "legacy", fetchImpl: broken });
  assert.equal(bad.filter((r) => r.ok).length, 2, "only the two expected 404s match an all-404 site");
  assert.match(markdownReport("https://site.test", bad), /\*\*2\/136 match\*\*/);
});
