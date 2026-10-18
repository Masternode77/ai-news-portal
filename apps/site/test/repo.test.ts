import { test } from "node:test";
import assert from "node:assert/strict";

// A misconfigured supabase source (no credentials) must answer 503 without caching, not a cached empty 200 or 404.
process.env["SITE_DATA_SOURCE"] = "supabase";
delete process.env["SUPABASE_URL"];
delete process.env["SUPABASE_ANON_KEY"];

test("pages get an uncached 503 when the configured data source is unavailable", async () => {
  const { getPublication, listPublications, siteRepo } = await import("../src/lib/repo.ts");
  assert.equal(siteRepo().source, "supabase");
  const list = await listPublications(10);
  assert.ok(list instanceof Response);
  assert.equal(list.status, 503);
  assert.equal(list.headers.get("cache-control"), "no-store");
  assert.equal(list.headers.get("retry-after"), "60");
  const one = await getPublication("news/x");
  assert.ok(one instanceof Response);
  assert.equal(one.status, 503);
  const health = await siteRepo().health();
  assert.equal(health.ok, false);
  assert.equal(health.source, "supabase");
});
