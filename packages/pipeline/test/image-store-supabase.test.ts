import { test } from "node:test";
import assert from "node:assert/strict";
import { silentLogger } from "@cc/shared";
import type { StageContext } from "@cc/shared";
import { IMAGE_STORE_STATIC, IMAGE_STORE_UPLOAD_FAILED, createSupabaseImageStore, hashedImageKey } from "../src/adapters/index.ts";
import type { SupabaseStorageLike } from "../src/adapters/index.ts";

const ctx = { logger: silentLogger() } as unknown as StageContext;
const BYTES = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
const SLUG = "column/europe-s-ai-dividend-2026-11-18";

function fakeStorage(options: { bucketExists?: boolean; createError?: string; uploadError?: string } = {}) {
  const calls = { getBucket: 0, createBucket: [] as { id: string; public: boolean }[], uploads: [] as { bucket: string; path: string; contentType: string; upsert: boolean; cacheControl: string; size: number }[] };
  let exists = options.bucketExists ?? false;
  const storage: SupabaseStorageLike = {
    async getBucket(_id) {
      calls.getBucket += 1;
      return exists ? { data: {}, error: null } : { data: null, error: { message: "Bucket not found" } };
    },
    async createBucket(id, opts) {
      calls.createBucket.push({ id, public: opts.public });
      if (options.createError) return { data: null, error: { message: options.createError } };
      exists = true;
      return { data: {}, error: null };
    },
    from(bucket) {
      return {
        async upload(path, body, opts) {
          calls.uploads.push({ bucket, path, contentType: opts.contentType, upsert: opts.upsert, cacheControl: opts.cacheControl, size: body.size });
          return options.uploadError ? { data: null, error: { message: options.uploadError } } : { data: { path }, error: null };
        },
      };
    },
  };
  return { storage, calls };
}

test("supabase image store: creates the public bucket once, uploads under a content-hashed key, returns the site path", async () => {
  const { storage, calls } = fakeStorage();
  const store = createSupabaseImageStore({ storage, bucket: "article-images", publicPath: "/media" });
  const key = hashedImageKey({ slug: SLUG, variant: "hero", mime: "image/webp", bytes: BYTES });
  assert.match(key, /^column\/europe-s-ai-dividend-2026-11-18\/hero-[0-9a-f]{10}\.webp$/);
  const stored = await store.put({ bytes: BYTES, mime: "image/webp", slug: SLUG, variant: "hero" }, ctx);
  assert.equal(stored.path, `/media/${key}`);
  assert.equal(stored.bytes, BYTES.byteLength);
  await store.put({ bytes: new Uint8Array([9, 9]), mime: "image/png", slug: SLUG, variant: "hero" }, ctx);
  assert.equal(calls.getBucket, 1, "the bucket is checked once per run");
  assert.deepEqual(calls.createBucket, [{ id: "article-images", public: true }]);
  assert.deepEqual(calls.uploads[0], { bucket: "article-images", path: key, contentType: "image/webp", upsert: true, cacheControl: "31536000", size: BYTES.byteLength });
  assert.notEqual(calls.uploads[1]?.path, key, "different bytes, different key");
});

test("supabase image store: placeholder SVGs stay static, an existing bucket is reused, failures carry a code", async () => {
  const { storage, calls } = fakeStorage({ bucketExists: true });
  const store = createSupabaseImageStore({ storage, bucket: "article-images", publicPath: "/media" });
  await assert.rejects(() => store.put({ bytes: BYTES, mime: "image/svg+xml", slug: SLUG, variant: "hero" }, ctx), new RegExp(`^Error: ${IMAGE_STORE_STATIC}`));
  assert.equal(calls.getBucket, 0, "an SVG never touches storage");
  await store.put({ bytes: BYTES, mime: "image/webp", slug: SLUG, variant: "hero" }, ctx);
  assert.equal(calls.createBucket.length, 0);

  const failing = fakeStorage({ uploadError: "Payload too large" });
  await assert.rejects(() => createSupabaseImageStore({ storage: failing.storage, bucket: "article-images", publicPath: "/media" }).put({ bytes: BYTES, mime: "image/webp", slug: SLUG, variant: "hero" }, ctx), new RegExp(`^Error: ${IMAGE_STORE_UPLOAD_FAILED}: Payload too large`));

  const raced = fakeStorage({ createError: "The resource already exists" });
  await createSupabaseImageStore({ storage: raced.storage, bucket: "article-images", publicPath: "/media" }).put({ bytes: BYTES, mime: "image/webp", slug: SLUG, variant: "hero" }, ctx);
  assert.equal(raced.calls.uploads.length, 1, "a bucket created concurrently is fine");

  const denied = fakeStorage({ createError: "permission denied" });
  const deniedStore = createSupabaseImageStore({ storage: denied.storage, bucket: "article-images", publicPath: "/media" });
  await assert.rejects(() => deniedStore.put({ bytes: BYTES, mime: "image/webp", slug: SLUG, variant: "hero" }, ctx), new RegExp(`^Error: ${IMAGE_STORE_UPLOAD_FAILED}: bucket article-images could not be created`));
  await assert.rejects(() => deniedStore.put({ bytes: BYTES, mime: "image/webp", slug: SLUG, variant: "hero" }, ctx), /could not be created/);
  assert.equal(denied.calls.getBucket, 2, "a failed bucket check is retried by the next image");
});
