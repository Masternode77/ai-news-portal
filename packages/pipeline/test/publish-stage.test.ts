import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parsePipelineConfig, parseSourcesConfig, publicationId, silentLogger } from "@cc/shared";
import type { ImageResult, PublicationRow, PublisherAdapter, StageContext } from "@cc/shared";
import { createSitePublisher } from "../src/adapters/index.ts";
import { createBudget } from "../src/budget.ts";
import { MemoryDb } from "../src/db/index.ts";
import { MemoryLedger } from "../src/ledger/index.ts";
import { runPipeline } from "../src/runner.ts";
import { PUBLISH_INPUT_INVALID, publicationFromDraft, publishStage } from "../src/stages/publish.ts";
import { PublishOutput } from "../src/stages/types.ts";
import { REPO_ROOT, TEST_PIPELINE_YAML, baseRunOptions, fixtureAdapters, testBannedPhrases, testQa, testScoring } from "./helpers.ts";
import { BRIEF, NOW, TITLE, draft, rawItem } from "./qa-fixtures.ts";
import { REDIRECTS } from "./site-publisher.test.ts";

const STAGING_YAML = TEST_PIPELINE_YAML.replace("publish_target: none", "publish_target: staging");

async function ctxWith(yaml = STAGING_YAML, publisher?: PublisherAdapter, fetchImpl: typeof globalThis.fetch = () => Promise.reject(new Error("no network"))): Promise<{ ctx: StageContext; db: MemoryDb; ledger: MemoryLedger }> {
  const cfg = parsePipelineConfig(yaml.includes("\npublish:") ? yaml : `${yaml}\npublish: { base_url: https://example.test }\n`, { env: {} }).config;
  const db = new MemoryDb();
  const ledger = new MemoryLedger();
  const runId = await ledger.startRun({ trigger: "local", startedAt: NOW, gitSha: null, flags: {} });
  const site = publisher ?? createSitePublisher({ publish: cfg.publish, redirects: REDIRECTS });
  const ctx: StageContext = { runId, now: NOW, config: cfg, scoring: testScoring(), bannedPhrases: testBannedPhrases(), qa: testQa(), logger: silentLogger(), ledger, budget: createBudget(cfg.budget), dryRun: true, replay: true, fixtureName: undefined, fetch: fetchImpl, adapters: { ...fixtureAdapters(db), db, publishers: { site } } };
  return { ctx, db, ledger };
}

const IMAGE: ImageResult = { path: "/images/generated/news/x/hero.svg", alt: "alt", provenance: { provider: "placeholder", model: "svg-editorial/2026-10-24.1", prompt: "p", generatedAt: NOW.toISOString() }, placeholder: true, costUsd: 0 };

test("publish_target none: nothing is written, no publisher call, every candidate is reported as dry", async () => {
  const never: PublisherAdapter = { target: "site", async publish() { throw new Error("must not publish"); } };
  const { ctx, db } = await ctxWith(TEST_PIPELINE_YAML, never);
  const out = PublishOutput.parse(await publishStage.run({ withImages: [{ draft: draft(), image: IMAGE }], rawItems: [rawItem()] }, ctx));
  assert.deepEqual(out.published, []);
  assert.equal(out.stats.target, "none");
  assert.equal(out.stats.candidates, 1);
  assert.deepEqual(out.stats.decisions.map((d) => [d.slug, d.action]), [[BRIEF.slug, "dry"]]);
  assert.equal(db.rows("publications").length, 0);
  assert.equal(db.rows("redirects").length, 0);
});

test("staging: a QA-passed draft becomes one publications row — brief fields as the body, the source with its original headline, the image, tags; redirects are synced first; a re-run updates the same row", async () => {
  const { ctx, db } = await ctxWith();
  const input = { withImages: [{ draft: draft(), image: IMAGE }], rawItems: [rawItem()] };
  const out = PublishOutput.parse(await publishStage.run(input, ctx));
  assert.equal(out.published.length, 1);
  assert.deepEqual(out.published[0], { slug: BRIEF.slug, url: `https://example.test/${BRIEF.slug}/`, action: "inserted", id: publicationId(BRIEF.slug) });
  assert.deepEqual([out.stats.published, out.stats.inserted, out.stats.updated, out.stats.skipped, out.stats.failed, out.stats.redirects_synced], [1, 1, 0, 0, 0, 44]);
  assert.equal(out.stats.revalidate.skipped, true, "revalidation is off by default");
  const row = (db.rows("publications") as PublicationRow[])[0]!;
  assert.equal(row.title, BRIEF.title_ko);
  assert.equal(row.content_type, "news_brief");
  assert.equal(row.draft_id, draft().id);
  assert.equal(row.body["summary_ko"], BRIEF.summary_ko);
  assert.equal(row.body["why_it_matters_ko"], BRIEF.why_it_matters_ko);
  assert.equal(row.body["expert_lens_ko"], BRIEF.expert_lens_ko);
  assert.deepEqual((row.body["generation"] as Record<string, unknown>)["prompt_version"], "2026-10-25.1");
  assert.deepEqual(row.sources, [{ url: BRIEF.source_url, name: BRIEF.source_name, published_at: BRIEF.published_at_source, title: TITLE }]);
  assert.deepEqual(row.image, IMAGE);
  assert.deepEqual(row.tags, BRIEF.tags);
  assert.equal(row.publisher, "pipeline");
  assert.equal(row.status, "published");
  assert.equal(row.published_at, NOW.toISOString());
  assert.equal(db.rows("redirects").length, 44);
  const again = PublishOutput.parse(await publishStage.run(input, ctx));
  assert.equal(again.stats.updated, 1);
  assert.equal(db.rows("publications").length, 1);
  assert.equal(publishStage.idempotencyKey(input), `publish:${BRIEF.slug}`);
});

test("one bad draft is a dead letter, the others still publish; an unsupported content_type is PUBLISH_INPUT_INVALID", async () => {
  const { ctx, db, ledger } = await ctxWith();
  const broken = draft({ ...BRIEF, title_ko: "" }, { promptVersion: "2026-10-25.2" });
  const essay = { ...draft(BRIEF, { promptVersion: "2026-10-25.3" }), content_type: "insight_essay" as const };
  const out = PublishOutput.parse(await publishStage.run({ withImages: [{ draft: broken, image: null }, { draft: draft(), image: null }, { draft: essay, image: null }], rawItems: [rawItem()] }, ctx));
  assert.equal(out.stats.published, 1);
  assert.equal(out.stats.failed, 2);
  assert.equal(db.rows("publications").length, 1);
  const dump = await ledger.dump();
  assert.equal(dump.deadLetters.length, 2);
  assert.ok(dump.deadLetters.every((d) => d.stage === "publish" && d.ref_table === "drafts"));
  assert.match(dump.deadLetters[0]!.error, new RegExp(`${PUBLISH_INPUT_INVALID}: draft body.brief is not a NewsBrief`));
  assert.match(dump.deadLetters[1]!.error, /insight_essay has no publisher mapping/);
  assert.deepEqual(out.stats.decisions.map((d) => d.action), ["failed", "inserted", "failed"]);
  assert.throws(() => publicationFromDraft({ draft: essay, image: null }, undefined, ctx), /PUBLISH_INPUT_INVALID/);
});

test("end to end on the scoring fixture with publish_target staging: generate → qa → image → publish writes exactly the QA-passed draft, funnel.published 1, no build step and no network", async () => {
  const cfg = parsePipelineConfig(`${STAGING_YAML}\npublish: { base_url: https://example.test }\n`, { env: {} }).config;
  const db = new MemoryDb();
  const adapters = { ...fixtureAdapters(db, "scoring"), publishers: { site: createSitePublisher({ publish: cfg.publish, redirects: REDIRECTS }) } };
  const sources = parseSourcesConfig(await readFile(resolve(REPO_ROOT, "fixtures/sources/scoring.yaml"), "utf8"));
  const result = await runPipeline(baseRunOptions({ config: cfg, db, adapters, sources, fixtureName: "scoring" }));
  assert.equal(result.status, "done", JSON.stringify(result.stages));
  const publish = result.stages.find((s) => s.stage === "publish")!;
  assert.equal(publish.status, "done");
  assert.deepEqual([publish.counts["candidates"], publish.counts["published"], publish.counts["inserted"], publish.counts["failed"], publish.counts["redirects_synced"], publish.counts["revalidate_failed"]], [1, 1, 1, 0, 44, 0]);
  assert.equal(result.funnel.qa_passed, 1);
  assert.equal(result.funnel.published, 1);
  const rows = db.rows("publications") as PublicationRow[];
  assert.equal(rows.length, 1);
  assert.match(rows[0]!.slug, /^news\/[0-9a-f]{16}$/);
  assert.equal(rows[0]!.status, "published");
  assert.ok(rows[0]!.image?.placeholder, "the 3f placeholder image is stored on the publication");
  assert.equal(result.state.publishStats.target, "staging");
  assert.equal(result.costTotalUsd, 0);
});

test("revalidation on: the published slug and the extra paths are requested after the rows are written; a failure is counted, the run is still done", async () => {
  const calls: string[] = [];
  const cfgYaml = `${STAGING_YAML}\npublish: { base_url: https://example.test, revalidate: { enabled: true, extra_paths: ["/", "/rss.xml"] } }\n`;
  const cfg = parsePipelineConfig(cfgYaml, { env: {} }).config;
  const site = createSitePublisher({ publish: cfg.publish, redirects: REDIRECTS, revalidateToken: "tok" });
  const { ctx, db } = await ctxWith(cfgYaml, site, async (url) => {
    calls.push(String(url));
    return new Response("", { status: String(url).endsWith("/rss.xml") ? 404 : 200 });
  });
  const out = PublishOutput.parse(await publishStage.run({ withImages: [{ draft: draft(), image: null }], rawItems: [rawItem()] }, ctx));
  assert.deepEqual(out.stats.revalidate, { requested: 3, ok: 2, failed: 1, skipped: false });
  assert.deepEqual(calls, [`https://example.test/${BRIEF.slug}/`, "https://example.test/", "https://example.test/rss.xml"]);
  assert.equal(db.rows("publications").length, 1, "the publication stands whatever revalidation did");
});
