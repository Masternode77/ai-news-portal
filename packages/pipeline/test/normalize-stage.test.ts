import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parsePipelineConfig, parseSourcesConfig, rawItemId, silentLogger } from "@cc/shared";
import type { PipelineConfig, RawItemInsert, SourceConfig, StageContext } from "@cc/shared";
import { createBudget } from "../src/budget.ts";
import { MemoryDb, seedMemoryDb } from "../src/db/index.ts";
import { MemoryLedger } from "../src/ledger/index.ts";
import { runPipeline } from "../src/runner.ts";
import { DUPLICATE_IN_POOL, DUPLICATE_OF_PUBLISHED, normalizeStage, rejectReason } from "../src/stages/normalize.ts";
import { NormalizeOutput } from "../src/stages/types.ts";
import { baseRunOptions, fixtureAdapters, FIXTURES_DIR, REPO_ROOT, TEST_PIPELINE_YAML, testBannedPhrases, testQa, testScoring } from "./helpers.ts";

const NOW = new Date("2026-10-20T00:45:00Z");
const RUN_ID = "11111111-1111-4111-8111-111111111111";

function config(extra = ""): PipelineConfig {
  return parsePipelineConfig(`${TEST_PIPELINE_YAML}\nnormalize: { version: test${extra} }\n`, { env: {} }).config;
}

function src(id: string, overrides: Partial<SourceConfig> = {}): SourceConfig {
  return { id, name: id, type: "rss", url: `https://${id}.example.com/feed.xml`, tier: 2, enabled: true, text_rights: "rewrite_only", ...overrides };
}

function raw(sourceId: string, url: string, title: string, body = "", extra: Partial<RawItemInsert> = {}): RawItemInsert {
  return { source_id: sourceId, canonical_url: url, title, published_at_source: "2026-10-19T01:00:00.000Z", fetched_at: NOW.toISOString(), payload: { snippet: body }, ...extra };
}

async function run(db: MemoryDb, rawItems: RawItemInsert[], sources: SourceConfig[], cfg = config()): Promise<NormalizeOutput> {
  const ledger = new MemoryLedger();
  const ctx: StageContext = { runId: RUN_ID, now: NOW, config: cfg, logger: silentLogger(), ledger, budget: createBudget(cfg.budget), dryRun: true, replay: true, fixtureName: undefined, scoring: testScoring(), bannedPhrases: testBannedPhrases(), qa: testQa(), fetch: () => Promise.reject(new Error("no network")), adapters: { ...fixtureAdapters(db), db } };
  return NormalizeOutput.parse(await normalizeStage.run({ rawItems, sources }, ctx));
}

const PRESS = "Example Data Centers today announced a 300 MW hyperscale campus in Incheon, with the first 60 MW phase scheduled to reach ready-for-service in the fourth quarter of 2028. The company said the site has secured a grid connection agreement with the utility and will use direct-to-chip liquid cooling for AI workloads.";

test("the same article from three sources converges to one candidate; the copy with text rights and the lowest tier wins", async () => {
  const db = new MemoryDb();
  const sources = [src("a", { tier: 3, text_rights: "rewrite_only" }), src("b", { tier: 2, text_rights: "rewrite_only" }), src("c", { tier: 1, text_rights: "full" })];
  const title = "Microsoft signs 1.2 GW capacity agreement with Example Data Centers in Busan";
  const items = [
    raw("a", "https://www.wire.example.com/news/microsoft-busan?utm_source=rss", title),
    raw("b", "https://wire.example.com/news/microsoft-busan/", title),
    raw("c", "https://wire-c.example.net/2026/10/19/microsoft-busan-agreement", `${title}, sources say`),
    raw("b", "https://wire.example.com/news/other-story", "Equinix breaks ground on SL4 in Seoul with 20 MW first phase"),
  ];
  const out = await run(db, items, sources);
  assert.equal(out.stats.pool, 4);
  assert.equal(out.stats.candidates, 2);
  assert.equal(out.stats.rejected, 2);
  assert.equal(out.stats.duplicate_in_pool, 2);
  assert.equal(out.stats.duplicate_of_published, 0);
  assert.deepEqual(out.stats.by_method, { title: 2 }, "both lower-ranked copies are compared with the kept copy, never with each other");
  const winner = out.candidates.find((c) => c.raw_item_id === rawItemId("https://wire-c.example.net/2026/10/19/microsoft-busan-agreement"));
  assert.ok(winner, "the tier-1 full-rights copy is kept even though it was listed last");
  assert.equal(winner?.rubric_version, "normalize/test");
  assert.equal(winner?.selected, false);
  assert.equal(winner?.reject_reason, null);
  assert.equal(winner?.total, 0);

  const rows = db.rows<{ raw_item_id: string; reject_reason: string; rubric_version: string; selected: boolean; run_id: string }>("candidates");
  assert.equal(rows.length, 2, "only rejections are written; survivors wait for score");
  const byId = new Map(rows.map((r) => [r.raw_item_id, r]));
  const keptUrl = "https://wire-c.example.net/2026/10/19/microsoft-busan-agreement";
  assert.equal(byId.get(rawItemId("https://www.wire.example.com/news/microsoft-busan?utm_source=rss"))?.reject_reason, rejectReason(DUPLICATE_IN_POOL, "title", keptUrl), "the row id is derived from the canonical url as stored");
  assert.equal(byId.get(rawItemId("https://wire.example.com/news/microsoft-busan/"))?.reject_reason, rejectReason(DUPLICATE_IN_POOL, "title", keptUrl));
  assert.ok(rows.every((r) => r.rubric_version === "normalize/test" && r.selected === false && r.run_id === RUN_ID));
  assert.deepEqual(out.stats.decisions.map((d) => [d.source_id, d.reason, d.method, d.duplicate_of]), [["b", DUPLICATE_IN_POOL, "title", keptUrl], ["a", DUPLICATE_IN_POOL, "title", keptUrl]], "decisions follow preference order: tier 2 before tier 3");
  assert.ok(out.stats.decisions.every((d) => (d.score ?? 0) >= 0.85));

  // When the copies share one URL identity and the kept copy is one of them, the url method fires.
  const sameUrl = await run(new MemoryDb(), items.slice(0, 2), [src("a", { tier: 1 }), src("b", { tier: 2 })]);
  assert.deepEqual(sameUrl.stats.by_method, { url: 1 });
  assert.equal(sameUrl.stats.decisions[0]?.duplicate_of, "https://www.wire.example.com/news/microsoft-busan?utm_source=rss", "duplicate_of names the kept copy by its stored canonical url");

  // Re-running is idempotent: the same rejections upsert onto the same (raw_item_id, rubric_version) rows.
  await run(db, items, sources);
  assert.equal(db.size("candidates"), 2);
});

test("already published stories are rejected by url identity at any age and by title similarity inside the window only", async () => {
  const db = new MemoryDb();
  const publication = (slug: string, title: string, sourceUrl: string, publishedAt: string, sourceTitle?: string) => ({
    id: rawItemId(slug), draft_id: null, slug, content_type: "news_brief", title, body: {}, image: null,
    sources: [{ url: sourceUrl, name: "src", published_at: publishedAt, ...(sourceTitle ? { title: sourceTitle } : {}) }],
    published_at: publishedAt, updated_at: publishedAt, publisher: "pipeline", status: "published", legacy_id: null, noindex: false, tags: [], category: null, region: null,
  });
  await db.insert("publications", [
    publication("news/old-eia", "Data-center load is turning spare generation into a timing problem", "https://www.eia.gov/todayinenergy/detail.php?id=67344", "2026-08-12T02:00:00.000Z"),
    publication("news/recent-ko", "마이크로소프트, 부산에 1.2 GW 용량 계약", "https://wire.example.com/news/ms-busan-ko", "2026-10-18T00:00:00.000Z", "Microsoft signs 1.2 GW capacity agreement with Example Data Centers in Busan"),
    publication("news/stale-en", "KEPCO opens 345 kV substation for the Saemangeum data center cluster", "https://wire.example.com/news/kepco-old", "2026-10-01T00:00:00.000Z"),
    { ...publication("news/unpublished", "Equinix breaks ground on SL4 in Seoul with 20 MW first phase", "https://wire.example.com/news/eq", "2026-10-19T00:00:00.000Z"), status: "unpublished" },
  ]);
  const items = [
    raw("a", "https://www.eia.gov/todayinenergy/detail.php?id=67344&utm_source=x", "Data-center load is turning spare generation into a timing problem (EIA)"),
    raw("a", "https://wire-c.example.net/ms-busan-en", "Microsoft signs 1.2 GW capacity agreement with Example Data Centers in Busan, sources say"),
    raw("a", "https://wire-c.example.net/kepco-new", "KEPCO opens 345 kV substation for the Saemangeum data center cluster"),
    raw("a", "https://wire-c.example.net/eq-new", "Equinix breaks ground on SL4 in Seoul with 20 MW first phase"),
  ];
  const out = await run(db, items, [src("a")]);
  assert.equal(out.stats.published_compared, 3, "unpublished rows are not compared");
  assert.equal(out.stats.published_in_window, 1);
  assert.equal(out.stats.duplicate_of_published, 2);
  assert.deepEqual(out.stats.by_method, { url: 1, title: 1 });
  assert.equal(out.stats.candidates, 2, "a title match outside the window and an unpublished row do not block");
  const rows = db.rows<{ raw_item_id: string; reject_reason: string }>("candidates");
  assert.equal(rows.find((r) => r.raw_item_id === rawItemId("https://www.eia.gov/todayinenergy/detail.php?id=67344&utm_source=x"))?.reject_reason, rejectReason(DUPLICATE_OF_PUBLISHED, "url", "news/old-eia"));
  assert.equal(rows.find((r) => r.raw_item_id === rawItemId("https://wire-c.example.net/ms-busan-en"))?.reject_reason, rejectReason(DUPLICATE_OF_PUBLISHED, "title", "news/recent-ko"), "the source title stored on the publication is compared, not the Korean editorial title");
  const decision = out.stats.decisions.find((d) => d.method === "title");
  assert.ok((decision?.score ?? 0) >= 0.85);
});

test("the published url index covers the whole archive by paging, not only the newest page", async () => {
  const db = new MemoryDb();
  const rows = Array.from({ length: 7 }, (_, i) => {
    const publishedAt = new Date(Date.UTC(2025, 0, 1 + i)).toISOString();
    return {
      id: rawItemId(`news/old-${i}`), draft_id: null, slug: `news/old-${i}`, content_type: "news_brief", title: `Old story number ${i} about a substation`, body: {}, image: null,
      sources: [{ url: `https://archive.example.com/story-${i}`, name: "src", published_at: publishedAt }],
      published_at: publishedAt, updated_at: publishedAt, publisher: "legacy", status: "published", legacy_id: null, noindex: false, tags: [], category: null, region: null,
    };
  });
  await db.insert("publications", rows);
  const items = [
    raw("a", "https://archive.example.com/story-0?utm_source=rss", "Old story number 0 about a substation, revisited"),
    raw("a", "https://archive.example.com/story-6/", "Old story number 6 about a substation, revisited"),
    raw("a", "https://archive.example.com/story-new", "A new story about a different substation in Daegu"),
  ];
  const out = await run(db, items, [src("a")], config(", published_page_size: 3"));
  assert.equal(out.stats.published_compared, 7, "three pages of 3, 3 and 1 rows");
  assert.equal(out.stats.published_in_window, 0, "all seven are outside the 7-day title window");
  assert.deepEqual(out.stats.by_method, { url: 2 });
  assert.equal(out.stats.candidates, 1);
  const reasons = db.rows<{ raw_item_id: string; reject_reason: string }>("candidates");
  assert.equal(reasons.find((r) => r.raw_item_id === rawItemId("https://archive.example.com/story-0?utm_source=rss"))?.reject_reason, rejectReason(DUPLICATE_OF_PUBLISHED, "url", "news/old-0"), "the oldest publication, on the last page, is still matched");
  assert.equal(reasons.find((r) => r.raw_item_id === rawItemId("https://archive.example.com/story-6/"))?.reject_reason, rejectReason(DUPLICATE_OF_PUBLISHED, "url", "news/old-6"));
});

test("pool methods: content hash, title key, body shingles; short bodies and different stories pass", async () => {
  const db = new MemoryDb();
  const sources = [src("a", { tier: 1 }), src("b", { tier: 2 })];
  const hash = "a".repeat(64);
  const items = [
    raw("a", "https://a.example.com/gumi", "Samsung SDS to build AI data center in Gumi", "same body", { content_hash: hash }),
    raw("b", "https://b.example.com/gumi-mirror", "Samsung SDS to build AI data center in Gumi", "same body", { content_hash: hash }),
    raw("a", "https://a.example.com/hbm4", "NVIDIA, SK hynix expand HBM4 supply deal — report", "x"),
    raw("b", "https://b.example.com/hbm4", "Nvidia and SK Hynix expand HBM4 supply deal: report", "y"),
    raw("a", "https://a.example.com/incheon", "Example Data Centers announces 300 MW Incheon campus", PRESS),
    raw("b", "https://b.example.com/incheon", "Incheon to host 300 MW hyperscale campus, Example Data Centers says", PRESS),
    raw("a", "https://a.example.com/short-1", "Short note one about cooling", "Liquid cooling update for the Gumi site, phase one."),
    raw("b", "https://b.example.com/short-2", "Short note two about cooling", "Liquid cooling update for the Gumi site, phase one."),
  ];
  const out = await run(db, items, sources);
  assert.deepEqual(out.stats.by_method, { hash: 1, title_key: 1, body: 1 });
  assert.equal(out.stats.candidates, 5, "two short notes with the same tiny body are different stories");
  const kept = new Set(out.candidates.map((c) => c.raw_item_id));
  assert.ok(kept.has(rawItemId("https://a.example.com/gumi")) && !kept.has(rawItemId("https://b.example.com/gumi-mirror")), "tier 1 copy wins on hash");
  assert.ok(kept.has(rawItemId("https://a.example.com/incheon")) && !kept.has(rawItemId("https://b.example.com/incheon")), "tier 1 copy wins on body");
  const body = out.stats.decisions.find((d) => d.method === "body");
  assert.equal(body?.duplicate_of, "https://a.example.com/incheon");
  assert.equal(body?.score, 1);
  // Below body_min_tokens no body comparison happens even for identical text; a lower threshold changes nothing for them.
  const strict = await run(new MemoryDb(), items.slice(6), sources, config(", body_min_tokens: 5"));
  assert.equal(strict.stats.candidates, 1, "with a five-token floor the identical short bodies do collapse");
});

test("end to end with the dedupe fixture: 12 raw items from 3 wires become 6 candidates with every reason recorded", async () => {
  const db = new MemoryDb();
  const seeded = await seedMemoryDb(db, FIXTURES_DIR, "dedupe");
  assert.equal(seeded?.publications, 1);
  const sources = parseSourcesConfig(await readFile(resolve(REPO_ROOT, "fixtures/sources/dedupe.yaml"), "utf8"));
  const ledger = new MemoryLedger();
  const result = await runPipeline(baseRunOptions({ ledger, db, adapters: fixtureAdapters(db, "dedupe"), sources, fixtureName: "dedupe", now: NOW }));
  assert.equal(result.status, "done");
  assert.equal(result.funnel.items_fetched, 12);
  assert.equal(result.funnel.sources_ok, 3);
  const stats = result.state.normalizeStats;
  assert.equal(stats.pool, 12);
  assert.equal(stats.candidates, 6);
  assert.equal(stats.rejected, 6);
  assert.equal(stats.duplicate_of_published, 1);
  assert.equal(stats.duplicate_in_pool, 5);
  assert.deepEqual(stats.by_method, { url: 2, title: 1, body: 1, title_key: 1, hash: 1 });
  const counts = (await ledger.dump()).stageEvents.find((e) => e.stage === "normalize")?.counts;
  assert.equal(counts?.["candidates"], 6);
  assert.equal(counts?.["duplicate_of_published"], 1);
  assert.equal(counts?.["method_url"], 2);
  const rows = db.rows<{ reject_reason: string | null; rubric_version: string }>("candidates");
  assert.equal(rows.filter((r) => r.rubric_version.startsWith("normalize/")).length, 6, "normalize writes its six rejections");
  assert.equal(rows.filter((r) => r.rubric_version.startsWith("score/")).length, 6, "score (3c) writes a row for each survivor");
  const reasons = rows.filter((r) => r.rubric_version.startsWith("normalize/")).map((r) => r.reject_reason ?? "").sort();
  assert.ok(reasons.every((r) => /^DUPLICATE_(OF_PUBLISHED|IN_POOL): (url|title|hash|title_key|body)=/.test(r)), reasons.join("\n"));
  assert.ok(reasons.includes("DUPLICATE_OF_PUBLISHED: url=news/eia-data-center-load-timing"));
  assert.equal(result.state.candidates.length, 6, "score keeps every survivor as a scored candidate");
  assert.ok(result.state.rawItems.every((item) => item.id === rawItemId(item.canonical_url)), "ingest stamps the deterministic id normalize references");
});
