/**
 * set-publication-image — attach a hero image to one published row (3e, Josh 2026-11-17: the first
 * production essay went out with the static placeholder, which the site does not show, and Josh asked for a
 * Higgsfield image on it). Two image sources:
 *
 * - `--path`: a file committed under apps/site/public/generated/articles/<dir>/ like the legacy columns' hero
 *   images and deployed first; the file must exist under --public-dir.
 * - `--source-url` (Josh 2026-11-19 A안: Higgsfield images generated through the Claude connector): an https URL
 *   on an `image.import.allowed_hosts` host. The tool downloads it (no redirects, at most `image.import.max_bytes`,
 *   webp/png/jpeg by magic bytes), uploads it to the project's `image.storage` bucket exactly like a served run
 *   (createSupabaseImageStore, key `<slug>/hero-<sha256:10>.<ext>`) and points the row at `/media/<key>`. The row
 *   is read before anything is uploaded, so a wrong slug leaves no orphan file.
 *
 *   node packages/pipeline/tools/set-publication-image.ts --dry-run|--apply --target staging|production
 *     --slug <slug> (--path /generated/articles/<dir>/hero.webp | --source-url https://<allowed host>/…) --alt <text>
 *     --provider <name> [--model <id>] [--prompt <text>] [--generated-at <ISO>] [--public-dir apps/site/public]
 *   node packages/pipeline/tools/set-publication-image.ts --list-missing --target staging|production [--limit 5]
 *
 * --dry-run validates the image (ImageResult schema; a --path file must exist; a --source-url is downloaded and
 * checked), reads the row and prints the before/after without uploading or writing. --apply uploads (source-url
 * only), writes `image` on the row matched by slug and reads it back. Only a row that exists is updated; nothing
 * else on it changes. --list-missing prints the newest pipeline essays (rows without a legacy_id) whose image is
 * missing or the placeholder, with the title, deck and thesis an image prompt needs; it writes nothing.
 *
 * Writing production is a STOP-THE-LINE approval item: `--target production` with --apply also needs
 * CC_ALLOW_PRODUCTION_PUBLISH=true and uses SUPABASE_PROD_URL / SUPABASE_PROD_SERVICE_ROLE_KEY; staging uses
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (names only; values stay in the environment). Logs go to stderr; stdout
 * is the JSON result only.
 */
import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { ImageResult, createLogger, loadPipelineConfig } from "@cc/shared";
import type { DbPort, ImageImportConfig, ImageStore, Logger, Row, StageContext } from "@cc/shared";
import { SupabaseDb } from "../src/db/supabase.ts";
import type { SupabaseLike } from "../src/ledger/supabase.ts";
import { createSupabaseImageStore, hashedImageKey } from "../src/adapters/image-store/supabase.ts";
import type { SupabaseStorageLike } from "../src/adapters/image-store/supabase.ts";
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

export type ImportMime = "image/webp" | "image/png" | "image/jpeg";

export interface SourceImage {
  url: string;
  bytes: Uint8Array;
  mime: ImportMime;
}

/** The variant every imported hero image is stored under. */
export const HERO_VARIANT = "hero";
const ESSAY_CONTENT_TYPE = "insight_essay";
/** Newest essays scanned by --list-missing before the image filter. */
const LIST_SCAN = 50;

/**
 * The ImageResult to store; throws when the path or fields are invalid or a site-relative file is missing.
 * `publicDir` null skips the disk check: a hosted `/media/...` path is proven by its upload, not the checkout.
 */
export function buildImage(input: ImageInput, publicDir: string | null): ImageResult {
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
    if (publicDir !== null) {
      const file = resolve(publicDir, `.${image.path}`);
      if (!existsSync(file)) throw new Error(`IMAGE_FILE_MISSING: ${image.path} is not under ${publicDir}; commit and deploy the file before pointing a row at it`);
    }
  }
  return image;
}

/** The parsed URL when it is plain https on an allowed host; throws IMAGE_SOURCE_INVALID / IMAGE_SOURCE_HOST_NOT_ALLOWED. */
export function checkSourceUrl(raw: string, allowedHosts: readonly string[]): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("IMAGE_SOURCE_INVALID: --source-url is not a URL");
  }
  if (url.protocol !== "https:") throw new Error("IMAGE_SOURCE_INVALID: --source-url must be https");
  if (url.username || url.password || url.port) throw new Error("IMAGE_SOURCE_INVALID: --source-url must not carry credentials or a port");
  if (!allowedHosts.includes(url.hostname)) {
    throw new Error(`IMAGE_SOURCE_HOST_NOT_ALLOWED: ${url.hostname} is not in image.import.allowed_hosts (${allowedHosts.join(", ") || "none"})`);
  }
  return url;
}

/** The image type by magic bytes (the response's content-type is not trusted), or null. */
export function sniffImageMime(bytes: Uint8Array): ImportMime | null {
  const ascii = (start: number, end: number): string => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, 4) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

/** Downloads at most `maxBytes` with redirects refused; throws IMAGE_SOURCE_* codes. */
export async function downloadSourceImage(
  url: URL,
  options: { fetch: typeof globalThis.fetch; maxBytes: number; timeoutMs: number },
): Promise<SourceImage> {
  let response: Response;
  try {
    response = await options.fetch(url, { redirect: "error", signal: AbortSignal.timeout(options.timeoutMs) });
  } catch (error) {
    throw new Error(`IMAGE_SOURCE_FETCH_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new Error(`IMAGE_SOURCE_HTTP_${response.status}: ${url.hostname} answered ${response.status}`);
  const declared = Number(response.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > options.maxBytes) {
    await response.body?.cancel();
    throw new Error(`IMAGE_SOURCE_TOO_LARGE: ${declared} bytes > ${options.maxBytes}`);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body?.getReader();
  if (!reader) throw new Error("IMAGE_SOURCE_EMPTY: no body");
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > options.maxBytes) {
      await reader.cancel();
      throw new Error(`IMAGE_SOURCE_TOO_LARGE: more than ${options.maxBytes} bytes`);
    }
    chunks.push(value);
  }
  if (total === 0) throw new Error("IMAGE_SOURCE_EMPTY: no bytes");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const mime = sniffImageMime(bytes);
  if (!mime) throw new Error("IMAGE_SOURCE_NOT_IMAGE: the bytes are not webp, png or jpeg");
  return { url: url.href, bytes, mime };
}

/** The `/media/<key>` path the store will return for these bytes (same hash, so dry-run and apply agree). */
export function plannedImportPath(slug: string, source: SourceImage, publicPath: string): string {
  return `${publicPath}/${hashedImageKey({ slug, variant: HERO_VARIANT, mime: source.mime, bytes: source.bytes })}`;
}

/** Uploads the bytes through the run's image store; returns the stored path. */
export async function storeSourceImage(store: ImageStore, slug: string, source: SourceImage, logger: Logger): Promise<string> {
  // The store only reads ctx.logger; a tool has no run context.
  const ctx = { logger } as Pick<StageContext, "logger"> as StageContext;
  const stored = await store.put({ bytes: source.bytes, mime: source.mime, slug, variant: HERO_VARIANT }, ctx);
  return stored.path;
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

/** True when the row shows no image: none, an empty path, or the placeholder (which the site never renders). */
export function needsImage(image: unknown): boolean {
  if (!image || typeof image !== "object") return true;
  const value = image as { path?: unknown; placeholder?: unknown };
  return value.placeholder === true || typeof value.path !== "string" || value.path.length === 0;
}

export interface MissingImage {
  slug: string;
  /** Site path of the article. */
  url: string;
  title: string;
  deck: string;
  thesis: string;
  tags: string[];
  published_at: string;
  image: unknown;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Newest published pipeline essays (no legacy_id) without a shown image, at most `limit`. */
export async function listMissingImages(db: DbPort, limit: number): Promise<MissingImage[]> {
  const rows = await db.select<Row>(
    "publications",
    { content_type: ESSAY_CONTENT_TYPE, status: "published" },
    { columns: ["slug", "title", "body", "tags", "published_at", "image", "legacy_id"], limit: LIST_SCAN, orderBy: { column: "published_at", ascending: false } },
  );
  return rows
    .filter((row) => (row["legacy_id"] ?? null) === null && needsImage(row["image"]))
    .slice(0, limit)
    .map((row) => {
      const body = (row["body"] ?? {}) as Record<string, unknown>;
      return {
        slug: text(row["slug"]),
        url: `/${text(row["slug"])}/`,
        title: text(row["title"]),
        deck: text(body["deck"]),
        thesis: text(body["thesis"]),
        tags: Array.isArray(row["tags"]) ? row["tags"].filter((tag): tag is string => typeof tag === "string") : [],
        published_at: text(row["published_at"]),
        image: row["image"] ?? null,
      };
    });
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

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

if (isMainModule()) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "dry-run": { type: "boolean", default: false },
      apply: { type: "boolean", default: false },
      "list-missing": { type: "boolean", default: false },
      limit: { type: "string", default: "5" },
      target: { type: "string" },
      slug: { type: "string" },
      path: { type: "string" },
      "source-url": { type: "string" },
      alt: { type: "string", default: "" },
      provider: { type: "string" },
      model: { type: "string" },
      prompt: { type: "string", default: "" },
      "generated-at": { type: "string" },
      "public-dir": { type: "string", default: "apps/site/public" },
      config: { type: "string", default: "config/pipeline.yaml" },
    },
  });
  const target = values.target;
  const modes = [values["dry-run"], values.apply, values["list-missing"]].filter(Boolean).length;
  const limit = Number(values.limit);
  const sourceUrl = values["source-url"];
  if (modes !== 1) fail("pass exactly one of --dry-run, --apply or --list-missing");
  else if (target !== "staging" && target !== "production") fail("--target staging|production is required");
  else if (values["list-missing"] && !(Number.isInteger(limit) && limit >= 1 && limit <= 20)) fail("--limit must be an integer from 1 to 20");
  else if (!values["list-missing"] && (!values.slug || !values.provider)) fail("--slug and --provider are required");
  else if (!values["list-missing"] && Boolean(values.path) === Boolean(sourceUrl)) fail("pass exactly one of --path or --source-url");
  else if (values.apply && target === "production" && !productionAllowed(process.env)) fail(`--apply --target production also needs ${PRODUCTION_ALLOW_ENV}=true (a production write is a STOP-THE-LINE approval item)`);
  else {
    const names = supabaseEnvFor(target);
    const url = process.env[names.url];
    const key = process.env[names.key];
    if (!url || !key) fail(`${names.url} and ${names.key} are required (names only; values stay in the environment)`);
    else {
      try {
        const client = createClient(url, key);
        // Structural cast: SupabaseClient satisfies the minimal shape SupabaseDb needs.
        const db = new SupabaseDb(client as unknown as SupabaseLike);
        if (values["list-missing"]) {
          const missing = await listMissingImages(db, limit);
          print({ target, mode: "list-missing", count: missing.length, missing });
        } else {
          const slug = values.slug as string;
          const generatedAt = values["generated-at"] ?? new Date().toISOString();
          const input = { alt: values.alt, provider: values.provider as string, model: values.model, prompt: values.prompt, generatedAt };
          let image: ImageResult;
          let source: SourceImage | null = null;
          let store: ImageStore | null = null;
          if (sourceUrl) {
            // The committed file, not the environment: no CC_FLAG_* override applies to image.storage / image.import.
            const { config } = await loadPipelineConfig(resolve(values.config), {});
            const imported: ImageImportConfig = config.image.import;
            if (config.image.storage.kind !== "supabase") throw new Error("IMAGE_STORAGE_OFF: --source-url needs image.storage.kind supabase");
            source = await downloadSourceImage(checkSourceUrl(sourceUrl, imported.allowed_hosts), { fetch: globalThis.fetch, maxBytes: imported.max_bytes, timeoutMs: imported.timeout_ms });
            image = buildImage({ ...input, path: plannedImportPath(slug, source, config.image.storage.public_path) }, null);
            const storage = (client as unknown as { storage: SupabaseStorageLike }).storage;
            store = createSupabaseImageStore({ storage, bucket: config.image.storage.bucket, publicPath: config.image.storage.public_path });
          } else {
            image = buildImage({ ...input, path: values.path as string }, resolve(values["public-dir"]));
          }
          const plan = await planImage(db, slug, image);
          const sourceInfo = source ? { url: source.url, mime: source.mime, bytes: source.bytes.byteLength } : undefined;
          if (values["dry-run"]) {
            print({ target, mode: "dry-run", ...plan, ...(sourceInfo ? { source: sourceInfo } : {}) });
          } else {
            if (source && store) {
              const logger = createLogger({ name: "set-publication-image", sink: (line) => process.stderr.write(`${line}\n`) });
              const stored = await storeSourceImage(store, slug, source, logger);
              if (stored !== plan.after.path) throw new Error(`IMAGE_STORE_PATH_MISMATCH: stored ${stored}, planned ${plan.after.path}`);
            }
            const result = await applyImage(db, plan);
            print({ target, mode: "apply", slug: plan.slug, before: plan.before, ...result, ...(sourceInfo ? { source: sourceInfo } : {}) });
            process.exitCode = result.verified ? 0 : 1;
          }
        }
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
      }
    }
  }
}
