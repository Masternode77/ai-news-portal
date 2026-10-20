import { test } from "node:test";
import assert from "node:assert/strict";
import { IngestConfig, silentLogger } from "@cc/shared";
import type { SourceConfig, StageContext } from "@cc/shared";
import { CC_BY_4_URL, createEpochIndexAdapter, epochArticleMetadata, epochArticleTarget, epochIndexLinks } from "../src/adapters/index.ts";
import { createBudget } from "../src/budget.ts";
import { baseRunOptions } from "./helpers.ts";

const NOW = new Date("2026-10-18T00:45:00Z");
const LONG = "This paragraph is comfortably longer than the sixty character minimum used by the extractor.";
const LICENCE = `<footer><a href="${CC_BY_4_URL}">CC BY 4.0</a></footer>`;

const INDEX = `<html><body><ul>
  <li><span>Oct 15, 2026</span> <a href="/gradient-updates/first-post/">First</a></li>
  <li><span>Oct 14, 2026</span> <a href="https://epoch.ai/gradient-updates/unlicensed-post/">Unlicensed</a></li>
  <li><span>Sep 1, 2026</span> <a href="/gradient-updates/old-post/">Old</a></li>
  <li><a href="/data-insights/other-section/">Other section</a></li>
  <li><a href="/gradient-updates/first-post/">First again</a></li>
</ul></body></html>`;

function article(title: string, date: string, licensed = true): string {
  return `<html><head><meta property="og:title" content="${title}"><meta property="og:description" content="Desc of ${title}"></head><body><div class="content-header"><time>${date}</time></div><div class="formatted-text content-body article-content"><p>${LONG} ${title}</p></div><div class="content-sidebar-right"></div>${licensed ? LICENCE : ""}</body></html>`;
}

const PAGES: Record<string, string> = {
  "https://epoch.ai/gradient-updates": INDEX,
  "https://epoch.ai/gradient-updates/first-post/": article("First post title", "Oct 15, 2026"),
  "https://epoch.ai/gradient-updates/unlicensed-post/": article("Unlicensed post", "Oct 14, 2026", false),
  "https://epoch.ai/gradient-updates/old-post/": article("Old post", "Sep 1, 2026"),
};

function ctx(urls: string[]): StageContext {
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
    fetch: async (input) => {
      const url = String(input);
      urls.push(url);
      const page = PAGES[url];
      return page === undefined ? new Response("missing", { status: 404, headers: { "content-type": "text/html" } }) : new Response(page, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    },
    adapters: base.adapters,
  };
}

const SOURCE: SourceConfig = {
  id: "epoch-ai-gradient-updates",
  name: "Epoch AI",
  type: "html",
  url: "https://epoch.ai/gradient-updates",
  tier: 2,
  enabled: true,
  text_rights: "full",
  pool_max_age_days: 21,
  extract: { kind: "epoch_index", path_prefix: "/gradient-updates/", hosts: ["epoch.ai"] },
};

test("epochArticleTarget accepts only clean https article urls on epoch.ai", () => {
  assert.deepEqual(epochArticleTarget("https://epoch.ai/gradient-updates/some-post"), { url: "https://epoch.ai/gradient-updates/some-post/", prefix: "/gradient-updates/", slug: "some-post" });
  assert.equal(epochArticleTarget("https://epoch.ai/gradient-updates/"), null);
  assert.equal(epochArticleTarget("https://epoch.ai/gradient-updates/some-post/?utm=x"), null);
  assert.equal(epochArticleTarget("http://epoch.ai/gradient-updates/some-post/"), null);
  assert.equal(epochArticleTarget("https://evil.example/gradient-updates/some-post/"), null);
});

test("epochIndexLinks keeps section links within the age window, deduplicated and limited", () => {
  const links = epochIndexLinks(INDEX, "/gradient-updates/", 5, NOW, 21);
  assert.deepEqual(links, ["https://epoch.ai/gradient-updates/first-post/", "https://epoch.ai/gradient-updates/unlicensed-post/"]);
  assert.deepEqual(epochIndexLinks(INDEX, "/gradient-updates/", 1, NOW, 21), ["https://epoch.ai/gradient-updates/first-post/"]);
  assert.deepEqual(epochIndexLinks(INDEX, "/data-insights/", 5, NOW, 21), ["https://epoch.ai/data-insights/other-section/"], "links without a listing date are kept");
});

test("epochArticleMetadata needs the licence link, a title and a date", () => {
  const meta = epochArticleMetadata(PAGES["https://epoch.ai/gradient-updates/first-post/"]!, "https://epoch.ai/gradient-updates/first-post/");
  assert.deepEqual(meta, { title: "First post title", description: "Desc of First post title", publishedAt: "2026-10-15T12:00:00.000Z", url: "https://epoch.ai/gradient-updates/first-post/" });
  assert.equal(epochArticleMetadata(PAGES["https://epoch.ai/gradient-updates/unlicensed-post/"]!, "https://epoch.ai/gradient-updates/unlicensed-post/"), null);
});

test("the html index adapter lists, filters, extracts at fetch time and reports skips", async () => {
  const urls: string[] = [];
  const adapter = createEpochIndexAdapter({ ingest: IngestConfig.parse({ extract_host_delay_ms: 0 }), defaultMaxAgeDays: 10, itemsPerSource: 6, resolveHost: async () => ["93.184.216.34"] });
  const detail = await adapter.fetchDetailed!(SOURCE, ctx(urls));
  assert.deepEqual(urls, ["https://epoch.ai/gradient-updates", "https://epoch.ai/gradient-updates/first-post/", "https://epoch.ai/gradient-updates/unlicensed-post/"]);
  assert.equal(detail.stats.listed, 2);
  assert.equal(detail.stats.kept, 1);
  assert.deepEqual(detail.stats.skipped, { unlicensed_or_no_metadata: 1 });
  const [item] = detail.items;
  assert.equal(item?.canonical_url, "https://epoch.ai/gradient-updates/first-post/");
  assert.equal(item?.title, "First post title");
  assert.equal(item?.published_at_source, "2026-10-15T12:00:00.000Z");
  assert.ok(String(item?.payload?.["body_text"]).includes("First post title"));
  assert.equal(item?.payload?.["text_rights"], "full");
  const extracted = await adapter.extract!(item!, SOURCE, ctx([]));
  assert.equal(extracted.method, "epoch_index:payload");
  assert.equal(extracted.chars, String(item?.payload?.["body_text"]).length);
  await assert.rejects(adapter.fetch({ ...SOURCE, url: "https://example.com/gradient-updates" }, ctx([])), /EXTRACTION_FAILED/);
});

test("index and article requests retry once on SOURCE_UNREACHABLE and article pages are spaced by the host delay", async () => {
  const urls: string[] = [];
  const stamps: number[] = [];
  const indexStamps: number[] = [];
  let indexCalls = 0;
  const base = ctx(urls);
  const flaky: StageContext = {
    ...base,
    fetch: async (input) => {
      const url = String(input);
      if (url === "https://epoch.ai/gradient-updates") {
        indexStamps.push(Date.now());
        if ((indexCalls += 1) === 1) return new Response("", { status: 503, headers: { "content-type": "text/html" } });
      } else {
        stamps.push(Date.now());
      }
      return base.fetch(input);
    },
  };
  const adapter = createEpochIndexAdapter({ ingest: IngestConfig.parse({ retry_backoff_ms: 0, extract_host_delay_ms: 40 }), defaultMaxAgeDays: 10, itemsPerSource: 6, resolveHost: async () => ["93.184.216.34"] });
  const detail = await adapter.fetchDetailed!(SOURCE, flaky);
  assert.equal(indexCalls, 2, "the 503 on the index was retried once");
  assert.ok(indexStamps[1]! - indexStamps[0]! >= 35, `the retry waited the host delay, not only retry_backoff_ms: ${indexStamps[1]! - indexStamps[0]!} ms`);
  assert.equal(detail.stats.kept, 1);
  assert.equal(stamps.length, 2);
  assert.ok(stamps[1]! - stamps[0]! >= 35, `article pages are at least the host delay apart: ${stamps[1]! - stamps[0]!} ms`);

  const dead = createEpochIndexAdapter({ ingest: IngestConfig.parse({ retry_attempts: 0, extract_host_delay_ms: 0 }), defaultMaxAgeDays: 10, itemsPerSource: 6, resolveHost: async () => ["93.184.216.34"] });
  indexCalls = 0;
  await assert.rejects(dead.fetchDetailed!(SOURCE, flaky), /SOURCE_UNREACHABLE/, "with retries off the first 503 is final");
});

test("every listed article unreachable fails the source; one unreachable article is only a skip", async () => {
  const base = ctx([]);
  const failing = (urlsToFail: (url: string) => boolean): StageContext => ({
    ...base,
    fetch: async (input) => (urlsToFail(String(input)) ? new Response("", { status: 503, headers: { "content-type": "text/html" } }) : base.fetch(input)),
  });
  const adapter = createEpochIndexAdapter({ ingest: IngestConfig.parse({ retry_attempts: 0, extract_host_delay_ms: 0 }), defaultMaxAgeDays: 10, itemsPerSource: 6, resolveHost: async () => ["93.184.216.34"] });
  await assert.rejects(adapter.fetchDetailed!(SOURCE, failing((url) => url !== "https://epoch.ai/gradient-updates")), /SOURCE_UNREACHABLE: all 2 article requests failed; last: .*503/);
  const partial = await adapter.fetchDetailed!(SOURCE, failing((url) => url === "https://epoch.ai/gradient-updates/first-post/"));
  assert.equal(partial.stats.kept, 0);
  assert.deepEqual(partial.stats.skipped, { source_unreachable: 1, unlicensed_or_no_metadata: 1 }, "a partial failure keeps item-level isolation");
});

test("two Epoch sources sharing one pacer never request epoch.ai inside the host interval", async () => {
  const { HostPacer } = await import("../src/adapters/index.ts");
  const stamps: number[] = [];
  const base = ctx([]);
  const timed: StageContext = { ...base, fetch: async (input) => { stamps.push(Date.now()); return base.fetch(input); } };
  const pacer = new HostPacer();
  const adapter = createEpochIndexAdapter({ ingest: IngestConfig.parse({ extract_host_delay_ms: 30 }), defaultMaxAgeDays: 10, itemsPerSource: 6, resolveHost: async () => ["93.184.216.34"], pacer });
  const second: SourceConfig = { ...SOURCE, id: "epoch-ai-data-insights", url: "https://epoch.ai/gradient-updates" };
  const [a, b] = await Promise.all([adapter.fetchDetailed!(SOURCE, timed), adapter.fetchDetailed!(second, timed)]);
  assert.equal(a.stats.kept + b.stats.kept, 2);
  const sorted = [...stamps].sort((x, y) => x - y);
  assert.equal(sorted.length, 6, "two index pages and two article pages per source");
  for (let i = 1; i < sorted.length; i += 1) assert.ok(sorted[i]! - sorted[i - 1]! >= 25, `requests ${i - 1}→${i} are spaced: ${sorted.map((t) => t - sorted[0]!).join(",")}`);
});

test("a licensed Epoch page with an empty body is kept without body_text and fails extraction instead of counting as ok", async () => {
  const urls: string[] = [];
  const base = ctx(urls);
  const index = `<html><body><ul><li><span>Oct 15, 2026</span> <a href="/gradient-updates/empty-post/">Empty</a></li></ul></body></html>`;
  const empty = `<html><head><meta property="og:title" content="Empty post"><meta property="og:description" content="Only a description"></head><body><div class="content-header"><time>Oct 15, 2026</time></div><div class="formatted-text content-body article-content">   </div><div class="content-sidebar-right"></div>${LICENCE}</body></html>`;
  const pages: Record<string, string> = { "https://epoch.ai/gradient-updates": index, "https://epoch.ai/gradient-updates/empty-post/": empty };
  const local: StageContext = {
    ...base,
    fetch: async (input) => {
      const page = pages[String(input)];
      return page === undefined ? new Response("missing", { status: 404, headers: { "content-type": "text/html" } }) : new Response(page, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    },
  };
  const adapter = createEpochIndexAdapter({ ingest: IngestConfig.parse({ extract_host_delay_ms: 0 }), defaultMaxAgeDays: 10, itemsPerSource: 6, resolveHost: async () => ["93.184.216.34"] });
  const detail = await adapter.fetchDetailed!(SOURCE, local);
  assert.equal(detail.stats.kept, 1, "the item is kept with its metadata");
  const [item] = detail.items;
  assert.equal(item?.payload?.["body_text"], undefined);
  assert.equal(item?.payload?.["body_preview"], undefined);
  assert.deepEqual(item?.payload?.["extraction"], { ok: false, error: "EXTRACTION_EMPTY", detail: "epoch_index:fallback_text: body container holds no text" });
  assert.equal(item?.payload?.["snippet"], "Only a description");
  await assert.rejects(adapter.extract!(item!, SOURCE, local), /EXTRACTION_EMPTY/, "ingest's extraction pass records it as a failure, never as extract_ok");
});

test("a future-dated Epoch article is skipped as date_future, like a feed entry", async () => {
  const base = ctx([]);
  const index = `<html><body><ul><li><a href="/gradient-updates/future-post/">Future</a></li><li><span>Oct 15, 2026</span> <a href="/gradient-updates/first-post/">First</a></li></ul></body></html>`;
  const pages: Record<string, string> = { ...PAGES, "https://epoch.ai/gradient-updates": index, "https://epoch.ai/gradient-updates/future-post/": article("Future post", "Nov 30, 2026") };
  const local: StageContext = {
    ...base,
    fetch: async (input) => {
      const page = pages[String(input)];
      return page === undefined ? new Response("missing", { status: 404, headers: { "content-type": "text/html" } }) : new Response(page, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    },
  };
  const adapter = createEpochIndexAdapter({ ingest: IngestConfig.parse({ extract_host_delay_ms: 0 }), defaultMaxAgeDays: 10, itemsPerSource: 6, resolveHost: async () => ["93.184.216.34"] });
  const detail = await adapter.fetchDetailed!(SOURCE, local);
  assert.deepEqual(detail.stats.skipped, { date_future: 1 });
  assert.deepEqual(detail.items.map((i) => i.canonical_url), ["https://epoch.ai/gradient-updates/first-post/"]);
});
