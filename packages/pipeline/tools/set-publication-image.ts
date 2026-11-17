/**
 * set-publication-image — attach a hero image to one published row (3e, Josh 2026-11-17: the first
 * production essay went out with the static placeholder, which the site does not show, and Josh asked for a
 * Higgsfield image on it). The image file is committed under apps/site/public/generated/articles/<dir>/ like
 * the legacy columns' hero images and deployed first; this tool then points `publications.image` at it.
 *
 *   node packages/pipeline/tools/set-publication-image.ts --dry-run|--apply --target staging|production
 *     --slug <slug> --path /generated/articles/<dir>/hero.webp --alt <text>
 *     --provider <name> [--model <id>] [--prompt <text>] [--generated-at <ISO>] [--public-dir apps/site/public]
 *
 * --dry-run validates the image (ImageResult schema; a site-relative path must exist under --public-dir),
 * reads the row and prints the before/after without writing. --apply writes `image` on the row matched by
 * slug and reads it back. Only a row that exists is updated; nothing else on it changes. Writing production
 * is a STOP-THE-LINE approval item: `--target production` with --apply also needs
 * CC_ALLOW_PRODUCTION_PUBLISH=true and uses SUPABASE_PROD_URL / SUPABASE_PROD_SERVICE_ROLE_KEY; staging uses
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (names only; values stay in the environment).
 */
import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { ImageResult } from "@cc/shared";
import type { DbPort, Row } from "@cc/shared";
import { SupabaseDb } from "../src/db/supabase.ts";
import type { SupabaseLike } from "../src/ledger/supabase.ts";
import { PRODUCTION_ALLOW_ENV, productionAllowed, supabaseEnvFor } from "../src/supabase-env.ts";

export interface ImageInput {
  path: string;
  alt: string;
  provider: string;
  model?: string;
  prompt: string;
  generatedAt: string;
}

export interface ImagePlan {
  slug: string;
  before: unknown;
  after: ImageResult;
}

/** The ImageResult to store; throws when the path or fields are invalid or a site-relative file is missing. */
export function buildImage(input: ImageInput, publicDir: string): ImageResult {
  if (input.alt.trim().length === 0) throw new Error("IMAGE_ALT_MISSING: --alt is required (the site renders it as the image's alt text)");
  const image = ImageResult.parse({
    path: input.path,
    alt: input.alt.trim(),
    provenance: { provider: input.provider, ...(input.model ? { model: input.model } : {}), prompt: input.prompt, generatedAt: input.generatedAt },
    placeholder: false,
    costUsd: 0,
  });
  if (image.path.startsWith("/")) {
    if (image.path.includes("..")) throw new Error(`IMAGE_PATH_INVALID: ${image.path}`);
    const file = resolve(publicDir, `.${image.path}`);
    if (!existsSync(file)) throw new Error(`IMAGE_FILE_MISSING: ${image.path} is not under ${publicDir}; commit and deploy the file before pointing a row at it`);
  }
  return image;
}

/** Reads the row by slug; throws when it does not exist. */
export async function planImage(db: DbPort, slug: string, image: ImageResult): Promise<ImagePlan> {
  const rows = await db.select<Row>("publications", { slug }, { columns: ["slug", "image", "status", "content_type"], limit: 1 });
  const row = rows[0];
  if (!row) throw new Error(`PUBLICATION_MISSING: no publications row with slug ${slug}`);
  return { slug, before: row["image"] ?? null, after: image };
}

/** Writes `image` on the row and reads it back; returns whether the stored path matches. */
export async function applyImage(db: DbPort, plan: ImagePlan): Promise<{ verified: boolean; stored: unknown }> {
  await db.update("publications", { slug: plan.slug }, { image: plan.after });
  const rows = await db.select<Row>("publications", { slug: plan.slug }, { columns: ["image"], limit: 1 });
  const stored = rows[0]?.["image"] ?? null;
  const path = stored && typeof stored === "object" ? (stored as { path?: unknown }).path : undefined;
  return { verified: path === plan.after.path, stored };
}

function isMainModule(): boolean {
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1] ?? "")).href;
  } catch {
    return false;
  }
}

function fail(message: string): void {
  process.stderr.write(`set-publication-image: ${message}\n`);
  process.exitCode = 2;
}

if (isMainModule()) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "dry-run": { type: "boolean", default: false },
      apply: { type: "boolean", default: false },
      target: { type: "string" },
      slug: { type: "string" },
      path: { type: "string" },
      alt: { type: "string", default: "" },
      provider: { type: "string" },
      model: { type: "string" },
      prompt: { type: "string", default: "" },
      "generated-at": { type: "string" },
      "public-dir": { type: "string", default: "apps/site/public" },
    },
  });
  const target = values.target;
  if (values.apply === values["dry-run"]) fail("pass exactly one of --dry-run or --apply");
  else if (target !== "staging" && target !== "production") fail("--target staging|production is required");
  else if (!values.slug || !values.path || !values.provider) fail("--slug, --path and --provider are required");
  else if (values.apply && target === "production" && !productionAllowed(process.env)) fail(`--apply --target production also needs ${PRODUCTION_ALLOW_ENV}=true (a production write is a STOP-THE-LINE approval item)`);
  else {
    const names = supabaseEnvFor(target);
    const url = process.env[names.url];
    const key = process.env[names.key];
    if (!url || !key) fail(`${names.url} and ${names.key} are required (names only; values stay in the environment)`);
    else {
      try {
        const image = buildImage(
          { path: values.path, alt: values.alt, provider: values.provider, model: values.model, prompt: values.prompt, generatedAt: values["generated-at"] ?? new Date().toISOString() },
          resolve(values["public-dir"]),
        );
        // Structural cast: SupabaseClient satisfies the minimal shape SupabaseDb needs.
        const db = new SupabaseDb(createClient(url, key) as unknown as SupabaseLike);
        const plan = await planImage(db, values.slug, image);
        if (values["dry-run"]) {
          process.stdout.write(`${JSON.stringify({ target, mode: "dry-run", ...plan }, null, 2)}\n`);
        } else {
          const result = await applyImage(db, plan);
          process.stdout.write(`${JSON.stringify({ target, mode: "apply", slug: plan.slug, before: plan.before, ...result }, null, 2)}\n`);
          process.exitCode = result.verified ? 0 : 1;
        }
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
      }
    }
  }
}
