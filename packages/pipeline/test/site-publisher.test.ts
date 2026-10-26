import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePipelineConfig, parseRedirectsConfig, publicationId, silentLogger } from "@cc/shared";
import type { PublicationInsert, PublicationRow, StageContext } from "@cc/shared";
import { PublishError, createSitePublisher, publicationUrl } from "../src/adapters/index.ts";
import { createBudget } from "../src/budget.ts";
import { MemoryDb } from "../src/db/index.ts";
import { MemoryLedger } from "../src/ledger/index.ts";
import { REPO_ROOT, TEST_PIPELINE_YAML, fixtureAdapters, testBannedPhrases, testQa, testScoring } from "./helpers.ts";

const NOW = new Date("2026-10-26T00:45:00Z");
const LATER = new Date("2026-10-26T08:45:00Z");
const DRAFT_A = "33333333-3333-4333-8333-333333333333";
const DRAFT_B = "44444444-4444-4444-8444-444444444444";
export const REDIRECTS = parseRedirectsConfig(readFileSync(resolve(REPO_ROOT, "config/redirects.yaml"), "utf8"), "config/redirects.yaml");

function ctxWith(publishYaml = "publish: { base_url: https://example.test }", fetchImpl: typeof globalThis.fetch = () => Promise.reject(new Error("no network")), now = NOW): { ctx: StageContext; db: MemoryDb } {
  const cfg = parsePipelineConfig(`${TEST_PIPELINE_YAML}\n${publishYaml}\n`, { env: {} }).config;
  const db = new MemoryDb();
  const ctx: StageContext = { runId: "11111111-1111-4111-8111-111111111111", now, config: cfg, scoring: testScoring(), bannedPhrases: testBannedPhrases(), qa: testQa(), logger: silentLogger(), ledger: new MemoryLedger(), budget: createBudget(cfg.budget), dryRun: true, replay: true, fixtureName: undefined, fetch: fetchImpl, adapters: { ...fixtureAdapters(db), db } };
  return { ctx, db };
}

function item(overrides: Partial<PublicationInsert> = {}): PublicationInsert {
  return { draft_id: DRAFT_A, slug: "news/0123456789abcdef", content_type: "news_brief", title: "부산 1.2 GW 계약", body: { summary_ko: "요약" }, sources: [{ url: "https://a.example.com/busan", name: "Source a", published_at: "2026-10-19T22:00:00.000Z" }], published_at: NOW.toISOString(), publisher: "pipeline", status: "published", ...overrides };
}

test("publish inserts a complete publications row keyed by slug: deterministic id, defaults filled, public URL from publish.base_url", async () => {
  const { ctx, db } = ctxWith();
  const publisher = createSitePublisher({ publish: ctx.config.publish, redirects: REDIRECTS });
  const result = await publisher.publish(item(), ctx);
  assert.deepEqual(result, { slug: "news/0123456789abcdef", url: "https://example.test/news/0123456789abcdef/", action: "inserted", id: publicationId("news/0123456789abcdef") });
  const rows = db.rows("publications") as PublicationRow[];
  assert.equal(rows.length, 1);
  const row = rows[0]!;
  assert.equal(row.id, publicationId("news/0123456789abcdef"));
  assert.equal(row.draft_id, DRAFT_A);
  assert.equal(row.updated_at, NOW.toISOString());
  assert.equal(row.published_at, NOW.toISOString());
  assert.deepEqual([row.noindex, row.tags, row.category, row.region, row.legacy_id, row.image], [false, [], null, null, null, null]);
  assert.equal(publicationUrl("https://example.test/", "column/x"), "https://example.test/column/x/");
});

test("re-publishing the same draft updates in place: same id, first published_at kept, content and updated_at refreshed, still one row", async () => {
  const { ctx, db } = ctxWith();
  const publisher = createSitePublisher({ publish: ctx.config.publish, redirects: REDIRECTS });
  const first = await publisher.publish(item(), ctx);
  const second = await publisher.publish(item({ title: "부산 1.2 GW 계약 (수정)", published_at: LATER.toISOString() }), { ...ctx, now: LATER });
  assert.equal(second.action, "updated");
  assert.equal(second.id, first.id);
  const rows = db.rows("publications") as PublicationRow[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.title, "부산 1.2 GW 계약 (수정)");
  assert.equal(rows[0]!.published_at, NOW.toISOString(), "the original publication date survives");
  assert.equal(rows[0]!.updated_at, LATER.toISOString());
});

test("a slug already written by another draft follows publish.slug_conflict: update (default) keeps the row identity, skip leaves it, fail throws", async () => {
  const update = ctxWith();
  const legacyRow = { ...item({ draft_id: null, publisher: "legacy", legacy_id: "eia-x", title: "legacy title" }) };
  const publisher = createSitePublisher({ publish: update.ctx.config.publish, redirects: REDIRECTS });
  const legacy = await publisher.publish(legacyRow, update.ctx);
  const replaced = await publisher.publish(item({ draft_id: DRAFT_B, title: "new draft" }), { ...update.ctx, now: LATER });
  assert.equal(replaced.action, "updated");
  assert.equal(replaced.id, legacy.id, "the row keeps its id and URL identity");
  const row = (update.db.rows("publications") as PublicationRow[])[0]!;
  assert.equal(row.title, "new draft");
  assert.equal(row.draft_id, DRAFT_B);
  assert.equal(row.legacy_id, "eia-x", "the legacy id is preserved when the incoming row has none");
  assert.equal(row.published_at, NOW.toISOString());

  const skip = ctxWith("publish: { base_url: https://example.test, slug_conflict: skip }");
  const skipper = createSitePublisher({ publish: skip.ctx.config.publish, redirects: REDIRECTS });
  await skipper.publish(item(), skip.ctx);
  const skipped = await skipper.publish(item({ draft_id: DRAFT_B, title: "other" }), skip.ctx);
  assert.equal(skipped.action, "skipped");
  assert.equal((skip.db.rows("publications") as PublicationRow[])[0]!.title, "부산 1.2 GW 계약", "untouched");
  assert.equal((await skipper.publish(item({ title: "same draft again" }), skip.ctx)).action, "updated", "the same draft is never a conflict");

  const fail = ctxWith("publish: { base_url: https://example.test, slug_conflict: fail }");
  const failer = createSitePublisher({ publish: fail.ctx.config.publish, redirects: REDIRECTS });
  await failer.publish(item(), fail.ctx);
  await assert.rejects(failer.publish(item({ draft_id: DRAFT_B }), fail.ctx), (error: unknown) => error instanceof PublishError && error.code === "SLUG_CONFLICT");
  assert.equal(fail.db.rows("publications").length, 1);
});

test("syncRedirects upserts config/redirects.yaml into the redirects table idempotently; publish.redirects_sync false writes nothing", async () => {
  const { ctx, db } = ctxWith();
  const publisher = createSitePublisher({ publish: ctx.config.publish, redirects: REDIRECTS });
  assert.equal(await publisher.syncRedirects(ctx), 4);
  assert.equal(await publisher.syncRedirects(ctx), 4);
  const rows = db.rows("redirects");
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.find((r) => r["from_path"] === "/author/rowan-hale"), { from_path: "/author/rowan-hale", to_path: "/author/josh-inn/", status: 301 });
  const off = ctxWith("publish: { base_url: https://example.test, redirects_sync: false }");
  assert.equal(await createSitePublisher({ publish: off.ctx.config.publish, redirects: REDIRECTS }).syncRedirects(off.ctx), 0);
  assert.equal(off.db.rows("redirects").length, 0);
});

test("revalidate: off by default (no request); on, it GETs each path with the x-prerender-revalidate token and reports failures without throwing; a replay fetch or a missing token is a counted failure", async () => {
  const off = ctxWith("publish: { base_url: https://example.test }", async () => {
    throw new Error("must not be called");
  });
  const quiet = await createSitePublisher({ publish: off.ctx.config.publish, redirects: REDIRECTS, revalidateToken: "t" }).revalidate(["/news/x/"], off.ctx);
  assert.deepEqual(quiet, { requested: 0, ok: 0, failed: 0, skipped: true, errors: [] });

  const calls: { url: string; header: string | null; method: string | undefined }[] = [];
  const on = ctxWith("publish: { base_url: https://example.test, revalidate: { enabled: true } }", async (url, init) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(url), header: headers.get("x-prerender-revalidate"), method: init?.method });
    return new Response(String(url).endsWith("/broken/") ? "boom" : "ok", { status: String(url).endsWith("/broken/") ? 500 : 200 });
  });
  const result = await createSitePublisher({ publish: on.ctx.config.publish, redirects: REDIRECTS, revalidateToken: "secret-token" }).revalidate(["/news/x/", "/broken/", "/"], on.ctx);
  assert.deepEqual({ requested: result.requested, ok: result.ok, failed: result.failed, skipped: result.skipped }, { requested: 3, ok: 2, failed: 1, skipped: false });
  assert.deepEqual(calls.map((c) => c.url), ["https://example.test/news/x/", "https://example.test/broken/", "https://example.test/"]);
  assert.ok(calls.every((c) => c.header === "secret-token" && c.method === "GET"));
  assert.match(result.errors[0]!, /\/broken\/: http 500/);

  const replay = ctxWith("publish: { base_url: https://example.test, revalidate: { enabled: true } }");
  const offline = await createSitePublisher({ publish: replay.ctx.config.publish, redirects: REDIRECTS, revalidateToken: "t" }).revalidate(["/news/x/"], replay.ctx);
  assert.deepEqual([offline.requested, offline.ok, offline.failed], [1, 0, 1], "--replay: the fetch throws, the publication stands");
  const noToken = await createSitePublisher({ publish: replay.ctx.config.publish, redirects: REDIRECTS }).revalidate(["/news/x/"], replay.ctx);
  assert.equal(noToken.failed, 1);
  assert.match(noToken.errors[0]!, /REVALIDATE_TOKEN_MISSING: CC_REVALIDATE_TOKEN/);
});

test("unpublish flips the row to unpublished (hidden from the anon site by RLS) without deleting it", async () => {
  const { ctx, db } = ctxWith();
  const publisher = createSitePublisher({ publish: ctx.config.publish, redirects: REDIRECTS });
  await publisher.publish(item(), ctx);
  await publisher.unpublish("news/0123456789abcdef", { ...ctx, now: LATER });
  const row = (db.rows("publications") as PublicationRow[])[0]!;
  assert.equal(row.status, "unpublished");
  assert.equal(row.updated_at, LATER.toISOString());
});
