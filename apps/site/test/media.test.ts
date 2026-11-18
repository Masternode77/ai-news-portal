import { test } from "node:test";
import assert from "node:assert/strict";
import { MEDIA_CACHE_CONTROL, mediaUpstream } from "../src/lib/media.ts";

const ENV = { SITE_DATA_SOURCE: "supabase", SUPABASE_URL: "https://project.example.co" };
const KEY = "column/europe-s-ai-dividend-2026-11-18/hero-0123456789.webp";

test("mediaUpstream: an image key of the store's shape maps to the bucket's public object", () => {
  assert.deepEqual(mediaUpstream(KEY, ENV), { url: `https://project.example.co/storage/v1/object/public/article-images/${KEY}`, contentType: "image/webp" });
  assert.equal(mediaUpstream("a/b.PNG".toLowerCase(), ENV)?.contentType, "image/png");
  assert.equal(mediaUpstream(KEY, { ...ENV, MEDIA_BUCKET: "other-bucket" })?.url.includes("/public/other-bucket/"), true);
  assert.equal(mediaUpstream(KEY, { ...ENV, MEDIA_BUCKET: "Bad/Bucket" })?.url.includes("/public/article-images/"), true, "an invalid bucket name falls back to the default");
  assert.equal(MEDIA_CACHE_CONTROL, "public, max-age=31536000, immutable");
});

test("mediaUpstream refuses traversal, odd keys, non-image files and a site that does not read Supabase", () => {
  for (const key of [undefined, "", "../secret.webp", "a/../b.webp", "/abs.webp", "a//b.webp", ".hidden.webp", "a/b.svg", "a/b.html", "a/b", "a b.webp", "a/b.webp?x=1", `${"a/".repeat(9)}b.webp`]) {
    assert.equal(mediaUpstream(key, ENV), null, String(key));
  }
  assert.equal(mediaUpstream(KEY, { SITE_DATA_SOURCE: "legacy_json", SUPABASE_URL: ENV.SUPABASE_URL }), null);
  assert.equal(mediaUpstream(KEY, { SITE_DATA_SOURCE: "supabase" }), null);
  assert.equal(mediaUpstream(KEY, { SITE_DATA_SOURCE: "supabase", SUPABASE_URL: "http://insecure.example.co" }), null);
  assert.equal(mediaUpstream(KEY, { SITE_DATA_SOURCE: "supabase", SUPABASE_URL: "not a url" }), null);
});
