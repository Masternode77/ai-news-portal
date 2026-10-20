/**
 * normalize — Phase 3b. Turns the run's raw items into unscored candidates by
 * removing (1) items whose story is already published and (2) copies of one
 * story inside the pool. Every rejection is written to `candidates` with
 * `selected = false` and a reject_reason (ADR-003; ADR-004 DUPLICATE_OF_PUBLISHED),
 * so "why was this never published" has an answer in the table (R6).
 *
 * Decision order, cheapest rule first:
 *   published  URL identity of any `publications.sources[].url` (unbounded in time), then
 *              title token Dice ≥ `normalize.title_similarity` against the title and the
 *              sources[].title of publications inside `normalize.published_window_days`.
 *   pool       URL identity → content_hash → title key → title Dice → body shingle Jaccard
 *              ≥ `normalize.body_similarity` (both bodies ≥ `body_min_tokens`). The copy kept
 *              is the one with the best text rights, then the lowest tier, then the longest body.
 *
 * Survivors are returned in memory; score (3c) writes their scored rows. The
 * stage is deterministic and touches no network (R7).
 */
import { rawItemId } from "@cc/shared";
import type { CandidateInsert, DbPort, RawItemInsert, Row, SourceConfig, Stage, StageContext, TextRights } from "@cc/shared";
import { dice, jaccard, shingles, textTokens, titleKey, titleTokens } from "../lib/similarity.ts";
import { urlIdentityKey } from "../lib/url.ts";
import type { NormalizeDecision, NormalizeStats } from "../state.ts";
import { defineStageSpec } from "./spec.ts";
import { NormalizeInput, NormalizeOutput } from "./types.ts";

export const DUPLICATE_OF_PUBLISHED = "DUPLICATE_OF_PUBLISHED";
export const DUPLICATE_IN_POOL = "DUPLICATE_IN_POOL";
const DECISION_SAMPLE = 100;
const UPSERT_CHUNK = 50;
const SHINGLE_SIZE = 5;
const RIGHTS_RANK: Record<TextRights, number> = { full: 0, rewrite_only: 1, link_only: 2 };

export function rubricVersion(version: string): string {
  return `normalize/${version}`;
}

/** `<CODE>: <method>=<duplicate_of>` — the code is first so `errorCode()`-style parsing recovers it (R6). */
export function rejectReason(code: string, method: string, duplicateOf: string): string {
  return `${code}: ${method}=${duplicateOf}`;
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 1) if (i % size === 0) out.push(items.slice(i, i + size));
  return out;
}

/** Longest text the item carries: extracted body, feed body preview, snippet, or a fixture description. */
export function bodyTextOf(item: RawItemInsert): string {
  const payload = item.payload ?? {};
  for (const key of ["body_text", "body_preview", "snippet", "description"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return "";
}

interface PoolItem {
  item: RawItemInsert;
  id: string;
  source: SourceConfig | undefined;
  urlKey: string;
  titleKey: string;
  titleTokens: Set<string>;
  bodyTokens: string[];
  shingleSet: Set<string> | null;
}

function poolItem(item: RawItemInsert, sources: ReadonlyMap<string, SourceConfig>): PoolItem {
  const body = bodyTextOf(item);
  return {
    item,
    id: item.id ?? rawItemId(item.canonical_url),
    source: sources.get(item.source_id),
    urlKey: urlIdentityKey(item.canonical_url) ?? item.canonical_url,
    titleKey: titleKey(item.title),
    titleTokens: titleTokens(item.title),
    bodyTokens: textTokens(body),
    shingleSet: null,
  };
}

function shinglesOf(entry: PoolItem): Set<string> {
  if (!entry.shingleSet) entry.shingleSet = shingles(entry.bodyTokens, SHINGLE_SIZE);
  return entry.shingleSet;
}

/** Which copy of a story survives: text rights (full first), tier, longer body, then URL for determinism. */
export function preferenceOrder(a: PoolItem, b: PoolItem): number {
  const rights = RIGHTS_RANK[a.source?.text_rights ?? "link_only"] - RIGHTS_RANK[b.source?.text_rights ?? "link_only"];
  if (rights !== 0) return rights;
  const tier = (a.source?.tier ?? 3) - (b.source?.tier ?? 3);
  if (tier !== 0) return tier;
  const body = b.bodyTokens.length - a.bodyTokens.length;
  if (body !== 0) return body;
  return a.item.canonical_url.localeCompare(b.item.canonical_url);
}

export interface PublishedIndex {
  /** URL identity key → publication slug, for every source URL of every published row. */
  urlKeys: Map<string, string>;
  /** Publications inside the title window with the token sets of their title and source titles. */
  recent: { slug: string; titles: Set<string>[] }[];
  compared: number;
}

export async function loadPublishedIndex(db: DbPort, now: Date, windowDays: number, limit: number): Promise<PublishedIndex> {
  const rows = await db.select<Row>("publications", { status: "published" }, { columns: ["slug", "title", "sources", "published_at"], limit, orderBy: { column: "published_at", ascending: false } });
  const since = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const urlKeys = new Map<string, string>();
  const recent: PublishedIndex["recent"] = [];
  for (const row of rows) {
    const slug = typeof row["slug"] === "string" ? row["slug"] : "";
    if (!slug) continue;
    const titles: string[] = typeof row["title"] === "string" ? [row["title"]] : [];
    const sources = Array.isArray(row["sources"]) ? (row["sources"] as unknown[]) : [];
    for (const source of sources) {
      if (!source || typeof source !== "object") continue;
      const { url, title } = source as { url?: unknown; title?: unknown };
      if (typeof url === "string") {
        const key = urlIdentityKey(url);
        if (key && !urlKeys.has(key)) urlKeys.set(key, slug);
      }
      if (typeof title === "string") titles.push(title);
    }
    const publishedAt = typeof row["published_at"] === "string" ? Date.parse(row["published_at"]) : Number.NaN;
    if (Number.isFinite(publishedAt) && publishedAt >= since) {
      const sets = titles.map(titleTokens).filter((set) => set.size > 0);
      if (sets.length > 0) recent.push({ slug, titles: sets });
    }
  }
  return { urlKeys, recent, compared: rows.length };
}

export const normalizeStage: Stage<NormalizeInput, NormalizeOutput> = {
  name: "normalize",
  input: NormalizeInput,
  output: NormalizeOutput,
  idempotencyKey: (input) => `normalize:${input.rawItems.map((item) => item.canonical_url).sort().join("|")}`,
  async run(input, ctx: StageContext) {
    const started = Date.now();
    const cfg = ctx.config.normalize;
    const db = ctx.adapters.db;
    const version = rubricVersion(cfg.version);
    const sources = new Map(input.sources.map((source) => [source.id, source]));
    const pool = input.rawItems.map((item) => poolItem(item, sources));
    const published = await loadPublishedIndex(db, ctx.now, cfg.published_window_days, cfg.published_limit);

    const decisions: NormalizeDecision[] = [];
    const byMethod: Record<string, number> = {};
    const rejectedRows: Row[] = [];
    let duplicateOfPublished = 0;
    let duplicateInPool = 0;
    const reject = (entry: PoolItem, code: string, method: string, duplicateOf: string, score: number | null): void => {
      if (code === DUPLICATE_OF_PUBLISHED) duplicateOfPublished += 1;
      else duplicateInPool += 1;
      byMethod[method] = (byMethod[method] ?? 0) + 1;
      if (decisions.length < DECISION_SAMPLE) decisions.push({ canonical_url: entry.item.canonical_url, source_id: entry.item.source_id, reason: code, method, duplicate_of: duplicateOf, score });
      rejectedRows.push({
        raw_item_id: entry.id,
        run_id: ctx.runId,
        rubric_version: version,
        scores: { relevance: 0, timeliness: 0, impact: 0, reader_value: 0, insight_potential: 0 },
        total: 0,
        selected: false,
        reject_reason: rejectReason(code, method, duplicateOf),
      });
      ctx.logger.info("normalize: item rejected", { source_id: entry.item.source_id, url: entry.item.canonical_url, reason: code, method, duplicate_of: duplicateOf, score });
    };

    // 1. Already published: URL identity (any age), then title similarity inside the window.
    const unpublished: PoolItem[] = [];
    for (const entry of pool) {
      const slug = published.urlKeys.get(entry.urlKey);
      if (slug) {
        reject(entry, DUPLICATE_OF_PUBLISHED, "url", slug, null);
        continue;
      }
      let best: { slug: string; score: number } | null = null;
      for (const publication of published.recent) {
        for (const tokens of publication.titles) {
          const score = dice(entry.titleTokens, tokens);
          if (score >= cfg.title_similarity && (!best || score > best.score)) best = { slug: publication.slug, score };
        }
      }
      if (best) {
        reject(entry, DUPLICATE_OF_PUBLISHED, "title", best.slug, Number(best.score.toFixed(3)));
        continue;
      }
      unpublished.push(entry);
    }

    // 2. One copy per story inside the pool; the preferred copy is seen first and becomes the winner.
    unpublished.sort(preferenceOrder);
    const winners: PoolItem[] = [];
    const byUrl = new Map<string, PoolItem>();
    const byHash = new Map<string, PoolItem>();
    const byTitleKey = new Map<string, PoolItem>();
    for (const entry of unpublished) {
      const sameUrl = byUrl.get(entry.urlKey);
      if (sameUrl) {
        reject(entry, DUPLICATE_IN_POOL, "url", sameUrl.item.canonical_url, null);
        continue;
      }
      const hash = entry.item.content_hash ?? null;
      const sameHash = hash ? byHash.get(hash) : undefined;
      if (sameHash) {
        reject(entry, DUPLICATE_IN_POOL, "hash", sameHash.item.canonical_url, null);
        continue;
      }
      const sameTitle = entry.titleKey ? byTitleKey.get(entry.titleKey) : undefined;
      if (sameTitle) {
        reject(entry, DUPLICATE_IN_POOL, "title_key", sameTitle.item.canonical_url, null);
        continue;
      }
      let match: { winner: PoolItem; method: string; score: number } | null = null;
      for (const winner of winners) {
        const title = dice(entry.titleTokens, winner.titleTokens);
        if (title >= cfg.title_similarity) {
          match = { winner, method: "title", score: title };
          break;
        }
        if (entry.bodyTokens.length >= cfg.body_min_tokens && winner.bodyTokens.length >= cfg.body_min_tokens) {
          const body = jaccard(shinglesOf(entry), shinglesOf(winner));
          if (body >= cfg.body_similarity) {
            match = { winner, method: "body", score: body };
            break;
          }
        }
      }
      if (match) {
        reject(entry, DUPLICATE_IN_POOL, match.method, match.winner.item.canonical_url, Number(match.score.toFixed(3)));
        continue;
      }
      winners.push(entry);
      byUrl.set(entry.urlKey, entry);
      if (hash) byHash.set(hash, entry);
      if (entry.titleKey) byTitleKey.set(entry.titleKey, entry);
    }

    // 3. Rejections are durable (idempotent per raw item and rule version); survivors stay in memory for score.
    for (const chunk of chunks(rejectedRows, UPSERT_CHUNK)) await db.upsert("candidates", chunk, ["raw_item_id", "rubric_version"]);
    const candidates: CandidateInsert[] = winners.map((entry) => ({
      raw_item_id: entry.id,
      run_id: ctx.runId,
      rubric_version: version,
      scores: { relevance: 0, timeliness: 0, impact: 0, reader_value: 0, insight_potential: 0 },
      total: 0,
      selected: false,
      reject_reason: null,
    }));
    const stats: NormalizeStats = {
      pool: pool.length,
      candidates: candidates.length,
      rejected: rejectedRows.length,
      duplicate_of_published: duplicateOfPublished,
      duplicate_in_pool: duplicateInPool,
      by_method: byMethod,
      published_compared: published.compared,
      published_in_window: published.recent.length,
      decisions,
      ms: Date.now() - started,
    };
    ctx.logger.info("normalize: pool reduced to candidates", { pool: stats.pool, candidates: stats.candidates, rejected: stats.rejected, duplicate_of_published: duplicateOfPublished, duplicate_in_pool: duplicateInPool, by_method: byMethod, published_compared: published.compared });
    return { candidates, stats };
  },
};

export const normalizeSpec = defineStageSpec({
  stage: normalizeStage,
  select: (state) => ({ rawItems: state.rawItems, sources: state.sources }),
  merge: (state, output) => ({ ...state, candidates: output.candidates, normalizeStats: output.stats }),
  counts: (output) => ({
    pool: output.stats.pool,
    candidates: output.stats.candidates,
    rejected: output.stats.rejected,
    duplicate_of_published: output.stats.duplicate_of_published,
    duplicate_in_pool: output.stats.duplicate_in_pool,
    ...Object.fromEntries(Object.entries(output.stats.by_method).map(([method, count]) => [`method_${method}`, count])),
    published_compared: output.stats.published_compared,
  }),
});
