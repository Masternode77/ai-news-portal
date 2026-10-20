/**
 * Live RSS/Atom source adapter (Phase 3a). Fetches one feed through the
 * safety wrapper, parses it without dependencies, and maps entries to
 * RawItemInsert rows with the legacy rules carried over as configuration:
 * tracking-param stripping, https upgrade, Drupal dates, age window,
 * per-source cap, host/path allowlists, the Google Cloud release-notes
 * section rule, and no body extraction for rewrite_only / link_only sources.
 */
import type { ExtractedText, IngestConfig, RawItemInsert, SourceAdapter, SourceConfig, SourceFetchDetail, SourceFetchStats, StageContext } from "@cc/shared";
import { parsePublishedAt, olderThanDays } from "../../lib/dates.ts";
import { cleanText, truncate } from "../../lib/html.ts";
import { cleanItemUrl, googleReleaseNoteTarget, hostAllowed, hostOf, pathWithinPrefix, registrableDomain, repairFeedLink } from "../../lib/url.ts";
import { ecPressApiUrl, runExtraction } from "./extract.ts";
import { parseFeed } from "./feed-parser.ts";
import type { FeedItem } from "./feed-parser.ts";
import { FEED_CONTENT_TYPES, JSON_CONTENT_TYPES, PAGE_CONTENT_TYPES, SourceFetchError, safeFetchText, withRetry } from "./net.ts";
import type { HostResolver } from "./net.ts";

export interface LiveRssOptions {
  ingest: IngestConfig;
  /** caps.pool_max_age_days unless the source overrides it. */
  defaultMaxAgeDays: number;
  /** caps.items_per_source */
  itemsPerSource: number;
  resolveHost?: HostResolver;
}

/** The feed host, its registrable domain and every subdomain of it (feeds redirect between `feeds.`/`www.`/bare), plus `extract.hosts`. */
export function allowedHostsFor(source: SourceConfig): string[] {
  const feedHost = hostOf(source.url);
  const domain = feedHost ? registrableDomain(feedHost) : null;
  const configured = source.extract?.hosts ?? [];
  return [...new Set([feedHost, domain, domain ? `*.${domain}` : null, ...configured].filter((h): h is string => typeof h === "string" && h.length > 0))];
}

export interface MappedItem {
  item: RawItemInsert | null;
  skip: string | null;
}

function firstSentence(text: string): string {
  return text.split(/(?<=[.!?])\s/)[0] ?? text;
}

function googleSection(contentHtml: string, heading: string | undefined): string | null {
  if (!heading) return contentHtml;
  const marker = new RegExp(`<h2\\b[^>]*>${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</h2>`, "i").exec(contentHtml);
  if (!marker) return null;
  const rest = contentHtml.slice(marker.index + marker[0].length);
  const end = rest.search(/<h2\b/i);
  return end < 0 ? rest : rest.slice(0, end);
}

/** Pure mapping of one feed entry to a raw item, or the reason it was skipped. */
export function mapFeedItem(entry: FeedItem, source: SourceConfig, options: LiveRssOptions, now: Date, allowedHosts: string[]): MappedItem {
  const isGoogle = source.extract?.kind === "google_release_notes";
  let title = cleanText(entry.title);
  const rawLink = entry.link ?? (entry.guid && /^https?:\/\//i.test(entry.guid) ? entry.guid : null);
  if (!rawLink) return { item: null, skip: "no_url" };
  let url = cleanItemUrl(repairFeedLink(rawLink, source.url), { keepFragment: isGoogle });
  if (!url) return { item: null, skip: "no_url" };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { item: null, skip: "no_url" };
  }
  // Hosts are only enforced where the pipeline will fetch the page (text_rights: full); link-only and
  // rewrite-only items are never fetched, so a feed may point at any public https host.
  if (source.text_rights === "full" && !hostAllowed(parsed.hostname, allowedHosts)) return { item: null, skip: "offhost" };

  let contentHtml = entry.contentHtml;
  let product: string | null = null;
  if (isGoogle) {
    // The all-GCP feed lists one /release-notes page per date; keep the configured product section and
    // point the link at the product's own release-notes path (legacy scopeGoogleAiReleaseItem).
    if (source.extract?.section) {
      const section = googleSection(contentHtml, source.extract.section);
      if (section === null) return { item: null, skip: "section_missing" };
      contentHtml = section;
      if (source.extract.path && parsed.pathname === "/release-notes") {
        parsed.pathname = source.extract.path;
        url = parsed.toString();
      }
    }
    const target = googleReleaseNoteTarget(url);
    if (!target) return { item: null, skip: "not_dated_release_note" };
    product = target.product;
    const lead = cleanText(contentHtml.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "");
    title = `${product}: ${truncate(firstSentence(lead || title), 140)}`;
  }
  if (source.extract?.path && parsed.pathname !== source.extract.path) return { item: null, skip: "path_not_allowed" };
  if (source.extract?.path_prefix && !pathWithinPrefix(parsed, source.extract.path_prefix)) return { item: null, skip: "path_not_allowed" };

  if (title.length < options.ingest.min_title_chars) return { item: null, skip: "title_length" };
  // Long titles (Federal Register notices run past 400 chars) are kept and cut, never skipped.
  title = truncate(title, options.ingest.max_title_chars);

  const date = parsePublishedAt(entry.dates, now);
  if (date.problem === "missing") return { item: null, skip: "date_missing" };
  if (date.problem === "future") return { item: null, skip: "date_future" };
  if (date.problem || !date.iso) return { item: null, skip: "date_invalid" };
  const maxAge = source.pool_max_age_days ?? options.defaultMaxAgeDays;
  if (olderThanDays(date.iso, maxAge, now)) return { item: null, skip: "too_old" };

  const bodyText = cleanText(contentHtml);
  const summaryText = cleanText(entry.summaryHtml) || bodyText;
  const image = entry.image ? cleanItemUrl(entry.image) : null;
  return {
    item: {
      source_id: source.id,
      canonical_url: url,
      title,
      published_at_source: date.iso,
      fetched_at: now.toISOString(),
      payload: {
        guid: entry.guid,
        snippet: truncate(summaryText, options.ingest.snippet_chars),
        body_preview: truncate(bodyText, options.ingest.body_preview_chars),
        image,
        categories: entry.categories,
        text_rights: source.text_rights,
        text_scope: source.text_scope ?? "full",
        language: source.language ?? null,
        tier: source.tier,
        product,
      },
    },
    skip: null,
  };
}

export function createLiveRssAdapter(options: LiveRssOptions): SourceAdapter {
  const fetchDetailed = async (source: SourceConfig, ctx: StageContext): Promise<SourceFetchDetail> => {
    const allowedHosts = allowedHostsFor(source);
    const started = Date.now();
    const response = await withRetry(
      () =>
        safeFetchText(source.url, {
          fetch: ctx.fetch,
          timeoutMs: options.ingest.feed_timeout_ms,
          maxBytes: options.ingest.max_body_bytes,
          userAgent: options.ingest.user_agent,
          allowedHosts,
          contentTypes: FEED_CONTENT_TYPES,
          ...(options.resolveHost ? { resolveHost: options.resolveHost } : {}),
        }),
      options.ingest.retry_attempts,
      options.ingest.retry_backoff_ms,
    );
    if (!/<(rss|feed|rdf:RDF|channel)[\s>]/i.test(response.text)) throw new SourceFetchError("FEED_PARSE", `no rss/atom/rdf root element in ${response.url} (${response.contentType || "no content-type"}, ${response.bytes} bytes)`);
    const feed = parseFeed(response.text);
    const stats: SourceFetchStats = { listed: feed.items.length, kept: 0, skipped: {}, fetch: { url: response.url, bytes: response.bytes, redirects: response.redirects, ms: Date.now() - started } };
    const seen = new Set<string>();
    const kept: RawItemInsert[] = [];
    for (const entry of feed.items) {
      const mapped = mapFeedItem(entry, source, options, ctx.now, allowedHosts);
      if (!mapped.item) {
        stats.skipped[mapped.skip ?? "unknown"] = (stats.skipped[mapped.skip ?? "unknown"] ?? 0) + 1;
        continue;
      }
      if (seen.has(mapped.item.canonical_url)) {
        stats.skipped["duplicate"] = (stats.skipped["duplicate"] ?? 0) + 1;
        continue;
      }
      seen.add(mapped.item.canonical_url);
      kept.push(mapped.item);
    }
    kept.sort((a, b) => (b.published_at_source ?? "").localeCompare(a.published_at_source ?? ""));
    const capped = kept.slice(0, options.itemsPerSource);
    if (kept.length > capped.length) stats.skipped["capped"] = kept.length - capped.length;
    stats.kept = capped.length;
    return { items: capped, stats };
  };

  return {
    type: "rss",
    async fetch(source, ctx) {
      return (await fetchDetailed(source, ctx)).items;
    },
    fetchDetailed,
    async extract(item, source, ctx): Promise<ExtractedText> {
      const kind = source.extract?.kind ?? "generic";
      if (source.text_rights !== "full" || kind === "none") throw new SourceFetchError("TEXT_USE_NOT_AUTHORIZED", `${source.id} is ${source.text_rights}`);
      const allowedHosts = allowedHostsFor(source);
      const apiUrl = kind === "ec_press" ? ecPressApiUrl(item.canonical_url) : null;
      const response = await withRetry(
        () =>
          safeFetchText(apiUrl ?? item.canonical_url, {
            fetch: ctx.fetch,
            timeoutMs: options.ingest.page_timeout_ms,
            maxBytes: options.ingest.max_body_bytes,
            userAgent: options.ingest.user_agent,
            accept: apiUrl ? "application/json" : "text/html, application/xhtml+xml;q=0.9, */*;q=0.5",
            allowedHosts,
            contentTypes: apiUrl ? JSON_CONTENT_TYPES : PAGE_CONTENT_TYPES,
            ...(options.resolveHost ? { resolveHost: options.resolveHost } : {}),
          }),
        options.ingest.retry_attempts,
        // A retry to the publisher's host keeps the host's request spacing (arXiv: 15 s), not only the global backoff.
        Math.max(options.ingest.retry_backoff_ms, options.ingest.extract_host_delay_ms, source.extract?.delay_ms ?? 0),
      );
      const extraction = runExtraction({ kind, url: item.canonical_url, body: response.text, licenseMarker: source.extract?.license_marker });
      return { text: extraction.text, chars: extraction.chars, method: extraction.method };
    },
  };
}
