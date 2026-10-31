import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { TEMPLATE_UNRESOLVED, parsePipelineConfig, parsePromptFile, parseSourcesConfig, requireLlmPrompt, candidateId, draftId, newsBriefSlug, rawItemId, silentLogger } from "@cc/shared";
import type { CandidateInsert, LlmAdapter, LlmRequest, LlmResponse, PipelineConfig, RawItemInsert, SourceConfig, StageContext } from "@cc/shared";
import { createMemoryPromptRegistry } from "../src/adapters/index.ts";
import { BudgetExceededError, createBudget } from "../src/budget.ts";
import { MemoryDb } from "../src/db/index.ts";
import { MemoryLedger } from "../src/ledger/index.ts";
import { runPipeline } from "../src/runner.ts";
import { SCHEMA_INVALID, generateStage, groundingCheck, longestCommonRun, numberTokens, parseDraft, readerFields, sourcePacket } from "../src/stages/generate.ts";
import { GenerateOutput } from "../src/stages/types.ts";
import { baseRunOptions, fixtureAdapters, REPO_ROOT, TEST_PIPELINE_YAML, testBannedPhrases, testQa, testScoring } from "./helpers.ts";

const NOW = new Date("2026-10-20T00:45:00Z");
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const PRICING = `
  pricing:
    claude-opus-5-5: { input_per_mtok: 4, output_per_mtok: 20, cache_read_per_mtok: 0.4 }
`;

function config(extraLlm = "", budget = "budget: { run_usd: 2.0, soft_warn_usd: 1.5, max_calls: 60 }"): PipelineConfig {
  const yaml = TEST_PIPELINE_YAML.replace("budget: { run_usd: 2.0, soft_warn_usd: 1.5, max_calls: 60 }", budget).replace("  provider: fixture\n", `  provider: fixture\n${extraLlm}`);
  return parsePipelineConfig(yaml, { env: {} }).config;
}

function src(id: string, overrides: Partial<SourceConfig> = {}): SourceConfig {
  return { id, name: `Source ${id}`, type: "rss", url: `https://${id}.example.com/feed.xml`, tier: 1, enabled: true, text_rights: "full", ...overrides };
}

function raw(sourceId: string, url: string, title: string, body: string, extra: Partial<RawItemInsert> = {}): RawItemInsert {
  return { id: rawItemId(url), source_id: sourceId, canonical_url: url, title, published_at_source: "2026-10-19T22:00:00.000Z", fetched_at: NOW.toISOString(), payload: { body_text: body, extraction: { ok: true, method: "generic", chars: body.length } }, ...extra };
}

function candidate(item: RawItemInsert): CandidateInsert {
  const id = candidateId(item.id!, "score/test");
  return { id, raw_item_id: item.id!, run_id: RUN_ID, rubric_version: "score/test", scores: { relevance: 0.9, timeliness: 1, impact: 0.8, reader_value: 0.8, insight_potential: 0.7 }, total: 0.86, selected: true, reject_reason: null, rubric: { tier: "full", rank: 1, insight_eligible: true, reasons: { relevance: "r", timeliness: "t", impact: "i", reader_value: "v", insight_potential: "p" } } };
}

const BUSAN_URL = "https://a.example.com/busan";
const BUSAN_TITLE = "Microsoft signs 1.2 GW capacity agreement with Example Data Centers in Busan";
const BUSAN = "Microsoft has signed a 1.2 GW capacity agreement with Example Data Centers for an AI data center campus in Busan, the companies said on Monday. The first 200 MW phase is scheduled to reach ready-for-service in 2028, with grid interconnection secured from KEPCO through a new 345 kV substation and liquid cooling for GPU clusters. Financing of $2.1 billion is being arranged with a consortium of Korean lenders.";

const GOOD_DRAFT = {
  title_ko: "Microsoft, 부산 AI 데이터센터 캠퍼스에 1.2 GW 용량 계약 체결",
  summary_ko: "Microsoft가 Example Data Centers와 부산의 AI 데이터센터 캠퍼스에 대해 1.2 GW 규모의 용량 계약을 맺었다고 두 회사가 월요일 밝혔다. 1단계 200 MW는 2028년 ready-for-service를 목표로 하며, 계통 접속은 KEPCO가 새로 짓는 345 kV 변전소를 통해 확보했다. 자금은 한국 금융기관 컨소시엄과 21억 달러(2.1 billion) 규모로 협의 중이다. 원문은 임대 기간과 단가는 밝히지 않았다.",
  why_it_matters_ko: "국내에서 단일 하이퍼스케일러가 GW 단위 용량을 한 캠퍼스에 묶는 계약은 드물다. 비수도권 입지와 한전 변전소 신설이 대형 AI 수요의 실제 경로가 되고 있음을 보여주며, 국내 운영사와 금융기관에는 참조 거래가 생긴 셈이다.",
  expert_lens_ko: "1.2 GW 계약과 200 MW 1단계 사이의 간극이 핵심이다. 2028년 RFS는 345 kV 변전소 준공과 송전 보강이 동시에 맞아야 가능하며, 원문은 그 공정 리스크를 다루지 않는다. 21억 달러 금융은 1단계 규모에 비해 커 보여 후속 단계까지 포함한 약정일 가능성이 있다. 다음에 확인할 신호는 한전의 계통 접속 승인 시점이다.",
  tags: ["Hyperscale", "korea", "power", "grid", "financing", "cooling", "extra-seventh"],
};

function response(json: unknown, overrides: Partial<LlmResponse> = {}): LlmResponse {
  return { text: JSON.stringify(json), json, usage: { inputTokens: 1500, outputTokens: 700, cacheReadTokens: 0 }, costUsd: 0.02, model: "claude-opus-5-5", stopReason: "end_turn", ...overrides };
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

async function promptFile() {
  return requireLlmPrompt(parsePromptFile(await readFile(resolve(REPO_ROOT, "prompts/news_brief.md"), "utf8"), "prompts/news_brief.md"));
}

async function run(db: MemoryDb, items: RawItemInsert[], sources: SourceConfig[], llm: LlmAdapter, cfg = config(), ledger = new MemoryLedger(), budget = createBudget(cfg.budget), systemOverride?: string): Promise<GenerateOutput> {
  const file = await promptFile();
  const prompts = createMemoryPromptRegistry({ news_brief: systemOverride === undefined ? file : { ...file, system: systemOverride } });
  const runId = await ledger.startRun({ trigger: "local", startedAt: NOW, gitSha: null, flags: {} });
  const ctx: StageContext = { runId, now: NOW, config: cfg, scoring: testScoring(), bannedPhrases: testBannedPhrases(), qa: testQa(), logger: silentLogger(), ledger, budget, dryRun: true, replay: true, fixtureName: undefined, fetch: () => Promise.reject(new Error("no network")), adapters: { ...fixtureAdapters(db), llm, prompts, db } };
  return GenerateOutput.parse(await generateStage.run({ selected: items.map((item) => ({ ...candidate(item), run_id: runId })), rawItems: items, sources }, ctx));
}

test("a selected candidate becomes a schema-valid news_brief draft: the stage fills the source fields and slug, stores checks, usage and cost, and upserts idempotently", async () => {
  const db = new MemoryDb();
  const item = raw("a", BUSAN_URL, BUSAN_TITLE, BUSAN);
  const seen: LlmRequest[] = [];
  const out = await run(db, [item], [src("a")], scriptedLlm([response(GOOD_DRAFT)], seen));
  assert.equal(out.drafts.length, 1);
  const draft = out.drafts[0]!;
  const prompt = await promptFile();
  assert.equal(draft.content_type, "news_brief");
  assert.equal(draft.prompt_version, prompt.version);
  assert.equal(draft.model, "claude-opus-5-5");
  assert.equal(draft.candidate_id, candidateId(item.id!, "score/test"));
  assert.equal(draft.id, draftId(draft.candidate_id, "news_brief", prompt.version));
  assert.equal(draft.cost_usd, 0.02);
  assert.equal(draft.input_tokens, 1500);
  assert.equal(draft.review_status, "none");
  const brief = draft.body["brief"] as Record<string, unknown>;
  assert.equal(brief["source_url"], BUSAN_URL, "the stage, not the model, names the source");
  assert.equal(brief["source_name"], "Source a");
  assert.equal(brief["published_at_source"], "2026-10-19T22:00:00.000Z");
  assert.equal(brief["slug"], newsBriefSlug(BUSAN_URL, BUSAN_TITLE));
  assert.match(brief["slug"] as string, /^news\/[a-f0-9]{16}$/);
  assert.deepEqual(brief["tags"], ["hyperscale", "korea", "power", "grid", "financing", "cooling"], "tags are lower-cased, de-duplicated and cut at six");
  const checks = draft.body["checks"] as { grounding: { numbers: string[]; ungrounded: string[]; pass: boolean }; quote_max_words: number; banned: { version: string; matches: string[]; pass: boolean } };
  assert.equal(checks.grounding.pass, true, `ungrounded: ${checks.grounding.ungrounded.join(" ")}`);
  assert.deepEqual(checks.banned, { version: testBannedPhrases().version, matches: [], pass: true }, "the banned-phrase guard runs on every draft and records the inventory version");
  assert.deepEqual(out.stats.banned, { checked: 1, passed: 1, matches: 0 });
  assert.deepEqual(out.stats.decisions[0]?.banned_matches, []);
  assert.ok(checks.grounding.numbers.includes("1.2") && checks.grounding.numbers.includes("345") && checks.grounding.numbers.includes("2028") && checks.grounding.numbers.includes("21억"), checks.grounding.numbers.join(" "));
  assert.ok(checks.quote_max_words >= 2 && checks.quote_max_words <= 20, `shared run ${checks.quote_max_words}`);
  assert.equal(out.stats.drafted, 1);
  assert.equal(out.stats.grounding_pass_rate, 1);
  assert.equal(out.stats.cost_usd, 0.02);
  assert.equal(out.stats.decisions[0]?.slug, brief["slug"]);

  const request = seen[0]!;
  assert.equal(request.task, "news_brief");
  assert.equal(request.model, "claude-opus-5-5");
  assert.equal(request.promptVersion, prompt.version);
  assert.equal(request.cacheKey, item.id);
  assert.equal(request.maxOutputTokens, prompt.max_output_tokens);
  assert.ok(request.outputSchema && (request.outputSchema as { properties?: Record<string, unknown> }).properties?.["summary_ko"], "the draft schema rides along as JSON Schema");
  assert.ok(request.system.includes("재서술"), "the system prompt is the prompt file body");
  assert.ok(request.system.includes('"전략적 의미"') && request.system.includes("느낌표") && !request.system.includes("{{"), "the 금지 표현 line is rendered from config/banned-phrases.yaml");
  assert.ok(!request.system.includes("strategic significance"), "guard-only English entries stay out of the Korean prompt");
  assert.ok(request.messages[0]!.content.includes(BUSAN_URL) && request.messages[0]!.content.includes("text_rights"));

  assert.equal(db.size("drafts"), 1);
  await run(db, [item], [src("a")], scriptedLlm([response(GOOD_DRAFT)]));
  assert.equal(db.size("drafts"), 1, "same candidate, same prompt version → the same row");
});

test("an ungrounded number is reported, not blocked; a reply that fails the schema or the call becomes a dead letter and the run continues", async () => {
  const db = new MemoryDb();
  const ledger = new MemoryLedger();
  const a = raw("a", BUSAN_URL, BUSAN_TITLE, BUSAN);
  const b = raw("b", "https://b.example.com/kepco", "KEPCO energises 345 kV substation for the Saemangeum cluster", "KEPCO energised a new 345 kV substation serving the Saemangeum data center cluster, adding 1 GW of grid connection capacity.");
  const c = raw("c", "https://c.example.com/x", "Example story three about a substation", "A third story with a 500 MW figure.");
  const invented = { ...GOOD_DRAFT, summary_ko: `${GOOD_DRAFT.summary_ko} 업계는 2단계 400 MW가 2029년에 온다고 본다.` };
  const out = await run(db, [a, b, c], [src("a"), src("b"), src("c")], scriptedLlm([response(invented), response({ title_ko: "too short" }), new Error("LLM_UNAVAILABLE: http 503")]), config(), ledger);
  assert.equal(out.stats.selected, 3);
  assert.equal(out.stats.drafted, 1);
  assert.equal(out.stats.failed, 2);
  assert.equal(out.stats.grounding.checked, 1);
  assert.equal(out.stats.grounding.passed, 0);
  assert.equal(out.stats.grounding_pass_rate, 0);
  assert.deepEqual(out.stats.decisions[0]?.grounding_ungrounded, ["400", "2029"], `the invented figures are named: ${out.stats.decisions[0]?.grounding_ungrounded.join(" ")}`);
  assert.ok(out.stats.decisions[1]!.error!.startsWith(`${SCHEMA_INVALID}: `), out.stats.decisions[1]!.error!);
  assert.match(out.stats.decisions[1]!.error!, /summary_ko/);
  assert.equal(out.stats.decisions[2]?.error, "LLM_UNAVAILABLE: http 503");
  const dead = (await ledger.dump()).deadLetters;
  assert.equal(dead.length, 2);
  assert.ok(dead.every((d) => d.stage === "generate" && d.ref_table === "candidates"));
  assert.equal(dead[0]?.ref_id, candidateId(b.id!, "score/test"));
  assert.equal(db.size("drafts"), 1, "only the valid draft is written");
});

test("the budget guard stops generation before a call it cannot cover; a first call it cannot cover ends the run as budget_stop", async () => {
  const items = [raw("a", BUSAN_URL, BUSAN_TITLE, BUSAN), raw("b", "https://b.example.com/2", "Second story about a 100 MW campus", "A 100 MW campus story."), raw("c", "https://c.example.com/3", "Third story about a 50 MW campus", "A 50 MW campus story.")];
  const sources = [src("a"), src("b"), src("c")];
  // Each reply costs 0.6 USD; the cap of 1.0 covers one call and the estimate for the next (≈0.07) still fits, the third does not.
  const tight = config(PRICING, "budget: { run_usd: 1.0, soft_warn_usd: 0.9, max_calls: 60 }");
  const budget = createBudget(tight.budget);
  const out = await run(new MemoryDb(), items, sources, scriptedLlm([response(GOOD_DRAFT, { costUsd: 0.6 }), response(GOOD_DRAFT, { costUsd: 0.6 })]), tight, new MemoryLedger(), budget);
  assert.equal(out.stats.drafted, 2, "spent 1.2? no: the second call was allowed on the pre-call estimate; the third was refused");
  assert.equal(out.stats.budget_stopped, 1);
  assert.equal(out.stats.decisions[2]?.error?.startsWith("BUDGET_EXCEEDED: "), true);
  assert.match(budget.stopReason ?? "", /^generate stopped before candidate 3\/3: /, "the stage tells the runner so the run ends as budget_stop with the two drafts kept");

  const exhausted = config(PRICING, "budget: { run_usd: 0.01, soft_warn_usd: 0.01, max_calls: 60 }");
  await assert.rejects(run(new MemoryDb(), items, sources, scriptedLlm([response(GOOD_DRAFT)]), exhausted), (error: unknown) => error instanceof BudgetExceededError);
});

test("a draft that uses a banned phrase or pattern is reported, not blocked; a prompt with an unresolved placeholder fails before any call", async () => {
  const db = new MemoryDb();
  const item = raw("a", BUSAN_URL, BUSAN_TITLE, BUSAN);
  const dirty = { ...GOOD_DRAFT, title_ko: "Microsoft, 부산에 1.2 GW 계약 — 게임 체인저!", expert_lens_ko: `${GOOD_DRAFT.expert_lens_ko} 업계에 따르면 후속 계약도 논의 중이다.` };
  const out = await run(db, [item], [src("a")], scriptedLlm([response(dirty)]));
  assert.equal(out.drafts.length, 1, "reported, not blocked (blocking is QA 3g)");
  const checks = out.drafts[0]!.body["checks"] as { banned: { matches: string[]; pass: boolean } };
  assert.deepEqual(checks.banned, { ...checks.banned, matches: ["phrase:게임 체인저", "pattern:unsourced_attribution", "pattern:exclamation"], pass: false });
  assert.deepEqual(out.stats.banned, { checked: 1, passed: 0, matches: 3 });
  assert.deepEqual(out.stats.decisions[0]?.banned_matches, checks.banned.matches);
  assert.deepEqual(Object.keys(readerFields(GOOD_DRAFT as never)), ["title_ko", "summary_ko", "why_it_matters_ko", "expert_lens_ko"], "tags are not reader copy");

  const seen: LlmRequest[] = [];
  await assert.rejects(
    run(new MemoryDb(), [item], [src("a")], scriptedLlm([response(GOOD_DRAFT)], seen), config(), new MemoryLedger(), undefined, "규칙: {{banned_phrases}} 그리고 {{tone}}"),
    (e: unknown) => e instanceof Error && e.message.startsWith(TEMPLATE_UNRESOLVED) && e.message.includes("{{tone}}"),
  );
  assert.equal(seen.length, 0, "nothing reaches the model with braces in the prompt");
});

test("checks: number claims are Korean-aware (scale words, counters), grounding compares values, and the longest shared run is deterministic", () => {
  assert.deepEqual(numberTokens("1,200 MW and 1.2 GW in 2028 for $2.1 billion; 345kV"), ["1,200", "1.2", "2028", "2.1 billion", "345"]);
  assert.deepEqual(numberTokens("1단계 200 MW, 3분기, 2차 입찰, 21억 달러, 1조원, 2028년"), ["200", "21억", "1조", "2028"], "counters and ordinals are not figures");
  const g = groundingCheck("용량은 1.2 GW, 1단계 200 MW, 2028년, 21억 달러", BUSAN);
  assert.deepEqual(g, { numbers: ["1.2", "200", "2028", "21억"], ungrounded: [], pass: true }, "21억 grounds on $2.1 billion by value");
  assert.deepEqual(groundingCheck("2027년 1,200 MW", BUSAN).ungrounded, ["2027", "1,200"], "a year the source never gave and a converted unit are both flagged");
  assert.equal(groundingCheck("2.1", BUSAN).pass, true, "the bare number of a scaled source figure grounds an unscaled claim");
  assert.deepEqual(groundingCheck("투자액은 2.1 million 달러다.", "Investment was $2.1 billion.").ungrounded, ["2.1 million"], "a scaled claim must match the canonical value, not just the digits");
  assert.equal(groundingCheck("21억 달러와 2.1 billion", "Investment was $2.1 billion.").pass, true);
  assert.deepEqual(groundingCheck("1.2조원", "1.2 GW").ungrounded, ["1.2조"]);
  assert.deepEqual(numberTokens("투자액은 2천억 달러, 1조2천억 원"), ["2천억", "1조2천억"], "a run of Korean scale words is one claim, and falling scales chain into one compound numeral");
  assert.deepEqual(groundingCheck("투자액은 2천억 달러다.", "Investment was $2000.").ungrounded, ["2천억"], "a compound scale is not its numeric prefix");
  assert.equal(groundingCheck("2천억 달러", "$200 billion").pass, true, "2천억 = 2 × 10³ × 10⁸ = 200 billion");
  assert.equal(groundingCheck("투자액 20.1억 달러", "Investment $2.01 billion").pass, true, "decimal scales compare by value, not by floating-point tails");
  assert.equal(groundingCheck("1.5만 가구", "15,000 homes").pass, true);
  assert.equal(groundingCheck("수치가 없는 문장", BUSAN).pass, true);
  // Phase 4 shadow evidence (compare.md §3): currency letters, compound Korean numerals, month digits.
  assert.equal(groundingCheck("450억 달러(45B 달러) 규모 팹", "a proposed $45B NAND flash fab").pass, true, "$45B is 45 billion");
  assert.deepEqual(groundingCheck("450억 달러", "a $45 million fab").ungrounded, ["450억"], "M is not B");
  assert.deepEqual(numberTokens("10GB HBM3E 5MW 345kV $45B €5M 1.2K"), ["10", "3", "5", "345", "45B", "5M", "1.2K"], "a letter that starts a longer word is a unit, not a scale");
  assert.equal(groundingCheck("1.2K 랙", "1,200 racks").pass, true);
  assert.equal(groundingCheck("Austria에 3억 600만 유로, Czechia에 9억 5,100만 유로", "€306 million to Austria and €951 million to Czechia").pass, true, "3억 600만 is one claim worth 306 million");
  assert.deepEqual(numberTokens("3억 600만 유로와 1조 2,000억 300만 원, 5천 3억"), ["3억 600만", "1조 2,000억 300만", "5천", "3억"], "falling scales chain; a rising pair does not");
  assert.deepEqual(groundingCheck("3억 600만 유로", "€3 million and €600 million").ungrounded, ["3억 600만"], "the halves of a compound numeral no longer ground it");
  assert.equal(groundingCheck("2024년 7월 이후 승인 39건", "39 projects approved since July 2024").pass, true, "7월 grounds on July");
  assert.deepEqual(groundingCheck("12월까지 연장", "extended until the end of the year").ungrounded, ["12"], "a month the source never names stays ungrounded");
  assert.deepEqual(groundingCheck("3개월간 7월", "three months, July").numbers, ["7"], "3개월 is a counter; 7월 is a month");
  assert.deepEqual(groundingCheck("단일 신규 원전 1기", "nearly 1.1 gigawatts").ungrounded, ["1"], "1.1 does not ground a bare 1 (compare.md §3 row 2 stays a correct rejection)");
  assert.equal(longestCommonRun("the first 200 MW phase is scheduled to reach", BUSAN), 9);
  assert.equal(longestCommonRun("완전히 다른 문장", BUSAN), 0);
  assert.equal(longestCommonRun("", BUSAN), 0);
});

test("source packet: rights and scope notes, truncation, and the draft parser's fences and tag normalisation", async () => {
  const long = raw("a", BUSAN_URL, BUSAN_TITLE, "x".repeat(50));
  const packet = sourcePacket(long, src("a"), 20);
  assert.equal(packet.body_chars, 50);
  assert.ok(packet.body_text.endsWith(" […]") && packet.body_text.length < 30);
  assert.match(packet.note, /20자에서 잘렸다/);
  const linkOnly = sourcePacket(raw("c", "https://c.example.com/1", "Title only", ""), src("c", { text_rights: "link_only" }), 1000);
  assert.equal(linkOnly.text_rights, "link_only");
  assert.match(linkOnly.note, /제목과 짧은 요약만/);
  assert.match(linkOnly.note, /본문이 없다/);
  const abstract = sourcePacket(raw("x", "https://x.example.com/1", "Paper", "abstract text"), src("x", { text_rights: "rewrite_only", text_scope: "abstract" }), 1000);
  assert.match(abstract.note, /초록/);

  const fenced = parseDraft(response(undefined as unknown, { json: undefined, text: "```json\n" + JSON.stringify(GOOD_DRAFT) + "\n```" }));
  assert.equal(fenced.title_ko, GOOD_DRAFT.title_ko);
  assert.deepEqual(fenced.tags.length, 6);
  assert.throws(() => parseDraft(response(undefined as unknown, { json: undefined, text: "I cannot do that." })), new RegExp(`^Error: ${SCHEMA_INVALID}: reply is not JSON`));
  assert.throws(() => parseDraft(response({ ...GOOD_DRAFT, slug: "news/abc" })), /slug/, "a model may not set the slug");
});

test("end to end: the scoring fixture's two selected items become two drafts from recorded replies, one of them with an ungrounded figure", async () => {
  const db = new MemoryDb();
  const sources = parseSourcesConfig(await readFile(resolve(REPO_ROOT, "fixtures/sources/scoring.yaml"), "utf8"));
  const ledger = new MemoryLedger();
  const result = await runPipeline(baseRunOptions({ ledger, db, adapters: fixtureAdapters(db, "scoring"), sources, fixtureName: "scoring", now: NOW }));
  assert.equal(result.status, "done");
  const stats = result.state.generateStats;
  assert.equal(stats.selected, 2);
  assert.equal(stats.drafted, 2);
  assert.equal(stats.failed, 0);
  assert.equal(stats.grounding.checked, 2);
  assert.equal(stats.grounding.passed, 1, "the KEPCO reply names a 2027 completion the source never gave");
  assert.deepEqual(stats.decisions.find((d) => d.source_id === "scoring-wire-b")?.grounding_ungrounded, ["2027"]);
  assert.deepEqual(stats.banned, { checked: 2, passed: 2, matches: 0 }, "the recorded replies are clean under the inventory");
  assert.equal(stats.quote_max_words <= 20, true);
  assert.equal(result.funnel.drafts, 2);
  assert.equal(result.funnel.passed_gate, result.state.scoreStats.passed);
  const counts = (await ledger.dump()).stageEvents.find((e) => e.stage === "generate")?.counts;
  assert.equal(counts?.["drafted"], 2);
  assert.equal(counts?.["grounding_passed"], 1);
  const rows = db.rows<{ content_type: string; prompt_version: string; body: { brief: { slug: string; source_url: string } } }>("drafts");
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.content_type === "news_brief" && /^news\/[a-f0-9]{16}$/.test(r.body.brief.slug)));
  assert.deepEqual(rows.map((r) => r.body.brief.source_url).sort(), ["https://wire-b.example.org/news/kepco-saemangeum-345kv", "https://www.wire-a.example.com/news/microsoft-busan-1-2gw"]);
});
