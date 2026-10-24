/**
 * Fixture image adapter (Phase 3f): `fixtures/images/<slug>.json` is either a
 * recorded reply `{ mime, base64, model?, cost_usd? }` or a scripted failure
 * `{ fail: "<reason>" }`; a missing file is also a failure, so the fixture
 * doubles as the "every provider fails" simulation the chain tests need.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { ImageAdapter, ImageMime, ImageRequest, ImageResult, StageContext } from "@cc/shared";
import { ImageError } from "./errors.ts";

export const FixtureImageRecord = z.union([
  z.strictObject({ fail: z.string().min(1) }),
  z.strictObject({
    mime: z.enum(["image/svg+xml", "image/png", "image/jpeg", "image/webp"]),
    base64: z.string().min(1),
    model: z.string().min(1).optional(),
    cost_usd: z.number().nonnegative().default(0),
  }),
]);
export type FixtureImageRecord = z.infer<typeof FixtureImageRecord>;

export function fixtureImagePath(fixturesDir: string, slug: string): string {
  return join(fixturesDir, "images", `${slug.replace(/[^A-Za-z0-9._-]+/g, "_")}.json`);
}

export function createFixtureImageAdapter(options: { fixturesDir: string }): ImageAdapter {
  return {
    provider: "fixture",
    async generate(request: ImageRequest, ctx: StageContext): Promise<ImageResult> {
      const path = fixtureImagePath(options.fixturesDir, request.slug);
      let raw: string;
      try {
        raw = await readFile(path, "utf8");
      } catch (error) {
        throw new ImageError("FIXTURE_MISSING", `${path} (${error instanceof Error ? error.message : String(error)})`);
      }
      const record = FixtureImageRecord.parse(JSON.parse(raw));
      if ("fail" in record) throw new ImageError("FIXTURE_FAILURE", record.fail);
      const bytes = Buffer.from(record.base64, "base64");
      const stored = await ctx.adapters.imageStore.put({ bytes, mime: record.mime as ImageMime, slug: request.slug, variant: "hero" }, ctx);
      ctx.budget.record(record.cost_usd);
      return {
        path: stored.path,
        alt: request.alt,
        provenance: { provider: "fixture", model: record.model ?? "recorded", prompt: request.prompt, generatedAt: ctx.now.toISOString() },
        placeholder: false,
        costUsd: record.cost_usd,
      };
    },
  };
}
