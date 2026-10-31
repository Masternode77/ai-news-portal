import { test } from "node:test";
import assert from "node:assert/strict";
import { createRedirectLoader, createRedirectLookup, parseRedirectRows, pathVariants, redirectResponse } from "../src/lib/redirects.ts";
import type { RedirectRule } from "../src/lib/redirects.ts";
import type { SiteSupabaseLike, SiteSupabaseQuery, SiteSupabaseResponse } from "../src/lib/publications.ts";

const RULES: RedirectRule[] = [
  { from_path: "/author/rowan-hale", to_path: "/author/josh-inn/", status: 301 },
  { from_path: "/hubs/texas/", to_path: "/region/us/", status: 301 },
  { from_path: "/data/ercot.csv", to_path: "/", status: 410 },
];

test("path variants cover the trailing slash both ways", () => {
  assert.deepEqual(pathVariants("/hubs/texas"), ["/hubs/texas", "/hubs/texas/"]);
  assert.deepEqual(pathVariants("/hubs/texas/"), ["/hubs/texas/", "/hubs/texas"]);
  assert.deepEqual(pathVariants("/"), ["/"]);
});

test("lookup matches either spelling, caches for the TTL, and keeps the last good set when a reload fails", async () => {
  let now = 0;
  let calls = 0;
  let fail = false;
  const errors: unknown[] = [];
  const lookup = createRedirectLookup(
    async () => {
      calls += 1;
      if (fail) throw new Error("db down");
      return RULES;
    },
    { ttlMs: 1000, now: () => now, onError: (e) => errors.push(e) },
  );
  assert.equal((await lookup.lookup("/author/rowan-hale/"))?.to_path, "/author/josh-inn/");
  assert.equal((await lookup.lookup("/hubs/texas"))?.to_path, "/region/us/");
  assert.equal(await lookup.lookup("/nope/"), null);
  assert.equal(calls, 1, "cached inside the TTL");
  now = 2000;
  fail = true;
  assert.equal((await lookup.lookup("/data/ercot.csv"))?.status, 410, "stale rules still answer");
  assert.equal(errors.length, 1);
  const cold = createRedirectLookup(async () => Promise.reject(new Error("down")));
  assert.equal(await cold.lookup("/author/rowan-hale"), null, "no rules at all: the 404 stands");
});

test("responses: 301 carries Location, 410 does not", async () => {
  const moved = redirectResponse(RULES[0]!);
  assert.equal(moved.status, 301);
  assert.equal(moved.headers.get("location"), "/author/josh-inn/");
  const gone = redirectResponse(RULES[2]!);
  assert.equal(gone.status, 410);
  assert.equal(gone.headers.get("location"), null);
  assert.equal(await gone.text(), "Gone");
});

test("parseRedirectRows drops rows that fail the schema", () => {
  assert.equal(parseRedirectRows([...RULES, { from_path: "nope", to_path: "/", status: 301 }, { from_path: "/x", to_path: "/", status: 302 }]).length, 3);
});

function fakeClient(response: SiteSupabaseResponse): { client: SiteSupabaseLike; tables: string[] } {
  const tables: string[] = [];
  const query = {
    then: <T,>(onfulfilled: (value: SiteSupabaseResponse) => T) => Promise.resolve(onfulfilled(response)),
  } as unknown as SiteSupabaseQuery;
  return {
    tables,
    client: {
      from: (table: string) => {
        tables.push(table);
        return { select: () => query };
      },
    },
  };
}

test("the loader follows the data source: redirects table for supabase, the YAML file otherwise", async () => {
  const { client, tables } = fakeClient({ data: RULES, error: null });
  const fromDb = createRedirectLoader({ SITE_DATA_SOURCE: "supabase", SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon" }, { supabaseFactory: () => client });
  assert.deepEqual(await fromDb!(), RULES);
  assert.deepEqual(tables, ["redirects"]);
  const broken = createRedirectLoader({ SITE_DATA_SOURCE: "supabase", SUPABASE_URL: "u", SUPABASE_ANON_KEY: "k" }, { supabaseFactory: () => fakeClient({ data: null, error: { message: "permission denied" } }).client });
  await assert.rejects(broken!(), /redirects unavailable: permission denied/);
  assert.equal(createRedirectLoader({ SITE_DATA_SOURCE: "supabase" }, { supabaseFactory: () => client }), null, "no credentials, no loader");
  const paths: string[] = [];
  const fromFile = createRedirectLoader({ SITE_DATA_SOURCE: "legacy_json" }, { repoRoot: "/repo", loadFile: async (p) => (paths.push(p), RULES) });
  assert.equal((await fromFile!()).length, 3);
  assert.deepEqual(paths, ["/repo/config/redirects.yaml"]);
  assert.equal(createRedirectLoader({ SITE_DATA_SOURCE: "bogus" }, {}), null);
});
