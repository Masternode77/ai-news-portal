/**
 * ingest — Phase 3a. For every enabled source: mirror the YAML row into the
 * `sources` table, honour an auto-disable recorded there, fetch through the
 * source adapter with bounded concurrency, validate each item, apply the
 * per-source cap, extract bodies for `text_rights: full` sources, upsert
 * `raw_items` (idempotent on canonical_url) and update source health.
 *
 * Failure isolation (P5): a failing source and a malformed item each become a
 * dead letter while the run continues; an extraction failure keeps the item
 * with its feed text and a `payload.extraction.ok = false` marker.
 *
 * Health: `fail_streak` counts consecutive failed runs; at
 * `ingest.auto_disable_after` the row's `enabled` flips to false in the table
 * (the YAML is untouched) with `health.auto_disabled_at` set and a
 * SOURCE_AUTO_DISABLED dead letter. A YAML `reviewed_at` later than that day
 * re-enables the source on the next run.
 */
import { createHash } from "node:crypto";
import { EMPTY_SOURCE_HEALTH, RawItemInsert, SourceHealth, rawItemId } from "@cc/shared";
import type {
  DbPort,
  RawItemInsert as RawItemInsertType,
  Row,
  SourceAdapter,
  SourceConfig,
  SourceFetchDetail,
  SourceHealth as SourceHealthType,
  Stage,
  StageContext,
} from "@cc/shared";
import { mapConcurrent, sleep } from "../lib/concurrency.ts";
import { hostOf, registrableDomain } from "../lib/url.ts";
import type { SourceRunStat } from "../state.ts";
import { defineStageSpec } from "./spec.ts";
import { IngestInput, IngestOutput } from "./types.ts";

/** 20 canonical URLs keep a PostgREST `in` filter under ~4 KB of request URL. */
const SELECT_CHUNK = 20;
const UPSERT_CHUNK = 50;
const ERROR_CHARS = 300;
const RECENT_MAX = 50;
const SAMPLE_ITEMS = 3;

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function errorCodeOf(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof (error as { code: unknown }).code === "string") return (error as { code: string }).code;
  return error instanceof Error ? error.name : "UNKNOWN";
}

function itemRef(item: unknown, sourceId: string, index: number): string {
  const url = item && typeof item === "object" ? (item as { canonical_url?: unknown }).canonical_url : undefined;
  return typeof url === "string" && url.length > 0 ? url.slice(0, 512) : `${sourceId}#${index}`;
}

function parseHealth(value: unknown): SourceHealthType {
  const parsed = SourceHealth.safeParse(value);
  return parsed.success ? parsed.data : { ...EMPTY_SOURCE_HEALTH, recent: [] };
}

/** A YAML `reviewed_at` strictly after the calendar day of the auto-disable re-enables the source. */
export function reviewClearsAutoDisable(reviewedAt: string | undefined, autoDisabledAt: string): boolean {
  return typeof reviewedAt === "string" && reviewedAt > autoDisabledAt.slice(0, 10);
}

export function contentHash(item: RawItemInsertType): string {
  const payload = item.payload ?? {};
  const body = typeof payload["body_text"] === "string" ? payload["body_text"] : typeof payload["body_preview"] === "string" ? payload["body_preview"] : typeof payload["snippet"] === "string" ? payload["snippet"] : "";
  return createHash("sha256").update(`${item.title}\n${body}`).digest("hex");
}

interface SourceTrack {
  source: SourceConfig;
  /** Effective flag for this run: YAML `enabled` minus a standing auto-disable. */
  enabled: boolean;
  health: SourceHealthType;
  failStreak: number;
  lastOkAt: string | null;
  /** The full `sources` row as mirrored this run; health updates are written on top of it. */
  row: Row;
}

/**
 * A health update is the full mirrored row with the health columns replaced.
 * Two reasons: PostgREST derives the upsert column list from the union of keys
 * and writes NULL for a key a row lacks, so a partial row would wipe other
 * columns on conflict; and PostgreSQL checks NOT NULL (name, type, url, tier,
 * text_rights) on the proposed tuple before `ON CONFLICT DO UPDATE` runs, so a
 * partial row never reaches the update at all.
 */
function sourceHealthRow(track: SourceTrack, enabled: boolean, lastOkAt: string | null, failStreak: number, health: SourceHealthType): Row {
  return { ...track.row, enabled, last_ok_at: lastOkAt, fail_streak: failStreak, health };
}

/** Mirror the YAML rows into `sources` (config columns only) and read back health. */
async function syncSources(db: DbPort, sources: SourceConfig[], ctx: StageContext): Promise<Map<string, SourceTrack>> {
  const existing = new Map<string, Row>();
  for (const chunk of chunks(sources.map((s) => s.id), SELECT_CHUNK)) {
    for (const row of await db.selectIn<Row>("sources", "id", chunk)) existing.set(String(row["id"]), row);
  }
  const tracks = new Map<string, SourceTrack>();
  const mirror: Row[] = [];
  for (const source of sources) {
    const row = existing.get(source.id);
    let health = parseHealth(row?.["health"]);
    let failStreak = typeof row?.["fail_streak"] === "number" ? (row["fail_streak"] as number) : 0;
    const lastOkAt = typeof row?.["last_ok_at"] === "string" ? (row["last_ok_at"] as string) : null;
    let enabled = source.enabled;
    if (source.enabled && health.auto_disabled_at) {
      if (reviewClearsAutoDisable(source.reviewed_at, health.auto_disabled_at)) {
        ctx.logger.info("source re-enabled: reviewed_at is after auto_disabled_at", { source_id: source.id, reviewed_at: source.reviewed_at, auto_disabled_at: health.auto_disabled_at });
        health = { ...health, auto_disabled_at: null };
        failStreak = 0;
      } else {
        enabled = false;
      }
    }
    const mirrorRow: Row = {
      id: source.id,
      name: source.name,
      type: source.type,
      url: source.url,
      tier: source.tier,
      enabled,
      text_rights: source.text_rights,
      terms_url: source.terms_url ?? null,
      reviewed_at: source.reviewed_at ?? null,
      fail_streak: failStreak,
      health,
      last_ok_at: lastOkAt,
    };
    mirror.push(mirrorRow);
    tracks.set(source.id, { source, enabled, health, failStreak, lastOkAt, row: mirrorRow });
  }
  for (const chunk of chunks(mirror, UPSERT_CHUNK)) await db.upsert("sources", chunk, ["id"]);
  return tracks;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * `success_rate_7d` is the share of successful outcomes among the runs recorded
 * in the seven days before `now` (by their own timestamps, so a missed slot or
 * an extra dispatch run does not distort it); `recent` keeps at most RECENT_MAX
 * outcomes, newest last, and an outcome older than the window is ignored even
 * while it is still in the list.
 */
export function healthAfter(track: { health: SourceHealthType; failStreak: number }, ok: boolean, now: Date, itemsKept: number, error: string | null): { health: SourceHealthType; failStreak: number } {
  const recent = [...track.health.recent, { at: now.toISOString(), ok }].slice(-RECENT_MAX);
  const since = now.getTime() - SEVEN_DAYS_MS;
  const sample = recent.filter((outcome) => Date.parse(outcome.at) >= since);
  const rate = sample.length > 0 ? sample.filter((outcome) => outcome.ok).length / sample.length : null;
  return {
    health: {
      success_rate_7d: rate,
      last_error: ok ? track.health.last_error : (error ?? "unknown").slice(0, ERROR_CHARS),
      last_error_at: ok ? track.health.last_error_at : now.toISOString(),
      items_last_run: itemsKept,
      auto_disabled_at: track.health.auto_disabled_at,
      recent,
    },
    failStreak: ok ? 0 : track.failStreak + 1,
  };
}

async function fetchSource(source: SourceConfig, adapter: SourceAdapter, ctx: StageContext): Promise<SourceFetchDetail> {
  if (adapter.fetchDetailed) return adapter.fetchDetailed(source, ctx);
  const items = await adapter.fetch(source, ctx);
  return { items, stats: { listed: items.length, kept: items.length, skipped: {} } };
}

/** Tier 1 failures are errors (alerted in 3i), tier 2 warnings, tier 3 informational. */
function logByTier(ctx: StageContext, source: SourceConfig, message: string, fields: Record<string, unknown>): void {
  const all = { source_id: source.id, tier: source.tier, ...fields };
  if (source.tier === 1) ctx.logger.error(message, all);
  else if (source.tier === 2) ctx.logger.warn(message, all);
  else ctx.logger.info(message, all);
}

interface Outcome {
  source: SourceConfig;
  detail: SourceFetchDetail | null;
  error: unknown;
  ms: number;
}

export const ingestStage: Stage<IngestInput, IngestOutput> = {
  name: "ingest",
  input: IngestInput,
  output: IngestOutput,
  idempotencyKey: (input) => `ingest:${input.sources.map((s) => s.id).sort().join(",")}`,
  async run(input, ctx: StageContext) {
    const cfg = ctx.config.ingest;
    const caps = ctx.config.caps;
    const db = ctx.adapters.db;
    const now = ctx.now;
    const nowIso = now.toISOString();

    const tracks = await syncSources(db, input.sources, ctx);
    const configured = input.sources.filter((source) => source.enabled);
    const active = configured.filter((source) => tracks.get(source.id)?.enabled).sort((a, b) => a.tier - b.tier);

    const perSource: SourceRunStat[] = [];
    const errors: { source_id: string; error: string }[] = [];
    let ok = 0;
    let invalidItems = 0;
    let skippedItems = 0;
    for (const source of configured) {
      const track = tracks.get(source.id);
      if (track && !track.enabled) {
        perSource.push({ source_id: source.id, tier: source.tier, status: "auto_disabled", listed: 0, kept: 0, skipped: {}, ms: 0, error: null, fail_streak: track.failStreak, sample: [] });
        ctx.logger.warn("source skipped: auto-disabled in the sources table", { source_id: source.id, tier: source.tier, fail_streak: track.failStreak, auto_disabled_at: track.health.auto_disabled_at });
      }
    }
    const autoDisabled = perSource.length;

    const outcomes = await mapConcurrent<SourceConfig, Outcome>(active, cfg.concurrency, async (source) => {
      const started = Date.now();
      const adapter = ctx.adapters.sources[source.type];
      if (!adapter) return { source, detail: null, error: new Error(`NO_ADAPTER: no source adapter registered for type "${source.type}"`), ms: 0 };
      try {
        return { source, detail: await fetchSource(source, adapter, ctx), error: null, ms: Date.now() - started };
      } catch (error) {
        return { source, detail: null, error, ms: Date.now() - started };
      }
    });

    const healthRows: Row[] = [];
    const fetched: { item: RawItemInsertType; source: SourceConfig }[] = [];
    for (const outcome of outcomes) {
      const { source } = outcome;
      const track = tracks.get(source.id)!;
      if (!outcome.detail) {
        const message = errorMessage(outcome.error);
        errors.push({ source_id: source.id, error: message });
        await ctx.ledger.deadLetter({ run_id: ctx.runId, stage: "ingest", ref_table: "sources", ref_id: source.id, payload: { url: source.url, tier: source.tier, fail_streak: track.failStreak + 1 }, error: message });
        const next = healthAfter(track, false, now, 0, message);
        let enabled = true;
        if (next.failStreak >= cfg.auto_disable_after && !next.health.auto_disabled_at) {
          enabled = false;
          next.health.auto_disabled_at = nowIso;
          const notice = `SOURCE_AUTO_DISABLED: ${source.id} failed ${next.failStreak} consecutive runs; last error ${message.slice(0, 120)}`;
          await ctx.ledger.deadLetter({ run_id: ctx.runId, stage: "ingest", ref_table: "sources", ref_id: `${source.id}#auto-disable`, payload: { url: source.url, tier: source.tier, fail_streak: next.failStreak }, error: notice });
          ctx.logger.error("source auto-disabled in the sources table; bump reviewed_at in YAML to re-enable", { source_id: source.id, tier: source.tier, fail_streak: next.failStreak });
        }
        logByTier(ctx, source, "source failed; continuing", { error: message, fail_streak: next.failStreak, ms: outcome.ms });
        healthRows.push(sourceHealthRow(track, enabled, track.lastOkAt, next.failStreak, next.health));
        perSource.push({ source_id: source.id, tier: source.tier, status: "failed", listed: 0, kept: 0, skipped: {}, ms: outcome.ms, error: message.slice(0, ERROR_CHARS), fail_streak: next.failStreak, sample: [] });
        continue;
      }

      ok += 1;
      const { items, stats } = outcome.detail;
      const valid: RawItemInsertType[] = [];
      for (const [index, item] of items.entries()) {
        const parsed = RawItemInsert.safeParse(item);
        if (parsed.success) {
          valid.push(parsed.data);
          continue;
        }
        invalidItems += 1;
        const error = `ITEM_INVALID: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`;
        await ctx.ledger.deadLetter({ run_id: ctx.runId, stage: "ingest", ref_table: "raw_items", ref_id: itemRef(item, source.id, index), payload: { source_id: source.id, index }, error });
      }
      valid.sort((a, b) => (b.published_at_source ?? "").localeCompare(a.published_at_source ?? ""));
      const kept = valid.slice(0, caps.items_per_source);
      const skipped: Record<string, number> = { ...stats.skipped };
      if (valid.length > kept.length) skipped["capped"] = (skipped["capped"] ?? 0) + (valid.length - kept.length);
      skippedItems += Object.values(skipped).reduce((sum, n) => sum + n, 0);
      for (const item of kept) fetched.push({ item, source });
      const next = healthAfter(track, true, now, kept.length, null);
      healthRows.push(sourceHealthRow(track, true, nowIso, 0, next.health));
      perSource.push({
        source_id: source.id,
        tier: source.tier,
        status: "ok",
        listed: stats.listed,
        kept: kept.length,
        skipped,
        ms: outcome.ms,
        error: null,
        fail_streak: 0,
        sample: kept.slice(0, SAMPLE_ITEMS).map((item) => ({ title: item.title, url: item.canonical_url, published_at: item.published_at_source ?? null })),
        ...(stats.fetch ? { fetch: stats.fetch } : {}),
      });
      ctx.logger.info("source fetched", { source_id: source.id, tier: source.tier, listed: stats.listed, kept: kept.length, skipped, ms: outcome.ms, invalid: items.length - valid.length });
    }

    // One row per canonical URL; the first source (tier order) wins.
    const seen = new Set<string>();
    let duplicates = 0;
    const unique: typeof fetched = [];
    for (const entry of fetched) {
      if (seen.has(entry.item.canonical_url)) {
        duplicates += 1;
        continue;
      }
      seen.add(entry.item.canonical_url);
      unique.push(entry);
    }

    // Body extraction only where the source grants text rights and the adapter can do it.
    let extractOk = 0;
    let extractFailed = 0;
    const eligible: typeof unique = [];
    for (const entry of unique) {
      const { item, source } = entry;
      if (typeof item.payload?.["body_text"] === "string") {
        extractOk += 1; // the adapter extracted at fetch time (html index sources)
        continue;
      }
      const adapter = ctx.adapters.sources[source.type];
      if (cfg.extract_bodies && source.text_rights === "full" && (source.extract?.kind ?? "generic") !== "none" && typeof adapter?.extract === "function") eligible.push(entry);
    }
    const extractSkipped = unique.length - eligible.length - extractOk;
    // Page requests are serialised per registrable host with a minimum interval (a robots Crawl-delay such as
    // arXiv's 15 s is honoured through `extract.delay_ms`); hosts run in parallel up to extract_concurrency.
    const byHost = new Map<string, { delayMs: number; entries: typeof eligible }>();
    for (const entry of eligible) {
      const host = hostOf(entry.item.canonical_url);
      const key = host ? registrableDomain(host) : entry.source.id;
      const group = byHost.get(key) ?? { delayMs: 0, entries: [] };
      group.delayMs = Math.max(group.delayMs, cfg.extract_host_delay_ms, entry.source.extract?.delay_ms ?? 0);
      group.entries.push(entry);
      byHost.set(key, group);
    }
    await mapConcurrent([...byHost.values()], cfg.extract_concurrency, async (group) => {
      for (const [index, { item, source }] of group.entries.entries()) {
        if (index > 0) await sleep(group.delayMs);
        const adapter = ctx.adapters.sources[source.type]!;
        try {
          const text = await adapter.extract!(item, source, ctx);
          item.payload = { ...(item.payload ?? {}), body_text: text.text, extraction: { ok: true, method: text.method, chars: text.chars } };
          extractOk += 1;
        } catch (error) {
          item.payload = { ...(item.payload ?? {}), extraction: { ok: false, error: errorCodeOf(error), detail: errorMessage(error).slice(0, ERROR_CHARS) } };
          extractFailed += 1;
          ctx.logger.warn("extraction failed; item kept with feed text", { source_id: source.id, url: item.canonical_url, error: errorMessage(error) });
        }
      }
    });

    // items_new before the idempotent upsert (PostgREST cannot report the inserted/updated split).
    const urls = unique.map((entry) => entry.item.canonical_url);
    const existing = new Set<string>();
    for (const chunk of chunks(urls, SELECT_CHUNK)) {
      for (const row of await db.selectIn<Row>("raw_items", "canonical_url", chunk, { columns: ["canonical_url"] })) existing.add(String(row["canonical_url"]));
    }
    // The id is derived from the canonical URL, so an upsert that hits an existing row never changes its primary key.
    const rows: RawItemInsertType[] = unique.map(({ item }) => ({ ...item, id: rawItemId(item.canonical_url), run_id: ctx.runId, content_hash: contentHash(item) }));
    for (const chunk of chunks(rows, UPSERT_CHUNK)) await db.upsert("raw_items", chunk as Row[], ["canonical_url"]);
    const itemsNew = urls.filter((url) => !existing.has(url)).length;
    for (const chunk of chunks(healthRows, UPSERT_CHUNK)) await db.upsert("sources", chunk, ["id"]);

    return {
      rawItems: rows,
      stats: {
        configured: configured.length,
        ok,
        failed: errors.length,
        invalid_items: invalidItems,
        errors,
        auto_disabled: autoDisabled,
        items_new: itemsNew,
        duplicates,
        skipped_items: skippedItems,
        extract_ok: extractOk,
        extract_failed: extractFailed,
        extract_skipped: extractSkipped,
        sources: perSource,
      },
    };
  },
};

export const ingestSpec = defineStageSpec({
  stage: ingestStage,
  select: (state) => ({ sources: state.sources }),
  merge: (state, output) => ({ ...state, rawItems: output.rawItems, sourceStats: output.stats, itemsNew: output.stats.items_new }),
  counts: (output) => ({
    sources_configured: output.stats.configured,
    sources_ok: output.stats.ok,
    sources_failed: output.stats.failed,
    sources_auto_disabled: output.stats.auto_disabled,
    items_fetched: output.rawItems.length,
    items_new: output.stats.items_new,
    items_invalid: output.stats.invalid_items,
    items_duplicate: output.stats.duplicates,
    items_skipped: output.stats.skipped_items,
    extract_ok: output.stats.extract_ok,
    extract_failed: output.stats.extract_failed,
    extract_skipped: output.stats.extract_skipped,
  }),
});
