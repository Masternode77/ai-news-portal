/** Request-time repository for pages: reads process.env so Vercel runtime variables apply without a rebuild. */
import { createClient } from "@supabase/supabase-js";
import { DataUnavailableError, createPublicationsRepo } from "./publications.ts";
import type { PublicationsRepo, SiteSupabaseLike } from "./publications.ts";
import type { PublicationRow } from "@cc/shared";

let cached: PublicationsRepo | null = null;

export function siteRepo(): PublicationsRepo {
  cached ??= createPublicationsRepo(
    {
      SITE_DATA_SOURCE: process.env["SITE_DATA_SOURCE"],
      SUPABASE_URL: process.env["SUPABASE_URL"],
      SUPABASE_ANON_KEY: process.env["SUPABASE_ANON_KEY"],
      LEGACY_DATA_DIR: process.env["LEGACY_DATA_DIR"],
    },
    {
      // Structural cast: the supabase-js builder satisfies the minimal chain the repo uses.
      supabaseFactory: (url, key) => createClient(url, key) as unknown as SiteSupabaseLike,
    },
  );
  return cached;
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

/** One publication, null when it does not exist, or the 503 response to return instead. */
export async function getPublication(slug: string): Promise<PublicationRow | null | Response> {
  try {
    return await siteRepo().get(slug);
  } catch (error) {
    if (error instanceof DataUnavailableError) return serviceUnavailable(error);
    throw error;
  }
}
