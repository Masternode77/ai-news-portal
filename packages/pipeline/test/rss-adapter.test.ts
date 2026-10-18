import { test } from "node:test";
import assert from "node:assert/strict";
import { IngestConfig, silentLogger } from "@cc/shared";
import type { SourceConfig, StageContext } from "@cc/shared";
import { allowedHostsFor, createLiveRssAdapter, mapFeedItem } from "../src/adapters/index.ts";
import type { FeedItem, LiveRssOptions } from "../src/adapters/index.ts";
import { createBudget } from "../src/budget.ts";
import { baseRunOptions } from "./helpers.ts";

const NOW = new Date("2026-10-18T00:45:00Z");
const RESOLVE = async () => ["93.184.216.34"];

function options(overrides: Partial<LiveRssOptions> = {}): LiveRssOptions {
  return { ingest: IngestConfig.parse({ retry_backoff_ms: 0 }), defaultMaxAgeDays: 10, itemsPerSource: 3, resolveHost: RESOLVE, ...overrides };
}

function source(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return { id: "example-feed", name: "Example", type: "rss", url: "https://feeds.example.com/rss.xml", tier: 2, enabled: true, text_rights: "rewrite_only", ...overrides };
}

function entry(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "A sufficiently long headline",
    link: "http://www.example.com/a?utm_source=x&id=1",
    guid: null,
    dates: ["Fri, 17 Oct 2026 12:00:00 GMT"],
    contentHtml: "<p>Body text for the item.</p>",
    summaryHtml: "Summary text",
    image: null,
    categories: ["ai"],
    ...overrides,
  };
}

function ctx(fetchImpl: typeof globalThis.fetch): StageContext {
  const base = baseRunOptions();
  return {
    runId: "11111111-1111-4111-8111-111111111111",
    now: NOW,
    config: base.config,
    logger: silentLogger(),
    ledger: base.ledger,
    budget: createBudget(base.config.budget),
    dryRun: true,
    replay: false,
    fixtureName: undefined,
    fetch: fetchImpl,
    adapters: base.adapters,
  };
}

function response(body: string, contentType = "application/rss+xml; charset=utf-8", status = 200): Response {
  return new Response(body, { status, headers: { "content-type": contentType } });
}

function rss(items: string): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>${items}</channel></rss>`;
}

function item(title: string, link: string, date: string): string {
  return `<item><title>${title}</title><link>${link}</link><pubDate>${date}</pubDate><description>desc</description></item>`;
}

test("mapFeedItem cleans the url and carries the feed fields and source rights", () => {
  const mapped = mapFeedItem(entry(), source(), options(), NOW, allowedHostsFor(source()));
  assert.equal(mapped.skip, null);
  assert.equal(mapped.item?.canonical_url, "https://www.example.com/a?id=1");
  assert.equal(mapped.item?.published_at_source, "2026-10-17T12:00:00.000Z");
  assert.equal(mapped.item?.fetched_at, NOW.toISOString());
  assert.equal(mapped.item?.payload?.["snippet"], "Summary text");
  assert.equal(mapped.item?.payload?.["body_preview"], "Body text for the item.");
  assert.equal(mapped.item?.payload?.["text_rights"], "rewrite_only");
  assert.equal(mapped.item?.payload?.["tier"], 2);
  assert.deepEqual(mapped.item?.payload?.["categories"], ["ai"]);
});

test("mapFeedItem skip reasons: age window, missing date, title length, no url, offhost only for full rights", () => {
  const hosts = allowedHostsFor(source());
  assert.equal(mapFeedItem(entry({ dates: ["2026-09-01T00:00:00Z"] }), source(), options(), NOW, hosts).skip, "too_old");
  assert.equal(mapFeedItem(entry({ dates: [] }), source(), options(), NOW, hosts).skip, "date_missing");
  assert.equal(mapFeedItem(entry({ dates: ["yesterday-ish"] }), source(), options(), NOW, hosts).skip, "date_invalid");
  assert.equal(mapFeedItem(entry({ title: "short" }), source(), options(), NOW, hosts).skip, "title_length");
  // Federal Register notices run past 400 characters: keep and cut, never skip.
  const long = mapFeedItem(entry({ title: `Notice of ${"a very long rulemaking title ".repeat(20)}end` }), source(), options(), NOW, hosts);
  assert.equal(long.skip, null);
  assert.equal(long.item?.title.length, 220);
  assert.ok(long.item?.title.endsWith("…"));
  assert.equal(mapFeedItem(entry({ dates: ["2026-10-25T00:00:00Z"] }), source(), options(), NOW, hosts).skip, "date_future");
  // A path-only <link> resolves against the feed URL.
  const relative = mapFeedItem(entry({ link: "/news/relative-item?utm_campaign=x" }), source(), options(), NOW, hosts);
  assert.equal(relative.item?.canonical_url, "https://feeds.example.com/news/relative-item");
  assert.equal(mapFeedItem(entry({ link: null, guid: "not-a-url" }), source(), options(), NOW, hosts).skip, "no_url");
  // Link-only and rewrite-only items are never fetched, so any public https host is fine.
  assert.equal(mapFeedItem(entry(), source({ text_rights: "link_only" }), options(), NOW, hosts).skip, null);
  // A full-rights source fetches the page, so the host allowlist applies.
  const full = source({ text_rights: "full" });
  assert.equal(mapFeedItem(entry(), full, options(), NOW, allowedHostsFor(full)).skip, "offhost");
  const fullWithHosts = source({ text_rights: "full", extract: { kind: "generic", hosts: ["*.example.com"] } });
  assert.equal(mapFeedItem(entry(), fullWithHosts, options(), NOW, allowedHostsFor(fullWithHosts)).skip, null);
  // A source-level age override beats the default window.
  assert.equal(mapFeedItem(entry({ dates: ["2026-10-01T00:00:00Z"] }), source({ pool_max_age_days: 30 }), options(), NOW, hosts).skip, null);
});

test("Google Cloud release notes: product section, path rewrite, dated anchor and product title", () => {
  const google = source({
    id: "google-cloud-ai-releases",
    url: "https://docs.cloud.google.com/feeds/gcp-release-notes.xml",
    text_rights: "full",
    extract: { kind: "google_release_notes", path: "/gemini-enterprise-agent-platform/release-notes", hosts: ["docs.cloud.google.com"], section: "Gemini Enterprise Agent Platform" },
  });
  const hosts = allowedHostsFor(google);
  const content = "<h2>Compute Engine</h2><p>Other product news.</p><h2>Gemini Enterprise Agent Platform</h2><p>Agent platform now supports a new region for deployments.</p><p>More details.</p><h2>TPU</h2><p>tpu news</p>";
  const mapped = mapFeedItem(entry({ title: "October 12, 2026", link: "https://docs.cloud.google.com/release-notes#October_12_2026", contentHtml: content, dates: ["2026-10-12T00:00:00Z"] }), google, options(), NOW, hosts);
  assert.equal(mapped.skip, null);
  assert.equal(mapped.item?.canonical_url, "https://docs.cloud.google.com/gemini-enterprise-agent-platform/release-notes#October_12_2026");
  assert.equal(mapped.item?.payload?.["product"], "Google Cloud AI");
  assert.ok(String(mapped.item?.title).startsWith("Google Cloud AI: Agent platform now supports"), mapped.item?.title);
  assert.ok(!String(mapped.item?.payload?.["body_preview"]).includes("Other product news"));
  assert.ok(!String(mapped.item?.payload?.["body_preview"]).includes("tpu news"));

  assert.equal(mapFeedItem(entry({ link: "https://docs.cloud.google.com/release-notes#October_12_2026", contentHtml: "<h2>Compute Engine</h2><p>Only other products today.</p>", dates: ["2026-10-12T00:00:00Z"] }), google, options(), NOW, hosts).skip, "section_missing");
  assert.equal(mapFeedItem(entry({ link: "https://docs.cloud.google.com/release-notes", contentHtml: content, dates: ["2026-10-12T00:00:00Z"] }), google, options(), NOW, hosts).skip, "not_dated_release_note");
  // A product feed links straight to the product page; no section rule, no rewrite.
  const compute = source({ id: "google-cloud-compute-releases", url: "https://docs.cloud.google.com/feeds/compute-release-notes.xml", text_rights: "full", extract: { kind: "google_release_notes", path: "/compute/docs/release-notes", hosts: ["docs.cloud.google.com"] } });
  const direct = mapFeedItem(entry({ link: "https://docs.cloud.google.com/compute/docs/release-notes#October_12_2026", contentHtml: "<p>Compute Engine adds a new machine family in asia-northeast3.</p>", dates: ["2026-10-12T00:00:00Z"] }), compute, options(), NOW, allowedHostsFor(compute));
  assert.equal(direct.skip, null);
  assert.equal(direct.item?.payload?.["product"], "Google Cloud Compute Engine");
  assert.equal(mapFeedItem(entry({ link: "https://docs.cloud.google.com/tpu/docs/release-notes#October_12_2026", dates: ["2026-10-12T00:00:00Z"] }), compute, options(), NOW, allowedHostsFor(compute)).skip, "path_not_allowed");
});

test("fetchDetailed reports listed/kept/skipped, drops duplicates and old entries, caps per source", async () => {
  const xml = rss(
    [
      item("Alpha headline item", "https://feeds.example.com/a", "Fri, 17 Oct 2026 10:00:00 GMT"),
      item("Bravo headline item", "https://feeds.example.com/b", "Thu, 16 Oct 2026 10:00:00 GMT"),
      item("Charlie headline item", "https://feeds.example.com/c", "Wed, 15 Oct 2026 10:00:00 GMT"),
      item("Delta headline item", "https://feeds.example.com/d", "Tue, 14 Oct 2026 10:00:00 GMT"),
      item("Alpha headline again", "https://feeds.example.com/a?utm_medium=rss", "Fri, 17 Oct 2026 10:00:00 GMT"),
      item("Echo headline item (old)", "https://feeds.example.com/e", "Tue, 01 Sep 2026 10:00:00 GMT"),
    ].join(""),
  );
  const urls: string[] = [];
  const adapter = createLiveRssAdapter(options());
  const detail = await adapter.fetchDetailed!(
    source(),
    ctx(async (input) => {
      urls.push(String(input));
      return response(xml);
    }),
  );
  assert.deepEqual(urls, ["https://feeds.example.com/rss.xml"]);
  assert.equal(detail.stats.listed, 6);
  assert.equal(detail.stats.kept, 3);
  assert.deepEqual(detail.stats.skipped, { duplicate: 1, too_old: 1, capped: 1 });
  assert.deepEqual(
    detail.items.map((i) => i.canonical_url),
    ["https://feeds.example.com/a", "https://feeds.example.com/b", "https://feeds.example.com/c"],
  );
  assert.ok((detail.stats.fetch?.bytes ?? 0) > 0);
  assert.equal(detail.stats.fetch?.redirects, 0);
  assert.equal((await adapter.fetch(source(), ctx(async () => response(xml)))).length, 3);
});

test("the feed request retries once on SOURCE_UNREACHABLE and never on a 4xx", async () => {
  const xml = rss(item("Alpha headline item", "https://feeds.example.com/a", "Fri, 17 Oct 2026 10:00:00 GMT"));
  const adapter = createLiveRssAdapter(options());
  let calls = 0;
  const flaky = ctx(async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("fetch failed");
    return response(xml);
  });
  assert.equal((await adapter.fetch(source(), flaky)).length, 1);
  assert.equal(calls, 2);

  calls = 0;
  await assert.rejects(adapter.fetch(source(), ctx(async () => (calls += 1, response("", "text/html", 404)))), /HTTP_404/);
  assert.equal(calls, 1, "a 404 is not retried");

  calls = 0;
  await assert.rejects(adapter.fetch(source(), ctx(async () => (calls += 1, response("", "text/html", 503)))), /SOURCE_UNREACHABLE/);
  assert.equal(calls, 2, "one retry for a 5xx");

  await assert.rejects(adapter.fetch(source({ url: "https://feeds.example.com/rss.xml" }), ctx(async () => response("<html>not a feed</html>", "text/html"))), /FEED_PARSE|no items|FEED/i);
});

test("extract honours text rights and the licence marker", async () => {
  const adapter = createLiveRssAdapter(options());
  const page = (footer: string) => `<html><body><article><p>${"The quick brown fox jumps over the lazy dog near the data centre. ".repeat(3)}</p></article><footer>${footer}</footer></body></html>`;
  const itemRow = { source_id: "example-feed", canonical_url: "https://feeds.example.com/post", title: "Headline long enough", fetched_at: NOW.toISOString() };

  await assert.rejects(adapter.extract!(itemRow, source(), ctx(async () => response(page(""), "text/html"))), /TEXT_USE_NOT_AUTHORIZED/);

  const full = source({ text_rights: "full", extract: { kind: "generic", license_marker: "Distributed under CC BY 4.0" } });
  const text = await adapter.extract!(itemRow, full, ctx(async () => response(page("Distributed under CC BY 4.0"), "text/html")));
  assert.equal(text.method, "generic:article");
  assert.ok(text.text.startsWith("The quick brown fox"));
  assert.equal(text.chars, text.text.length);

  await assert.rejects(adapter.extract!(itemRow, full, ctx(async () => response(page("All rights reserved"), "text/html"))), /LICENSE_MARKER_MISSING/);
  await assert.rejects(adapter.extract!({ ...itemRow, canonical_url: "https://elsewhere.example.net/post" }, full, ctx(async () => response(page(""), "text/html"))), /HOST_NOT_ALLOWED/);
});
