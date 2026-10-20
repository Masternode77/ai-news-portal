import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePipelineConfig, silentLogger } from "@cc/shared";
import type { DbPort, PipelineConfig, RawItemInsert, Row, SourceAdapter, SourceConfig, StageContext } from "@cc/shared";
import { createBudget } from "../src/budget.ts";
import { MemoryDb } from "../src/db/index.ts";
import { MemoryLedger } from "../src/ledger/index.ts";
import { ingestStage, reviewClearsAutoDisable } from "../src/stages/ingest.ts";
import { IngestOutput } from "../src/stages/types.ts";
import { TEST_PIPELINE_YAML, fixtureAdapters } from "./helpers.ts";

const NOW = new Date("2026-10-18T00:45:00Z");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function config(extra = ""): PipelineConfig {
  return parsePipelineConfig(`${TEST_PIPELINE_YAML}\ningest: { auto_disable_after: 2, concurrency: 2, extract_concurrency: 2, retry_backoff_ms: 0${extra} }\n`, { env: {} }).config;
}

function src(id: string, overrides: Partial<SourceConfig> = {}): SourceConfig {
  return { id, name: id, type: "rss", url: `https://${id}.example.com/feed.xml`, tier: 2, enabled: true, text_rights: "rewrite_only", ...overrides };
}

function raw(sourceId: string, slug: string, day: number): RawItemInsert {
  return {
    source_id: sourceId,
    canonical_url: `https://articles.example.com/${slug}`,
    title: `Headline ${slug} long enough`,
    published_at_source: `2026-10-${String(day).padStart(2, "0")}T00:00:00.000Z`,
    fetched_at: NOW.toISOString(),
    payload: { snippet: `snippet ${slug}` },
  };
}

class CodedError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "CodedError";
    this.code = code;
  }
}

interface Harness {
  db: MemoryDb;
  ledger: MemoryLedger;
  calls: string[];
  run(sources: SourceConfig[], cfg?: PipelineConfig): Promise<IngestOutput>;
}

function harness(feeds: Record<string, RawItemInsert[] | Error>, extractFails: string[] = []): Harness {
  const db = new MemoryDb();
  const ledger = new MemoryLedger();
  const calls: string[] = [];
  const rss: SourceAdapter = {
    type: "rss",
    async fetch(source) {
      calls.push(source.id);
      const value = feeds[source.id];
      if (value instanceof Error) throw value;
      return value ?? [];
    },
    async extract(item) {
      if (extractFails.includes(item.canonical_url)) throw new CodedError("EXTRACTION_FAILED", "boom");
      return { text: `extracted ${item.canonical_url}`, chars: 10 + item.canonical_url.length, method: "test" };
    },
  };
  const adapters = { ...fixtureAdapters(db), sources: { rss }, db };
  return {
    db,
    ledger,
    calls,
    async run(sources, cfg = config()) {
      const runId = await ledger.startRun({ trigger: "local", startedAt: NOW, gitSha: null, flags: {} });
      const ctx: StageContext = { runId, now: NOW, config: cfg, logger: silentLogger(), ledger, budget: createBudget(cfg.budget), dryRun: true, replay: true, fixtureName: undefined, fetch: () => Promise.reject(new Error("no network")), adapters };
      return IngestOutput.parse(await ingestStage.run({ sources }, ctx));
    },
  };
}

test("ingest mirrors sources, isolates a failing source, caps, dedupes, extracts only with text rights", async () => {
  const full = src("s-full", { tier: 1, text_rights: "full", extract: { kind: "generic" } });
  const bad = src("s-bad", { tier: 2 });
  const link = src("s-link", { tier: 3, text_rights: "link_only" });
  const off = src("s-off", { enabled: false });
  const h = harness(
    {
      "s-full": Array.from({ length: 8 }, (_, i) => raw("s-full", `a${i + 1}`, 10 + i)),
      "s-bad": new CodedError("SOURCE_UNREACHABLE", "timeout after 20000 ms"),
      "s-link": [raw("s-link", "a8", 17), raw("s-link", "l1", 16)],
    },
    ["https://articles.example.com/a3"],
  );
  const out = await h.run([full, bad, link, off]);

  assert.equal(out.stats.configured, 3);
  assert.equal(out.stats.ok, 2);
  assert.equal(out.stats.failed, 1);
  assert.equal(out.stats.auto_disabled, 0);
  assert.deepEqual(out.stats.errors.map((e) => e.source_id), ["s-bad"]);
  assert.equal(out.rawItems.length, 7, "6 capped items from s-full plus one unique link-only item");
  assert.equal(out.stats.duplicates, 1, "s-link's a8 is already listed by the tier-1 source");
  assert.equal(out.stats.items_new, 7);
  assert.equal(out.stats.skipped_items, 2, "two of eight capped away");
  assert.equal(out.rawItems[0]?.source_id, "s-full", "tier order");
  assert.ok(out.rawItems.every((item) => UUID.test(item.run_id ?? "") && /^[a-f0-9]{64}$/.test(item.content_hash ?? "")), "run_id and content_hash are stamped");

  assert.equal(out.stats.extract_ok, 5);
  assert.equal(out.stats.extract_failed, 1);
  assert.equal(out.stats.extract_skipped, 1, "the link-only item is never extracted");
  const a3 = out.rawItems.find((i) => i.canonical_url.endsWith("/a3"))!;
  assert.deepEqual(a3.payload?.["extraction"], { ok: false, error: "EXTRACTION_FAILED", detail: "CodedError: EXTRACTION_FAILED: boom" });
  assert.equal(a3.payload?.["body_text"], undefined);
  const a8 = out.rawItems.find((i) => i.canonical_url.endsWith("/a8"))!;
  assert.equal(a8.payload?.["body_text"], "extracted https://articles.example.com/a8");
  const l1 = out.rawItems.find((i) => i.canonical_url.endsWith("/l1"))!;
  assert.equal(l1.payload?.["body_text"], undefined);

  const byId = new Map(h.db.rows("sources").map((r) => [r["id"], r]));
  assert.equal(byId.size, 4, "disabled rows are mirrored too");
  assert.equal(byId.get("s-off")?.["enabled"], false);
  const fullRow = byId.get("s-full")!;
  assert.equal(fullRow["last_ok_at"], NOW.toISOString());
  assert.equal(fullRow["fail_streak"], 0);
  assert.deepEqual(fullRow["health"], { success_rate_7d: 1, last_error: null, last_error_at: null, items_last_run: 6, auto_disabled_at: null, recent: [{ at: NOW.toISOString(), ok: true }] });
  const badRow = byId.get("s-bad")!;
  assert.equal(badRow["enabled"], true);
  assert.equal(badRow["fail_streak"], 1);
  assert.equal((badRow["health"] as { last_error: string }).last_error, "CodedError: SOURCE_UNREACHABLE: timeout after 20000 ms");
  assert.equal((badRow["health"] as { success_rate_7d: number }).success_rate_7d, 0);
  assert.equal(h.db.size("raw_items"), 7);

  const stat = out.stats.sources.find((s) => s.source_id === "s-full")!;
  assert.equal(stat.status, "ok");
  assert.equal(stat.listed, 8);
  assert.equal(stat.kept, 6);
  assert.deepEqual(stat.skipped, { capped: 2 });
  assert.equal(stat.sample.length, 3);
  assert.equal(stat.sample[0]?.url, "https://articles.example.com/a8");
  const dump = await h.ledger.dump();
  assert.deepEqual(dump.deadLetters.map((d) => d.ref_id), ["s-bad"]);
});

test("repeated failures auto-disable a source in the table; a later reviewed_at re-enables it", async () => {
  const good = src("s-good", { tier: 1 });
  const bad = src("s-bad", { tier: 2, reviewed_at: "2026-10-01" });
  const h = harness({ "s-good": [raw("s-good", "g1", 17)], "s-bad": new CodedError("HTTP_403", "http 403") });

  const first = await h.run([good, bad]);
  assert.equal(first.stats.items_new, 1);
  const second = await h.run([good, bad]);
  assert.equal(second.stats.items_new, 0, "the same url is not new on the next run");
  assert.equal(second.rawItems.length, 1);
  const badRow = h.db.rows("sources").find((r) => r["id"] === "s-bad")!;
  assert.equal(badRow["enabled"], false);
  assert.equal(badRow["fail_streak"], 2);
  assert.equal((badRow["health"] as { auto_disabled_at: string }).auto_disabled_at, NOW.toISOString());
  const dump = await h.ledger.dump();
  assert.ok(dump.deadLetters.some((d) => d.error.startsWith("SOURCE_AUTO_DISABLED: s-bad failed 2 consecutive runs")));

  h.calls.length = 0;
  const third = await h.run([good, bad]);
  assert.deepEqual(h.calls, ["s-good"], "an auto-disabled source is not fetched");
  assert.equal(third.stats.auto_disabled, 1);
  assert.equal(third.stats.failed, 0);
  assert.equal(third.stats.sources.find((s) => s.source_id === "s-bad")?.status, "auto_disabled");
  assert.equal(h.db.rows("sources").find((r) => r["id"] === "s-bad")?.["enabled"], false, "the mirror keeps the table's enabled=false");

  h.calls.length = 0;
  const fourth = await h.run([good, { ...bad, reviewed_at: "2026-10-19" }]);
  assert.deepEqual(h.calls, ["s-good", "s-bad"], "a reviewed_at after the auto-disable day re-enables the source");
  assert.equal(fourth.stats.failed, 1);
  const reRow = h.db.rows("sources").find((r) => r["id"] === "s-bad")!;
  assert.equal(reRow["enabled"], true);
  assert.equal(reRow["fail_streak"], 1);
  assert.equal((reRow["health"] as { auto_disabled_at: string | null }).auto_disabled_at, null);

  assert.equal(reviewClearsAutoDisable("2026-10-18", "2026-10-18T00:45:00.000Z"), false);
  assert.equal(reviewClearsAutoDisable("2026-10-19", "2026-10-18T00:45:00.000Z"), true);
  assert.equal(reviewClearsAutoDisable(undefined, "2026-10-18T00:45:00.000Z"), false);
});

test("a malformed item is dead-lettered alone; a missing adapter fails only that source", async () => {
  const h = harness({ "s-x": [raw("s-x", "x1", 17), { bad: true } as unknown as RawItemInsert] });
  const out = await h.run([src("s-x"), src("s-api", { type: "api" })]);
  assert.equal(out.stats.invalid_items, 1);
  assert.equal(out.stats.ok, 1);
  assert.equal(out.stats.failed, 1);
  assert.ok(out.stats.errors[0]?.error.includes("NO_ADAPTER"));
  assert.equal(out.rawItems.length, 1);
  const dump = await h.ledger.dump();
  assert.deepEqual(dump.deadLetters.map((d) => d.error.split(":")[0]).sort(), ["Error", "ITEM_INVALID"]);
});

test("ingest.extract_bodies=false stores feed fields only", async () => {
  const h = harness({ "s-full": [raw("s-full", "f1", 17), raw("s-full", "f2", 16)] });
  const out = await h.run([src("s-full", { text_rights: "full" })], config(", extract_bodies: false"));
  assert.equal(out.stats.extract_ok, 0);
  assert.equal(out.stats.extract_skipped, 2);
  assert.ok(out.rawItems.every((i) => i.payload?.["body_text"] === undefined));
});

test("every sources upsert carries the full row: PostgreSQL checks NOT NULL before ON CONFLICT DO UPDATE", async () => {
  const h = harness({ "s-ok": [raw("s-ok", "a1", 10)], "s-bad": new CodedError("SOURCE_UNREACHABLE", "http 503") });
  const batches: Row[][] = [];
  const inner = h.db;
  const recording: DbPort = {
    kind: "memory",
    insert: (table, rows) => inner.insert(table, rows),
    upsert: (table, rows, keys) => {
      if (table === "sources") batches.push(rows.map((row) => ({ ...row })));
      return inner.upsert(table, rows, keys);
    },
    select: (table, where, options) => inner.select(table, where, options),
    selectIn: (table, column, values, options) => inner.selectIn(table, column, values, options),
    update: (table, where, patch) => inner.update(table, where, patch),
  };
  const cfg = config();
  const runId = await h.ledger.startRun({ trigger: "local", startedAt: NOW, gitSha: null, flags: {} });
  const ctx: StageContext = { runId, now: NOW, config: cfg, logger: silentLogger(), ledger: h.ledger, budget: createBudget(cfg.budget), dryRun: true, replay: true, fixtureName: undefined, fetch: () => Promise.reject(new Error("no network")), adapters: { ...fixtureAdapters(inner), sources: { rss: { type: "rss", fetch: async (source) => { const v = { "s-ok": [raw("s-ok", "a1", 10)], "s-bad": new CodedError("SOURCE_UNREACHABLE", "http 503") }[source.id]; if (v instanceof Error) throw v; return v ?? []; } } }, db: recording } };
  await ingestStage.run({ sources: [src("s-ok", { tier: 1 }), src("s-bad")] }, ctx);
  assert.equal(batches.length, 2, "one mirror upsert, one health upsert");
  const required = ["id", "name", "type", "url", "tier", "enabled", "text_rights", "terms_url", "reviewed_at", "fail_streak", "health", "last_ok_at"];
  for (const batch of batches) for (const row of batch) assert.deepEqual(Object.keys(row).sort(), [...required].sort(), JSON.stringify(row));
  const health = batches[1]!;
  assert.equal(health.find((r) => r["id"] === "s-ok")?.["last_ok_at"], NOW.toISOString());
  assert.equal(health.find((r) => r["id"] === "s-bad")?.["fail_streak"], 1);
  assert.equal(health.find((r) => r["id"] === "s-bad")?.["url"], "https://s-bad.example.com/feed.xml", "config columns ride along so the upsert never inserts NULL into a NOT NULL column");
});
