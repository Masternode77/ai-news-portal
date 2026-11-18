/**
 * `/media/<key>` (3e, Josh 2026-11-18): generated essay images live in a public Supabase Storage bucket of the
 * project the site reads (`SUPABASE_URL`, names only); the site serves them on its own domain so rows keep
 * site-relative paths and the project host never appears in pages. Keys carry a content hash
 * (`<slug>/<variant>-<hash>.<ext>`, packages/pipeline/src/adapters/image-store/supabase.ts), so every response
 * is immutable. Only image keys of that shape are proxied; anything else is a 404.
 */
export const MEDIA_BUCKET_DEFAULT = "article-images";

const CONTENT_TYPES: Record<string, string> = { webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };
const KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*){0,7}\.(webp|png|jpe?g)$/;

export interface MediaEnv {
  SITE_DATA_SOURCE?: string | undefined;
  SUPABASE_URL?: string | undefined;
  MEDIA_BUCKET?: string | undefined;
}

export interface MediaUpstream {
  url: string;
  contentType: string;
}

/** The bucket object to fetch for a `/media/<key>` request, or null when the key or the environment does not allow one. */
export function mediaUpstream(key: string | undefined, env: MediaEnv): MediaUpstream | null {
  if (!key || key.length > 300 || key.includes("..") || !KEY.test(key)) return null;
  if (env.SITE_DATA_SOURCE !== "supabase" || !env.SUPABASE_URL) return null;
  let base: URL;
  try {
    base = new URL(env.SUPABASE_URL);
  } catch {
    return null;
  }
  if (base.protocol !== "https:") return null;
  const bucket = env.MEDIA_BUCKET && /^[a-z0-9][a-z0-9-]{2,62}$/.test(env.MEDIA_BUCKET) ? env.MEDIA_BUCKET : MEDIA_BUCKET_DEFAULT;
  const ext = key.slice(key.lastIndexOf(".") + 1).toLowerCase();
  const path = key.split("/").map(encodeURIComponent).join("/");
  return { url: `${base.origin}/storage/v1/object/public/${bucket}/${path}`, contentType: CONTENT_TYPES[ext] ?? "application/octet-stream" };
}

export const MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";
