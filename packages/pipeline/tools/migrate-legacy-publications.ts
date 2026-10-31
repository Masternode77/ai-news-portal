/**
 * migrate-legacy-publications — Phase 3h dry-run planner for the Phase 5 (M5)
 * legacy migration (ADR-006). It reads the committed legacy JSON
 * (src/data/latest-news.json, src/data/authored-columns.json), maps the public
 * reader pages onto `publications` rows with the same mapper the site uses for
 * SITE_DATA_SOURCE=legacy_json (`@cc/shared` mapLegacyCollections), and checks
 * the preserve list (docs/diagnosis/05-preserve-list.csv) against them:
 *
 *   ready        the preserved URL maps to a valid, public publications row
 *   not_public   the record exists but is no longer public (quarantined, draft…)
 *   missing      no legacy record for the preserved URL
 *
 * --dry-run prints the plan. --apply (Phase 5 M5, docs/migration/phase5-cutover.md
 * step 7) writes it: the ready rows are upserted into `publications` by slug and
 * config/redirects.yaml into `redirects` by from_path, both idempotent, then the
 * written slugs are read back. Running it against production is a STOP-THE-LINE
 * approval item (ADR-006 M5): `--target production` also needs
 * CC_ALLOW_PRODUCTION_PUBLISH=true and uses SUPABASE_PROD_URL /
 * SUPABASE_PROD_SERVICE_ROLE_KEY; `--target staging` uses SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY (names only). A plan with a missing record is never
 * applied.
 *
 *   node packages/pipeline/tools/migrate-legacy-publications.ts --dry-run [--json <out.json>]
 *     [--news src/data/latest-news.json] [--columns src/data/authored-columns.json]
 *     [--preserve docs/diagnosis/05-preserve-list.csv]
 *   node packages/pipeline/tools/migrate-legacy-publications.ts --apply --target staging|production
 *     [--redirects config/redirects.yaml]
 */
import { readFile, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { loadRedirectsConfig, mapLegacyCollections } from "@cc/shared";
import type { DbPort, PublicationRow, RedirectsConfig } from "@cc/shared";
import { SupabaseDb } from "../src/db/supabase.ts";
import type { SupabaseLike } from "../src/ledger/supabase.ts";
import { productionAllowed, supabaseEnvFor, PRODUCTION_ALLOW_ENV } from "../src/supabase-env.ts";

export interface PreserveRow {
  url: string;
  type: string;
  record_id: string;
  indexable: string;
}

/** Minimal RFC 4180 reader: quoted fields may contain commas; no multi-line fields in this file. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    const cells: string[] = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]!;
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") {
        cells.push(cell);
        cell = "";
      } else cell += ch;
    }
    cells.push(cell);
    rows.push(cells);
  }
  return rows;
}

export function parsePreserveList(csv: string): PreserveRow[] {
  const [header, ...rows] = parseCsv(csv);
  if (!header) return [];
  const col = (name: string): number => header.indexOf(name);
  const url = col("url");
  const type = col("type");
  const recordId = col("record_id");
  const indexable = col("indexable");
  if (url < 0 || type < 0 || recordId < 0) throw new Error("PRESERVE_LIST_INVALID: expected url,type,record_id columns");
  return rows.map((cells) => ({ url: cells[url] ?? "", type: cells[type] ?? "", record_id: cells[recordId] ?? "", indexable: indexable >= 0 ? (cells[indexable] ?? "") : "" }));
}

export type PlanStatus = "ready" | "not_public" | "missing";

export interface PlanEntry {
  url: string;
  type: string;
  slug: string;
  record_id: string;
  status: PlanStatus;
  /** The legacy record's public_status when it exists but is not public. */
  public_status: string | null;
  image_path: string | null;
}

export interface MigrationPlan {
  rows: PublicationRow[];
  entries: PlanEntry[];
  counts: {
    news_public: number;
    column_public: number;
    skipped: number;
    without_body: number;
    preserved: number;
    ready: number;
    not_public: number;
    missing: number;
    expected_404: number;
    legacy_image_paths: number;
  };
}

/** `/news/<id>/` → `news/<id>`, `/column/<slug>/` → `column/<slug>`. */
export function slugFromPreservedUrl(url: string): string | null {
  const match = url.match(/^\/(news|column)\/([^/]+)\/?$/);
  return match ? `${match[1]}/${match[2]}` : null;
}

function publicStatusOf(records: unknown, id: string): string | null {
  if (!Array.isArray(records)) return null;
  const record = (records as Record<string, unknown>[]).find((r) => r["id"] === id);
  const status = record?.["public_status"];
  return typeof status === "string" ? status : record ? "unset" : null;
}

export function planLegacyMigration(input: { news: unknown; columns: unknown; preserve: PreserveRow[] }): MigrationPlan {
  const mapped = mapLegacyCollections(input.news, input.columns);
  const bySlug = new Map(mapped.rows.map((row) => [row.slug, row]));
  const entries: PlanEntry[] = [];
  let expected404 = 0;
  for (const row of input.preserve) {
    if (row.type === "column_page_quarantined") {
      expected404 += 1;
      continue;
    }
    if (row.type !== "news_page" && row.type !== "column_page") continue;
    const slug = slugFromPreservedUrl(row.url);
    if (!slug) continue;
    const found = bySlug.get(slug);
    if (found) {
      entries.push({ url: row.url, type: row.type, slug, record_id: row.record_id, status: "ready", public_status: null, image_path: found.image?.path ?? null });
      continue;
    }
    const publicStatus = publicStatusOf(row.type === "news_page" ? input.news : input.columns, row.record_id);
    entries.push({ url: row.url, type: row.type, slug, record_id: row.record_id, status: publicStatus === null ? "missing" : "not_public", public_status: publicStatus, image_path: null });
  }
  const count = (status: PlanStatus): number => entries.filter((e) => e.status === status).length;
  return {
    rows: mapped.rows,
    entries,
    counts: {
      news_public: mapped.rows.filter((r) => r.slug.startsWith("news/")).length,
      column_public: mapped.rows.filter((r) => r.slug.startsWith("column/")).length,
      skipped: mapped.skipped,
      without_body: mapped.withoutBody,
      preserved: entries.length,
      ready: count("ready"),
      not_public: count("not_public"),
      missing: count("missing"),
      expected_404: expected404,
      legacy_image_paths: mapped.rows.filter((r) => r.image?.path.startsWith("/generated/")).length,
    },
  };
}

export async function loadAndPlan(paths: { news: string; columns: string; preserve: string }): Promise<MigrationPlan> {
  const [news, columns, preserve] = await Promise.all([
    readFile(paths.news, "utf8").then((t) => JSON.parse(t) as unknown),
    readFile(paths.columns, "utf8").then((t) => JSON.parse(t) as unknown),
    readFile(paths.preserve, "utf8").then(parsePreserveList),
  ]);
  return planLegacyMigration({ news, columns, preserve });
}

export interface ApplyResult {
  publications_upserted: number;
  redirects_upserted: number;
  /** Written slugs found again on a read-back. */
  verified: number;
  slugs: string[];
}

/** Writes the ready rows and the redirect rules; idempotent (upserts by slug and from_path). */
export async function applyLegacyMigration(plan: MigrationPlan, redirects: RedirectsConfig, db: DbPort): Promise<ApplyResult> {
  if (plan.counts.missing > 0) throw new Error(`MIGRATION_PLAN_INCOMPLETE: ${plan.counts.missing} preserved page(s) have no legacy record`);
  const readySlugs = new Set(plan.entries.filter((e) => e.status === "ready").map((e) => e.slug));
  const rows = plan.rows.filter((row) => readySlugs.has(row.slug));
  if (rows.length !== readySlugs.size) throw new Error(`MIGRATION_PLAN_INCONSISTENT: ${readySlugs.size} ready entries but ${rows.length} mapped rows`);
  await db.upsert("publications", rows as unknown as Record<string, unknown>[], ["slug"]);
  await db.upsert("redirects", redirects as unknown as Record<string, unknown>[], ["from_path"]);
  const back = await db.selectIn<{ slug: string }>("publications", "slug", [...readySlugs], { columns: ["slug"] });
  return { publications_upserted: rows.length, redirects_upserted: redirects.length, verified: back.length, slugs: rows.map((r) => r.slug) };
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return pathToFileURL(realpathSync(entry)).href === import.meta.url;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "dry-run": { type: "boolean", default: false },
      apply: { type: "boolean", default: false },
      news: { type: "string", default: "src/data/latest-news.json" },
      columns: { type: "string", default: "src/data/authored-columns.json" },
      preserve: { type: "string", default: "docs/diagnosis/05-preserve-list.csv" },
      redirects: { type: "string", default: "config/redirects.yaml" },
      target: { type: "string" },
      json: { type: "string" },
    },
  });
  if (values.apply === values["dry-run"]) {
    process.stderr.write("migrate-legacy-publications: pass exactly one of --dry-run or --apply\n");
    process.exitCode = 2;
  } else if (values.apply) {
    const target = values.target;
    if (target !== "staging" && target !== "production") {
      process.stderr.write("migrate-legacy-publications: --apply needs --target staging|production\n");
      process.exitCode = 2;
    } else if (target === "production" && !productionAllowed(process.env)) {
      process.stderr.write(`migrate-legacy-publications: --target production also needs ${PRODUCTION_ALLOW_ENV}=true (Phase 5 M5 is a STOP-THE-LINE approval item)\n`);
      process.exitCode = 2;
    } else {
      const names = supabaseEnvFor(target);
      const url = process.env[names.url];
      const key = process.env[names.key];
      if (!url || !key) {
        process.stderr.write(`migrate-legacy-publications: ${names.url} and ${names.key} are required (names only; values stay in the environment)\n`);
        process.exitCode = 2;
      } else {
        const plan = await loadAndPlan({ news: resolve(values.news), columns: resolve(values.columns), preserve: resolve(values.preserve) });
        const redirects = await loadRedirectsConfig(resolve(values.redirects));
        // Structural cast: SupabaseClient satisfies the minimal shape SupabaseDb needs.
        const db = new SupabaseDb(createClient(url, key) as unknown as SupabaseLike);
        const result = await applyLegacyMigration(plan, redirects, db);
        process.stdout.write(`${JSON.stringify({ target, counts: plan.counts, ...result }, null, 2)}\n`);
        process.exitCode = result.verified === result.publications_upserted ? 0 : 1;
      }
    }
  } else {
    const plan = await loadAndPlan({ news: resolve(values.news), columns: resolve(values.columns), preserve: resolve(values.preserve) });
    const summary = { counts: plan.counts, entries: plan.entries };
    if (values.json) {
      await writeFile(resolve(values.json), `${JSON.stringify({ ...summary, rows: plan.rows }, null, 2)}\n`, "utf8");
      process.stdout.write(`plan written to ${values.json}\n`);
    }
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    process.exitCode = plan.counts.missing > 0 ? 1 : 0;
  }
}
