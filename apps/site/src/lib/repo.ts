/** Request-time repository for pages: reads process.env so Vercel runtime variables apply without a rebuild. */
import { createClient } from "@supabase/supabase-js";
import { loadRedirectsConfig } from "@cc/shared";
import { DataUnavailableError, createPublicationsRepo } from "./publications.ts";
import type { PublicationsRepo, SiteSupabaseLike } from "./publications.ts";
import type { PublicationRow } from "@cc/shared";
import { LISTING_LIMIT } from "./listing.ts";
import { createRedirectLoader, createRedirectLookup, noRedirects } from "./redirects.ts";
import type { RedirectLookup } from "./redirects.ts";

let cached: PublicationsRepo | null = null;
let redirects: RedirectLookup | null = null;

// Structural cast: the supabase-js builder satisfies the minimal chain the site uses.
const supabaseFactory = (url: string, key: string): SiteSupabaseLike => createClient(url, key) as unknown as SiteSupabaseLike;

export function siteRepo(): PublicationsRepo {
  cached ??= createPublicationsRepo(
    {
      SITE_DATA_SOURCE: process.env["SITE_DATA_SOURCE"],
      SUPABASE_URL: process.env["SUPABASE_URL"],
      SUPABASE_ANON_KEY: process.env["SUPABASE_ANON_KEY"],
      LEGACY_DATA_DIR: process.env["LEGACY_DATA_DIR"],
    },
    { supabaseFactory },
  );
  return cached;
}

/** Redirect rules for the middleware: the `redirects` table under supabase, config/redirects.yaml otherwise. */
export function siteRedirects(): RedirectLookup {
  if (redirects) return redirects;
  const loader = createRedirectLoader(
    {
      SITE_DATA_SOURCE: process.env["SITE_DATA_SOURCE"],
      SUPABASE_URL: process.env["SUPABASE_URL"],
      SUPABASE_ANON_KEY: process.env["SUPABASE_ANON_KEY"],
      REDIRECTS_FILE: process.env["REDIRECTS_FILE"],
    },
    { supabaseFactory, loadFile: loadRedirectsConfig },
  );
  redirects = loader
    ? createRedirectLookup(loader, { onError: (error) => console.error(JSON.stringify({ level: "warn", msg: "redirects load failed", error: error instanceof Error ? error.message : String(error) })) })
    : noRedirects;
  return redirects;
}

export function siteIndexable(): boolean {
  return process.env["SITE_INDEXABLE"] === "true";
}

/**
 * An outage must never become a cached empty page or a cached 404: the
 * response is a 503 with `no-store` so ISR keeps whatever it already holds
 * and the next request retries. Last-known-good serving is Phase 5 (ADR-005).
 */
export function serviceUnavailable(error: DataUnavailableError): Response {
  return new Response(`Service unavailable: ${error.source}`, {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "retry-after": "60" },
  });
}

/** Rows for a listing page, or the 503 response to return instead. */
export async function listPublications(limit: number): Promise<PublicationRow[] | Response> {
  try {
    return await siteRepo().list({ limit });
  } catch (error) {
    if (error instanceof DataUnavailableError) return serviceUnavailable(error);
    throw error;
  }
}

/** Every published row a listing page filters (newest first), or the 503 response to return instead. */
export async function allPublications(): Promise<PublicationRow[] | Response> {
  return listPublications(LISTING_LIMIT);
}

/** One publication, null when it does not exist, or the 503 response to return instead. */
export async function getPublication(slug: string): Promise<PublicationRow | null | Response> {
  try {
    return await siteRepo().get(slug);
  } catch (error) {
    if (error instanceof DataUnavailableError) return serviceUnavailable(error);
    throw error;
  }
}
