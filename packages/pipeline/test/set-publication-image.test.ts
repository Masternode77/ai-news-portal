import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { silentLogger } from "@cc/shared";
import { MemoryDb } from "../src/db/memory.ts";
import { createSupabaseImageStore } from "../src/adapters/index.ts";
import type { SupabaseStorageLike } from "../src/adapters/index.ts";
import {
  applyImage,
  buildImage,
  checkSourceUrl,
  downloadSourceImage,
  listMissingImages,
  needsImage,
  planImage,
  plannedImportPath,
  sniffImageMime,
  storeSourceImage,
} from "../tools/set-publication-image.ts";

const SLUG = "column/europe-s-ai-dividend-arrives-as-equipment-exports-while-its-own-2026-11-18";
const DIR = "column-europe-s-ai-dividend-arrives-as-equipment-exports-while-its-own-2026-11-18";
const PATH = `/generated/articles/${DIR}/hero.webp`;
const INPUT = { path: PATH, alt: "Crated transformers and cooling units on a port quay", provider: "higgsfield", model: "gpt_image_2_6", prompt: "editorial hero", generatedAt: "2026-11-17T15:40:20.000Z" };

function publicDir(withFile = true): string {
  const dir = mkdtempSync(join(tmpdir(), "cc-public-"));
  if (withFile) {
    mkdirSync(join(dir, "generated", "articles", DIR), { recursive: true });
    writeFileSync(join(dir, "generated", "articles", DIR, "hero.webp"), "webp");
  }
  return dir;
}

test("buildImage: a deployed site-relative file becomes a non-placeholder ImageResult with provenance", () => {
  const image = buildImage(INPUT, publicDir());
  assert.equal(image.path, PATH);
  assert.equal(image.placeholder, false);
  assert.deepEqual(image.provenance, { provider: "higgsfield", model: "gpt_image_2_6", prompt: "editorial hero", generatedAt: "2026-11-17T15:40:20.000Z" });
  assert.equal(image.costUsd, 0);
});

test("buildImage refuses a missing file, a traversal path, a bad path and an empty alt", () => {
  assert.throws(() => buildImage(INPUT, publicDir(false)), /^Error: IMAGE_FILE_MISSING/);
  assert.throws(() => buildImage({ ...INPUT, path: "/generated/../../etc/passwd" }, publicDir()), /IMAGE_PATH_INVALID/);
  assert.throws(() => buildImage({ ...INPUT, path: "generated/x.webp" }, publicDir()), /site-relative path or https URL/);
  assert.throws(() => buildImage({ ...INPUT, alt: "  " }, publicDir()), /^Error: IMAGE_ALT_MISSING/);
  assert.equal(buildImage({ ...INPUT, path: "https://images.example.org/hero.webp" }, publicDir(false)).path, "https://images.example.org/hero.webp", "an https URL is not checked on disk");
});

test("planImage + applyImage: only the matched row's image changes, and the stored path is read back", async () => {
  const db = new MemoryDb();
  const placeholder = { path: "/images/placeholder-brief.svg", alt: "", provenance: { provider: "static", prompt: "", generatedAt: "2026-11-17T15:23:30.663Z" }, placeholder: true, costUsd: 0 };
  await db.upsert("publications", [
    { slug: SLUG, title: "Essay", content_type: "insight_essay", status: "published", image: placeholder },
    { slug: "news/other", title: "Brief", content_type: "news_brief", status: "published", image: placeholder },
  ], ["slug"]);
  const image = buildImage(INPUT, publicDir());
  const plan = await planImage(db, SLUG, image);
  assert.deepEqual(plan.before, placeholder);
  const result = await applyImage(db, plan);
  assert.equal(result.verified, true);
  const rows = await db.select<{ slug: string; image: { path: string; placeholder: boolean } }>("publications", {});
  assert.equal(rows.find((r) => r.slug === SLUG)?.image.path, PATH);
  assert.equal(rows.find((r) => r.slug === "news/other")?.image.placeholder, true, "other rows are untouched");
  await assert.rejects(() => planImage(db, "column/missing", image), /^Error: PUBLICATION_MISSING/);
});

// --- 3e A안 (Josh 2026-11-19): --source-url imports and --list-missing -------------------------------------
const HOST = "d8j0ntlcm91z4.cloudfront.net";
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 8, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

function fakeFetch(respond: () => Response, seen: RequestInit[] = []): typeof globalThis.fetch {
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    seen.push(init ?? {});
    return respond();
  }) as typeof globalThis.fetch;
}

test("checkSourceUrl: only plain https on an allowed host", () => {
  assert.equal(checkSourceUrl(`https://${HOST}/u/hf_1.webp`, [HOST]).hostname, HOST);
  assert.throws(() => checkSourceUrl(`http://${HOST}/a.webp`, [HOST]), /^Error: IMAGE_SOURCE_INVALID: .*https/);
  assert.throws(() => checkSourceUrl("https://evil.example.com/a.webp", [HOST]), /^Error: IMAGE_SOURCE_HOST_NOT_ALLOWED: evil\.example\.com/);
  assert.throws(() => checkSourceUrl(`https://${HOST}.evil.example.com/a.webp`, [HOST]), /IMAGE_SOURCE_HOST_NOT_ALLOWED/, "a suffix is not the host");
  assert.throws(() => checkSourceUrl(`https://user:pw@${HOST}/a.webp`, [HOST]), /IMAGE_SOURCE_INVALID: .*credentials/);
  assert.throws(() => checkSourceUrl(`https://${HOST}:8443/a.webp`, [HOST]), /IMAGE_SOURCE_INVALID: .*port/);
  assert.throws(() => checkSourceUrl("not a url", [HOST]), /IMAGE_SOURCE_INVALID: .*not a URL/);
  assert.throws(() => checkSourceUrl(`https://${HOST}/a.webp`, []), /IMAGE_SOURCE_HOST_NOT_ALLOWED: .*\(none\)/, "an empty allowlist allows nothing");
});

test("sniffImageMime: webp, png and jpeg by magic bytes; anything else is null", () => {
  assert.equal(sniffImageMime(WEBP), "image/webp");
  assert.equal(sniffImageMime(PNG), "image/png");
  assert.equal(sniffImageMime(JPEG), "image/jpeg");
  assert.equal(sniffImageMime(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")), null);
  assert.equal(sniffImageMime(new Uint8Array([0x52, 0x49])), null);
});

test("downloadSourceImage: refuses redirects, caps the size, codes HTTP and non-image failures", async () => {
  const url = new URL(`https://${HOST}/u/hf_1.webp`);
  const seen: RequestInit[] = [];
  const ok = await downloadSourceImage(url, { fetch: fakeFetch(() => new Response(WEBP, { status: 200 }), seen), maxBytes: 1024, timeoutMs: 1000 });
  assert.equal(ok.mime, "image/webp");
  assert.equal(ok.bytes.byteLength, WEBP.byteLength);
  assert.equal(seen[0]?.redirect, "error", "a redirect could leave the allowed host");
  await assert.rejects(downloadSourceImage(url, { fetch: fakeFetch(() => new Response("gone", { status: 404 })), maxBytes: 1024, timeoutMs: 1000 }), /^Error: IMAGE_SOURCE_HTTP_404/);
  await assert.rejects(
    downloadSourceImage(url, { fetch: fakeFetch(() => new Response(WEBP, { status: 200, headers: { "content-length": "999999" } })), maxBytes: 1024, timeoutMs: 1000 }),
    /^Error: IMAGE_SOURCE_TOO_LARGE: 999999/,
  );
  await assert.rejects(downloadSourceImage(url, { fetch: fakeFetch(() => new Response(new Uint8Array(2048).fill(1), { status: 200 })), maxBytes: 1024, timeoutMs: 1000 }), /IMAGE_SOURCE_TOO_LARGE: more than 1024/);
  await assert.rejects(downloadSourceImage(url, { fetch: fakeFetch(() => new Response("<html>login</html>", { status: 200 })), maxBytes: 1024, timeoutMs: 1000 }), /^Error: IMAGE_SOURCE_NOT_IMAGE/);
  await assert.rejects(downloadSourceImage(url, { fetch: fakeFetch(() => new Response(new Uint8Array(0), { status: 200 })), maxBytes: 1024, timeoutMs: 1000 }), /^Error: IMAGE_SOURCE_EMPTY/);
  const throwing = (async () => {
    throw new TypeError("redirect mode is set to error");
  }) as typeof globalThis.fetch;
  await assert.rejects(downloadSourceImage(url, { fetch: throwing, maxBytes: 1024, timeoutMs: 1000 }), /^Error: IMAGE_SOURCE_FETCH_FAILED: redirect mode/);
});

test("a source-url import: the planned /media path is the stored one, and the row points at it without a disk check", async () => {
  const uploads: { bucket: string; path: string; contentType: string }[] = [];
  const storage: SupabaseStorageLike = {
    async getBucket() {
      return { data: {}, error: null };
    },
    async createBucket() {
      return { data: {}, error: null };
    },
    from(bucket) {
      return {
        async upload(path, _body, opts) {
          uploads.push({ bucket, path, contentType: opts.contentType });
          return { data: { path }, error: null };
        },
      };
    },
  };
  const source = { url: `https://${HOST}/u/hf_1.webp`, bytes: WEBP, mime: "image/webp" as const };
  const planned = plannedImportPath(SLUG, source, "/media");
  assert.match(planned, new RegExp(`^/media/${SLUG}/hero-[0-9a-f]{10}\\.webp$`));
  const store = createSupabaseImageStore({ storage, bucket: "article-images", publicPath: "/media" });
  assert.equal(await storeSourceImage(store, SLUG, source, silentLogger()), planned);
  assert.deepEqual(uploads, [{ bucket: "article-images", path: planned.slice("/media/".length), contentType: "image/webp" }]);

  const image = buildImage({ ...INPUT, path: planned }, null);
  assert.equal(image.path, planned, "a hosted path is not looked up in the checkout");
  assert.throws(() => buildImage({ ...INPUT, path: planned }, publicDir(false)), /IMAGE_FILE_MISSING/, "with a public dir the disk check still applies");

  const db = new MemoryDb();
  await db.upsert("publications", [{ slug: SLUG, title: "Essay", content_type: "insight_essay", status: "published", image: null }], ["slug"]);
  const result = await applyImage(db, await planImage(db, SLUG, image));
  assert.equal(result.verified, true);
});

test("needsImage: none, an empty path and the placeholder need one; a real image does not", () => {
  assert.equal(needsImage(null), true);
  assert.equal(needsImage(undefined), true);
  assert.equal(needsImage({ path: "", placeholder: false }), true);
  assert.equal(needsImage({ path: "/images/placeholder-brief.svg", placeholder: true }), true);
  assert.equal(needsImage({ path: PATH, placeholder: false }), false);
});

test("listMissingImages: newest published pipeline essays without a shown image, with deck and thesis, at most limit", async () => {
  const db = new MemoryDb();
  const placeholder = { path: "/images/placeholder-brief.svg", alt: "", provenance: { provider: "static", prompt: "", generatedAt: "2026-11-18T16:45:34.000Z" }, placeholder: true, costUsd: 0 };
  const real = { path: "/media/column/a/hero-0123456789.webp", alt: "a", provenance: { provider: "higgsfield", prompt: "p", generatedAt: "2026-11-18T00:00:00.000Z" }, placeholder: false, costUsd: 0 };
  const essay = (slug: string, publishedAt: string, extra: Record<string, unknown>) => ({
    slug, title: `T ${slug}`, content_type: "insight_essay", status: "published", published_at: publishedAt, legacy_id: null, tags: ["power"],
    body: { deck: `D ${slug}`, thesis: `Th ${slug}`, article_body: "long" }, image: placeholder, ...extra,
  });
  await db.upsert("publications", [
    essay("column/old-placeholder", "2026-11-17T00:00:00.000Z", {}),
    essay("column/new-placeholder", "2026-11-19T00:00:00.000Z", {}),
    essay("column/no-image", "2026-11-18T00:00:00.000Z", { image: null }),
    essay("column/has-image", "2026-11-20T00:00:00.000Z", { image: real }),
    essay("column/legacy", "2026-11-21T00:00:00.000Z", { legacy_id: "legacy-7", image: null }),
    essay("column/unpublished", "2026-11-22T00:00:00.000Z", { status: "unpublished" }),
    { slug: "news/abc", title: "Brief", content_type: "news_brief", status: "published", published_at: "2026-11-23T00:00:00.000Z", legacy_id: null, body: {}, tags: [], image: placeholder },
  ], ["slug"]);
  const all = await listMissingImages(db, 5);
  assert.deepEqual(all.map((row) => row.slug), ["column/new-placeholder", "column/no-image", "column/old-placeholder"]);
  assert.deepEqual(all[0], {
    slug: "column/new-placeholder", url: "/column/new-placeholder/", title: "T column/new-placeholder", deck: "D column/new-placeholder",
    thesis: "Th column/new-placeholder", tags: ["power"], published_at: "2026-11-19T00:00:00.000Z", image: placeholder,
  });
  assert.deepEqual((await listMissingImages(db, 1)).map((row) => row.slug), ["column/new-placeholder"]);
});
