/**
 * Epoch AI publishes under CC BY 4.0 but ships no feed; its section index
 * pages are server-rendered. This `type: html` adapter reads the index for a
 * handful of article links and each article's own metadata, keeping only
 * pages that carry the licence link (legacy: scripts/lib/epoch-ai.mjs).
 * Because the article page is already in hand, the body is extracted at
 * fetch time and stored in the payload; `extract` returns it without a
 * second request.
 */
import type { ExtractedText, IngestConfig, RawItemInsert, SourceAdapter, SourceConfig, SourceFetchDetail, SourceFetchStats, StageContext } from "@cc/shared";
import { isFutureDate, olderThanDays, parseDateCandidate } from "../../lib/dates.ts";
import { cleanText, metaContent, truncate } from "../../lib/html.ts";
import { hostOf } from "../../lib/url.ts";
import { CC_BY_4_URL, extractEpoch, ExtractionError } from "./extract.ts";
import type { Extraction } from "./extract.ts";
import { PAGE_CONTENT_TYPES, SourceFetchError, safeFetchText, withRetry } from "./net.ts";
import type { HostResolver } from "./net.ts";
import { HostPacer } from "./pacer.ts";

export const EPOCH_HOST = "epoch.ai";
export const EPOCH_INDEX_ARTICLE_LIMIT = 5;
const ARTICLE_PATH = /^\/(gradient-updates|data-insights)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/;
const DATE_PATTERN = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+20\d{2}\b/;

export function epochArticleTarget(value: string): { url: string; prefix: string; slug: string } | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== EPOCH_HOST || url.port || url.username || url.password || url.search || url.hash) return null;
  const match = url.pathname.match(ARTICLE_PATH);
  if (!match) return null;
  return { url: `https://${EPOCH_HOST}/${match[1]}/${match[2]}/`, prefix: `/${match[1]}/`, slug: match[2]! };
}

export interface EpochIndexListing {
  /** Article links to fetch: inside the age window, in index order, at most `limit`. */
  links: string[];
  /** Distinct section links the index actually listed, before the age window and the limit. */
  listed: number;
  /** `too_old` (listing date outside the window) and `capped` (beyond the limit), as the feed adapter reports them. */
  skipped: Record<string, number>;
}

/**
 * The section's article links with the telemetry of what the index listed. The listing date just before a link
 * decides whether it is too old; links without a readable date are kept. Counting happens before the age window
 * and the limit, so a stale index (`listed: 5, too_old: 5`) is distinguishable from a parser that found nothing.
 */
export function listEpochIndex(html: string, prefix: string, limit: number, now: Date, maxAgeDays: number): EpochIndexListing {
  const links: string[] = [];
  const seen = new Set<string>();
  const skipped: Record<string, number> = {};
  let lastIndex = 0;
  for (const match of html.matchAll(/href=["']([^"'#?]+)["']/gi)) {
    const raw = match[1]!.startsWith("/") ? `https://${EPOCH_HOST}${match[1]}` : match[1]!;
    const target = epochArticleTarget(raw);
    if (!target || target.prefix !== prefix || seen.has(target.url)) continue;
    seen.add(target.url);
    const listing = cleanText(html.slice(lastIndex, match.index).slice(-1500)).match(DATE_PATTERN)?.[0];
    lastIndex = (match.index ?? 0) + match[0].length;
    const listingDate = listing ? parseDateCandidate(listing) : null;
    if (listingDate && olderThanDays(listingDate.toISOString(), maxAgeDays, now)) {
      skipped["too_old"] = (skipped["too_old"] ?? 0) + 1;
      continue;
    }
    if (links.length >= limit) {
      skipped["capped"] = (skipped["capped"] ?? 0) + 1;
      continue;
    }
    links.push(target.url);
  }
  return { links, listed: seen.size, skipped };
}

/** The links alone (see listEpochIndex). */
export function epochIndexLinks(html: string, prefix: string, limit: number, now: Date, maxAgeDays: number): string[] {
  return listEpochIndex(html, prefix, limit, now, maxAgeDays).links;
}

export function epochPublishedAt(html: string): string | null {
  const headerIndex = html.search(/class=["'][^"']*\bcontent-header\b/i);
  const region = headerIndex >= 0 ? html.slice(headerIndex, headerIndex + 6000) : html;
  const text = cleanText(region).match(DATE_PATTERN)?.[0] ?? cleanText(html).match(DATE_PATTERN)?.[0];
  const date = text ? parseDateCandidate(text) : null;
  return date ? date.toISOString() : null;
}

export function epochArticleMetadata(html: string, url: string): { title: string; description: string; publishedAt: string; url: string } | null {
  const target = epochArticleTarget(url);
  if (!target || !(html.includes(`href="${CC_BY_4_URL}"`) || html.includes(`href='${CC_BY_4_URL}'`))) return null;
  const title =
    metaContent(html, "og:title") ||
    cleanText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "") ||
    cleanText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s*\|\s*Epoch AI\s*$/i, "");
  const publishedAt = epochPublishedAt(html);
  if (!title || !publishedAt) return null;
  return { title, description: metaContent(html, "og:description") || metaContent(html, "description"), publishedAt, url: target.url };
}

export interface EpochIndexOptions {
  ingest: IngestConfig;
  defaultMaxAgeDays: number;
  itemsPerSource: number;
  resolveHost?: HostResolver;
  /** Shared with the other live adapters: both Epoch sources pace their epoch.ai requests through one queue. */
  pacer?: HostPacer;
}

export function createEpochIndexAdapter(options: EpochIndexOptions): SourceAdapter {
  const pacer = options.pacer ?? new HostPacer();
  const pageDelayMs = (source: SourceConfig) => Math.max(options.ingest.extract_host_delay_ms, source.extract?.delay_ms ?? 0);
  // Index and article pages share the per-source retry with the feed adapter; every attempt (first or retry) takes
  // the host's slot from the shared pacer, so two Epoch sources never interleave requests inside the interval.
  const fetchPage = (url: string, source: SourceConfig, ctx: StageContext) =>
    withRetry(
      async () => {
        await pacer.acquire(EPOCH_HOST, pageDelayMs(source));
        return safeFetchText(url, {
          fetch: ctx.fetch,
          timeoutMs: options.ingest.page_timeout_ms,
          maxBytes: options.ingest.max_body_bytes,
          userAgent: options.ingest.user_agent,
          accept: "text/html, application/xhtml+xml;q=0.9",
          allowedHosts: [EPOCH_HOST],
          contentTypes: PAGE_CONTENT_TYPES,
          ...(options.resolveHost ? { resolveHost: options.resolveHost } : {}),
        });
      },
      options.ingest.retry_attempts,
      options.ingest.retry_backoff_ms,
    );

  const fetchDetailed = async (source: SourceConfig, ctx: StageContext): Promise<SourceFetchDetail> => {
    if (hostOf(source.url) !== EPOCH_HOST) throw new ExtractionError("EXTRACTION_FAILED", `${source.id}: epoch_index adapter needs an epoch.ai index url`);
    const prefix = new URL(source.url).pathname.replace(/\/?$/, "/");
    const maxAge = source.pool_max_age_days ?? options.defaultMaxAgeDays;
    const started = Date.now();
    const index = await fetchPage(source.url, source, ctx);
    const listing = listEpochIndex(index.text, prefix, Math.min(EPOCH_INDEX_ARTICLE_LIMIT, options.itemsPerSource), ctx.now, maxAge);
    const links = listing.links;
    const stats: SourceFetchStats = { listed: listing.listed, kept: 0, skipped: { ...listing.skipped }, fetch: { url: index.url, bytes: index.bytes, redirects: index.redirects, ms: Date.now() - started } };
    const items: RawItemInsert[] = [];
    let fetchFailures = 0;
    let lastFetchError: string | null = null;
    for (const link of links) {
      try {
        const page = await fetchPage(link, source, ctx);
        const meta = epochArticleMetadata(page.text, link);
        if (!meta) {
          stats.skipped["unlicensed_or_no_metadata"] = (stats.skipped["unlicensed_or_no_metadata"] ?? 0) + 1;
          continue;
        }
        if (isFutureDate(meta.publishedAt, ctx.now)) {
          stats.skipped["date_future"] = (stats.skipped["date_future"] ?? 0) + 1;
          continue;
        }
        if (olderThanDays(meta.publishedAt, maxAge, ctx.now)) {
          stats.skipped["too_old"] = (stats.skipped["too_old"] ?? 0) + 1;
          continue;
        }
        // The page is CC BY 4.0, but the same gate as ingest's extraction pass decides whether the body is stored:
        // `ingest.extract_bodies` (the kill switch), `text_rights: full`, and an extract kind other than `none`.
        // A `link_only` source keeps the title and link alone.
        const extractBody = options.ingest.extract_bodies && source.text_rights === "full" && (source.extract?.kind ?? "epoch_index") !== "none";
        // A licensed page whose body cannot be extracted (the body container holds no text, or the publisher changed
        // its markup and the selector throws) is an extraction failure, not usable source material (AGENTS.md
        // editorial rule) and not a lost article: the item keeps its title, link and description, carries no
        // body_text, records the failure and counts as extract_failed in ingest. Only a network error is a skip.
        let body: Extraction | null = null;
        let failure: { error: string; detail: string } | null = null;
        if (extractBody) {
          try {
            body = extractEpoch(page.text);
            if (body.text.trim().length === 0) failure = { error: "EXTRACTION_EMPTY", detail: `${body.method}: body container holds no text` };
          } catch (error) {
            if (!(error instanceof ExtractionError)) throw error;
            failure = { error: error.code, detail: error.message.startsWith(`${error.code}: `) ? error.message.slice(error.code.length + 2) : error.message };
          }
        }
        const extracted = body !== null && failure === null;
        if (failure) ctx.logger.warn("epoch article body not extracted; item kept without body_text", { source_id: source.id, link, ...failure });
        items.push({
          source_id: source.id,
          canonical_url: meta.url,
          title: meta.title,
          published_at_source: meta.publishedAt,
          fetched_at: ctx.now.toISOString(),
          payload: {
            guid: meta.url,
            ...(source.text_rights === "link_only" ? {} : { snippet: truncate(meta.description || (extracted && body ? body.text : ""), options.ingest.snippet_chars) }),
            ...(extracted && body
              ? { body_preview: truncate(body.text, options.ingest.body_preview_chars), body_text: body.text, extraction: { ok: true, method: body.method, chars: body.chars, limit_exceeded: body.limitExceeded } }
              : failure
                ? { extraction: { ok: false, ...failure } }
                : {}),
            image: null,
            categories: [],
            text_rights: source.text_rights,
            text_scope: source.text_scope ?? "full",
            language: source.language ?? null,
            tier: source.tier,
            product: null,
          },
        });
      } catch (error) {
        const code = error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "EXTRACTION_FAILED";
        stats.skipped[code.toLowerCase()] = (stats.skipped[code.toLowerCase()] ?? 0) + 1;
        if (error instanceof SourceFetchError) {
          fetchFailures += 1;
          lastFetchError = error.message;
        }
        ctx.logger.warn("epoch article skipped", { source_id: source.id, link, error: error instanceof Error ? error.message : String(error) });
      }
    }
    // One unreachable article is an item skip; every listed article unreachable is the source failing (health, streak, auto-disable).
    if (links.length > 0 && fetchFailures === links.length) {
      throw new SourceFetchError("SOURCE_UNREACHABLE", `all ${links.length} article requests failed; last: ${lastFetchError ?? "unknown"}`);
    }
    stats.kept = items.length;
    return { items, stats };
  };

  return {
    type: "html",
    async fetch(source, ctx) {
      return (await fetchDetailed(source, ctx)).items;
    },
    fetchDetailed,
    async extract(item): Promise<ExtractedText> {
      const text = typeof item.payload?.["body_text"] === "string" ? (item.payload["body_text"] as string) : "";
      if (!text.trim()) {
        // Surface the failure recorded at fetch time (EXTRACTION_EMPTY, EXTRACTION_FAILED, …) so ingest counts it by its code.
        const recorded = item.payload?.["extraction"];
        const failure = recorded && typeof recorded === "object" && (recorded as { ok?: unknown }).ok === false ? (recorded as { error?: unknown; detail?: unknown }) : null;
        throw new ExtractionError(typeof failure?.error === "string" ? failure.error : "EXTRACTION_EMPTY", typeof failure?.detail === "string" ? failure.detail : "epoch item carries no body_text (empty body at fetch time)");
      }
      return { text, chars: text.length, method: "epoch_index:payload" };
    },
  };
}
