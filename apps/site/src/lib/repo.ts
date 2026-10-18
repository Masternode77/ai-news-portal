/** Request-time repository for pages: reads process.env so Vercel runtime variables apply without a rebuild. */
import { createClient } from "@supabase/supabase-js";
import { createPublicationsRepo } from "./publications.ts";
import type { PublicationsRepo, SiteSupabaseLike } from "./publications.ts";

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
