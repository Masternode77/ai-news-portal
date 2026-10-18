/**
 * The only data access layer the site has (ADR-005 P1): it reads published
 * rows and nothing else. Three sources, chosen by SITE_DATA_SOURCE:
 *
 *   supabase    — anon key + RLS, published rows only (production after Phase 5)
 *   legacy_json — the committed JSON reader pages mapped through legacy-json.ts
 *                 (strangler period / local dev; needs LEGACY_DATA_DIR or the
 *                 repo layout, which the Vercel function runtime does not have)
 *   empty       — no data; proves the site builds and renders with 0 published
 *
 * An unset SITE_DATA_SOURCE means `empty`: a deployment must opt into a data
 * source explicitly. Every path is fail-safe: a missing directory, an
 * unreachable database or an invalid row degrades to "fewer rows" and is
 * reported by health(), never by a thrown error at render time.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PUBLICATION_COLUMNS, PublicationRow } from "@cc/shared";
import type { PublicationRow as PublicationRowType } from "@cc/shared";
import { mapLegacyCollections } from "./legacy-json.ts";

export const DATA_SOURCES = ["supabase", "legacy_json", "empty"] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export interface SiteEnv {
  SITE_DATA_SOURCE?: string | undefined;
  SUPABASE_URL?: string | undefined;
  SUPABASE_ANON_KEY?: string | undefined;
  LEGACY_DATA_DIR?: string | undefined;
}

export interface RepoHealth {
  ok: boolean;
  source: DataSource;
  publishedCount: number;
  detail?: string;
}

export interface PublicationsRepo {
  readonly source: DataSource;
  list(options?: { limit?: number }): Promise<PublicationRowType[]>;
  get(slug: string): Promise<PublicationRowType | null>;
  health(): Promise<RepoHealth>;
}

export interface SiteSupabaseResponse {
  data: unknown[] | null;
  error: { message: string } | null;
  count?: number | null;
}

/** Minimal shape of the supabase-js query chain the repo uses; tests inject a fake. */
export interface SiteSupabaseQuery {
  eq(column: string, value: unknown): SiteSupabaseQuery;
  order(column: string, options: { ascending: boolean }): SiteSupabaseQuery;
  limit(count: number): SiteSupabaseQuery;
  maybeSingle(): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  then<T>(onfulfilled: (value: SiteSupabaseResponse) => T): PromiseLike<T>;
}
export interface SiteSupabaseLike {
  from(table: string): { select(columns: string, options?: { count: "exact"; head: boolean }): SiteSupabaseQuery };
}
export type SupabaseFactory = (url: string, anonKey: string) => SiteSupabaseLike;

export function resolveDataSource(env: SiteEnv): DataSource {
  const raw = env.SITE_DATA_SOURCE?.trim();
  if (!raw) return "empty";
  if ((DATA_SOURCES as readonly string[]).includes(raw)) return raw as DataSource;
  throw new Error(`SITE_DATA_SOURCE must be one of ${DATA_SOURCES.join("|")}, got "${raw}"`);
}

const DEFAULT_LIMIT = 50;

function emptyRepo(detail?: string): PublicationsRepo {
  return {
    source: "empty",
    list: async () => [],
    get: async () => null,
    health: async () => ({ ok: true, source: "empty", publishedCount: 0, ...(detail ? { detail } : {}) }),
  };
}

function parseRows(data: unknown[] | null | undefined): { rows: PublicationRowType[]; invalid: number } {
  const rows: PublicationRowType[] = [];
  let invalid = 0;
  for (const item of data ?? []) {
    const parsed = PublicationRow.safeParse(item);
    if (parsed.success && parsed.data.status === "published") rows.push(parsed.data);
    else invalid += 1;
  }
  return { rows, invalid };
}

export function createSupabaseRepo(client: SiteSupabaseLike): PublicationsRepo {
  const columns = PUBLICATION_COLUMNS.join(",");
  const fetchList = async (limit: number): Promise<{ rows: PublicationRowType[]; invalid: number; error: string | null }> => {
    try {
      const result = await client.from("publications").select(columns).eq("status", "published").order("published_at", { ascending: false }).limit(limit);
      if (result.error) return { rows: [], invalid: 0, error: result.error.message };
      return { ...parseRows(result.data), error: null };
    } catch (error) {
      return { rows: [], invalid: 0, error: error instanceof Error ? error.message : String(error) };
    }
  };
  return {
    source: "supabase",
    async list(options = {}) {
      return (await fetchList(options.limit ?? DEFAULT_LIMIT)).rows;
    },
    async get(slug) {
      try {
        const result = await client.from("publications").select(columns).eq("slug", slug).eq("status", "published").maybeSingle();
        if (result.error || !result.data) return null;
        const parsed = PublicationRow.safeParse(result.data);
        return parsed.success && parsed.data.status === "published" ? parsed.data : null;
      } catch {
        return null;
      }
    },
    async health() {
      // A head-only count keeps the probe cheap; the small list proves rows parse under the current schema.
      try {
        const counted = await client.from("publications").select("id", { count: "exact", head: true }).eq("status", "published");
        if (counted.error) return { ok: false, source: "supabase", publishedCount: 0, detail: counted.error.message };
        const sample = await fetchList(5);
        if (sample.error) return { ok: false, source: "supabase", publishedCount: counted.count ?? 0, detail: sample.error };
        return {
          ok: true,
          source: "supabase",
          publishedCount: counted.count ?? sample.rows.length,
          ...(sample.invalid > 0 ? { detail: `${sample.invalid} of the latest rows failed schema validation` } : {}),
        };
      } catch (error) {
        return { ok: false, source: "supabase", publishedCount: 0, detail: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

interface LegacyLoad {
  rows: PublicationRowType[];
  detail?: string;
  failed: boolean;
}

export function createLegacyJsonRepo(dataDir: string, fs: { readFile: typeof readFile } = { readFile }): PublicationsRepo {
  let cache: Promise<LegacyLoad> | null = null;
  const load = (): Promise<LegacyLoad> => {
    cache ??= (async () => {
      try {
        const [news, columns] = await Promise.all([
          fs.readFile(resolve(dataDir, "latest-news.json"), "utf8").then((t) => JSON.parse(t) as unknown),
          fs.readFile(resolve(dataDir, "authored-columns.json"), "utf8").then((t) => JSON.parse(t) as unknown),
        ]);
        const mapped = mapLegacyCollections(news, columns);
        const notes = [
          mapped.skipped > 0 ? `${mapped.skipped} legacy record(s) could not be mapped` : null,
          mapped.withoutBody > 0 ? `${mapped.withoutBody} legacy page(s) have no editorial body` : null,
        ].filter((n): n is string => n !== null);
        return { rows: mapped.rows, failed: false, ...(notes.length > 0 ? { detail: notes.join("; ") } : {}) };
      } catch (error) {
        // A failed load is not cached: the next request retries instead of serving an empty site for the process lifetime.
        cache = null;
        return { rows: [], failed: true, detail: `legacy data unavailable: ${error instanceof Error ? error.message : String(error)}` };
      }
    })();
    return cache;
  };
  return {
    source: "legacy_json",
    list: async (options = {}) => (await load()).rows.slice(0, options.limit ?? DEFAULT_LIMIT),
    get: async (slug) => (await load()).rows.find((row) => row.slug === slug) ?? null,
    health: async () => {
      const { rows, detail, failed } = await load();
      return { ok: !failed, source: "legacy_json", publishedCount: rows.length, ...(detail ? { detail } : {}) };
    },
  };
}

export interface RepoDeps {
  supabaseFactory?: SupabaseFactory;
  /** Repository root used to locate legacy src/data when LEGACY_DATA_DIR is unset. */
  repoRoot?: string;
}

export function createPublicationsRepo(env: SiteEnv, deps: RepoDeps = {}): PublicationsRepo {
  const source = resolveDataSource(env);
  if (source === "empty") return emptyRepo(env.SITE_DATA_SOURCE?.trim() ? undefined : "SITE_DATA_SOURCE unset; serving empty");
  if (source === "supabase") {
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_ANON_KEY;
    if (!url || !key) return emptyRepo("SUPABASE_URL / SUPABASE_ANON_KEY not set; serving empty");
    if (!deps.supabaseFactory) return emptyRepo("supabase client factory not provided; serving empty");
    return createSupabaseRepo(deps.supabaseFactory(url, key));
  }
  const dataDir = env.LEGACY_DATA_DIR ?? resolve(deps.repoRoot ?? resolve(process.cwd(), "../.."), "src/data");
  return createLegacyJsonRepo(dataDir);
}
