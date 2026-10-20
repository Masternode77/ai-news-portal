/** Regression tests for the Phase 3a review findings. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_SOURCE_HEALTH, IngestConfig, parsePipelineConfig } from "@cc/shared";
import type { SourceHealth } from "@cc/shared";
import { buildAdapters, parseCli } from "../bin/pipeline.ts";
import { decodeBody, detectCharset, safeFetchText } from "../src/adapters/index.ts";
import { paragraphs } from "../src/lib/html.ts";
import { registrableDomain, repairFeedLink } from "../src/lib/url.ts";
import { healthAfter } from "../src/stages/ingest.ts";
import { cell, link, summarize } from "../tools/ingest-dry-run-summary.ts";
import { TEST_PIPELINE_YAML } from "./helpers.ts";

const LONG = "This paragraph is comfortably longer than the sixty character minimum used by the extractor.";

test("paragraphs() ignores <pre>, <path>, <picture> and <param> blocks", () => {
  const html = `<p>${LONG} one</p><pre><code>kubectl apply -f deploy.yaml\n$ echo not-a-paragraph ${LONG}</code></pre><svg><path d="M0 0 ${LONG}"/></svg><picture><source srcset="x"></picture><p class="lead">${LONG} two</p>`;
  const texts = paragraphs(html);
  assert.equal(texts.length, 2);
  assert.ok(texts[0]?.endsWith("one") && texts[1]?.endsWith("two"));
  assert.ok(texts.every((t) => !t.includes("kubectl")));
});

test("repairFeedLink resolves relative links and recovers escaped anchors", () => {
  assert.equal(repairFeedLink("/news/item-1", "https://feeds.example.com/rss.xml"), "https://feeds.example.com/news/item-1");
  assert.equal(repairFeedLink("item-2?x=1", "https://feeds.example.com/dir/rss.xml"), "https://feeds.example.com/dir/item-2?x=1");
  assert.equal(repairFeedLink("https://www.example.com/a", "https://feeds.example.com/rss.xml"), "https://www.example.com/a");
  assert.equal(repairFeedLink("%3Ca%20href%3D%22https%3A%2F%2Fwww.example.com%2Fdrupal%22%3Ex%3C%2Fa%3E", "https://feeds.example.com/rss.xml"), "https://www.example.com/drupal");
  assert.equal(repairFeedLink("   ", "https://feeds.example.com/rss.xml"), "");
});

test("registrableDomain and the feed allowlist cover feeds./www./bare variants of one publisher", async () => {
  assert.equal(registrableDomain("feeds.bloomberg.com"), "bloomberg.com");
  assert.equal(registrableDomain("www.blocksandfiles.com"), "blocksandfiles.com");
  assert.equal(registrableDomain("rss.etnews.com"), "etnews.com");
  assert.equal(registrableDomain("www.datanet.co.kr"), "datanet.co.kr");
  assert.equal(registrableDomain("www.gov.uk"), "www.gov.uk", "gov.uk is treated as a public suffix");
  assert.equal(registrableDomain("epoch.ai"), "epoch.ai");
  const { allowedHostsFor } = await import("../src/adapters/index.ts");
  const hosts = allowedHostsFor({ id: "bloomberg-technology", name: "B", type: "rss", url: "https://feeds.bloomberg.com/technology/news.rss", tier: 2, enabled: true, text_rights: "rewrite_only" });
  assert.deepEqual(hosts, ["feeds.bloomberg.com", "bloomberg.com", "*.bloomberg.com"]);
});

test("a redirect that downgrades to http is retried over https", async () => {
  const seen: string[] = [];
  const result = await safeFetchText("https://www.capacitymedia.com/feed/", {
    fetch: async (input) => {
      const url = String(input);
      seen.push(url);
      if (seen.length === 1) return new Response(null, { status: 301, headers: { location: "http://www.capacitymedia.com/feed" } });
      return new Response("<rss><channel></channel></rss>", { status: 200, headers: { "content-type": "application/rss+xml" } });
    },
    timeoutMs: 1000,
    maxBytes: 1024,
    userAgent: "test",
    allowedHosts: ["www.capacitymedia.com"],
    contentTypes: ["application/rss+xml"],
    resolveHost: async () => ["93.184.216.34"],
  });
  assert.deepEqual(seen, ["https://www.capacitymedia.com/feed/", "https://www.capacitymedia.com/feed"]);
  assert.equal(result.redirects, 1);
  assert.equal(result.url, "https://www.capacitymedia.com/feed");
});

test("charset detection: header first, then the XML prolog or meta charset, else utf-8", () => {
  const utf8 = new TextEncoder();
  assert.equal(detectCharset("text/xml; charset=EUC-KR", utf8.encode("<rss/>")), "euc-kr");
  assert.equal(detectCharset("text/xml", utf8.encode('<?xml version="1.0" encoding="ISO-8859-1"?><rss/>')), "iso-8859-1");
  assert.equal(detectCharset("text/html", utf8.encode('<html><head><meta charset="windows-1252"></head>')), "windows-1252");
  assert.equal(detectCharset("application/rss+xml", utf8.encode("<rss/>")), "utf-8");
  // "한" in EUC-KR is 0xC7 0xD1; with full ICU the decoder yields the character, otherwise the utf-8 fallback applies.
  const decoded = decodeBody(new Uint8Array([0xc7, 0xd1]), "euc-kr");
  assert.ok(decoded.charset === "euc-kr" ? decoded.text === "한" : decoded.charset === "utf-8", JSON.stringify(decoded));
  assert.equal(decodeBody(utf8.encode("plain"), "no-such-encoding").charset, "utf-8");
});

test("safeFetchText reports the charset it decoded with", async () => {
  const result = await safeFetchText("https://feeds.example.com/rss.xml", {
    fetch: async () => new Response(new Uint8Array([0x3c, 0x72, 0x73, 0x73, 0x3e, 0xc7, 0xd1, 0x3c, 0x2f, 0x72, 0x73, 0x73, 0x3e]), { status: 200, headers: { "content-type": "application/rss+xml; charset=euc-kr" } }),
    timeoutMs: 1000,
    maxBytes: 1024,
    userAgent: "test",
    allowedHosts: ["feeds.example.com"],
    contentTypes: ["application/rss+xml"],
    resolveHost: async () => ["93.184.216.34"],
  });
  assert.equal(result.bytes, 13);
  assert.ok(result.charset === "euc-kr" || result.charset === "utf-8");
  if (result.charset === "euc-kr") assert.equal(result.text, "<rss>한</rss>");
});

test("healthAfter keeps every outcome of the seven-day window and rates success over all of them", () => {
  type Track = { health: SourceHealth; failStreak: number };
  let track: Track = { health: { ...EMPTY_SOURCE_HEALTH, recent: [] }, failStreak: 0 };
  const day = (offset: number): Date => new Date(Date.parse("2026-10-18T00:45:00Z") + offset * 24 * 60 * 60 * 1000);
  for (const offset of [-12, -11, -10, -6]) track = healthAfter(track, false, day(offset), 0, "SOURCE_UNREACHABLE: http 503");
  assert.equal(track.failStreak, 4);
  assert.equal(track.health.success_rate_7d, 0, "four failures; the run six days ago saw only failures in its own window");
  track = healthAfter(track, true, day(0), 3, null);
  assert.equal(track.failStreak, 0);
  assert.equal(track.health.recent.length, 2, "outcomes that left the window are dropped; the rest keep their timestamp");
  assert.deepEqual(track.health.recent.at(-1), { at: day(0).toISOString(), ok: true });
  // Failures from 12, 11 and 10 days ago left the window; only the 6-day-old failure and today's success count.
  assert.equal(track.health.success_rate_7d, 0.5);
  assert.equal(track.health.last_error, "SOURCE_UNREACHABLE: http 503", "the last error is kept for diagnosis");
  assert.equal(track.health.items_last_run, 3);
  // Extra dispatch runs on one day do not push in-window outcomes out: the 6-day-old failure still counts.
  for (let i = 0; i < 60; i += 1) track = healthAfter(track, true, day(0), 3, null);
  assert.equal(track.health.recent.length, 62, "every outcome inside the window is kept, beyond the old count cap");
  assert.equal(track.health.success_rate_7d, 61 / 62);
  // After an outage only the new run is inside the window; the stale outcomes are gone from the list.
  track = healthAfter(track, false, day(30), 0, "SOURCE_UNREACHABLE: http 503");
  assert.equal(track.health.success_rate_7d, 0, "only the run inside the window counts");
  assert.equal(track.health.recent.length, 1);
  // The row-size cap (500) is the only bound: a source run 521 times in one window rates over the 500 kept
  // outcomes plus the new one, far beyond the three scheduled slots plus dispatches.
  let busy: Track = { health: { ...EMPTY_SOURCE_HEALTH, recent: [] }, failStreak: 0 };
  for (let i = 0; i < 520; i += 1) busy = healthAfter(busy, true, day(0), 3, null);
  busy = healthAfter(busy, false, day(0), 0, "SOURCE_UNREACHABLE: http 503");
  assert.equal(busy.health.success_rate_7d, 500 / 501);
  assert.equal(busy.health.recent.length, 500, "bounded row");
});

test("--live wires the real adapters; the default wires fixtures for rss and html alike", () => {
  const { config } = parsePipelineConfig(TEST_PIPELINE_YAML, { env: {} });
  const live = buildAdapters(parseCli(["run", "--dry-run", "--live"]), config);
  assert.equal(typeof live.sources["rss"]?.fetchDetailed, "function");
  assert.equal(typeof live.sources["rss"]?.extract, "function");
  assert.equal(live.sources["html"]?.type, "html");
  assert.equal(typeof live.sources["html"]?.fetchDetailed, "function");
  const fixtures = buildAdapters(parseCli(["run", "--dry-run", "--replay"]), config);
  assert.equal(fixtures.sources["rss"]?.fetchDetailed, undefined);
  assert.equal(fixtures.sources["html"]?.type, "html");
  assert.equal(typeof fixtures.sources["html"]?.fetch, "function");
  assert.throws(() => parseCli(["run", "--live"]), /requires --dry-run/);
  assert.throws(() => parseCli(["run", "--dry-run", "--live", "--replay"]), /mutually exclusive/);
  assert.equal(IngestConfig.parse({}).extract_bodies, true);
});

test("the step summary neutralises Markdown in feed text and keeps urls as autolinks", () => {
  assert.equal(cell("a | b\nc [x](y) <b>*_`#"), "a \\| b c \\[x\\](y) \\<b\\>\\*\\_\\`\\#");
  assert.equal(link("https://example.com/a_(b)?x=1"), "<https://example.com/a_(b)?x=1>");
  assert.equal(link("javascript:alert(1)"), "javascript:alert(1)");
  const markdown = summarize({
    runId: "r",
    status: "partial",
    live: true,
    funnel: { run_id: "r", started_at: "2026-10-18T00:45:00.000Z", items_fetched: 1 },
    stages: [{ stage: "ingest", status: "done", counts: {}, durationMs: 5 }],
    sourceStats: {
      configured: 1, ok: 1, failed: 0, auto_disabled: 0, items_new: 1, duplicates: 0, skipped_items: 0, extract_ok: 0, extract_failed: 0, extract_skipped: 1,
      sources: [{ source_id: "x", tier: 1, status: "ok", listed: 1, kept: 1, skipped: {}, ms: 5, error: null, fail_streak: 0, sample: [{ title: "[evil](https://x) <img src=x>", url: "https://x.test/a)", published_at: null }], fetch: { url: "https://x.test/feed-new", bytes: 2048, redirects: 1, ms: 5 } }],
    },
    ledger: { deadLetters: [{ ref_id: "s", error: "SourceFetchError: HTTP_404: http 404" }] },
  });
  assert.ok(markdown.includes("\\[evil\\](https://x) \\<img src=x\\>"));
  assert.ok(markdown.includes("<https://x.test/a)>"));
  assert.ok(markdown.includes("| x | 1 | ok | 1 | 1 |  | 2 | 1 | 5 |  |"));
  assert.ok(markdown.includes("- x → <https://x.test/feed-new> (1 hop)"));
  assert.ok(markdown.includes("| HTTP_404 | 1 |"));
});
