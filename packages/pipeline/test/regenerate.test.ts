import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PipelineRunRow, newsBriefSlug, parsePipelineConfig, parseSourcesConfig, publicationId } from "@cc/shared";
import type { CandidateInsert, DraftRow, PublicationRow, RawItemInsert } from "@cc/shared";
import { createSitePublisher } from "../src/adapters/index.ts";
import { MemoryDb } from "../src/db/index.ts";
import { MemoryLedger } from "../src/ledger/index.ts";
import { assessOperations } from "../src/ops/check.ts";
import { buildRegenerateReport, formatRegenerateReport, isKoreanBrief, planRegeneration, regenerationOutcomes, unpublishFailed } from "../src/ops/regenerate.ts";
import { runPipeline } from "../src/runner.ts";
import { REPO_ROOT, TEST_PIPELINE_YAML, baseRunOptions, fixtureAdapters } from "./helpers.ts";

const STAGING_YAML = `${TEST_PIPELINE_YAML.replace("publish_target: none", "publish_target: staging")}\npublish: { base_url: https://example.test }\n`;
const NOW = new Date("2026-10-20T00:45:00Z");
const LATER = new Date("2026-11-04T09:00:00Z");

/** A scoring-fixture run with publish_target staging leaves raw items, candidates, drafts and one publication in the memory DB. */
async function storedRun() {
  const config = parsePipelineConfig(STAGING_YAML, { env: {} }).config;
  const db = new MemoryDb();
  const adapters = () => ({ ...fixtureAdapters(db, "scoring"), publishers: { site: createSitePublisher({ publish: config.publish, redirects: [] }) } });
  const sources = parseSourcesConfig(await readFile(resolve(REPO_ROOT, "fixtures/sources/scoring.yaml"), "utf8"));
  const first = await runPipeline(baseRunOptions({ config, db, adapters: adapters(), sources, fixtureName: "scoring", now: NOW }));
  assert.equal(first.funnel.published, 1, "the Busan brief passes, the Saemangeum brief is rejected for 2027");
  return { config, db, adapters, sources };
}

/** Make the stored state look like the Korean era: both briefs published under Korean titles and *_ko body keys. */
async function koreanEra(db: MemoryDb) {
  const drafts = db.rows("drafts") as unknown as DraftRow[];
  const publications = db.rows("publications") as unknown as PublicationRow[];
  const busan = publications[0]!;
  const saemangeumDraft = drafts.find((d) => (d.body["brief"] as { slug?: string }).slug !== busan.slug)!;
  const saemangeumSlug = (saemangeumDraft.body["brief"] as { slug: string }).slug;
  const korean = (slug: string, title: string, draftId: string, base: PublicationRow): PublicationRow => ({
    ...base,
    id: publicationId(slug),
    slug,
    draft_id: draftId,
    title,
    body: { summary_ko: "한국어 요약입니다.", why_it_matters_ko: "한국어 의미입니다.", expert_lens_ko: "한국어 렌즈입니다.", tags: ["korea"] },
    published_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  });
  await db.upsert("publications", [korean(busan.slug, "Microsoft, 부산 AI 데이터센터 캠퍼스에 1.2 GW 용량 계약", busan.draft_id!, busan) as unknown as Record<string, unknown>], ["slug"]);
  await db.insert("publications", [korean(saemangeumSlug, "한전, 새만금 데이터센터 클러스터용 345 kV 변전소 가동", saemangeumDraft.id, busan) as unknown as Record<string, unknown>]);
  return { busanSlug: busan.slug, busanId: busan.id, saemangeumSlug };
}

test("planRegeneration picks published briefs with a Korean title, newest first, rebuilds their candidate and raw item, and explains every row it skips", async () => {
  const { db } = await storedRun();
  const { busanSlug, saemangeumSlug } = await koreanEra(db);
  await db.insert("publications", [
    { id: publicationId("news/00000000000000e1"), draft_id: null, slug: "news/00000000000000e1", content_type: "news_brief", title: "An English brief that needs nothing", body: {}, image: null, sources: [], published_at: LATER.toISOString(), updated_at: LATER.toISOString(), publisher: "pipeline", status: "published", legacy_id: null, noindex: false, tags: [], category: null, region: null },
    { id: publicationId("news/00000000000000e2"), draft_id: null, slug: "news/00000000000000e2", content_type: "news_brief", title: "초안이 없는 한국어 브리프", body: {}, image: null, sources: [], published_at: LATER.toISOString(), updated_at: LATER.toISOString(), publisher: "pipeline", status: "published", legacy_id: null, noindex: false, tags: [], category: null, region: null },
    { id: publicationId("column/a-column-2026-10-01"), draft_id: null, slug: "column/a-column-2026-10-01", content_type: "legacy_analysis", title: "칼럼 제목", body: {}, image: null, sources: [], published_at: LATER.toISOString(), updated_at: LATER.toISOString(), publisher: "legacy", status: "published", legacy_id: "x", noindex: false, tags: [], category: null, region: null },
    { id: publicationId("news/00000000000000e3"), draft_id: null, slug: "news/00000000000000e3", content_type: "news_brief", title: "내려간 한국어 브리프", body: {}, image: null, sources: [], published_at: LATER.toISOString(), updated_at: LATER.toISOString(), publisher: "pipeline", status: "unpublished", legacy_id: null, noindex: false, tags: [], category: null, region: null },
  ] as unknown as Record<string, unknown>[]);
  assert.equal(isKoreanBrief({ content_type: "news_brief", title: "한전 변전소" }), true);
  assert.equal(isKoreanBrief({ content_type: "legacy_analysis", title: "칼럼" }), false, "only news briefs are regenerated");
  assert.equal(isKoreanBrief({ content_type: "news_brief", title: "KEPCO switches on a substation" }), false);

  const plan = await planRegeneration(db, { limit: 10 });
  assert.equal(plan.eligible, 3, "two Korean briefs with a draft plus the one without; English, legacy and unpublished rows are not eligible");
  assert.deepEqual(plan.targets.map((t) => t.slug).sort(), [busanSlug, saemangeumSlug].sort());
  assert.deepEqual(plan.skipped.map((s) => [s.slug, s.reason]), [["news/00000000000000e2", "NO_DRAFT"]]);
  for (const target of plan.targets) {
    assert.equal(newsBriefSlug(target.rawItem.canonical_url, target.rawItem.title), target.slug, "the raw item yields the published slug, so the update lands in place");
    assert.equal(target.candidate.raw_item_id, target.rawItem.id);
    assert.equal("created_at" in target.candidate, false, "a stored candidate row becomes an insert row again");
  }
  assert.equal(plan.publications.length, 5, "every published row (not the unpublished one) is kept for a dry run's memory DB");

  assert.equal((await planRegeneration(db, { limit: 1 })).targets.length + (await planRegeneration(db, { limit: 1 })).skipped.length, 1, "limit applies before the lookups");
  const asked = await planRegeneration(db, { slugs: ["news/00000000000000e1", "column/a-column-2026-10-01"], limit: 10 });
  assert.deepEqual(asked.skipped.map((s) => [s.slug, s.reason]).sort(), [["column/a-column-2026-10-01", "NOT_A_BRIEF"], ["news/00000000000000e1", "NO_DRAFT"]].sort(), "explicit slugs are taken in any language, but only briefs");

  // A raw item whose title changed would give another slug: regenerating would publish a second row and leave the Korean one.
  const raw = db.rows("raw_items").find((r) => r["id"] === plan.targets[0]!.rawItem.id)!;
  await db.upsert("raw_items", [{ ...raw, title: `${String(raw["title"])} (updated)` }], ["id"]);
  const moved = await planRegeneration(db, { limit: 10 });
  assert.equal(moved.targets.length, 1);
  assert.deepEqual(moved.skipped.find((s) => s.reason === "SLUG_MISMATCH")?.slug, plan.targets[0]!.slug);
});

test("a regenerate run re-drafts the Korean briefs in English in place: the passing one is updated on its slug (same id, first published_at kept, English body keys), the one QA rejects is unpublished; the ledger marks the run as regenerate", async () => {
  const { config, db, adapters, sources } = await storedRun();
  const { busanSlug, busanId, saemangeumSlug } = await koreanEra(db);
  const plan = await planRegeneration(db, { limit: 10 });
  const candidates: CandidateInsert[] = plan.targets.map((t) => t.candidate);
  const rawItems: RawItemInsert[] = plan.targets.map((t) => t.rawItem);
  const ledger = new MemoryLedger();
  const result = await runPipeline(
    baseRunOptions({ config, db, ledger, adapters: adapters(), sources, fixtureName: "scoring", now: LATER, only: ["generate", "qa", "image", "publish"], seed: { rawItems, candidates, selected: candidates }, ledgerFlags: { mode: "regenerate", slugs: plan.targets.map((t) => t.slug) } }),
  );
  assert.equal(result.status, "done", JSON.stringify(result.stages));
  assert.deepEqual(result.stages.filter((s) => s.status === "skipped").map((s) => s.stage), ["ingest", "normalize", "score"], "nothing is re-ingested or re-scored");

  let entries = regenerationOutcomes(plan, result);
  const busan = entries.find((e) => e.slug === busanSlug)!;
  const saemangeum = entries.find((e) => e.slug === saemangeumSlug)!;
  assert.equal(busan.outcome, "regenerated");
  assert.match(busan.new_title ?? "", /^Microsoft books 1\.2 GW/);
  assert.equal(saemangeum.outcome, "qa_failed");
  assert.ok(saemangeum.reasons.includes("UNGROUNDED_NUMBER"), JSON.stringify(saemangeum));

  const row = (db.rows("publications") as unknown as PublicationRow[]).find((r) => r.slug === busanSlug)!;
  assert.equal(row.id, busanId, "updated in place");
  assert.equal(row.published_at, NOW.toISOString(), "the first publication date survives");
  assert.match(row.title, /^Microsoft books/);
  assert.equal(typeof row.body["summary"], "string");
  assert.equal(row.body["summary_ko"], undefined, "the Korean body is replaced, not merged");
  assert.equal(row.status, "published");

  entries = await unpublishFailed(db, entries, LATER);
  assert.equal(entries.find((e) => e.slug === saemangeumSlug)!.unpublished, true);
  assert.equal(entries.find((e) => e.slug === busanSlug)!.unpublished, false);
  assert.equal((db.rows("publications") as unknown as PublicationRow[]).find((r) => r.slug === saemangeumSlug)!.status, "unpublished");
  assert.deepEqual((await planRegeneration(db, { limit: 10 })).targets, [], "nothing Korean is left published");

  const run = (await ledger.dump()).runs[0]!;
  assert.equal((run.flags as Record<string, unknown>)["mode"], "regenerate");
  const report = buildRegenerateReport({ target: "staging", dryRun: false, plan, entries, result });
  assert.equal(report.remaining, 0);
  const markdown = formatRegenerateReport(report);
  assert.match(markdown, /regenerated 1 · QA failed 1 \(unpublished\) · kept 0 · still to do 0/);
  assert.match(markdown, /qa_failed → unpublished/);
});

test("a target the run never reached is kept for the next invocation, and an empty plan says there is nothing to do", async () => {
  const { db } = await storedRun();
  await koreanEra(db);
  const plan = await planRegeneration(db, { limit: 10 });
  const empty = { ...((await runPipeline(baseRunOptions({ db, only: ["publish"] }))) as object) } as Parameters<typeof regenerationOutcomes>[1];
  const entries = regenerationOutcomes(plan, empty);
  assert.ok(entries.every((e) => e.outcome === "kept" && e.reasons[0] === "NOT_PROCESSED"));
  assert.equal(buildRegenerateReport({ target: "staging", dryRun: true, plan, entries, result: null }).remaining, 2);
  const none = formatRegenerateReport(buildRegenerateReport({ target: "staging", dryRun: true, plan: { eligible: 0, targets: [], skipped: [], publications: [] }, entries: [], result: null }));
  assert.match(none, /dry run: nothing written/);
  assert.match(none, /Nothing to regenerate/);
});

test("ops: a regenerate run is not a pipeline cycle, so it cannot hide a stale schedule", () => {
  const row = (startedAt: string, flags: Record<string, unknown>): PipelineRunRow =>
    PipelineRunRow.parse({ id: crypto.randomUUID(), trigger: "dispatch", started_at: startedAt, ended_at: startedAt, status: "done", git_sha: null, flags, error: null, cost_total_usd: 0, funnel: null });
  const now = new Date("2026-11-04T12:00:00Z");
  const rows = [row("2026-11-04T11:00:00Z", { mode: "regenerate" }), row("2026-11-03T20:00:00Z", {})];
  assert.equal(assessOperations(rows, { now, slotHours: 8 }).status, "stale", "the 16 h old cycle decides, not the 1 h old regenerate run");
  assert.equal(assessOperations([row("2026-11-04T11:00:00Z", {})], { now, slotHours: 8 }).status, "ok");
});
