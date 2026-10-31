import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { NewsBrief, draftId, newsBriefSlug, parsePipelineConfig, parsePromptFile, parseSourcesConfig, silentLogger } from "@cc/shared";
import type { DraftInsert, ImageAdapter, PipelineConfig, StageContext } from "@cc/shared";
import { createFixtureImageAdapter, createImageChain, createPlaceholderImageAdapter, imageChainOrder, placeholderSvg, placeholderTopic, placeholderTopicText, MemoryImageStore, PLACEHOLDER_IMAGE_PATH, PLACEHOLDER_MODEL, createStaticImageStore } from "../src/adapters/index.ts";
import { createBudget } from "../src/budget.ts";
import { MemoryDb } from "../src/db/index.ts";
import { MemoryLedger } from "../src/ledger/index.ts";
import { runPipeline } from "../src/runner.ts";
import { DEFAULT_STAGE_SPECS, defineStageSpec } from "../src/stages/index.ts";
import { IMAGE_MISSING, imageAlt, imagePrompt, imageStage } from "../src/stages/image.ts";
import { ImageOutput, QaInput, QaOutput } from "../src/stages/types.ts";
import { emptyQaStats } from "../src/state.ts";
import { baseRunOptions, fixtureAdapters, REPO_ROOT, TEST_PIPELINE_YAML, testBannedPhrases, testQa, testScoring } from "./helpers.ts";

const NOW = new Date("2026-10-24T00:45:00Z");
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const CANDIDATE_ID = "22222222-2222-4222-8222-222222222222";

function config(imageYaml = "image: { provider: placeholder, fallback_chain: [placeholder] }", budgetYaml = ""): PipelineConfig {
  let yaml = TEST_PIPELINE_YAML.replace("image: { provider: placeholder, fallback_chain: [placeholder] }", imageYaml);
  if (budgetYaml) yaml = yaml.replace(/budget: \{[^}]*\}/, budgetYaml);
  return parsePipelineConfig(yaml, { env: {} }).config;
}

function brief(overrides: Partial<NewsBrief> = {}): NewsBrief {
  const title = overrides.title_ko ?? "한전, 새만금 데이터센터 클러스터용 345 kV 변전소 가동";
  const url = overrides.source_url ?? "https://wire-b.example.org/news/kepco-saemangeum-345kv";
  return NewsBrief.parse({
    title_ko: title,
    summary_ko: "한국전력이 새만금 데이터센터 클러스터에 전력을 공급할 345 kV 변전소를 가동했다고 밝혔다. 1단계 200 MW 공급이 시작됐고, 추가 변압기 증설은 입주 수요에 맞춰 단계적으로 진행된다. 한전은 변전소 가동으로 클러스터 내 첫 데이터센터가 올해 안에 전력을 받게 된다고 설명했다. 원문은 투자 규모와 2단계 일정은 밝히지 않았으며, 송전선 보강 계획도 언급하지 않았다.",
    why_it_matters_ko: "비수도권 데이터센터 클러스터에 실제 전력 공급이 시작됐다는 신호다. 계통 접속 병목이 풀리는 속도가 입지 결정을 좌우한다는 점에서, 다른 지방 클러스터와 하이퍼스케일러 협상에 참조 사례가 된다.",
    expert_lens_ko: "345 kV 변전소 가동은 계통 접속의 첫 관문일 뿐이며, 송전선 보강과 변압기 증설 일정이 실제 수용 용량을 결정한다. 1단계 200 MW 이후의 증설 약정이 공개되지 않은 점은 후속 입주 협상의 핵심 변수다. 다음에 확인할 신호는 2단계 접속 승인 시점과 변압기 리드타임이다.",
    source_url: url,
    source_name: "Wire B",
    published_at_source: "2026-10-19T22:00:00.000Z",
    tags: ["kepco", "power", "grid", "korea"],
    slug: newsBriefSlug(url, title),
    ...overrides,
  });
}

function draft(b: NewsBrief, body: Record<string, unknown> = { brief: b }, candidateId = CANDIDATE_ID): DraftInsert {
  return { id: draftId(candidateId, "news_brief", "2026-10-23.1"), candidate_id: candidateId, run_id: RUN_ID, content_type: "news_brief", prompt_version: "2026-10-23.1", model: "fixture", body, input_tokens: 10, output_tokens: 10, cost_usd: 0, review_status: "none" };
}

async function imagePromptFile() {
  return parsePromptFile(await readFile(resolve(REPO_ROOT, "prompts/image.md"), "utf8"), "prompts/image.md");
}

interface Ctx {
  ctx: StageContext;
  store: MemoryImageStore;
  db: MemoryDb;
  ledger: MemoryLedger;
}

async function ctxWith(cfg: PipelineConfig, image: ImageAdapter, fetchImpl: typeof globalThis.fetch = () => Promise.reject(new Error("no network"))): Promise<Ctx> {
  const db = new MemoryDb();
  const store = new MemoryImageStore();
  const ledger = new MemoryLedger();
  const runId = await ledger.startRun({ trigger: "local", startedAt: NOW, gitSha: null, flags: {} });
  const ctx: StageContext = { runId, now: NOW, config: cfg, scoring: testScoring(), bannedPhrases: testBannedPhrases(), qa: testQa(), logger: silentLogger(), ledger, budget: createBudget(cfg.budget), dryRun: true, replay: true, fixtureName: undefined, fetch: fetchImpl, adapters: { ...fixtureAdapters(db), image, imageStore: store, db } };
  return { ctx, store, db, ledger };
}

function chainFor(cfg: PipelineConfig, extra: Partial<Record<"fixture" | "openai", ImageAdapter>> = {}) {
  return createImageChain(cfg.image, { placeholder: createPlaceholderImageAdapter({ topics: cfg.image.placeholder.topics, defaultTopic: cfg.image.placeholder.default_topic }), ...extra });
}

test("placeholder first: every passed draft leaves with a deterministic brand SVG through the image store, no IMAGE_MISSING verdict", async () => {
  const cfg = config("image:\n  provider: placeholder\n  fallback_chain: [placeholder]\n  placeholder:\n    default_topic: ai-infrastructure\n    topics:\n      power-grid: [변전소, grid]\n      cooling: [cooling, 냉각]\n");
  const { ctx, store, db } = await ctxWith(cfg, chainFor(cfg));
  const b = brief();
  const out = ImageOutput.parse(await imageStage.run({ passed: [draft(b)] }, ctx));
  assert.equal(out.withImages.length, 1);
  const image = out.withImages[0]!.image!;
  assert.equal(image.path, `/images/generated/${b.slug}/hero.svg`);
  assert.equal(image.placeholder, true);
  assert.equal(image.costUsd, 0);
  assert.equal(image.provenance.provider, "placeholder");
  assert.equal(image.provenance.model, PLACEHOLDER_MODEL);
  assert.equal(image.alt, imageAlt(b));
  assert.match(image.provenance.prompt, /^Use case: Compute Current/);
  assert.match(image.provenance.prompt, /Title: 한전, 새만금/);
  const stored = store.files.get(image.path)!;
  assert.equal(stored.mime, "image/svg+xml");
  const svg = new TextDecoder().decode(stored.bytes);
  assert.match(svg, /COMPUTE CURRENT \/ POWER-GRID/, "the topic vocabulary picked the motif");
  assert.equal(svg, placeholderSvg({ title: b.title_ko, topic: "power-grid", seed: b.slug }), "same inputs, same bytes");
  assert.deepEqual(out.verdicts, [], "a placeholder-first configuration is a choice, not a failure");
  assert.equal(out.stats.placeholders, 1);
  assert.equal(out.stats.generated, 0);
  assert.equal(out.stats.image_missing, 0);
  assert.equal(db.rows("qa_results").length, 0);
  assert.equal(placeholderTopic("liquid cooling retrofit", cfg.image.placeholder.topics, "x"), "cooling");
  assert.equal(placeholderTopic("nothing relevant", cfg.image.placeholder.topics, "ai-infrastructure"), "ai-infrastructure");
});

test("a served run (static store, Codex PR #86): no generated path reaches the row — the deployed static placeholder does, with model static, and no IMAGE_MISSING", async () => {
  const cfg = config("image:\n  provider: placeholder\n  fallback_chain: [placeholder]\n  placeholder:\n    default_topic: ai-infrastructure\n    topics:\n      power-grid: [변전소, grid]\n");
  const { ctx, store } = await ctxWith(cfg, chainFor(cfg));
  ctx.adapters = { ...ctx.adapters, imageStore: createStaticImageStore() };
  const out = ImageOutput.parse(await imageStage.run({ passed: [draft(brief())] }, ctx));
  assert.equal(out.withImages.length, 1);
  const image = out.withImages[0]!.image!;
  assert.equal(image.path, PLACEHOLDER_IMAGE_PATH, "a path the site serves (apps/site/public/images/placeholder-brief.svg)");
  assert.doesNotMatch(image.path, /\/images\/generated\//);
  assert.equal(image.provenance.provider, "placeholder");
  assert.equal(image.provenance.model, "static");
  assert.equal(image.placeholder, true);
  assert.deepEqual(out.verdicts, [], "the static placeholder is still an image: IMAGE_MISSING is not written");
  assert.equal(store.files.size, 0, "nothing was stored");
  await assert.rejects(createStaticImageStore().put({ bytes: new Uint8Array([1]), mime: "image/svg+xml", slug: "news/x", variant: "hero" }, ctx), /IMAGE_STORE_STATIC/);
});

test("the motif comes from the brief's title, tags and summary only — the prompt template's own vocabulary (\"grid interconnects\") never picks power-grid for a cooling brief", async () => {
  const cfg = config("image:\n  provider: placeholder\n  fallback_chain: [placeholder]\n  placeholder:\n    default_topic: ai-infrastructure\n    topics:\n      power-grid: [변전소, grid]\n      cooling: [cooling, 냉각]\n");
  const { ctx, store } = await ctxWith(cfg, chainFor(cfg));
  const title = "Example, 서울 캠퍼스 액침 냉각 전환으로 PUE 1.15 달성";
  const url = "https://wire-a.example.com/news/example-seoul-liquid-cooling";
  const cooling = brief({
    title_ko: title,
    source_url: url,
    slug: newsBriefSlug(url, title),
    summary_ko: "Example이 서울 캠퍼스의 20 MW 추론 구역을 직접 액체 냉각으로 전환해 설계 PUE를 1.4에서 1.15로 낮췄다고 밝혔다. 열 교환 장치는 랙 열마다 설치됐고 랙 밀도는 80 kW까지 올렸으며, 기존 공랭 설비는 예비 계통으로 남겼다. 운영사는 전환 구역의 서버를 멈추지 않고 열 단위로 공사를 진행했다고 설명했다. 원문은 전환 비용과 공사 기간, 2차 전환 구역의 일정은 밝히지 않았다.",
    why_it_matters_ko: "국내 운영 중인 캠퍼스에서 공랭을 액체 냉각으로 바꿔 PUE를 낮춘 사례는 드물다. 고밀도 추론 수요가 기존 자산의 재투자 결정을 앞당기고 있다는 신호이며, 전력 단가가 높은 수도권 캠퍼스에서는 냉각 전환이 증설보다 먼저 검토될 수 있다.",
    expert_lens_ko: "PUE 1.15는 설계 값이고 운영 값은 계절과 부하율에 따라 달라진다. 80 kW 랙 밀도는 열 교환 장치 용량이 상한을 정하므로 다음에 확인할 신호는 운영 PUE 공개와 2차 전환 구역 발표다. 전환 비용이 공개되지 않은 점은 투자 회수 기간 판단을 막고, 임차인 입장에서는 냉각 전환분이 임대료에 어떻게 반영되는지가 협상 변수가 된다.",
    tags: ["cooling", "pue", "korea"],
  });
  const prompt = imagePrompt((await imagePromptFile()).system, cooling);
  assert.match(prompt, /grid interconnects/, "the template's fixed vocabulary does mention grids");
  const request = { prompt, alt: imageAlt(cooling), slug: cooling.slug, title: cooling.title_ko, summary: cooling.summary_ko, tags: cooling.tags };
  assert.doesNotMatch(placeholderTopicText(request), /grid interconnects/, "the matched text excludes the prompt");
  const out = ImageOutput.parse(await imageStage.run({ passed: [draft(cooling)] }, ctx));
  const svg = new TextDecoder().decode(store.files.get(out.withImages[0]!.image!.path)!.bytes);
  assert.match(svg, /COMPUTE CURRENT \/ COOLING/, "a cooling brief gets the cooling motif");
  assert.doesNotMatch(svg, /POWER-GRID/);
  const neutral = brief({ title_ko: "데이터센터 업계 소식 묶음", slug: newsBriefSlug(url, "neutral"), summary_ko: "이번 주 업계 소식을 간단히 정리했다. 각 항목의 상세 내용은 원문 링크에서 확인할 수 있으며, 수치는 원문 기준이다. 추가 확인이 필요한 항목은 다음 호에서 다룬다. 이번 호에는 운영사 인사, 협회 일정, 정부 공고 마감일과 같은 짧은 소식만 모았고, 개별 거래나 설비 수치는 담지 않았다. 독자 제보는 다음 호 마감 전까지 받으며, 정리 기준과 누락 항목은 편집부 안내 페이지에 함께 적어 두었다.", tags: ["weekly"] });
  const out2 = ImageOutput.parse(await imageStage.run({ passed: [draft(neutral)] }, ctx));
  assert.match(new TextDecoder().decode(store.files.get(out2.withImages[0]!.image!.path)!.bytes), /COMPUTE CURRENT \/ AI-INFRASTRUCTURE/, "no article vocabulary → the default topic, which was unreachable before");
});

test("every real provider fails: the chain records each attempt, the placeholder stands in, IMAGE_MISSING (soft) is written and the stage still completes", async () => {
  const cfg = config("image:\n  provider: fixture\n  fallback_chain: [openai, placeholder]\n  pricing:\n    gpt-image-2: { usd_per_image: 0.07 }\n  timeout_ms: 200\n  max_retries: 0\n");
  const emptyFixtures = await mkdtemp(join(tmpdir(), "cc-images-"));
  const openai: ImageAdapter = { provider: "openai", async generate() { throw new Error("IMAGE_UNAVAILABLE: http 503"); } };
  const { ctx, db, ledger } = await ctxWith(cfg, chainFor(cfg, { fixture: createFixtureImageAdapter({ fixturesDir: emptyFixtures }), openai }));
  assert.deepEqual(imageChainOrder(cfg.image), ["fixture", "openai", "placeholder"]);
  const b = brief();
  const out = ImageOutput.parse(await imageStage.run({ passed: [draft(b), draft(brief({ title_ko: "두 번째 브리프 제목입니다", source_url: "https://wire-b.example.org/news/second" }), undefined, "33333333-3333-4333-8333-333333333333")] }, ctx));
  assert.equal(out.withImages.length, 2);
  for (const entry of out.withImages) {
    assert.equal(entry.image?.placeholder, true);
    assert.equal(entry.image?.provenance.provider, "placeholder");
  }
  assert.equal(out.verdicts.length, 2);
  const verdict = out.verdicts[0]!;
  assert.equal(verdict.rule, IMAGE_MISSING);
  assert.equal(verdict.severity, "soft");
  assert.equal(verdict.pass, false);
  assert.equal(verdict.reason_code, "IMAGE_PROVIDERS_FAILED");
  const attempts = verdict.evidence["attempts"] as { provider: string; ok: boolean; code: string | null }[];
  assert.deepEqual(attempts.map((a) => [a.provider, a.ok, a.code]), [["fixture", false, "FIXTURE_MISSING"], ["openai", false, "IMAGE_UNAVAILABLE"], ["placeholder", true, null]]);
  assert.equal(out.stats.failed_attempts, 4);
  assert.equal(out.stats.image_missing, 2);
  assert.equal(out.stats.placeholders, 2);
  assert.equal(out.stats.cost_usd, 0);
  assert.equal(db.rows("qa_results").length, 2, "soft verdicts are persisted for the human-review queue (ADR-004)");
  assert.equal(db.rows("qa_results")[0]?.["draft_id"], draft(b).id);
  assert.equal((await ledger.dump()).deadLetters.length, 0, "a provider failure is not a dead letter; the placeholder is the designed outcome");
});

test("budget: a paid provider is skipped, not called, when the run cannot cover another image; the verdict says so", async () => {
  const cfg = config("image:\n  provider: openai\n  fallback_chain: [placeholder]\n  pricing:\n    gpt-image-2: { usd_per_image: 0.5 }\n", "budget: { run_usd: 0.4, soft_warn_usd: 0.3, max_calls: 60 }");
  let calls = 0;
  const openai: ImageAdapter = { provider: "openai", async generate() { calls += 1; throw new Error("should not be called"); } };
  const { ctx } = await ctxWith(cfg, chainFor(cfg, { openai }));
  const out = ImageOutput.parse(await imageStage.run({ passed: [draft(brief())] }, ctx));
  assert.equal(calls, 0);
  assert.equal(out.stats.budget_stopped, 1);
  assert.equal(out.verdicts[0]?.reason_code, "IMAGE_BUDGET_SKIPPED");
  const attempts = out.verdicts[0]!.evidence["attempts"] as { provider: string; code: string | null }[];
  assert.equal(attempts[0]?.code, "IMAGE_BUDGET_SKIPPED");
  assert.equal(out.withImages[0]?.image?.placeholder, true);
});

test("a recorded fixture reply becomes a real image: bytes go to the store, provenance says fixture, no verdict", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cc-images-"));
  const b = brief();
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
  await writeFile(join(dir, "images", `${b.slug.replace(/[^A-Za-z0-9._-]+/g, "_")}.json`).replace(/\/images\//, "/images/"), "", { flag: "a" }).catch(() => undefined);
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(dir, "images"), { recursive: true });
  await writeFile(join(dir, "images", `${b.slug.replace(/[^A-Za-z0-9._-]+/g, "_")}.json`), JSON.stringify({ mime: "image/svg+xml", base64: Buffer.from(svg).toString("base64"), model: "recorded-test", cost_usd: 0.01 }));
  const cfg = config("image: { provider: fixture, fallback_chain: [placeholder] }");
  const { ctx, store } = await ctxWith(cfg, chainFor(cfg, { fixture: createFixtureImageAdapter({ fixturesDir: dir }) }));
  const out = ImageOutput.parse(await imageStage.run({ passed: [draft(b)] }, ctx));
  const image = out.withImages[0]!.image!;
  assert.equal(image.placeholder, false);
  assert.equal(image.provenance.provider, "fixture");
  assert.equal(image.provenance.model, "recorded-test");
  assert.equal(image.costUsd, 0.01);
  assert.equal(ctx.budget.spentUsd, 0.01);
  assert.equal(new TextDecoder().decode(store.files.get(image.path)!.bytes), svg);
  assert.deepEqual(out.verdicts, []);
  assert.equal(out.stats.generated, 1);
});

test("prompt template, alt text, and an invalid draft body (dead letter, image null) ", async () => {
  const file = await imagePromptFile();
  assert.equal(file.task, "image");
  const b = brief();
  const prompt = imagePrompt(file.system, b);
  assert.match(prompt, /Title: 한전, 새만금 데이터센터 클러스터용 345 kV 변전소 가동/);
  assert.match(prompt, /Tags: kepco, power, grid, korea/);
  assert.match(prompt, /Source: Wire B/);
  assert.doesNotMatch(prompt, /\{\{/, "every placeholder was filled");
  assert.equal(imageAlt(b), "한전, 새만금 데이터센터 클러스터용 345 kV 변전소 가동 — Compute Current 편집 일러스트");

  const cfg = config();
  const { ctx, ledger } = await ctxWith(cfg, chainFor(cfg));
  const out = ImageOutput.parse(await imageStage.run({ passed: [draft(b, { brief: { title_ko: "no" } })] }, ctx));
  assert.equal(out.withImages[0]?.image, null);
  const dead = (await ledger.dump()).deadLetters;
  assert.equal(dead.length, 1);
  assert.match(dead[0]!.error, /^IMAGE_INPUT_INVALID/);
  assert.equal(out.stats.with_images, 0);
});

test("end to end: generate → (stub QA passes all) → image with a failing provider → placeholders, IMAGE_MISSING ×2, publish none, run done", async () => {
  const yaml = TEST_PIPELINE_YAML.replace("image: { provider: placeholder, fallback_chain: [placeholder] }", "image: { provider: fixture, fallback_chain: [placeholder] }");
  const cfg = parsePipelineConfig(yaml, { env: {} }).config;
  const db = new MemoryDb();
  const ledger = new MemoryLedger();
  const emptyFixtures = await mkdtemp(join(tmpdir(), "cc-images-"));
  const adapters = fixtureAdapters(db, "scoring");
  adapters.image = createImageChain(cfg.image, { placeholder: createPlaceholderImageAdapter(), fixture: createFixtureImageAdapter({ fixturesDir: emptyFixtures }) });
  const passAll = defineStageSpec({
    stage: { name: "qa", input: QaInput, output: QaOutput, idempotencyKey: () => "qa", run: async (input) => ({ passed: input.drafts, verdicts: [], stats: emptyQaStats() }) },
    select: (state) => ({ drafts: state.drafts, rawItems: state.rawItems, sources: state.sources, candidates: state.candidates }),
    merge: (state, output) => ({ ...state, passed: output.passed, verdicts: output.verdicts }),
    counts: (output) => ({ qa_passed: output.passed.length }),
  });
  const stages = DEFAULT_STAGE_SPECS.map((spec) => (spec.name === "qa" ? passAll : spec));
  const sources = parseSourcesConfig(await readFile(resolve(REPO_ROOT, "fixtures/sources/scoring.yaml"), "utf8"));
  const result = await runPipeline(baseRunOptions({ config: cfg, ledger, db, adapters, sources, stages, fixtureName: "scoring" }));
  assert.equal(result.status, "done", JSON.stringify(result.stages));
  const image = result.stages.find((s) => s.stage === "image")!;
  assert.equal(image.status, "done");
  assert.equal(image.counts["passed"], 2);
  assert.equal(image.counts["with_images"], 2);
  assert.equal(image.counts["placeholders"], 2);
  assert.equal(image.counts["image_missing"], 2);
  assert.equal(result.state.withImages.every((entry) => entry.image?.placeholder === true && entry.image.path.startsWith("/images/generated/news/")), true);
  assert.equal(result.state.verdicts.filter((v) => v.rule === IMAGE_MISSING).length, 2);
  assert.equal(result.stages.find((s) => s.stage === "publish")?.status, "done");
  assert.equal(result.funnel.published, 0);
  assert.equal(result.funnel.qa_passed, 2);
  assert.equal(result.costTotalUsd, 0);
  assert.notEqual(PLACEHOLDER_IMAGE_PATH, result.state.withImages[0]!.image!.path, "the generated SVG, not the static file");
});
