import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parsePipelineConfig, parseSourcesConfig, rawItemId, silentLogger, SelectionConfig } from "@cc/shared";
import type { CandidateInsert, PipelineConfig, RawItemInsert, ScoringConfig, SourceConfig, StageContext } from "@cc/shared";
import { createBudget } from "../src/budget.ts";
import { MemoryDb } from "../src/db/index.ts";
import { MemoryLedger } from "../src/ledger/index.ts";
import { runPipeline } from "../src/runner.ts";
import {
  BELOW_THRESHOLD,
  NOT_SELECTED,
  compileScoring,
  hasTerm,
  normalizeText,
  rejectReason,
  scoreDoc,
  scoreImpact,
  scoreReaderValue,
  scoreRelevance,
  scoreStage,
  scoreTimeliness,
} from "../src/stages/score.ts";
import { ScoreOutput } from "../src/stages/types.ts";
import { REPO_ROOT, TEST_PIPELINE_YAML, baseRunOptions, fixtureAdapters, testBannedPhrases, testScoring } from "./helpers.ts";

const NOW = new Date("2026-10-20T00:45:00Z");
const RUN_ID = "11111111-1111-4111-8111-111111111111";

function config(caps = "{ min: 1, max: 2 }"): PipelineConfig {
  return parsePipelineConfig(TEST_PIPELINE_YAML.replace("briefs_per_cycle: { min: 1, max: 2 }", `briefs_per_cycle: ${caps}`), { env: {} }).config;
}

function src(id: string, overrides: Partial<SourceConfig> = {}): SourceConfig {
  return { id, name: id, type: "rss", url: `https://${id}.example.com/feed.xml`, tier: 2, enabled: true, text_rights: "rewrite_only", ...overrides };
}

/** Items carry a positive extraction marker, as ingest stamps on a full-rights source whose page was fetched; the marker is inert on other sources. */
function raw(sourceId: string, url: string, title: string, body = "", publishedAt: string | null = "2026-10-19T22:00:00.000Z"): RawItemInsert {
  return { id: rawItemId(url), source_id: sourceId, canonical_url: url, title, published_at_source: publishedAt, fetched_at: NOW.toISOString(), payload: { snippet: body, extraction: { ok: true, method: "test", chars: body.length } } };
}

function candidate(item: RawItemInsert): CandidateInsert {
  return { raw_item_id: item.id!, run_id: RUN_ID, rubric_version: "normalize/test", scores: { relevance: 0, timeliness: 0, impact: 0, reader_value: 0, insight_potential: 0 }, total: 0, selected: false, reject_reason: null, rubric: null };
}

async function run(db: MemoryDb, items: RawItemInsert[], sources: SourceConfig[], scoring: ScoringConfig = testScoring(), cfg = config()): Promise<ScoreOutput> {
  const ledger = new MemoryLedger();
  const ctx: StageContext = { runId: RUN_ID, now: NOW, config: cfg, scoring, bannedPhrases: testBannedPhrases(), logger: silentLogger(), ledger, budget: createBudget(cfg.budget), dryRun: true, replay: true, fixtureName: undefined, fetch: () => Promise.reject(new Error("no network")), adapters: { ...fixtureAdapters(db), db } };
  return ScoreOutput.parse(await scoreStage.run({ candidates: items.map(candidate), rawItems: items, sources }, ctx));
}

const BUSAN = "Microsoft has signed a 1.2 GW capacity agreement with Example Data Centers for an AI data center campus in Busan. The first 200 MW phase reaches ready-for-service in 2028 with grid interconnection from KEPCO through a new 345 kV substation and liquid cooling for GPU clusters. Financing of $2.1 billion is being arranged with Korean lenders.";
const KEPCO = "KEPCO energised a new 345 kV substation serving the Saemangeum data center cluster, adding 1 GW of grid connection capacity. Transmission upgrades remain the constraint for further interconnection requests.";
const HBM = "Nvidia and SK hynix have expanded their HBM4 supply agreement for 2027 accelerator production, a report said, as advanced packaging capacity at TSMC remains the bottleneck.";

test("every candidate gets five axis scores, a reason per axis, a total and a durable row; the cycle cap and the per-source cap decide the selection", async () => {
  const db = new MemoryDb();
  const sources = [src("a", { tier: 1, text_rights: "full" }), src("b"), src("c", { tier: 3, text_rights: "link_only" })];
  const items = [
    raw("a", "https://a.example.com/busan", "Microsoft signs 1.2 GW capacity agreement with Example Data Centers in Busan", BUSAN),
    raw("a", "https://a.example.com/incheon", "Example Data Centers secures $1.4 billion project financing for Incheon 300 MW campus", "Example Data Centers closed $1.4 billion of project financing for its 300 MW hyperscale campus in Incheon, with debt from three Korean banks and a grid connection agreement with the utility; the first 120 MW is pre-leased to two hyperscalers."),
    raw("b", "https://b.example.com/kepco", "KEPCO energises 345 kV substation for the Saemangeum data center cluster", KEPCO),
    raw("c", "https://c.example.com/hbm4", "Nvidia and SK hynix expand HBM4 supply deal for 2027 accelerators", HBM),
    raw("b", "https://b.example.com/pets", "Photo app adds AI image generator for pet portraits", "A consumer photo app added an AI image generator that turns pet photos into portraits, with a chatbot to pick styles."),
  ];
  const out = await run(db, items, sources);
  assert.equal(out.candidates.length, 5, "every input candidate comes back scored");
  for (const row of out.candidates) {
    assert.equal(row.rubric_version, "score/" + testScoring().version);
    assert.equal(row.run_id, RUN_ID);
    assert.ok(row.rubric, "the rubric verdict is stored");
    for (const axis of ["relevance", "timeliness", "impact", "reader_value", "insight_potential"] as const) {
      assert.ok(row.scores[axis] >= 0 && row.scores[axis] <= 1);
      assert.ok(row.rubric!.reasons[axis].length > 0, `${axis} has a reason`);
    }
    const w = testScoring().weights;
    const expected = Number((w.relevance * row.scores.relevance + w.timeliness * row.scores.timeliness + w.impact * row.scores.impact + w.reader_value * row.scores.reader_value + w.insight_potential * row.scores.insight_potential).toFixed(4));
    assert.equal(row.total, expected, "total is the weighted sum");
  }
  const byUrl = new Map(items.map((item, i) => [item.canonical_url, out.candidates[i]!]));
  const busan = byUrl.get("https://a.example.com/busan")!;
  const incheon = byUrl.get("https://a.example.com/incheon")!;
  const kepco = byUrl.get("https://b.example.com/kepco")!;
  const hbm = byUrl.get("https://c.example.com/hbm4")!;
  const pets = byUrl.get("https://b.example.com/pets")!;
  assert.equal(busan.rubric?.tier, "full");
  assert.equal(busan.selected, true);
  assert.equal(busan.rubric?.rank, 1);
  assert.equal(busan.reject_reason, null);
  assert.equal(incheon.selected, false);
  assert.equal(incheon.reject_reason, rejectReason(NOT_SELECTED, { source_cap: "a", rank: 2 }), "the second story from the same source yields to selection.per_source_max");
  assert.equal(kepco.selected, true, "the next source's story takes the second slot");
  assert.equal(kepco.rubric?.rank, 3);
  assert.equal(pets.rubric?.tier, null);
  assert.equal(pets.reject_reason, rejectReason(BELOW_THRESHOLD, { relevance: pets.scores.relevance, relevance_min: testScoring().thresholds.relevance_min }), "an off-beat item is named by the relevance floor, not the total");
  assert.equal(out.stats.below_relevance, 1);
  assert.match(pets.rubric!.reasons.relevance, /no_infra/);
  assert.ok(hbm.scores.reader_value < busan.scores.reader_value, "link-only tier-3 copy has little reader value");
  assert.deepEqual(out.selected.map((row) => row.raw_item_id), [busan.raw_item_id, kepco.raw_item_id]);
  assert.equal(out.stats.candidates, 5);
  assert.equal(out.stats.selected, 2);
  assert.equal(out.stats.shortfall, 0);
  assert.equal(out.stats.below_threshold + out.stats.passed, 5);
  assert.equal(out.stats.not_selected, out.stats.passed - 2);
  assert.equal(out.stats.decisions[0]?.canonical_url, "https://a.example.com/busan", "decisions are listed by total");

  const rows = db.rows<{ raw_item_id: string; rubric_version: string; selected: boolean; rubric: { tier: string | null; reasons: Record<string, string> } }>("candidates");
  assert.equal(rows.length, 5, "one durable row per candidate");
  assert.ok(rows.every((r) => r.rubric_version === "score/" + testScoring().version && r.rubric.reasons["relevance"]!.length > 0));
  assert.equal(rows.filter((r) => r.selected).length, 2);
  // Re-running upserts onto the same (raw_item_id, rubric_version) rows.
  await run(db, items, sources);
  assert.equal(db.size("candidates"), 5);
});

test("thresholds, weights and caps come from config only: the same candidates change tier and selection when the config changes", async () => {
  const sources = [src("a", { tier: 1, text_rights: "full" }), src("b")];
  const items = [
    raw("a", "https://a.example.com/busan", "Microsoft signs 1.2 GW capacity agreement with Example Data Centers in Busan", BUSAN, "2026-10-10T00:00:00.000Z"),
    raw("b", "https://b.example.com/kepco", "KEPCO energises 345 kV substation for the Saemangeum data center cluster", KEPCO),
    raw("b", "https://b.example.com/hbm4", "Nvidia and SK hynix expand HBM4 supply deal for 2027 accelerators", HBM),
  ];
  const base = await run(new MemoryDb(), items, sources);
  assert.equal(base.candidates[1]?.rubric?.tier, "full");
  assert.equal(base.candidates[0]?.scores.timeliness, testScoring().timeliness.beyond, "a ten-day-old story is beyond the last bucket");
  assert.ok(base.candidates[0]!.total < 0.9 && base.candidates[0]!.total >= testScoring().thresholds.full);

  const strict = testScoring({ thresholds: { full: 0.95, brief: 0.9, relevance_min: 0.55 } });
  const out = await run(new MemoryDb(), items, sources, strict);
  assert.deepEqual(out.candidates.map((c) => c.rubric?.tier), [null, null, null], "raising the thresholds in config rejects everything");
  assert.ok(out.candidates.every((c) => c.reject_reason?.startsWith(`${BELOW_THRESHOLD}: total=`)));
  assert.equal(out.stats.shortfall, 1, "caps.briefs_per_cycle.min is reported, never filled from below the threshold");
  assert.equal(out.stats.selected, 0);

  const lenient = testScoring({ thresholds: { full: 0.4, brief: 0.3, relevance_min: 0.55 } });
  const wide = await run(new MemoryDb(), items, sources, lenient, config("{ min: 1, max: 3 }"));
  assert.equal(wide.stats.passed, 3);
  assert.equal(wide.stats.selected, 2, "selection.per_source_max keeps the third (same-source) story out even with room in the cycle cap");
  assert.equal(wide.candidates[2]?.reject_reason, rejectReason(NOT_SELECTED, { source_cap: "b", rank: 3 }));

  const twoPerSource = testScoring({ thresholds: { full: 0.4, brief: 0.3, relevance_min: 0.55 }, selection: { per_source_max: 2, abstract_max_tier: "brief" } });
  const three = await run(new MemoryDb(), items, sources, twoPerSource, config("{ min: 1, max: 3 }"));
  assert.equal(three.stats.selected, 3);

  const capOne = await run(new MemoryDb(), items, sources, lenient, config("{ min: 1, max: 1 }"));
  assert.equal(capOne.stats.selected, 1);
  assert.equal(capOne.candidates[1]?.selected, true, "the fresher KEPCO story outranks the ten-day-old Busan story");
  assert.equal(capOne.candidates[0]?.reject_reason, rejectReason(NOT_SELECTED, { rank: 2, max: 1 }));

  const relevanceOnly = testScoring({ weights: { relevance: 1, timeliness: 0, impact: 0, reader_value: 0, insight_potential: 0 } });
  const r = await run(new MemoryDb(), items, sources, relevanceOnly);
  assert.ok(r.candidates.every((c) => c.total === Number(c.scores.relevance.toFixed(4))), "weights are read from config");

  // The relevance floor is a config threshold too: a rich but off-beat item cannot pass on impact and reader value.
  const speech = raw("a", "https://a.example.com/speech", "Commission President announces €90 billion industrial investment programme", "The Commission signed a €90 billion investment programme for European industry, the President said in a speech, with €6 million for skills.");
  const floored = await run(new MemoryDb(), [speech], sources, testScoring({ thresholds: { full: 0.75, brief: 0.3, relevance_min: 0.55 } }));
  assert.ok(floored.candidates[0]!.scores.impact >= 0.5 && floored.candidates[0]!.scores.relevance < 0.55, `impact ${floored.candidates[0]!.scores.impact}, relevance ${floored.candidates[0]!.scores.relevance}`);
  assert.equal(floored.candidates[0]?.rubric?.tier, null);
  assert.match(floored.candidates[0]!.reject_reason!, /^BELOW_THRESHOLD: relevance=0(\.\d+)?,relevance_min=0\.55$/);
  const unfloored = await run(new MemoryDb(), [speech], sources, testScoring({ thresholds: { full: 0.75, brief: 0.3, relevance_min: 0 } }));
  assert.equal(unfloored.candidates[0]?.rubric?.tier, "brief", "lowering the floor in config lets the same item through");
});

test("an abstract-only source never reaches tier full, and its reader value is capped", async () => {
  const arxiv = src("arxiv", { tier: 1, text_rights: "full", text_scope: "abstract", extract: { kind: "none" } });
  const items = [raw("arxiv", "https://arxiv.example.com/abs/1", "Thermal limits of direct-to-chip liquid cooling for 150 kW GPU training clusters in Seoul AI data centers", "We model heat rejection for direct-to-chip liquid cooling in GPU clusters at rack densities up to 150 kW in Seoul data center halls with 1 GW of grid interconnection, and show CDU flow bounds usable capacity.")];
  const lenient = testScoring({ thresholds: { full: 0.3, brief: 0.2, relevance_min: 0.55 } });
  const out = await run(new MemoryDb(), items, [arxiv], lenient);
  const row = out.candidates[0]!;
  assert.ok(row.total >= 0.3, `total ${row.total} clears the full threshold on numbers`);
  assert.equal(row.rubric?.tier, "brief", "selection.abstract_max_tier");
  assert.ok(row.scores.reader_value <= testScoring().reader_value.abstract_cap);
  assert.match(row.rubric!.reasons.reader_value, /cap=abstract/);
});

test("a full-rights item without a positive extraction (failed or never attempted) is scored on its feed text as rewrite_only and never reaches tier full; the cap is not configurable", async () => {
  const full = src("a", { tier: 1, text_rights: "full" });
  const title = "Microsoft signs 1.2 GW capacity agreement with Example Data Centers in Busan";
  const ok = raw("a", "https://a.example.com/ok", title, BUSAN);
  ok.payload = { ...ok.payload, body_text: BUSAN, extraction: { ok: true, method: "generic", chars: BUSAN.length } };
  const failed = raw("a", "https://a.example.com/failed", title, BUSAN);
  failed.payload = { snippet: BUSAN, extraction: { ok: false, error: "EXTRACTION_EMPTY", detail: "no text" } };
  const missing = raw("a", "https://a.example.com/missing", title, BUSAN);
  missing.payload = { snippet: BUSAN };
  const out = await run(new MemoryDb(), [ok, failed, missing], [full]);
  const [good, bad, never] = out.candidates;
  assert.equal(good?.rubric?.tier, "full");
  assert.equal(bad?.rubric?.tier, "brief", "failed extraction never reaches full");
  assert.equal(never?.rubric?.tier, "brief", "an extraction never attempted (extract_bodies off, extract.kind none) never reaches full");
  assert.ok(bad!.scores.reader_value < good!.scores.reader_value, `reader value ${bad!.scores.reader_value} vs ${good!.scores.reader_value}`);
  assert.equal(never!.scores.reader_value, bad!.scores.reader_value);
  assert.match(bad!.rubric!.reasons.reader_value, /rights=full→rewrite_only\(extraction_failed/);
  assert.match(never!.rubric!.reasons.reader_value, /rights=full→rewrite_only\(extraction_missing/);
  assert.equal(bad!.scores.reader_value, Number((good!.scores.reader_value - testScoring().reader_value.text_rights.full + testScoring().reader_value.text_rights.rewrite_only).toFixed(3)));
  const permissive = await run(new MemoryDb(), [failed, missing], [full], testScoring({ thresholds: { full: 0.1, brief: 0.05, relevance_min: 0 }, selection: { per_source_max: 2, abstract_max_tier: "full" } }));
  assert.deepEqual(permissive.candidates.map((c) => c.rubric?.tier), ["brief", "brief"], "no threshold or selection setting lifts the cap (fail-closed)");
  assert.throws(() => SelectionConfig.parse({ per_source_max: 2, abstract_max_tier: "brief", unextracted_max_tier: "full" }), "the schema has no knob for it");
  const rewrite = raw("b", "https://b.example.com/x", title, BUSAN);
  rewrite.payload = { snippet: BUSAN };
  const other = await run(new MemoryDb(), [rewrite], [src("b")]);
  assert.doesNotMatch(other.candidates[0]!.rubric!.reasons.reader_value, /extraction_/, "the marker only matters on full-rights sources");
});

test("relevance: lifts, caps and the procedural-notice guard are explained in the reason", () => {
  const scoring = testScoring();
  const compiled = compileScoring(scoring);
  const score = (item: RawItemInsert, source: SourceConfig) => scoreRelevance(scoreDoc(candidate(item), item, source, compiled), scoring.relevance, compiled);

  const fr = src("federal-register-fixture", { url: "https://www.federalregister.gov/api/v1/documents.rss" });
  const hydro = score(raw("federal-register-fixture", "https://www.federalregister.gov/documents/2026/10/19/2026-1/hydro", "Notice of Availability of the Final Environmental Impact Statement for the Example River Hydroelectric Project", "Take notice that the Commission has issued the final environmental impact statement for the relicensing of the 120 MW Example River hydroelectric project. The project's power is sold to the regional utility."), fr);
  assert.ok(hydro.score <= scoring.relevance.caps.procedural_notice, `hydro notice ${hydro.score}`);
  assert.match(hydro.reason, /procedural_notice/);
  const largeLoad = score(raw("federal-register-fixture", "https://www.federalregister.gov/documents/2026/10/19/2026-2/large-load", "Combined Notice of Filings: Example Utility application to serve a 500 MW large load data center campus", "Take notice that Example Utility filed an application for a special contract to serve a 500 MW large load data center campus with a new 230 kV interconnection."), fr);
  assert.ok(largeLoad.score > scoring.relevance.caps.procedural_notice, "a compute hook releases the cap");
  assert.doesNotMatch(largeLoad.reason, /procedural_notice/);
  const sameTitleElsewhere = score(raw("wire", "https://wire.example.com/hydro", "Notice of Availability of the Final Environmental Impact Statement for the Example River Hydroelectric Project", "Take notice that the Commission has issued the final environmental impact statement for the 120 MW project; power is sold to the regional utility."), src("wire"));
  assert.doesNotMatch(sameTitleElsewhere.reason, /procedural_notice/, "the guard is scoped to docket sources");

  const fossil = score(raw("wire", "https://wire.example.com/fossil", "Stegosaurus fossil skeleton sells for record price at auction", "A near-complete skeleton sold at auction with power bidding."), src("wire"));
  assert.ok(fossil.score <= scoring.relevance.caps.hard_archive);
  assert.match(fossil.reason, /hard_archive/);
  const fossilFuel = score(raw("wire", "https://wire.example.com/ff", "Utility retires fossil fuel generation as data center load growth strains the grid", "The utility will replace fossil fuel generation with nuclear capacity to serve data center interconnection requests."), src("wire"));
  assert.doesNotMatch(fossilFuel.reason, /hard_archive/, "fossil fuel is on-beat");
  assert.ok(fossilFuel.score > 0.6);

  const chatter = score(raw("kr", "https://kr.example.com/stocks", "AI 데이터센터 관련주 급등… 수혜주 찾기 분주", "인공지능 데이터센터 관련주가 급등세를 보이며 증시에서 수혜주 찾기가 분주하다."), src("kr", { language: "ko" }));
  assert.ok(chatter.score <= scoring.relevance.caps.korean_market_chatter);
  assert.match(chatter.reason, /korean_market_chatter/);
  const korean = score(raw("kr", "https://kr.example.com/kepco", "한국전력, 새만금 데이터센터 전력 공급용 345kV 변전소 준공", "한국전력이 새만금 데이터센터 클러스터에 전력을 공급할 345kV 변전소를 준공했다. 1GW 규모의 계통 연계 용량이 확보됐다."), src("kr", { language: "ko" }));
  assert.ok(korean.score >= scoring.thresholds.full, `Korean aliases reach the English vocabulary: ${korean.reason}`);
  assert.match(korean.reason, /power_grid:1\.00\(/);
  assert.match(korean.reason, /lifts=data_center\+grid/);

  const consumer = score(raw("wire", "https://wire.example.com/pets", "Photo app adds AI image generator for pet portraits", "A consumer photo app added an AI image generator with a chatbot to pick styles."), src("wire"));
  assert.ok(consumer.score <= scoring.relevance.caps.no_infra.with_ai);
  assert.match(consumer.reason, /no_infra/);
  const enterprise = score(raw("wire", "https://wire.example.com/k8s", "Enterprise AI platform adds Kubernetes operator for on-prem inference workloads", "The vendor released a Kubernetes operator for private AI deployments with hybrid cloud storage, backup and disaster recovery for on-premises inference workloads."), src("wire"));
  assert.ok(enterprise.score <= scoring.relevance.caps.enterprise_only.cap);
  assert.match(enterprise.reason, /enterprise_only/);

  const busan = score(raw("a", "https://a.example.com/busan", "Microsoft signs 1.2 GW capacity agreement with Example Data Centers in Busan", BUSAN), src("a"));
  assert.ok(busan.score >= 0.9);
  assert.match(busan.reason, /lifts=.*ai\+infra/);
  assert.match(busan.reason, /dims=direct_ai_infrastructure:1\.00\(/);
});

test("timeliness buckets follow ctx.now, impact signals and reader value name what they matched", () => {
  const scoring = testScoring();
  const compiled = compileScoring(scoring);
  assert.deepEqual(scoreTimeliness("2026-10-19T23:00:00Z", NOW, scoring.timeliness), { score: 1, reason: "age=1.8h,bucket=<=3h" });
  assert.deepEqual(scoreTimeliness("2026-10-19T12:00:00Z", NOW, scoring.timeliness), { score: 0.56, reason: "age=12.8h,bucket=<=18h" });
  assert.deepEqual(scoreTimeliness("2026-10-10T00:00:00Z", NOW, scoring.timeliness), { score: scoring.timeliness.beyond, reason: "age=240.8h,bucket=beyond" });
  assert.deepEqual(scoreTimeliness(null, NOW, scoring.timeliness), { score: scoring.timeliness.unknown_date, reason: "date=unknown" });
  assert.equal(scoreTimeliness("2026-10-21T00:00:00Z", NOW, scoring.timeliness).score, 1, "a date slightly ahead of the slot counts as fresh");

  const item = raw("a", "https://a.example.com/busan", "Microsoft signs 1.2 GW capacity agreement with Example Data Centers in Busan", BUSAN);
  const doc = scoreDoc(candidate(item), item, src("a", { tier: 1, text_rights: "full" }), compiled);
  const impact = scoreImpact(doc, scoring.impact, compiled);
  assert.equal(impact.score, 1);
  assert.match(impact.reason, /capacity_gw\(1\.2 gw\)/);
  assert.match(impact.reason, /money_billion\(\$2\.1 billion\)/);
  const gpus = raw("a", "https://a.example.com/gpus", "Meta plans a 1 million GPU supercluster", "The gigawatt-scale cluster will hold 1 million GPUs across the campus.");
  assert.doesNotMatch(scoreImpact(scoreDoc(candidate(gpus), gpus, src("a"), compiled), scoring.impact, compiled).reason, /money_million/, "a count of GPUs is not a sum of money");
  assert.match(impact.reason, /hyperscaler\(microsoft\)/);
  const value = scoreReaderValue(doc, scoring.reader_value, compiled);
  assert.match(value.reason, /rights=full\(\+0\.3\),tier=1\(\+0\.2\)/);
  assert.match(value.reason, /region=.*busan/);
  assert.match(value.reason, /figures\(\+/);
  const quiet = raw("c", "https://c.example.com/quiet", "Vendor updates documentation", "Minor documentation update.");
  const quietDoc = scoreDoc(candidate(quiet), quiet, src("c", { tier: 3, text_rights: "link_only" }), compiled);
  assert.deepEqual(scoreImpact(quietDoc, scoring.impact, compiled), { score: 0, reason: "signals=none" });
  assert.equal(scoreReaderValue(quietDoc, scoring.reader_value, compiled).score, Number((scoring.reader_value.text_rights.link_only + scoring.reader_value.tier["3"]).toFixed(3)));
});

test("text normalisation: Korean aliases, whole-word terms and the fixture end to end through the runner", async () => {
  const compiled = compileScoring(testScoring());
  const text = normalizeText("한국전력이 새만금 데이터센터에 345kV 변전소를 준공했다. M&A 소식.", compiled.aliases);
  assert.ok(text.includes("kepco") && text.includes("data center") && text.includes("substation") && text.includes("energized"));
  assert.ok(hasTerm(text, "m&a"), "a vocabulary term with & matches the normalised text");
  assert.ok(hasTerm("the gpu cluster", "gpu"));
  assert.ok(!hasTerm("gpus here", "gpu"), "whole words only");
  assert.ok(hasTerm("liquid   cooling", "liquid cooling"), "flexible whitespace");

  const db = new MemoryDb();
  const sources = parseSourcesConfig(await readFile(resolve(REPO_ROOT, "fixtures/sources/scoring.yaml"), "utf8"));
  const ledger = new MemoryLedger();
  const result = await runPipeline(baseRunOptions({ ledger, db, adapters: fixtureAdapters(db, "scoring"), sources, fixtureName: "scoring", now: NOW }));
  assert.equal(result.status, "done");
  const stats = result.state.scoreStats;
  assert.equal(stats.candidates, 13);
  assert.equal(result.funnel.items_scored, 13);
  assert.equal(result.funnel.passed_gate, stats.passed);
  assert.equal(stats.selected, 2);
  assert.equal(new Set(result.state.selected.map((c) => result.state.rawItems.find((i) => i.id === c.raw_item_id)?.source_id)).size, 2);
  const counts = (await ledger.dump()).stageEvents.find((e) => e.stage === "score")?.counts;
  assert.equal(counts?.["selected"], 2);
  assert.equal(counts?.["candidates"], 13);
  const rows = db.rows<{ rubric_version: string; rubric: { reasons: Record<string, string> } | null }>("candidates").filter((r) => r.rubric_version.startsWith("score/"));
  assert.equal(rows.length, 13);
  assert.ok(rows.every((r) => r.rubric && Object.keys(r.rubric.reasons).length === 5));
});

test("numeric separators survive normalisation: decimal commas and thousands separators still feed the impact and figure patterns", async () => {
  assert.equal(normalizeText("Plans a 1,2 GW campus for $1,400 million, said KEPCO (Busan).", []), "plans a 1,2 gw campus for $1,400 million said kepco busan .");
  const item = raw("a", "https://a.example.com/comma", "Hyperscaler signs 1,2 GW data center lease worth $1,400 million in Busan", "A 1,2 GW AI data center campus in Busan: a $1,400 million lease signed with the hyperscaler, with grid interconnection by KEPCO at a 345 kV substation.");
  const out = await run(new MemoryDb(), [item], [src("a", { tier: 1, text_rights: "full" })]);
  const impact = out.candidates[0]!.rubric!.reasons.impact;
  assert.match(impact, /capacity_gw\(1,2 gw\)/, impact);
  assert.match(impact, /money_million\(\$1,400 million\)/, impact);
  assert.doesNotMatch(impact, /capacity_gw\(2 gw\)/, "a decimal comma must not split the figure");
  assert.match(out.candidates[0]!.rubric!.reasons.reader_value, /figures\(/);
});
