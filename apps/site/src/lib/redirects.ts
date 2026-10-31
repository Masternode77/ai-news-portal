/**
 * Legacy URL redirects (R8, ADR-005): 301 to the new address or 410 Gone.
 *
 * The middleware consults this only when a route answered 404, so ordinary
 * pages never wait on it. Rules come from the `redirects` table (anon RLS
 * read; the pipeline syncs it from config/redirects.yaml on every publishing
 * run) or, for local and CI runs without a database, from that YAML file.
 * The table is small, so the whole set is loaded and kept per instance for a
 * few minutes. A failed load is logged and not cached: the 404 stands and the
 * next request retries.
 */
import { resolve } from "node:path";
import { RedirectRow } from "@cc/shared";
import type { RedirectRow as RedirectRule } from "@cc/shared";
import { resolveDataSource } from "./publications.ts";
import type { SupabaseFactory } from "./publications.ts";

export type { RedirectRule };
export type RedirectLoader = () => Promise<RedirectRule[]>;

export interface RedirectLookup {
  lookup(pathname: string): Promise<RedirectRule | null>;
}

export const REDIRECT_TTL_MS = 5 * 60 * 1000;

/** `/a/b` and `/a/b/` name the same page; the exact spelling wins when both are listed. */
export function pathVariants(pathname: string): string[] {
  if (pathname === "/") return ["/"];
  const bare = pathname.replace(/\/+$/, "");
  const variants = [pathname, bare, `${bare}/`];
  return [...new Set(variants)];
}

export function parseRedirectRows(data: unknown[] | null | undefined): RedirectRule[] {
  const rules: RedirectRule[] = [];
  for (const item of data ?? []) {
    const parsed = RedirectRow.safeParse(item);
    if (parsed.success) rules.push(parsed.data);
  }
  return rules;
}

export function createRedirectLookup(
  loader: RedirectLoader,
  options: { ttlMs?: number; now?: () => number; onError?: (error: unknown) => void } = {},
): RedirectLookup {
  const ttl = options.ttlMs ?? REDIRECT_TTL_MS;
  const now = options.now ?? Date.now;
  let cache: { at: number; rules: Map<string, RedirectRule> } | null = null;
  const load = async (): Promise<Map<string, RedirectRule> | null> => {
    if (cache && now() - cache.at < ttl) return cache.rules;
    try {
      const rules = await loader();
      cache = { at: now(), rules: new Map(rules.map((rule) => [rule.from_path, rule])) };
      return cache.rules;
    } catch (error) {
      options.onError?.(error);
      return cache?.rules ?? null;
    }
  };
  return {
    async lookup(pathname) {
      const rules = await load();
      if (!rules) return null;
      for (const variant of pathVariants(pathname)) {
        const rule = rules.get(variant);
        if (rule) return rule;
      }
      return null;
    },
  };
}

export const noRedirects: RedirectLookup = { lookup: async () => null };

/** 301 carries the new address; 410 carries no Location (to_path is a placeholder for these rows). */
export function redirectResponse(rule: RedirectRule): Response {
  if (rule.status === 301) {
    return new Response(null, { status: 301, headers: { location: rule.to_path, "cache-control": "public, max-age=3600" } });
  }
  return new Response("Gone", { status: 410, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

export interface RedirectSourceEnv {
  SITE_DATA_SOURCE?: string | undefined;
  SUPABASE_URL?: string | undefined;
  SUPABASE_ANON_KEY?: string | undefined;
  REDIRECTS_FILE?: string | undefined;
}

export interface RedirectSourceDeps {
  /** Same minimal supabase-js shape the publications repo uses. */
  supabaseFactory?: SupabaseFactory;
  /** Reads and validates config/redirects.yaml (the @cc/shared loader in production code). */
  loadFile?: (path: string) => Promise<RedirectRule[]>;
  /** Repository root used to locate config/redirects.yaml when REDIRECTS_FILE is unset. */
  repoRoot?: string;
}

/**
 * The loader that matches the site's data source: the `redirects` table for
 * `supabase`; the YAML file for `legacy_json` and `empty` (local, CI and
 * previews without a database — a missing file just means no redirects).
 */
export function createRedirectLoader(env: RedirectSourceEnv, deps: RedirectSourceDeps = {}): RedirectLoader | null {
  let source: string;
  try {
    source = resolveDataSource(env);
  } catch {
    return null;
  }
  if (source === "supabase") {
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !deps.supabaseFactory) return null;
    const client = deps.supabaseFactory(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
    return async () => {
      const result = await client.from("redirects").select("from_path,to_path,status");
      if (result.error) throw new Error(`redirects unavailable: ${result.error.message}`);
      return parseRedirectRows(result.data);
    };
  }
  if (!deps.loadFile) return null;
  const file = env.REDIRECTS_FILE ?? resolve(deps.repoRoot ?? resolve(process.cwd(), "../.."), "config/redirects.yaml");
  const loadFile = deps.loadFile;
  return () => loadFile(file);
}
