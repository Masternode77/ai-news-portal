import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryDb } from "../src/db/memory.ts";
import { applyImage, buildImage, planImage } from "../tools/set-publication-image.ts";

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
