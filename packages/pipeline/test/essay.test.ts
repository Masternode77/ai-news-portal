/**
 * Phase 3e insight essays: eligibility and daily limits, the essay attempt inside generate, the QA rules
 * (ESSAY_STRUCTURE and the shared rules reading `body.essay`), the publication row and how the site renders
 * it, and the prompt's includes. The clean essay is the recorded reply of the `essay` replay fixture
 * (fixtures/llm/insight_essay/<raw item id>.json), grounded in fixtures/html/essay-grid-wire.json.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { InsightEssay, candidateId, draftId, parsePipelineConfig, rawItemId, renderTemplate, requireLlmPrompt, silentLogger, templatePlaceholders } from "@cc/shared";
import type { CandidateInsert, DraftInsert, EssayConfig, InsightEssayDraft, LlmAdapter, LlmRequest, LlmResponse, PipelineConfig, QaEvidence, RawItemInsert, SourceConfig, StageContext } from "@cc/shared";
import { createFilePromptRegistry, createMemoryPromptRegistry } from "../src/adapters/index.ts";
import { PROMPT_INCLUDE_INVALID, resolveIncludes } from "../src/adapters/prompts/file.ts";
import { createBudget } from "../src/budget.ts";
import { MemoryDb } from "../src/db/index.ts";
import { MemoryLedger } from "../src/ledger/index.ts";
import { QA_RULES } from "../src/qa/registry.ts";
import { readerOf, readerText } from "../src/qa/text.ts";
import {
  ESSAY_ATTEMPTS_EXHAUSTED,
  ESSAY_DAILY_CAP,
  NO_ELIGIBLE_CANDIDATE,
  eligibleEssayCandidates,
  essayArticleBody,
  essayHeadings,
  essayHistory,
  essayIneligibility,
  insightEssaySlug,
  kstDate,
  kstDayStart,
  parseEssayDraft,
  storedHeadings,
} from "../src/stages/essay.ts";
import { generateStage } from "../src/stages/generate.ts";
import { imageSubjectOf } from "../src/stages/image.ts";
import { publicationFromDraft } from "../src/stages/publish.ts";
import { appliesTo, qaStage } from "../src/stages/qa.ts";
import { GenerateOutput, QaOutput } from "../src/stages/types.ts";
import { FIXTURES_DIR, REPO_ROOT, TEST_PIPELINE_YAML, fixtureAdapters, testBannedPhrases, testQa, testScoring } from "./helpers.ts";

const NOW = new Date("2026-11-16T07:45:00Z"); // 16:45 KST
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const URL = "https://www.grid-wire.example.org/reports/northvale-queue-4-8gw";
const RAW_ID = rawItemId(URL);
const TITLE = "Northvale Grid Authority reports 4.8 GW of AI data center requests in its interconnection queue";
const SOURCE_TEXT: string = JSON.parse(await readFile(resolve(FIXTURES_DIR, "html/essay-grid-wire.json"), "utf8"))[URL];
const RECORDED = JSON.parse(await readFile(resolve(FIXTURES_DIR, `llm/insight_essay/${RAW_ID}.json`), "utf8")) as LlmResponse;
const ESSAY_DRAFT = RECORDED.json as InsightEssayDraft;

/**
 * The site's own renderer (apps/site/src/lib), loaded at run time: the publish → render contract is tested
 * against the real code without pulling apps/site into this package's TypeScript program (rootDir).
 */
interface SiteRender {
  bodySections(body: Record<string, unknown>): Array<{ key: string; paragraphs: string[] }>;
}
interface SiteView {
  isSubheading(paragraph: string, next: string | undefined): boolean;
  LONGFORM_SECTION_KEYS: readonly string[];
  byline(row: { slug: string; content_type: string; sources: unknown[] }): { name: string };
}
const siteLib = (name: string): string => resolve(REPO_ROOT, "apps/site/src/lib", name);
const { bodySections } = (await import(siteLib("render.ts"))) as SiteRender;
const { byline, isSubheading, LONGFORM_SECTION_KEYS } = (await import(siteLib("view.ts"))) as SiteView;

function config(essay = "essay: { enabled: true }\n", budget = "budget: { run_usd: 2.0, soft_warn_usd: 1.5, max_calls: 60 }"): PipelineConfig {
  const yaml = `${TEST_PIPELINE_YAML.replace("budget: { run_usd: 2.0, soft_warn_usd: 1.5, max_calls: 60 }", budget).replace("  provider: fixture\n", "  provider: fixture\n  pricing:\n    claude-opus-5-5: { input_per_mtok: 4, output_per_mtok: 20, cache_read_per_mtok: 0.4 }\n")}${essay}`;
  return parsePipelineConfig(yaml, { env: {} }).config;
}

const ESSAY_CONFIG: EssayConfig = { enabled: true, min_source_chars: 2000, min_total: 0.6, max_attempts_per_day: 2, recent_essays: 5, sample: false };

function src(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return { id: "essay-grid-wire", name: "Essay Grid Wire", type: "rss", url: "https://www.grid-wire.example.org/feed.xml", tier: 1, enabled: true, text_rights: "full", language: "en", ...overrides };
}

function raw(overrides: Partial<RawItemInsert> = {}, payload: Record<string, unknown> = {}): RawItemInsert {
  return { id: RAW_ID, source_id: "essay-grid-wire", canonical_url: URL, title: TITLE, published_at_source: "2026-11-13T01:00:00.000Z", fetched_at: NOW.toISOString(), payload: { body_text: SOURCE_TEXT, extraction: { ok: true, method: "fixture", chars: SOURCE_TEXT.length }, ...payload }, ...overrides };
}

function cand(item: RawItemInsert = raw(), overrides: Partial<CandidateInsert> = {}, insight = 0.975, insightEligible = true, tier: "full" | "brief" | null = "full"): CandidateInsert {
  const id = candidateId(item.id!, "score/test");
  return { id, raw_item_id: item.id!, run_id: RUN_ID, rubric_version: "score/test", scores: { relevance: 0.98, timeliness: 0.06, impact: 1, reader_value: 0.8, insight_potential: insight }, total: 0.772, selected: false, reject_reason: null, rubric: { tier, rank: tier ? 1 : null, insight_eligible: insightEligible, reasons: { relevance: "r", timeliness: "t", impact: "i", reader_value: "v", insight_potential: "p" } }, ...overrides };
}

function essayRecord(overrides: Partial<InsightEssay> = {}): InsightEssay {
  return InsightEssay.parse({ ...ESSAY_DRAFT, sources: [{ url: URL, name: "Essay Grid Wire", published_at: "2026-11-13T01:00:00.000Z" }], slug: insightEssaySlug(ESSAY_DRAFT.title, NOW), ...overrides });
}

function essayDraft(essay: Record<string, unknown> = essayRecord(), promptVersion = "2026-11-16.1"): DraftInsert {
  const cid = candidateId(RAW_ID, "score/test");
  return { id: draftId(cid, "insight_essay", promptVersion), candidate_id: cid, run_id: RUN_ID, content_type: "insight_essay", prompt_version: promptVersion, model: "fixture", body: { essay, checks: { words: 1309, headings: [] }, source: { raw_item_id: RAW_ID, canonical_url: URL, source_id: "essay-grid-wire", text_rights: "full", text_scope: "full", chars: SOURCE_TEXT.length } }, input_tokens: 0, output_tokens: 0, cost_usd: 0, review_status: "none" };
}

function evidence(overrides: Partial<QaEvidence> = {}): QaEvidence {
  return { sourceText: [TITLE, SOURCE_TEXT, "Essay Grid Wire", "2026-11-13T01:00:00.000Z"].join("\n"), source: src(), rawItem: raw(), candidate: cand(), bannedPhrases: testBannedPhrases(), recentPublishedTitles: [], now: NOW, ...overrides };
}

function scriptedLlm(replies: Array<LlmResponse | Error>, seen: LlmRequest[] = []): LlmAdapter {
  let index = 0;
  return {
    provider: "fixture",
    async complete(request, ctx) {
      seen.push(request);
      const reply = (replies[index] ?? replies[replies.length - 1])!;
      index += 1;
      if (reply instanceof Error) throw reply;
      ctx.budget.record(reply.costUsd);
      return reply;
    },
  };
}

async function ctxWith(db: MemoryDb, cfg: PipelineConfig, llm?: LlmAdapter, ledger = new MemoryLedger()): Promise<{ ctx: StageContext; ledger: MemoryLedger }> {
  const runId = await ledger.startRun({ trigger: "local", startedAt: NOW, gitSha: null, flags: {} });
  const adapters = fixtureAdapters(db);
  const ctx: StageContext = { runId, now: NOW, config: cfg, scoring: testScoring(), bannedPhrases: testBannedPhrases(), qa: testQa(), logger: silentLogger(), ledger, budget: createBudget(cfg.budget), dryRun: true, replay: true, fixtureName: undefined, fetch: () => Promise.reject(new Error("no network")), adapters: { ...adapters, db, ...(llm ? { llm } : {}) } };
  return { ctx, ledger };
}

async function generate(db: MemoryDb, cfg: PipelineConfig, options: { llm?: LlmAdapter; candidates?: CandidateInsert[]; item?: RawItemInsert; source?: SourceConfig; ledger?: MemoryLedger } = {}): Promise<{ out: GenerateOutput; ledger: MemoryLedger }> {
  const { ctx, ledger } = await ctxWith(db, cfg, options.llm, options.ledger);
  const item = options.item ?? raw();
  const out = GenerateOutput.parse(await generateStage.run({ selected: [], candidates: options.candidates ?? [cand(item)], rawItems: [item], sources: [options.source ?? src()] }, ctx));
  return { out, ledger };
}

// ---------------------------------------------------------------------------
// pure helpers
// ---------------------------------------------------------------------------
test("KST day and slug: midnight KST is 15:00 UTC the day before; the slug is the title's ASCII words within 64 chars plus the KST date", () => {
  assert.equal(kstDayStart(NOW).toISOString(), "2026-11-15T15:00:00.000Z");
  assert.equal(kstDate(new Date("2026-11-16T14:59:59Z")), "2026-11-16");
  assert.equal(kstDate(new Date("2026-11-16T15:00:00Z")), "2026-11-17", "00:00 KST belongs to the next day");
  assert.equal(insightEssaySlug("In Northvale, signed load matters more than the 4.8 GW headline", NOW), "column/in-northvale-signed-load-matters-more-than-the-4-8-gw-headline-2026-11-16");
  const long = insightEssaySlug("Texas data-center buyers should price interconnection delay as delivery risk rather than a permitting nuisance", NOW);
  assert.match(long, /^column\/[a-z0-9-]{1,64}-\d{4}-\d{2}-\d{2}$/);
  assert.ok(!long.includes("--"));
  assert.equal(insightEssaySlug("Énergie über alles", NOW), "column/energie-uber-alles-2026-11-16", "diacritics are folded, not dropped");
  assert.equal(insightEssaySlug("한국어 제목", NOW), "column/essay-2026-11-16", "a title with no ASCII word still yields a valid slug");
});

test("eligibility (E1, D4): insight-eligible and passed with total ≥ min_total, full rights without an abstract scope, extraction not failed, enough body, never essayed; ranked by insight, total, id", () => {
  const item = raw();
  const essayed = new Set<string>();
  assert.equal(essayIneligibility(cand(item), item, src(), ESSAY_CONFIG, essayed), null);
  assert.equal(essayIneligibility(cand(item, {}, 0.6, false), item, src(), ESSAY_CONFIG, essayed), "not_insight_eligible");
  assert.equal(essayIneligibility(cand(item, {}, 0.9, true, null), item, src(), ESSAY_CONFIG, essayed), "below_threshold");
  assert.equal(essayIneligibility(cand(item, { total: 0.556 }, 0.9, true, "brief"), item, src(), ESSAY_CONFIG, essayed), "below_min_total", "passed the brief threshold but not the essay's topic-fit floor");
  assert.equal(essayIneligibility(cand(item, { total: 0.6 }, 0.9, true, "brief"), item, src(), ESSAY_CONFIG, essayed), null, "the floor is inclusive");
  assert.equal(essayIneligibility(cand(item), undefined, src(), ESSAY_CONFIG, essayed), "no_raw_item");
  assert.equal(essayIneligibility(cand(item), item, src({ text_rights: "rewrite_only" }), ESSAY_CONFIG, essayed), "text_rights");
  assert.equal(essayIneligibility(cand(item), item, src({ text_scope: "abstract", extract: { kind: "arxiv_abstract" } }), ESSAY_CONFIG, essayed), "abstract_only");
  assert.equal(essayIneligibility(cand(item), raw({}, { extraction: { ok: false, error: "HTTP_404" } }), src(), ESSAY_CONFIG, essayed), "extraction_failed");
  assert.equal(essayIneligibility(cand(item), raw({}, { body_text: SOURCE_TEXT.slice(0, 1999) }), src(), ESSAY_CONFIG, essayed), "short_body");
  assert.equal(essayIneligibility(cand(item), item, src(), ESSAY_CONFIG, new Set([RAW_ID])), "already_essayed");

  const other = raw({ id: rawItemId("https://www.grid-wire.example.org/reports/other"), canonical_url: "https://www.grid-wire.example.org/reports/other" });
  const items = new Map([[item.id!, item], [other.id!, other]]);
  const sources = new Map([["essay-grid-wire", src()]]);
  const ranked = eligibleEssayCandidates([cand(other, { total: 0.9 }, 0.8), cand(item, { total: 0.7 }, 0.95)], items, sources, ESSAY_CONFIG, essayed);
  assert.deepEqual(ranked.map((e) => e.candidate.raw_item_id), [item.id, other.id], "insight potential first, total second");
  const counts: Record<string, number> = {};
  const none = eligibleEssayCandidates([cand(other, { total: 0.5 }), cand(item, {}, 0.6, false), cand(item, { total: 0.58 })], items, sources, ESSAY_CONFIG, essayed, counts);
  assert.equal(none.length, 0);
  assert.deepEqual(counts, { below_min_total: 2, not_insight_eligible: 1 }, "each rejected candidate counts once, under its first failed rule");
  assert.equal(ranked[0]!.chars, SOURCE_TEXT.length);
});

test("history: today's published essays and attempts (drafts and failed essay generations) count from midnight KST; essayed raw items come from every earlier essay draft; legacy headings are read from article_body", async () => {
  const db = new MemoryDb();
  await db.upsert("publications", [
    { slug: "column/today-2026-11-16", title: "Today", content_type: "insight_essay", status: "published", published_at: "2026-11-15T16:00:00.000Z", body: { headings: ["One", "Two"] } },
    { slug: "column/yesterday", title: "Yesterday", content_type: "insight_essay", status: "published", published_at: "2026-11-15T14:00:00.000Z", body: { article_body: "Opening paragraph.\n\nSix weeks is not weather noise\n\nReasoning paragraph." } },
    { slug: "news/x", title: "Brief", content_type: "news_brief", status: "published", published_at: "2026-11-16T01:00:00.000Z", body: {} },
  ], ["slug"]);
  await db.upsert("drafts", [
    { id: "d1", candidate_id: "c1", content_type: "insight_essay", prompt_version: "v", created_at: "2026-11-15T15:30:00.000Z", body: { source: { raw_item_id: "r-today" } } },
    { id: "d2", candidate_id: "c2", content_type: "insight_essay", prompt_version: "v", created_at: "2026-11-10T00:00:00.000Z", body: { source: { raw_item_id: "r-old" } } },
    { id: "d3", candidate_id: "c3", content_type: "news_brief", prompt_version: "v", created_at: "2026-11-16T00:00:00.000Z", body: { source: { raw_item_id: "r-brief" } } },
  ], ["id"]);
  await db.insert("dead_letters", [
    { id: "f1", run_id: RUN_ID, stage: "generate", ref_table: "candidates", ref_id: "c-cut", payload: { content_type: "insight_essay", stop_reason: "max_tokens" }, error: "SCHEMA_INVALID: reply is not JSON", created_at: "2026-11-15T23:00:00.000Z" },
    { id: "f2", run_id: RUN_ID, stage: "generate", ref_table: "candidates", ref_id: "c-old", payload: { content_type: "insight_essay" }, error: "LLM_TIMEOUT", created_at: "2026-11-14T23:00:00.000Z" },
    { id: "f3", run_id: RUN_ID, stage: "generate", ref_table: "candidates", ref_id: "c-brief", payload: { canonical_url: "https://x.example/a" }, error: "SCHEMA_INVALID", created_at: "2026-11-15T23:00:00.000Z" },
  ]);
  const history = await essayHistory(db, NOW, ESSAY_CONFIG, 1);
  assert.equal(history.publishedToday, 1);
  assert.equal(history.attemptsToday, 2, "today's essay draft and today's failed essay generation; yesterday's failure and brief failures do not count");
  assert.deepEqual([...history.essayed].sort(), ["r-old", "r-today"], "brief drafts and failed generations do not mark a raw item as essayed");
  assert.deepEqual(history.recent.map((r) => r.title), ["Today", "Yesterday"]);
  assert.deepEqual(history.recent[1]!.headings, ["Six weeks is not weather noise"]);
  assert.deepEqual(storedHeadings({ headings: ["A", 3, "B"] }), ["A", "B"]);
});

test("parseEssayDraft: a recorded reply parses; tags are normalised; missing sections and a short body are SCHEMA_INVALID", () => {
  const ok = parseEssayDraft({ ...RECORDED, json: { ...ESSAY_DRAFT, tags: ["Power", "power", " grid "] } });
  assert.deepEqual(ok.tags, ["power", "grid"]);
  const { counterpoint: _c, ...missing } = ESSAY_DRAFT;
  assert.throws(() => parseEssayDraft({ ...RECORDED, json: missing }), /^Error: SCHEMA_INVALID: counterpoint/);
  assert.throws(() => parseEssayDraft({ ...RECORDED, json: { ...ESSAY_DRAFT, body: "Too short." } }), /SCHEMA_INVALID: body/);
  assert.throws(() => parseEssayDraft({ ...RECORDED, json: undefined, text: "not json" }), /SCHEMA_INVALID: reply is not JSON/);
});

// ---------------------------------------------------------------------------
// generate
// ---------------------------------------------------------------------------
test("generate drafts one essay from the best eligible candidate with prompts/insight_essay.md: stage-owned sources and slug, checks, body.source, totals include the essay", async () => {
  const db = new MemoryDb();
  const seen: LlmRequest[] = [];
  const { out } = await generate(db, config(), { llm: scriptedLlm([{ ...RECORDED, costUsd: 0.11, model: "claude-opus-5-5" }], seen) });
  assert.equal(out.stats.essay.outcome, "drafted");
  assert.equal(out.stats.essay.eligible, 1);
  assert.equal(out.stats.drafted, 1);
  assert.equal(out.stats.cost_usd, 0.11);
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.task, "insight_essay");
  assert.equal(seen[0]!.cacheKey, RAW_ID);
  assert.match(seen[0]!.system, /# Voice[\s\S]*Josh Jiwoon Inn[\s\S]*# Structure[\s\S]*insight_essay — structure template/, "voice and template are rendered into the system prompt");
  assert.doesNotMatch(seen[0]!.system, /<!--\s*include:|\{\{/u, "no include line or placeholder reaches the model");
  assert.match(seen[0]!.messages[0]!.content, /Recent essays of The Current[\s\S]*no earlier essays/);
  const draft = out.drafts[0]!;
  assert.equal(draft.content_type, "insight_essay");
  const essay = InsightEssay.parse(draft.body["essay"]);
  assert.deepEqual(essay.sources, [{ url: URL, name: "Essay Grid Wire", published_at: "2026-11-13T01:00:00.000Z" }]);
  assert.equal(essay.slug, "column/in-northvale-signed-load-matters-more-than-the-4-8-gw-headline-2026-11-16");
  const checks = draft.body["checks"] as { grounding: { pass: boolean; ungrounded: string[] }; banned: { pass: boolean }; words: number; headings: string[] };
  assert.equal(checks.grounding.pass, true, JSON.stringify(checks.grounding.ungrounded));
  assert.equal(checks.banned.pass, true);
  assert.ok(checks.words >= 1100 && checks.words <= 1900, `words ${checks.words}`);
  assert.equal(checks.headings.length, 5);
  assert.equal((draft.body["source"] as { raw_item_id: string }).raw_item_id, RAW_ID);
  assert.equal(db.rows("drafts").length, 1);
});

test("generate skips the essay with a reason: off by default, no candidates, daily cap (published today), attempts exhausted, nothing eligible; the model is never called", async () => {
  const never = scriptedLlm([new Error("must not be called")]);
  const off = await generate(new MemoryDb(), config(""), { llm: never });
  assert.equal(off.out.stats.essay.outcome, "off");
  assert.equal(off.out.stats.essay.enabled, false);

  const capped = new MemoryDb();
  await capped.upsert("publications", [{ slug: "column/x-2026-11-16", title: "x", content_type: "insight_essay", status: "published", published_at: "2026-11-16T00:00:00.000Z", body: {} }], ["slug"]);
  const c = await generate(capped, config(), { llm: never });
  assert.equal(c.out.stats.essay.outcome, "skipped");
  assert.match(c.out.stats.essay.reason!, new RegExp(`^${ESSAY_DAILY_CAP}: 1 published today`));

  const tried = new MemoryDb();
  await tried.upsert("drafts", [1, 2].map((n) => ({ id: `d${n}`, candidate_id: `c${n}`, content_type: "insight_essay", prompt_version: "v", created_at: "2026-11-16T00:00:00.000Z", body: { source: { raw_item_id: `r${n}` } } })), ["id"]);
  const a = await generate(tried, config(), { llm: never });
  assert.match(a.out.stats.essay.reason!, new RegExp(`^${ESSAY_ATTEMPTS_EXHAUSTED}: 2 attempts today`));
  assert.equal(a.out.stats.essay.attempts_today, 2);

  const failed = new MemoryDb();
  await failed.insert("dead_letters", [1, 2].map((n) => ({ id: `f${n}`, run_id: RUN_ID, stage: "generate", ref_table: "candidates", ref_id: `c${n}`, payload: { content_type: "insight_essay", stop_reason: "max_tokens" }, error: "SCHEMA_INVALID: reply is not JSON", created_at: "2026-11-16T00:00:00.000Z" })));
  const f = await generate(failed, config(), { llm: never });
  assert.match(f.out.stats.essay.reason!, new RegExp(`^${ESSAY_ATTEMPTS_EXHAUSTED}: 2 attempts today`), "two paid generations that failed exhaust the day like two drafts");

  const none = await generate(new MemoryDb(), config(), { llm: never, source: src({ text_rights: "link_only" }) });
  assert.match(none.out.stats.essay.reason!, new RegExp(`^${NO_ELIGIBLE_CANDIDATE}: .*\\(text_rights 1\\)$`));
  assert.equal(none.out.stats.essay.eligible, 0);
  assert.deepEqual(none.out.stats.essay.ineligible, { text_rights: 1 });
  assert.equal(none.out.drafts.length, 0);
});

test("sample mode (CC_FLAG_ESSAY=sample, staging review runs) ignores the KST daily limits but still reports them, and never re-essays a raw item", async () => {
  const db = new MemoryDb();
  await db.upsert("publications", [{ slug: "column/x-2026-11-16", title: "x", content_type: "insight_essay", status: "published", published_at: "2026-11-16T00:00:00.000Z", body: {} }], ["slug"]);
  await db.upsert("drafts", [1, 2].map((n) => ({ id: `d${n}`, candidate_id: `c${n}`, content_type: "insight_essay", prompt_version: "v", created_at: "2026-11-16T00:00:00.000Z", body: { source: { raw_item_id: `r${n}` } } })), ["id"]);
  const sample = config("essay: { enabled: true, sample: true }\n");
  const { out } = await generate(db, sample, { llm: scriptedLlm([RECORDED]) });
  assert.equal(out.stats.essay.outcome, "drafted", String(out.stats.essay.reason));
  assert.equal(out.stats.essay.published_today, 1);
  assert.equal(out.stats.essay.attempts_today, 2);
  await db.upsert("drafts", out.drafts.map((d) => ({ ...d, created_at: "2026-11-16T07:46:00.000Z" })) as unknown as Record<string, unknown>[], ["id"]);
  const again = await generate(db, sample, { llm: scriptedLlm([new Error("must not be called")]) });
  assert.match(again.out.stats.essay.reason!, new RegExp(`^${NO_ELIGIBLE_CANDIDATE}`), "the same raw item is never essayed twice, sample or not");
});

test("generate: a reply that fails the essay schema is a dead letter and stats.essay failed; a budget that cannot cover the essay stops it without a call", async () => {
  const db = new MemoryDb();
  const { out, ledger } = await generate(db, config(), { llm: scriptedLlm([{ ...RECORDED, json: { ...ESSAY_DRAFT, body: "short" }, costUsd: 0.05 }]) });
  assert.equal(out.stats.essay.outcome, "failed");
  assert.match(out.stats.essay.reason!, /^SCHEMA_INVALID: body/);
  assert.equal(out.stats.failed, 1);
  assert.equal(out.stats.cost_usd, 0.05, "a paid reply that failed is still cost");
  const dead = (await ledger.dump()).deadLetters;
  assert.equal(dead.length, 1);
  assert.equal(dead[0]!.stage, "generate");
  assert.equal((dead[0]!.payload as { content_type: string }).content_type, "insight_essay");

  const seen: LlmRequest[] = [];
  const poor = await generate(new MemoryDb(), config(undefined, "budget: { run_usd: 0.01, soft_warn_usd: 0.01, max_calls: 60 }"), { llm: scriptedLlm([RECORDED], seen) });
  assert.equal(poor.out.stats.essay.outcome, "budget_stopped");
  assert.equal(seen.length, 0);
});

// ---------------------------------------------------------------------------
// QA
// ---------------------------------------------------------------------------
async function check(code: string, draft: DraftInsert, ev: QaEvidence = evidence()) {
  const entry = testQa().rules.find((r) => r.rule === code)!;
  return QA_RULES.get(code)!.check(draft, ev, entry);
}

test("the clean essay passes every rule that judges essays; THIN_EXPERT_LENS does not judge essays and ESSAY_STRUCTURE does not judge briefs", async () => {
  const qa = testQa();
  for (const entry of qa.rules.filter((r) => r.stage === "qa")) {
    if (!appliesTo(entry, "insight_essay")) {
      assert.equal(entry.rule, "THIN_EXPERT_LENS");
      continue;
    }
    const v = await check(entry.rule, essayDraft());
    assert.equal(v.pass, true, `${entry.rule}: ${JSON.stringify(v.evidence)}`);
  }
  assert.equal(appliesTo(qa.rules.find((r) => r.rule === "ESSAY_STRUCTURE")!, "news_brief"), false);
});

test("the reader of an essay: fields in reading order without heading markers, the deck as description, the first source's name", () => {
  const reader = readerOf(essayDraft())!;
  assert.deepEqual(Object.keys(reader.fields), ["title", "deck", "thesis", "body", "counterpoint", "implications"]);
  assert.equal(reader.description, ESSAY_DRAFT.deck);
  assert.equal(reader.source_name, "Essay Grid Wire");
  assert.doesNotMatch(readerText(reader), /^#/mu);
  assert.equal(readerOf(essayDraft({ title: "broken" })), null);
});

test("shared rules read the essay: an ungrounded number, an invented name, two quotations, a banned phrase and a copied passage fail", async () => {
  const body = (extra: string) => essayDraft(essayRecord({ body: `${ESSAY_DRAFT.body}\n\n${extra}` }));
  const n = await check("UNGROUNDED_NUMBER", body("A rival queue holds 7.7 GW."));
  assert.equal(n.pass, false);
  assert.deepEqual(n.evidence["ungrounded"], ["7.7"]);
  const e = await check("UNGROUNDED_ENTITY", body("The decision also matters for buyers in the Texas market."));
  assert.equal(e.pass, false);
  assert.deepEqual(e.evidence["ungrounded"], ["Texas"]);
  const q = await check("QUOTE_TOO_LONG", body('The authority calls this "a queue of requests without studies" and "a backlog that will take time to clear".'));
  assert.equal(q.pass, false);
  const b = await check("BANNED_PATTERN", body("That is the strategic significance of the report."));
  assert.equal(b.pass, false);
  // A pasted passage dilutes in a 1,300-word essay (SIMILARITY_TOO_HIGH is a share), so the shared-run cap of QUOTE_TOO_LONG is what blocks it.
  const copied = SOURCE_TEXT.split("\n\n").slice(0, 3).join("\n\n");
  const pasted = essayDraft(essayRecord({ counterpoint: `## A copied section\n\n${copied}` }));
  const run = await check("QUOTE_TOO_LONG", pasted);
  assert.equal(run.pass, false);
  assert.ok((run.evidence["longest_shared_run"] as number) > 20);
  const whole = await check("SIMILARITY_TOO_HIGH", essayDraft(essayRecord({ body: `${SOURCE_TEXT}\n\n## A copied section\n\n${SOURCE_TEXT}\n\n## Another copied section\n\n${SOURCE_TEXT}` })));
  assert.equal(whole.pass, false, "a body that is mostly the source fails on share as well");
  const schema = await check("SCHEMA_INVALID", essayDraft({ ...essayRecord(), slug: "news/0123456789abcdef" }));
  assert.equal(schema.pass, false);
});

function structure(overrides: Partial<InsightEssay>, ev: QaEvidence = evidence()) {
  return check("ESSAY_STRUCTURE", essayDraft(essayRecord(overrides)), ev);
}

test("ESSAY_STRUCTURE: each structural miss is named in evidence.failures", async () => {
  const clean = await structure({});
  assert.equal(clean.pass, true, JSON.stringify(clean.evidence));
  assert.deepEqual(clean.evidence["headings"], essayHeadings(essayRecord()));

  const noHeading = await structure({ counterpoint: ESSAY_DRAFT.counterpoint.replace(/^## [^\n]+\n+/u, "") });
  assert.ok((noHeading.evidence["failures"] as string[]).includes("sections:counterpoint_heading"));
  const oneSection = await structure({ body: ESSAY_DRAFT.body.replace("## Where the wires run out", "Where the wires run out.").replace("## What a buyer should do with the queue", "What a buyer should do.") });
  assert.ok((oneSection.evidence["failures"] as string[]).includes("sections:body"));
  const retired = await structure({ implications: ESSAY_DRAFT.implications.replace("## Three filings that will settle the timeline", "## What to watch") });
  assert.deepEqual(retired.evidence["retired_used"], ["What to watch"]);
  const punctuated = await structure({ body: ESSAY_DRAFT.body.replace("## Where the wires run out", "## Where do the wires run out?") });
  assert.ok((punctuated.evidence["failures"] as string[]).includes("heading_shape"));
  const bullets = await structure({ implications: `${ESSAY_DRAFT.implications}\n\n- one more point to watch` });
  assert.ok((bullets.evidence["failures"] as string[]).includes("markdown"));
  const bold = await structure({ body: ESSAY_DRAFT.body.replace("My reading is", "**My reading** is") });
  assert.ok((bold.evidence["failures"] as string[]).includes("markdown"));
  const ellipsis = await structure({ deck: `${ESSAY_DRAFT.deck.slice(0, -1)}…` });
  assert.ok((ellipsis.evidence["failures"] as string[]).includes("ellipsis"));
  const question = await structure({ body: `What does a 4.8 GW queue really mean? ${ESSAY_DRAFT.body}` });
  assert.ok((question.evidence["failures"] as string[]).includes("question_open"));
  const entry = testQa().rules.find((r) => r.rule === "ESSAY_STRUCTURE")!;
  const short = await QA_RULES.get("ESSAY_STRUCTURE")!.check(essayDraft(), evidence(), { ...entry, params: { ...entry.params, section_min_words: 400 } });
  assert.ok((short.evidence["failures"] as string[]).includes("length:implications"));
});

test("ESSAY_STRUCTURE: an \"X is a Y, not a Z\" title fails only when one of the previous four essays already used that shape", async () => {
  const title = "Northvale's queue is a list of options, not a supply pipeline";
  const alone = await structure({ title }, evidence({ recentPublishedTitles: ["Cooling ratings overstate usable capacity", "Signed load decides delivery"] }));
  assert.equal(alone.pass, true, JSON.stringify(alone.evidence));
  assert.equal(alone.evidence["contrast_title"], true);
  const repeated = await structure({ title }, evidence({ recentPublishedTitles: ["One", "Two", "ERCOT's record is a capacity gate, not a permitting nuisance"] }));
  assert.ok((repeated.evidence["failures"] as string[]).includes("contrast_title"));
  const outOfWindow = await structure({ title }, evidence({ recentPublishedTitles: ["One", "Two", "Three", "Four", "ERCOT's record is a capacity gate, not a permitting nuisance"] }));
  assert.equal(outOfWindow.pass, true, "five consecutive essays: this one and the previous four");
});

test("the QA stage judges an essay with the 13 rules that apply to it, and compares its title only with essays", async () => {
  const db = new MemoryDb();
  // A title whose event signature (numbers + names) is large enough for DUPLICATE_EVENT to compare.
  const title = "Northvale Grid Authority queue: 4.8 GW requested, 0.9 GW signed, 1.1 GW of headroom";
  const essay = essayDraft(essayRecord({ title }));
  // The same event as a published brief is the point of an essay, not a duplicate.
  await db.upsert("publications", [{ slug: "news/51766a7404d41b67", title, content_type: "news_brief", status: "published", published_at: "2026-11-16T00:00:00.000Z", body: {} }], ["slug"]);
  const { ctx } = await ctxWith(db, config());
  const out = QaOutput.parse(await qaStage.run({ drafts: [essay], rawItems: [raw()], sources: [src()], candidates: [cand()] }, ctx));
  assert.equal(out.verdicts.length, 13);
  assert.equal(out.verdicts.some((v) => v.rule === "THIN_EXPERT_LENS"), false);
  assert.equal(out.stats.passed, 1, JSON.stringify(out.stats.decisions[0]));
  assert.equal(out.stats.decisions[0]!.slug, essayRecord().slug);
  assert.equal(out.stats.decisions[0]!.title, title);
  assert.equal(out.verdicts.find((v) => v.rule === "DUPLICATE_EVENT")!.evidence["compared"], 0, "the brief is not compared");

  // An essay published a month ago is outside the 7-day brief window but still among the newest essays.
  await db.upsert("publications", [{ slug: "column/earlier", title, content_type: "insight_essay", status: "published", published_at: "2026-10-15T00:00:00.000Z", body: {} }], ["slug"]);
  const again = QaOutput.parse(await qaStage.run({ drafts: [essay], rawItems: [raw()], sources: [src()], candidates: [cand()] }, (await ctxWith(db, config())).ctx));
  assert.equal(again.stats.rejected, 1);
  assert.deepEqual(again.stats.decisions[0]!.failed_rules, ["DUPLICATE_EVENT"]);
});

// ---------------------------------------------------------------------------
// image, publish and the site
// ---------------------------------------------------------------------------
test("image subject of an essay: its deck as the summary and its thesis as the why", () => {
  const subject = imageSubjectOf(essayDraft())!;
  assert.equal(subject.summary, ESSAY_DRAFT.deck);
  assert.equal(subject.why_it_matters, ESSAY_DRAFT.thesis);
  assert.equal(subject.slug, essayRecord().slug);
  assert.equal(imageSubjectOf(essayDraft({ title: "x" })), null);
});

test("publish maps an essay to the legacy column shape, and the site renders its headings as section headings under Josh Jiwoon Inn's byline", async () => {
  const { ctx } = await ctxWith(new MemoryDb(), config());
  const row = publicationFromDraft({ draft: essayDraft(), image: null }, raw(), ctx);
  assert.equal(row.content_type, "insight_essay");
  assert.equal(row.slug, "column/in-northvale-signed-load-matters-more-than-the-4-8-gw-headline-2026-11-16");
  assert.deepEqual(Object.keys(row.body).slice(0, 5), ["deck", "thesis", "article_body", "meta_description", "headings"]);
  assert.equal(row.body["meta_description"], ESSAY_DRAFT.deck);
  assert.equal(row.sources.length, 1);
  assert.equal(row.sources[0]!.title, TITLE);
  const article = row.body["article_body"] as string;
  assert.equal(article, essayArticleBody(essayRecord()));
  assert.doesNotMatch(article, /^#/mu, "no Markdown markers reach the site");

  const sections = bodySections(row.body);
  assert.deepEqual(sections.map((s) => s.key), ["deck", "thesis", "article_body"]);
  const longform = sections.find((s) => LONGFORM_SECTION_KEYS.includes(s.key))!;
  const rendered = longform.paragraphs.filter((p, i) => isSubheading(p, longform.paragraphs[i + 1]));
  assert.deepEqual(rendered, essayHeadings(essayRecord()), "every essay heading and nothing else renders as a heading");
  assert.equal(byline({ slug: row.slug, content_type: row.content_type, sources: row.sources }).name, "Josh Jiwoon Inn");
});

// ---------------------------------------------------------------------------
// the prompt
// ---------------------------------------------------------------------------
test("prompts/insight_essay.md renders the voice and the template through includes; an include outside the repository is refused", async () => {
  const file = requireLlmPrompt(await createFilePromptRegistry({ promptsDir: resolve(REPO_ROOT, "prompts") }).get("insight_essay"));
  assert.equal(file.task, "insight_essay");
  assert.equal(file.output_schema, "InsightEssayDraft");
  assert.deepEqual(templatePlaceholders(file.system), ["banned_phrases"], "the included documents add no placeholder");
  assert.doesNotMatch(file.system, /<!--\s*include:/u);
  assert.doesNotMatch(file.system, /^version: 2026/mu, "the documents' front matter is dropped");
  assert.match(file.system, /## 4\. Standing positions/);
  assert.match(file.system, /## 2\. `body` — the argument/);
  assert.doesNotThrow(() => renderTemplate(file.system, { banned_phrases: "x" }));

  const dir = await mkdtemp(join(tmpdir(), "cc-prompt-"));
  await mkdir(join(dir, "prompts"));
  await writeFile(join(dir, "doc.md"), "---\nversion: 1\n---\nIncluded text.\n");
  assert.equal(await resolveIncludes("Before\n<!-- include: ../doc.md -->\nAfter", join(dir, "prompts", "p.md")), "Before\nIncluded text.\nAfter");
  await assert.rejects(resolveIncludes("<!-- include: ../../etc/passwd -->", join(dir, "prompts", "p.md")), new RegExp(PROMPT_INCLUDE_INVALID));
  await assert.rejects(resolveIncludes("<!-- include: /etc/passwd -->", join(dir, "prompts", "p.md")), new RegExp(PROMPT_INCLUDE_INVALID));
  await assert.rejects(resolveIncludes("<!-- include: ../missing.md -->", join(dir, "prompts", "p.md")), new RegExp(PROMPT_INCLUDE_INVALID));
  const memory = createMemoryPromptRegistry({});
  await assert.rejects(memory.get("insight_essay"), /PROMPT_MISSING/);
});
