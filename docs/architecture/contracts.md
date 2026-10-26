# 계약: Stage · Adapter · 설정 스키마 (Phase 1 설계)

언어: TypeScript(`packages/*`), zod 4(`zod@^4.6`). 아래 시그니처는 Phase 2에서 `packages/shared/src/contracts/*.ts`로 옮겨 그대로 컴파일되어야 한다. 외부 호출은 전부 Adapter 뒤에 있고, Stage는 공급자 이름을 모른다(P3).

## 1. 공통 타입

```ts
import { z } from "zod";

export const RunId = z.string().uuid();
export type RunId = z.infer<typeof RunId>;

export interface StageContext {
  runId: RunId;
  now: Date;                       // 예정 슬롯 시각(ADR-002: cron 지연과 무관)
  config: PipelineConfig;          // §4
  logger: Logger;                  // 구조화 로그, 시크릿·원문 금지
  ledger: Ledger;                  // stage_events / dead_letters 기록
  budget: Budget;                  // 누계 USD, canSpend(estimateUsd), record(costUsd), stop(reason)/stopReason (3d: 스테이지가 산출물을 남기고 멈추면 러너가 런을 budget_stop으로 끝낸다)
  dryRun: boolean;                 // true면 DB 쓰기·발행·외부 호출 금지(어댑터가 fixture/모의로 대체)
  adapters: {
    sources: Record<string, SourceAdapter>;
    llm: LlmAdapter;
    image: ImageAdapter;
    publishers: Record<string, PublisherAdapter>;
    db: DbPort;                    // Supabase 클라이언트 래퍼(테이블별 upsert/select)
  };
}

export interface Stage<I, O> {
  readonly name: StageName;        // 'ingest' | 'normalize' | 'score' | 'generate' | 'qa' | 'image' | 'publish'
  readonly input: z.ZodType<I>;
  readonly output: z.ZodType<O>;
  /** 멱등: 같은 (runId, input)로 두 번 호출해도 결과·부작용이 같아야 한다. */
  idempotencyKey(input: I): string;
  run(input: I, ctx: StageContext): Promise<O>;
}
```

러너 규약(`packages/pipeline/src/runner.ts`):

1. `pipeline_runs` 선기록(`status: started`).
2. Stage마다: `enabled` 확인 → `input.parse` → `stage_events` started → `run` → `output.parse` → `stage_events` done(counts). 예외는 아이템 단위면 `dead_letters`, Stage 단위면 `stage_events.error` + 런 `partial`, 설정·DB 연결 실패면 런 `failed`.
3. 종료 시 `funnel` 13컬럼·비용 집계 → Telegram.
4. `--dry-run`은 `ctx.dryRun=true`로 전 Stage를 실행하되 DbPort가 메모리 구현으로 바뀐다. `--replay --fixture <name>`은 어댑터를 fixture 구현으로 바꾼다(네트워크 0). Phase 3b 개정: `--stage`는 콤마 목록(`--stage ingest,normalize`)을 받고, fixture 런은 `fixtures/db/<name>.json`이 있으면 메모리 DbPort를 먼저 채운다(현재 `publications`).
5. Phase 3b 개정 — normalize 계약: `NormalizeInput { rawItems, sources }` → `NormalizeOutput { candidates: CandidateInsert[](미채점: scores 0, selected false, rubric_version normalize/<version>), stats }`. 판정 순서는 발행본 URL 정체성(무기한) → 창 내 발행본 제목 유사도 → 풀 내 URL 정체성 → content_hash → 제목 키 → 제목 유사도 → 본문 shingle. 대표 사본은 `text_rights`(full 우선) → tier → 본문 길이 순. `PublicationSource.title`(선택)은 3h가 원제를 남겨 normalize가 한국어 편집 제목 대신 비교할 수 있게 한다. `SelectOptions.orderBy`가 DbPort에 추가됐다(발행본을 최신순으로 읽기 위함). 3b 후속(PR #60 리뷰): 발행본 URL 색인은 `SelectOptions.offset`(PostgREST `range`)으로 `status=published` 행 **전부**를 `normalize.published_page_size`씩 페이지 순회해 만든다(제목 비교만 창 적용).
6. Phase 3c 개정 — score 계약: `ScoreInput { candidates, rawItems, sources }` → `ScoreOutput { candidates: CandidateInsert[](전부 채점됨), selected: CandidateInsert[], stats }`. `ctx.scoring`(`config/scoring.yaml`, CLI `--scoring`)이 StageContext에 추가됐다. 5축(relevance·timeliness·impact·reader_value·insight_potential) 각 0~1, `total = Σ weights × score`, `tier = relevance < thresholds.relevance_min → BELOW_THRESHOLD(총점 무관) · total ≥ thresholds.full → full · ≥ thresholds.brief → brief · 미달 → BELOW_THRESHOLD`. 선택은 통과 후보를 total(동점: timeliness → URL) 순으로 소스당 `selection.per_source_max`, 사이클당 `caps.briefs_per_cycle.max`까지; 통과 수가 `min` 미만이면 `shortfall`로 보고하고 채우지 않는다. 모든 후보 행에 `rubric { tier, rank, insight_eligible, reasons{축별 한 줄} }`(`candidates.rubric` jsonb, 마이그레이션 0002)을 쓴다. funnel `passed_gate`는 임계값 통과 수(Phase 0 정의), 선택 수는 stage counts `selected`.
7. Phase 3d 개정 — generate 계약(news_brief): `GenerateInput { selected, rawItems, sources }` → `GenerateOutput { drafts: DraftInsert[], stats }`. 선택 후보마다 raw item·source에서 **소스 패킷**(제목·소스명·URL·발행일·언어·`text_rights`·`text_scope`·본문(`llm.max_source_chars`에서 잘라 표시)·note)을 user 메시지로 보내고, `ctx.adapters.prompts.get("news_brief")`의 system prompt와 `NewsBriefDraft` JSON 스키마로 `ctx.adapters.llm.complete()`를 호출한다. 모델은 `NewsBriefDraft { title_ko, summary_ko, why_it_matters_ko, expert_lens_ko, tags }`만 쓰고 `source_url`·`source_name`·`published_at_source`·`slug`(`newsBriefSlug`)는 스테이지가 채워 `NewsBrief`로 검증한다. 호출 전 `budget.canSpend(추정)`(첫 후보부터 불가 → `BudgetExceededError`, 도중 불가 → 남은 후보 `budget_stopped` + `ctx.budget.stop(reason)` → 러너가 런을 `budget_stop`(exit 1)으로 끝내되 완료된 초안은 다음 스테이지로 흘린다), 스키마 실패·LLM 오류는 `dead_letters(stage generate, ref candidates)`. 초안 행 `body = { brief, checks: { grounding { numbers, ungrounded, pass }, quote_max_words, banned { version, matches, pass } }, source }`, 검사는 보고만(차단은 3g). `stage_events.counts { selected, drafted, failed, budget_stopped, grounding_checked, grounding_passed, quote_max_words, banned_passed, cost_usd_milli }`, funnel `drafts`. `ctx.bannedPhrases`(`config/banned-phrases.yaml`, CLI `--banned-phrases`)가 StageContext에 추가됐다(Codex PR #65 P1): system prompt는 `prompts/news_brief.md`의 `{{banned_phrases}}` 자리를 그 인벤토리(`phrases.ko` + `patterns[].note`)로 렌더링하고(`renderTemplate`; 값이 없는 placeholder는 호출 전에 `TEMPLATE_UNRESOLVED`로 실패), 같은 인벤토리(`phrases` ko·en, `hook_starts`, `patterns[].regex`)로 초안의 독자 노출 필드(`title_ko`·`summary_ko`·`why_it_matters_ko`·`expert_lens_ko`)를 검사한다(`packages/pipeline/src/checks/banned-phrases.ts`; 3g `BANNED_PATTERN`은 같은 함수로 차단). 금지 표현 목록은 프롬프트 파일에 적지 않는다(AGENTS.md "Banned Generic Patterns").
8. Phase 3f 개정 — image 계약: `ImageInput { passed }`(QA 통과 초안) → `ImageOutput { withImages: DraftWithImage[], verdicts: QaVerdict[], stats }`. 초안마다 `body.brief`(NewsBrief)에서 프롬프트(`prompts/image.md` 템플릿의 `{{title}}·{{summary}}·{{tags}}·{{source}}` 치환)·alt(`{title_ko} — Compute Current 편집 일러스트`)·slug를 만들고 공급자 체인(`image.provider` → `image.fallback_chain`, 마지막은 항상 placeholder)을 `ctx.adapters.image.generate()`로 호출한다. 유료 공급자는 호출 전 `budget.canSpend(image.pricing[model].usd_per_image)`; 불가면 호출 없이 건너뛴다(`budget_stopped`, 런은 계속). 유료 호출의 비용은 2xx 응답 시점에 `budget.record`(다운로드·저장 실패로 플레이스홀더가 들어가도 예산에 남음)하고, 스테이지 `cost_usd`는 초안별 `budget.spentUsd` 증분이다. 플레이스홀더 모티프는 `ImageRequest { title, summary, tags }`만으로 고르고 렌더링된 `prompt`는 보지 않는다(템플릿 고정 어휘 오매칭 방지). 실제 공급자가 설정돼 있는데 플레이스홀더가 들어가면 `QaVerdict { rule: IMAGE_MISSING, severity: soft, pass: false, reason_code: IMAGE_PROVIDERS_FAILED | IMAGE_BUDGET_SKIPPED, evidence { provider_order, attempts, path } }`를 `qa_results`에 upsert(`draft_id, rule, checked_at`)하고 `state.verdicts`에 덧붙인다(ADR-004). body에 brief가 없는 초안은 dead letter(`IMAGE_INPUT_INVALID`)와 `image: null`. `stage_events.counts { passed, with_images, generated, placeholders, failed_attempts, budget_stopped, image_missing, cost_usd_milli }`.
9. Phase 3g 개정 — qa 계약: `QaInput { drafts, rawItems, sources, candidates }` → `QaOutput { passed: DraftInsert[], verdicts: QaVerdict[], stats }`. `ctx.qa`(`config/qa.yaml`, CLI `--qa`, `QaConfig`)가 StageContext에 추가됐다. 초안마다 `QaEvidence { sourceText(3d sourceTextOf: 제목·본문·소스명·발행일), source, rawItem, candidate, bannedPhrases, recentPublishedTitles(3g는 빈 배열), now }`를 만들고 `config/qa.yaml`의 enabled `stage: qa` 규칙을 **설정 순서로 전부** 실행한다(첫 hard 실패에서 멈추지 않음). 규칙은 `packages/pipeline/src/qa/rules/<CODE>.ts`(파일명 = `rule` = `reason_code`)가 export 하는 `QaRule`이고 `qa/registry.ts`의 Map에 모인다 — 설정에 있는데 파일이 없으면 `QA_RULE_UNKNOWN`으로 런 실패, 파일만 있고 설정에 없으면 돌지 않는다. 규칙이 throw 하면 실패 verdict(`evidence.error = "QA_RULE_ERROR: …"`)로 기록한다. 모든 verdict는 `qa_results`에 upsert(`draft_id, rule, checked_at`; evidence에 `qa_version`·`params`). 판정: hard 실패 ≥ 1 → `rejected`(`drafts.review_status = rejected`), `auto_pass` 아닌 soft 실패 ≥ 1 → `held`(`pending`, 사람 검토 큐), 그 외 `passed`(image·publish 입력). qa 스테이지 규칙 12 = hard `SCHEMA_INVALID`·`SOURCE_UNREACHABLE`·`QUOTE_TOO_LONG`·`SIMILARITY_TOO_HIGH`·`UNGROUNDED_NUMBER`·`UNGROUNDED_ENTITY`·`LANG_MISMATCH`·`BANNED_PATTERN` + soft `RUBRIC_BELOW_TARGET`·`READABILITY_LOW`·`SEO_FIELDS_MISSING`·`THIN_EXPERT_LENS`; `IMAGE_MISSING`은 `stage: image` 행을 3f 이미지 스테이지가 게이트로 읽는다(`qaRuleEntry(ctx.qa, "IMAGE_MISSING")`: `enabled: false` → verdict 없음, hard → 초안 `rejected`(withImages에서 제외, `drafts.review_status`), soft 비auto_pass → `held`(`pending`), soft + auto_pass → 전달; `ImageStats { rejected, held }`, decisions `disposition`); `DATE_INVALID`·`DUPLICATE_OF_PUBLISHED`·`RIGHTS_VIOLATION`·`BUDGET_EXCEEDED`는 상류 단계(3a·3b·3a/3c·3d)가 같은 의미로 막고, `EXTRACTION_CONTAMINATED`는 3a 추출기 후속, `INSIGHT_DENSITY_LOW`·`HUMAN_STYLE_LOW`는 3e. `stage_events.counts { drafts, qa_passed, rejected, held, verdicts, hard_failed, soft_failed, auto_passed, rule_errors }`, funnel `qa_passed`, `--json` `qaStats { …, rules, by_rule, decisions[{ draft_id, slug, title_ko, source_id, outcome, failed_rules, auto_passed_rules, failed_evidence }] }`. fixture RSS 어댑터는 라이브와 같이 `content:encoded`를 `body_preview`로 싣는다(권리 규칙 동일).
10. Phase 3h 개정 — publish 계약: `PublishInput { withImages, rawItems }` → `PublishOutput { published: PublishedRef[], stats }`. `flags.publish_target`이 `none`이면 아무것도 쓰지 않고 후보 전부를 `stats.decisions[].action = dry`로 보고한다("발행했을 글"). `staging`/`production`이면 `ctx.adapters.publishers.site`(`createSitePublisher`)로 ① `syncRedirects`(`config/redirects.yaml` → `redirects` upsert, `from_path`) ② 초안마다 `publicationFromDraft`(`news_brief`만; brief를 `NewsBrief`로 검증, `title = title_ko`, `body = { summary_ko, why_it_matters_ko, expert_lens_ko, tags, source_url, source_name, published_at_source, checks, generation{prompt_version, model, run_id} }`, `image` = 3f 결과, `sources = [{ url, name, published_at, title: raw item 원제 }]`, `published_at = ctx.now`, `publisher = pipeline`, `status = published`, `draft_id`) → `publisher.publish` ③ 발행된 slug(`/<slug>/`) + `publish.revalidate.extra_paths`를 `revalidate`. 한 건의 실패는 `dead_letters(stage publish, ref drafts)`와 `stats.failed`로 남고 런은 계속된다(P5). 사이트 퍼블리셔: slug로 기존 행을 읽어 같은 초안이면 제자리 갱신(id·첫 `published_at`·`legacy_id` 유지), 다른 초안이면 `publish.slug_conflict`(update \| skip \| fail); 행은 `PublicationRow`로 검증해 `upsert(publications, ..., ["slug"])`, `id = publicationId(slug)`(결정적). `revalidate`는 `ctx.fetch` GET `base_url + path` + 헤더 `x-prerender-revalidate`(토큰은 `publish.revalidate.token_env` 이름의 환경 변수), 실패는 `RevalidateResult { requested, ok, failed, skipped, errors }`로 보고만(throw 없음; `--replay`에서는 전부 실패). `unpublish(slug)`는 `status = unpublished`. `stage_events.counts { candidates, published, inserted, updated, skipped, failed, redirects_synced, revalidate_ok, revalidate_failed }`, funnel `published` = 실제 쓴 행 수, `--json` `publishStats`. 레거시 25건 이관은 `packages/pipeline/tools/migrate-legacy-publications.ts --dry-run`(`@cc/shared` `mapLegacyCollections`, Phase 5 M5가 실제 쓰기).
11. Phase 3i 개정 — 알림·운영: 러너는 바뀌지 않고 CLI가 런 뒤에 한 번 `RunSummary`를 만든다(`packages/pipeline/src/notify/summary.ts` `buildRunSummary(RunResult)`: `run_id, status, trigger, started_local(notify.summary.timezone, KST 고정 오프셋), funnel, published[{slug,url,content_type,title,action}](최대 `max_published`), failures[{code,count,sample}](단계 오류·소스 오류·generate/image/publish 실패·QA 거절 규칙(auto_pass 제외)·예산 정지를 `errorCode`로 집계, 빈도순 `top_failures`), zero_published_reasons(발행 0건이면 파이프라인 순서로 **처음** 멈춘 단계 한 줄: skipped flag_off·error·빈 출력), stages, cost{spent_usd,cap_usd,soft_warn_usd,calls,state,stop_reason,input/output_tokens}`). `renderNotification`은 done/partial이면 요약 템플릿, failed/budget_stop이면 실패 템플릿(ADR-007), 스테이지 밖 crash는 `formatRunCrash`. 같은 텍스트가 로그 `run summary`·`--json summary.text`·step summary "Notify (3i)"·Telegram에 간다. `RunResult`에 `budget { spent_usd, calls, state, stop_reason }`가 추가됐다. 전송은 `Notifier`(§2) 구현 `createTelegramNotifier`(`packages/pipeline/src/notify/telegram.ts`): `notify.telegram.enabled`(기본 false, `CC_FLAG_NOTIFY_TELEGRAM` override)이고 상태가 `on`에 있으면 `POST <base_url>/bot<token>/sendMessage` JSON `{ chat_id, text(max_chars에서 머리부터 보존), disable_web_page_preview }`를 **plain text**로, 러너와 같은 fetch 규칙으로(`--replay`는 `NETWORK_DISABLED` 실패, 재시도 없음) 보낸다. 429(`retry_after`)/5xx/네트워크만 `max_retries`회 재시도, 다른 4xx는 즉시 `TELEGRAM_HTTP_<status>: <description>`; 토큰은 URL에만 쓰고 오류·로그에서 스크럽; 결과 `NotifyResult { channel, sent, skipped(disabled|status_filtered), attempts, error, ms }`는 `--json notify`로 보고만(런 결과 불변). 켜져 있으면 `TELEGRAM_BOT_TOKEN`·`TELEGRAM_CHAT_ID`(이름, `bot_token_env`·`chat_id_env`)가 시작 시 필수(`ConfigError`). 운영 점검 `pipeline ops [--from <json>] [--json]`(`packages/pipeline/src/ops/check.ts` `assessOperations(pipeline_runs 행, { now, slotHours })`): 최근 `done/partial` 행이 heartbeat — `slot_hours × 1.5`보다 오래되면 `stale`, 없으면 `never`, 마지막 완료 2건이 failed/budget_stop이면 `failing`, 2시간 넘게 끝나지 않은 `started` 행은 `crashed`; 24 h 창·7 d 비용 집계; exit 0 ok / 1 그 외 / 2 설정 오류. 스케줄 런타임은 `.github/workflows/pipeline.yml`(ADR-002: `workflow_dispatch`만, `schedule` 주석, `--dry-run` 고정, concurrency `cc-pipeline` cancel-in-progress false, timeout 45, 시크릿 이름만, 런 JSON·로그 아티팩트 90일; 켜는 것은 승인 항목).

## 2. Adapter 인터페이스

```ts
export interface SourceAdapter {
  readonly type: "rss" | "html" | "api";
  /** 한 소스에서 아이템을 가져온다. 실패는 throw; 러너가 소스 단위로 격리한다. */
  fetch(source: SourceConfig, ctx: StageContext): Promise<RawItemInput[]>;
  /** Phase 3a 개정: fetch + 소스별 통계(listed/kept/skipped 사유/바이트/리다이렉트). ingest는 있으면 이것을 쓴다. */
  fetchDetailed?(source: SourceConfig, ctx: StageContext): Promise<{ items: RawItemInput[]; stats: SourceFetchStats }>;
  /** 본문 추출(선택). `text_rights: full` 소스에만 호출된다. 없으면 ingest가 피드 필드만 저장한다. */
  extract?(item: RawItemInput, source: SourceConfig, ctx: StageContext): Promise<ExtractedText>;
}
export interface SourceFetchStats {
  listed: number;                          // 피드가 나열한 항목 수
  kept: number;                            // url/날짜/제목 규칙과 소스별 캡 적용 후
  skipped: Record<string, number>;         // too_old | capped | pool_cap | offhost | date_missing | date_invalid | title_length | no_url | duplicate | section_missing …
  fetch?: { url: string; bytes: number; redirects: number; ms: number };
}
// 어댑터의 모든 네트워크 호출은 ctx.fetch를 쓰는 safeFetchText 하나를 지난다: https/443, 자격증명 없음,
// DNS가 공인 주소로만 해석, 같은 허용 호스트 안에서 ≤3 리다이렉트, content-type 허용 목록, 2 MiB 스트리밍 캡.
// `--replay`는 ctx.fetch를 throw로 바꾸므로 어댑터는 네트워크 0이 보장된다(R7).

export interface LlmAdapter {
  readonly provider: string;      // 'anthropic' | 'openrouter' | 'fixture'
  complete(req: LlmRequest, ctx: StageContext): Promise<LlmResponse>;
}
export const LlmRequest = z.object({
  task: z.enum(["curate", "news_brief", "expert_lens", "insight_essay", "qa_assist"]),
  model: z.string(),                       // config에서 task별 지정
  system: z.string(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
  outputSchema: z.any().optional(),        // 구조화 출력(zod → JSON schema)
  maxOutputTokens: z.number().int().positive(),
  promptVersion: z.string(),               // prompts/<task>.md 헤더 version
  cacheKey: z.string().optional(),         // Phase 3d: fixture 어댑터의 녹화 키(news_brief: raw_item_id → fixtures/llm/<task>/<key>.json)
});
export const LlmResponse = z.object({
  text: z.string(),
  json: z.unknown().optional(),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number(), cacheReadTokens: z.number().default(0) }),
  costUsd: z.number().nonnegative(),
  model: z.string(),
  stopReason: z.string(),
});
// Phase 3d: 프롬프트 파일 레지스트리(StageAdapters.prompts). 파일 구현은 prompts/<task>.md를 읽어 §6 머리말을 strict 검증하고 캐시한다.
export interface PromptRegistry { get(task: LlmTask): Promise<PromptFile> }
// Anthropic 어댑터(adapters/llm/anthropic.ts)는 ctx.fetch로만 Messages API를 호출한다(--replay에서 throw, R7). outputSchema가 있으면
// 단일 tool(emit_result) 강제 호출로 구조화 출력을 받고, 429/5xx/네트워크/타임아웃은 llm.max_retries까지 지수 백오프, 4xx는 즉시
// LLM_REQUEST_REJECTED, 비용은 llm.pricing[model]로 계산해 budget.record(행 없는 모델은 LLM_PRICING_MISSING). 키는 ANTHROPIC_API_KEY(이름만).

export interface ImageAdapter {
  readonly provider: string;      // 'placeholder' | 'openai' | 'fixture' | 'chain'
  generate(req: ImageRequest, ctx: StageContext): Promise<ImageResult>;
}
export interface ImageRequest { prompt: string; alt: string; slug: string; title?: string; tags?: readonly string[] }   // Phase 3f: title·tags는 플레이스홀더 모티프용
// Phase 3f: 생성된 바이트는 레포에 들어가지 않는다. 어댑터는 ImageStore에 넣고 돌려받은 경로를 ImageResult.path에 쓴다.
// 구현: memory(dry-run·테스트), local(CLI --images-dir); 호스팅 저장소(Supabase Storage / Vercel Blob)는 3h 결정.
export interface ImageStore {
  readonly kind: string;
  put(input: { bytes: Uint8Array; mime: "image/svg+xml" | "image/png" | "image/jpeg" | "image/webp"; slug: string; variant: string }, ctx: StageContext): Promise<{ path: string; bytes: number }>;
}
// 체인(adapters/image/chain.ts): image.provider → image.fallback_chain 순으로 시도, 시도마다 { provider, ok, code, error, ms }를 남긴다.
// placeholder 어댑터는 던지지 않는다(저장소 실패 시 정적 /images/placeholder-brief.svg). openai 어댑터는 ctx.fetch만 쓰고(--replay에서 throw),
// 429/5xx/타임아웃은 image.max_retries까지 재시도, 비용은 image.pricing[model].usd_per_image(행 없으면 IMAGE_PRICING_MISSING).
export const ImageResult = z.object({
  path: z.string(),                        // 저장 경로 또는 URL
  alt: z.string(),
  provenance: z.object({ provider: z.string(), model: z.string().optional(), prompt: z.string(), generatedAt: z.string().datetime() }),
  placeholder: z.boolean(),
  costUsd: z.number().nonnegative(),
});

export interface PublisherAdapter {        // Phase 3h: site 구현은 packages/pipeline/src/adapters/publisher/site.ts
  readonly target: "site" | "blog" | "social";
  /** 멱등: 같은 slug는 제자리 갱신, 새 slug 생성 금지. 다른 초안이 쓴 slug는 config publish.slug_conflict(update|skip|fail). */
  publish(item: PublicationInsert, ctx: StageContext): Promise<{ slug: string; url: string; action?: "inserted" | "updated" | "skipped"; id?: string }>;
  unpublish?(slug: string, ctx: StageContext): Promise<void>;            // status = unpublished (행 삭제 없음)
  revalidate?(paths: string[], ctx: StageContext): Promise<RevalidateResult>;   // site만; 실패는 보고, throw 없음
  syncRedirects?(ctx: StageContext): Promise<number>;                    // site만; config/redirects.yaml → redirects 테이블
}
export interface RevalidateResult { requested: number; ok: number; failed: number; skipped: boolean; errors: string[] }

export interface Notifier {                // Phase 3i: packages/pipeline/src/notify/telegram.ts (createTelegramNotifier); CLI가 런 뒤 1회 호출, 러너는 모른다
  readonly channel: string;                // "telegram"
  send(message: NotifyMessage, ctx: NotifyContext): Promise<NotifyResult>;   // 실패는 결과로 보고, throw 없음(soft)
}
export interface NotifyMessage { kind: "run_summary" | "run_failure"; runId: string; status: Exclude<RunStatus, "started">; text: string }   // plain text, ADR-007 레이아웃
export interface NotifyContext { fetch: typeof globalThis.fetch; logger: Logger }   // StageContext.fetch와 같은 규칙(--replay는 throw)
export interface NotifyResult { channel: string; sent: boolean; skipped: "disabled" | "status_filtered" | null; attempts: number; error: string | null; ms: number }   // error는 크리덴셜을 담지 않는다

export interface QaRule {                  // Phase 3g: packages/pipeline/src/qa/rules/<CODE>.ts 가 `rule`로 export
  readonly rule: string;                   // reason_code와 동일 (ADR-004 표) = 파일명 = config/qa.yaml의 rule
  check(draft: DraftInsert, evidence: QaEvidence, config: QaRuleConfig): Promise<QaVerdict> | QaVerdict;
}
// severity·enabled·auto_pass·stage·params는 코드가 아니라 config/qa.yaml의 행(QaRuleEntry = QaRuleConfig)에 있다.
export interface QaEvidence {
  sourceText: string | null;               // 3d sourceTextOf(raw item, source): 제목·본문·소스명·발행일
  source?: SourceConfig; rawItem?: RawItemInsert; candidate?: CandidateInsert;
  bannedPhrases: BannedPhrasesConfig;      // config/banned-phrases.yaml
  recentPublishedTitles: string[];         // 기사 간 반복 규칙용(Phase 4), 3g는 []
  now: Date;                               // checked_at
}
export const QaVerdict = z.object({
  rule: z.string(), severity: z.enum(["hard", "soft"]), pass: z.boolean(),
  reason_code: z.string(), evidence: z.record(z.string(), z.unknown()), checked_at: z.string().datetime(),
});
```

## 3. 콘텐츠 스키마 (Appendix A)

```ts
export const NewsBrief = z.object({
  title_ko: z.string().min(10).max(90),
  summary_ko: z.string().min(200).max(1200),         // 재서술, 연속 인용 ≤ 20단어·1회 (QA가 검사)
  why_it_matters_ko: z.string().min(100),
  expert_lens_ko: z.string().min(150),               // 3~5문장
  source_url: z.string().url(),
  source_name: z.string(),
  published_at_source: z.string().datetime(),
  tags: z.array(z.string()).min(1).max(6),
  image: ImageResult.optional(),
  slug: z.string().regex(/^news\/[a-f0-9]{16}$/),
});

export const InsightEssay = z.object({
  title_ko: z.string().min(10).max(90),
  thesis_ko: z.string().min(20).max(200),            // 한 문장
  body_ko: z.string().min(2500),                     // content/templates/insight_essay.md 구조
  counterpoint_ko: z.string().min(100),
  implications_ko: z.string().min(150),
  sources: z.array(z.object({ url: z.string().url(), name: z.string(), published_at: z.string().datetime() })).min(2),
  image: ImageResult,                                // 실패 시 placeholder=true
  slug: z.string().regex(/^column\/[a-z0-9-]{1,64}-\d{4}-\d{2}-\d{2}$/),
});
```

## 4. 설정 스키마

`config/pipeline.yaml`

```yaml
schedule: { cron: "45 15,23,7 * * *", timezone: "UTC", slot_hours: 8 }
flags:
  stages: { ingest: true, normalize: false, score: false, generate: false, qa: false, image: false, publish: true }   # normalize: 3b, score: 3c, generate: 3d, qa: 3g, image: 3f 기본 OFF (§7)
  publish_target: none        # none | staging | production  (ADR-006)
caps:
  briefs_per_cycle: { min: 1, max: 2 }
  essays_per_day: 1
  pool_max_items: 200          # 레거시 30 → 상향(ADR-004 재측정 대상). ingest가 소스 간 중복 제거 뒤 tier 순으로 자른다(낮은 tier부터 탈락, 추출·저장 전)
  pool_max_age_days: 10
  items_per_source: 6          # Phase 3a: 레지스트리 id별 최신 N(레거시는 표시 이름 기준)
ingest:                        # Phase 3a, 전부 선택(기본값은 packages/shared/src/schema/config.ts)
  concurrency: 6
  extract_concurrency: 3
  feed_timeout_ms: 20000
  page_timeout_ms: 12000
  max_body_bytes: 6291456
  retry_attempts: 1            # 소스별, 타임아웃·5xx·429만
  retry_backoff_ms: 2000
  snippet_chars: 220
  body_preview_chars: 800
  min_title_chars: 12
  max_title_chars: 220
  auto_disable_after: 5        # 연속 실패 런 수 → sources 테이블의 enabled=false(YAML 불변)
  extract_bodies: true
  extract_host_delay_ms: 1000  # 등록 도메인별 페이지 요청 최소 간격(호스트 간은 병렬, 호스트 안은 직렬)
  user_agent: "Mozilla/5.0 (compatible; ComputeCurrentBot/1.0)"
normalize:                     # Phase 3b, 전부 선택(기본값은 packages/shared/src/schema/config.ts)
  version: "2026-10-20.1"      # candidates.rubric_version = normalize/<version> (탈락 행)
  title_similarity: 0.85       # 제목 토큰 Dice (ADR-004)
  body_similarity: 0.6         # 본문 5-gram shingle Jaccard
  body_min_tokens: 40
  published_window_days: 7     # 발행본 제목 비교 창(URL 정체성 일치는 무기한)
  published_page_size: 1000    # 발행본 전체를 이 크기로 페이지 순회해 URL 색인을 만든다(PostgREST max-rows 1000)
budget: { run_usd: 2.0, soft_warn_usd: 1.5, max_calls: 60 }
llm:
  provider: anthropic
  models: { curate: claude-haiku-5-5, news_brief: claude-opus-5-5, expert_lens: claude-opus-5-5, insight_essay: claude-opus-5-5, qa_assist: claude-haiku-5-5 }
  pricing:                    # Phase 3d: USD/M토큰. Anthropic 어댑터는 행 없는 모델을 거부한다(비용 계산 필수)
    claude-opus-5-5: { input_per_mtok: 4, output_per_mtok: 20, cache_read_per_mtok: 0.4 }
    claude-haiku-5-5: { input_per_mtok: 0.1, output_per_mtok: 0.5, cache_read_per_mtok: 0.01 }
  base_url: https://api.anthropic.com
  timeout_ms: 90000           # 요청당; 429/5xx/타임아웃은 max_retries까지 지수 백오프
  max_retries: 2
  max_source_chars: 12000     # 모델에 보내는 원문 본문 상한(패킷에 잘림 표시)
image:                        # Phase 3f
  provider: placeholder       # placeholder | openai | fixture — 먼저 시도(기본 플레이스홀더 우선, B안)
  fallback_chain: [placeholder]   # 이어서 시도; 마지막은 placeholder 필수(스키마 refine)
  openai: { model: gpt-image-2, size: 1536x1024, quality: medium, output_format: webp }   # OPENAI_API_KEY(이름만) 필요
  pricing: { gpt-image-2: { usd_per_image: 0.07 } }   # 장당 USD; 어댑터는 행 없는 모델을 거부
  timeout_ms: 60000
  max_retries: 1
  placeholder: { default_topic: ai-infrastructure, topics: { power-grid: [grid, 변전소, …], cooling: […], … } }   # 결정적 브랜드 SVG의 모티프 어휘
notify:                       # Phase 3i (ADR-007): 런마다 요약 1건 — 로그·--json summary.text·Telegram이 같은 텍스트
  telegram:
    enabled: false            # 기본 OFF(§7; CC_FLAG_NOTIFY_TELEGRAM으로 override). 켜면 bot_token_env·chat_id_env 이름의 환경 변수가 시작 시 필수
    bot_token_env: TELEGRAM_BOT_TOKEN
    chat_id_env: TELEGRAM_CHAT_ID
    base_url: https://api.telegram.org
    timeout_ms: 10000
    max_retries: 1            # 429(retry_after)/5xx/네트워크만; --replay(NETWORK_DISABLED)는 재시도 없음
    retry_backoff_ms: 1000
    max_chars: 3800           # Bot API 4096 상한; 머리(상태·funnel·링크)부터 보존하고 꼬리를 자른다
    on: [done, partial, budget_stop, failed]   # 보내는 런 결과(started는 없음)
  summary: { timezone: Asia/Seoul, top_failures: 3, max_published: 5 }
```

`config/sources.yaml` (한 소스 ≤ 10줄, R5)

```yaml
- id: datacenterfrontier
  name: Data Center Frontier
  type: rss
  url: https://www.datacenterfrontier.com/rss
  tier: 1
  enabled: true
  text_rights: rewrite_only      # full | rewrite_only | link_only (ADR-004)
  terms_url: https://…
  reviewed_at: 2026-10-18
  pool_max_age_days: 10
```

Phase 3a 개정 — 선택 필드 3개(단순 소스는 여전히 ≤10줄). `extract`는 특수 페이지에만 쓴다:

```yaml
- id: google-cloud-ai-releases
  name: Google Cloud AI
  type: rss                      # rss | html(서버 렌더 색인; epoch.ai) | api
  url: https://docs.cloud.google.com/feeds/gcp-release-notes.xml
  tier: 2
  enabled: true
  text_rights: full
  reviewed_at: 2026-10-04
  language: en                   # ISO 639-1(선택)
  text_scope: full               # full | abstract(arXiv: 메타데이터만 CC0)
  extract:                       # text_rights: full 에서만 의미 있음
    kind: google_release_notes   # generic | google_release_notes | epoch_index | arxiv_abstract | ec_press | none
    path: /gemini-enterprise-agent-platform/release-notes   # 허용 기사 경로(정확히) 또는 path_prefix: /gradient-updates/
    hosts: [docs.cloud.google.com]                          # 기사 호스트 허용 목록(피드 호스트는 항상 포함, `*.example.com` 가능)
    license_marker: Distributed under CC BY 4.0             # 추출 페이지가 반드시 담아야 하는 가시 문구
    section: Gemini Enterprise Agent Platform               # 전제품 피드에서 남길 제품 섹션
    delay_ms: 15000                                         # 이 소스 호스트에 대한 페이지 요청 최소 간격(robots Crawl-delay; arXiv 15 s). 기본은 ingest.extract_host_delay_ms
```

규칙: 링크 호스트 제한(`hosts`)은 페이지를 실제로 가져오는 `full` 소스에만 적용된다(`rewrite_only`/`link_only`는 링크를 가져오지 않으므로 어떤 공인 https 호스트든 허용). `link_only` 소스의 `raw_items.payload`에는 `snippet`·`body_preview`가 없다(제목·링크만 저장, ADR-004). `text_scope: abstract`는 `text_rights: full`일 때 `extract.kind`가 `arxiv_abstract` 또는 `none`이어야 설정 로드를 통과한다(기본 `generic` 추출기는 페이지 전체를 저장하므로 거부). 또한 권리와 무관하게 `abstract` 범위의 피드 항목은 `snippet`·`body_preview`를 피드 요약(`description`/`summary`)에서만 채우고 `content:encoded`는 저장하지 않는다(요약이 없으면 둘 다 생략). Epoch `html` 어댑터도 같은 권리 규칙을 따른다(`full`이 아니면 본문 미저장). 자동 비활성(`sources.health.auto_disabled_at`)은 YAML의 `reviewed_at`이 그 날짜보다 뒤면 다음 런에서 해제된다. `config/sources.yaml`의 82행은 `packages/pipeline/tools/migrate-legacy-registry.ts`가 `config/sourceRegistry.yml`에서 1회 생성했다(이후 수동 편집).

`config/scoring.yaml`(Phase 3c, `ScoringConfig`, CLI `--scoring`): `version`(→ `rubric_version = score/<version>`), 루브릭 5축 가중치(relevance 0.35, timeliness 0.2, impact 0.2, reader_value 0.15, insight_potential 0.1; 합 1 검증), tier 임계값(full 0.75, brief 0.55; full ≥ brief 검증) + 관련성 축 하한 `relevance_min: 0.55`(레거시 게이트가 관련성 단독이었던 것을 보존: 영향도·독자 가치만으로는 통과 불가), `insight_trigger: 0.7`, `selection { per_source_max: 1, abstract_max_tier: brief }`(full 소스인데 `payload.extraction.ok = true`가 없는 아이템 — 추출 실패·미시도 — 은 reader_value를 rewrite_only로 계산하고 코드에서 brief 상한: 설정으로 풀 수 없는 fail-closed 게이트), 그리고 축별 규칙 데이터 — `relevance`(레거시 8차원 가중 어휘 136쌍, AI·인프라·소비자·약한 인접·화석·인접 주제 어휘, `formula`·`lifts`·`caps` 계수, 정형 고시 가드 패턴, 한국어 별칭 42·증시 패턴), `timeliness`(시간 버킷 5 + `beyond`·`unknown_date`), `impact`(신호 9: GW/MW·금액 정규식, 하이퍼스케일러·칩·한국 주요 행위자·거래 동사·규제 용어), `reader_value`(권리·tier·본문 길이·지역 용어·수치 패턴·abstract 상한), `insight_potential`(테마 6 + 다차원 폭 보너스). 엔진의 모양(축·이름 붙은 lift/cap)은 코드, 숫자·용어·패턴은 전부 이 파일. 정규식 문자열은 로드 시 컴파일 검증, 알 수 없는 키는 오류.

`config/banned-phrases.yaml`(Phase 3d, `BannedPhrasesConfig`, CLI `--banned-phrases`; AGENTS.md "Banned Generic Patterns"의 리빌드 측 정본): `version`, `phrases { ko, en }`(정확 문구; 대소문자 무시·단어 사이 공백 유연 매치), `hook_starts { ko, en }`(필드가 이 문구로 시작하면 매치), `patterns [{ name, note, regex }]`(`note`는 프롬프트에 보이는 설명, `regex`는 가드가 `iu`로 매치). 한 인벤토리가 두 곳을 먹인다 — `prompts/news_brief.md`의 `{{banned_phrases}}`(출력 언어인 `phrases.ko` + 모든 `patterns[].note`)와 초안 가드(전 항목; 3d 보고 `checks.banned`, 3g 차단 `BANNED_PATTERN`). `phrases.en` 43구·`hook_starts.en` 11구는 레거시 `config/bannedPhrases.yml`을 데이터로 이관한 것(레거시 파일은 Phase 5 컷오버에서 퇴역; 그때까지 두 파일이 공존하되 리빌드는 새 파일만 읽는다). 중복 문구(공백·대소문자 무시)·중복 패턴 이름·컴파일 안 되는 정규식·알 수 없는 키는 로드 오류. 문구를 프롬프트·폴백 문안에 복사하지 않고 이 파일을 고치고 `version`을 올린다.

`config/qa.yaml`(Phase 3g, `QaConfig`, CLI `--qa`; ADR-004 B안의 데이터 면): `version`(모든 verdict evidence의 `qa_version`; 규칙·임계값을 바꾸면 올린다) + `rules[]`(배열 순서 = 실행 순서) 각 `{ rule: UPPER_SNAKE(= qa/rules/<CODE>.ts = reason_code), severity: hard|soft, enabled(기본 true), auto_pass?(soft만 — hard에 있으면 로드 실패), stage: qa|image(기본 qa; image 행은 심각도만 제공), params: {}(임계값은 여기에만; 규칙은 `numberParam`/`stringListParam`으로 읽고 타입이 틀리면 `QA_PARAM_INVALID`) }`. strict: 중복 rule, 알 수 없는 키, 빈 rules 로드 실패. 3g 초기값: `SOURCE_UNREACHABLE.min_source_chars 500`, `QUOTE_TOO_LONG { max_quote_words 20, max_quotes 1 }`, `SIMILARITY_TOO_HIGH { overlap_max 0.22, shingle_words 8, sentence_reuse_max 0.15, copied_sentence_min_chars 45 }`, `UNGROUNDED_NUMBER.max_ungrounded 0`, `UNGROUNDED_ENTITY { max_ungrounded 0, min_chars 3, allow [Compute Current] }`, `LANG_MISMATCH.min_hangul_ratio 0.6`, `RUBRIC_BELOW_TARGET.min_total 0.70`, `READABILITY_LOW { max_avg_sentence_words 40, max_same_opening 3, opening_words 2 }`, `SEO_FIELDS_MISSING { title_max_chars 70, description_min_chars 80 }`, `THIN_EXPERT_LENS { min_sentences 3, min_concrete 3 }`; soft 4종과 `IMAGE_MISSING`은 `auto_pass: true`(Phase 4 shadow).

`config/pipeline.yaml` `publish`(Phase 3h, `PublishConfig`, 전부 기본값 있음): `base_url`(발행 URL·revalidate 요청의 루트), `slug_conflict: update|skip|fail`(다른 초안이 쓴 slug; 같은 초안의 재발행은 항상 제자리 갱신), `redirects_sync`(매 발행 런에 `config/redirects.yaml`을 `redirects` 테이블로 upsert), `revalidate { enabled(기본 false), token_env(기본 CC_REVALIDATE_TOKEN — 환경 변수 **이름**), timeout_ms, extra_paths(기본 ["/"]) }`. 무엇을 쓸지는 `flags.publish_target`이, 어떻게 쓸지는 이 블록이 정한다.

`config/redirects.yaml`(Phase 3h, `RedirectsConfig`, CLI `--redirects`): `[{ from_path, to_path, status: 301|410 }]`, `from_path` 유일·둘 다 루트 상대 경로. 초기 4행(vercel.json의 4건; astro.config 1건은 중복) + 보존 목록 이후 격리된 컬럼 13건의 410 행(2026-10-26 Josh 결정; `to_path`는 `/`로 두고 410 응답에는 Location이 없다). 보존 목록 시점부터 404였던 격리 컬럼 2건은 그대로 404(ADR-005).

`config/qa.yaml`: 규칙 목록·순서·severity·임계값·`auto_pass`(soft).

`config/redirects.yaml`: `[{ from: "/author/rowan-hale", to: "/author/josh-inn/", status: 301 }, …]` (레거시 5건).

zod로 전부 검증(`packages/shared/src/config/schema.ts`). 알 수 없는 키는 오류(`strict()`).

## 5. 멱등 키 규약

| 대상 | 키 |
|---|---|
| raw_item | `canonical_url` (unique). Phase 3b 개정: 행 `id`는 `rawItemId(canonical_url)` = uuid5 모양의 sha1(`computecurrent:raw_item:<url>`)로 ingest가 upsert 전에 찍는다 — 충돌 시 PK가 바뀌지 않고, normalize·score가 행을 다시 읽지 않고 참조한다 |
| candidate | `raw_item_id + ':' + rubric_version`. Phase 3b: normalize의 중복 **탈락**은 `rubric_version = normalize/<normalize.version>`, `selected=false`, `reject_reason = "<CODE>: <method>=<duplicate_of>"`(코드: `DUPLICATE_OF_PUBLISHED` \| `DUPLICATE_IN_POOL`)로 기록되고, 살아남은 후보는 메모리로 score에 넘어간다. Phase 3c: score는 **모든** 후보를 `rubric_version = score/<scoring.version>`으로 upsert — `scores`(5축)·`total`·`selected`·`reject_reason = "<CODE>: <key>=<value>,…"`(코드: `BELOW_THRESHOLD` \| `NOT_SELECTED`)·`rubric`(tier·rank·insight_eligible·축별 reason). 같은 아이템이 다음 런 풀에 다시 들어오면 같은 행을 덮어쓴다(이월 로직 없음). Phase 3d: 행 `id = candidateId(raw_item_id, rubric_version)`(uuid5 모양 sha1)을 score가 upsert 전에 찍어 drafts가 참조한다 |
| draft | `candidate_id + ':' + content_type + ':' + prompt_version`. Phase 3d: 행 `id = draftId(candidate_id, content_type, prompt_version)`, upsert 충돌 키 `(candidate_id, content_type, prompt_version)` — 같은 후보·같은 프롬프트 버전의 재생성은 행을 덮어쓰고, 프롬프트 버전이 오르면 새 행 |
| qa_result | `draft_id + ':' + rule + ':' + checked_at` |
| publication | `slug` (news: `news/` + sha1(canonical_url + title)[0:16] — 레거시 규칙 유지, Phase 3d `newsBriefSlug(url, title)` = sha1(`url|title`)[0:16]을 초안 단계에서 미리 계산; essay: `column/` + slugify(title)[0:64] + `-YYYY-MM-DD`). Phase 3h: 행 `id = publicationId(slug)`(uuid5 모양 sha1)이라 같은 slug의 재발행은 같은 id·첫 `published_at`을 유지하고 upsert 충돌 키는 `slug`; 다른 초안의 같은 slug는 `publish.slug_conflict` 정책 |
| run | uuid; 재실행은 새 run, 아이템 키는 그대로라 중복 발행 불가 |

## 6. 프롬프트 파일 규약

`prompts/<task>.md` 머리말:

```
---
task: news_brief
version: 2026-10-24.1
model_hint: claude-opus-5-5
output_schema: NewsBriefDraft
max_output_tokens: 2500
---
(본문 = system prompt, 한국어; `{{name}}` placeholder 허용)
```

`drafts.prompt_version`에 `version`을 기록한다. Phase 3d: 머리말은 `PromptFrontMatter` zod(strict; `task`는 `LlmTask` enum, `output_schema`는 콘텐츠 스키마 이름, `max_output_tokens` 양의 정수)로 검증하고 `---` 뒤 본문이 system prompt다(`parsePromptFile`/`loadPromptFile`, `PromptRegistry`). `output_schema`가 `NewsBriefDraft`인 이유는 모델이 제목·요약·의미·렌즈·태그만 쓰고 출처·날짜·slug는 스테이지가 채우기 때문이다(§1 7). `model_hint`는 문서용이고 실제 모델은 `llm.models.<task>`다. 규칙·문체·용어를 바꾸면 `version`을 올린다(초안 행이 새로 생긴다, §5). 본문은 `{{name}}` placeholder를 가질 수 있고 스테이지가 `renderTemplate`로 채운다(strict: 값이 없는 placeholder는 모델 호출 전에 `TEMPLATE_UNRESOLVED`로 실패, 치환된 값은 다시 스캔하지 않음). 3d `news_brief.md`의 유일한 placeholder는 `{{banned_phrases}}`로 `config/banned-phrases.yaml`(§4)에서 렌더링된다 — 금지 표현 목록을 프롬프트 파일에 적지 않는다(AGENTS.md). Phase 3f: `task: image`인 `prompts/image.md`는 머리말이 `{ task, version, model_hint }`뿐이고 본문은 `{{title}}`·`{{summary}}`·`{{tags}}`·`{{source}}`·`{{why}}`를 치환하는 템플릿이다(`ImagePromptFile`; `requireLlmPrompt`/`requireImagePrompt`가 스테이지에서 종류를 보장). 그 `version`은 `ImageResult.provenance`에는 들어가지 않고 run 로그에 남는다. 레거시 인라인 프롬프트(`curate.mjs:58-73`, `content.mjs:159-184`, `expert-lens.mjs:403-426`, `authored-column-engine.mjs:830-1478`)는 3d/3e에서 추출·재작성하며 복붙하지 않는다(P9).

## 7. 기능 플래그 규약

- 모든 Stage·Adapter·Publisher에 `enabled`. 기본값은 Phase 3 이식 직후 `false`, Phase 4에서 `true`. 적용: 3a ingest는 네트워크 스위치 `--live`(기본 OFF)가 플래그 역할을 하고, 3b normalize는 `flags.stages.normalize: false`(테스트·CI smoke·dry-run 증거는 `CC_FLAG_STAGES_NORMALIZE=true`로 켠다), 3c score는 `flags.stages.score: false`(`CC_FLAG_STAGES_SCORE=true`), 3d generate는 `flags.stages.generate: false`(`CC_FLAG_STAGES_GENERATE=true`; fixture 런은 `llm.provider: fixture`, 라이브 생성은 `anthropic` + `ANTHROPIC_API_KEY`), 3f image는 `flags.stages.image: false`(`CC_FLAG_STAGES_IMAGE=true`; Phase 2 no-op 때 `true`였던 기본값을 내림), 3g qa는 `flags.stages.qa: false`(`CC_FLAG_STAGES_QA=true`; 같은 이유로 내림 — 꺼지면 `passed`가 비어 image·publish 입력이 0인 fail-closed가 유지된다), 3h publish는 스테이지 플래그 대신 `flags.publish_target: none`(기본)이 스위치다(`CC_FLAG_PUBLISH_TARGET=staging`; `--dry-run`이면 메모리 DB, Phase 4는 staging 스키마, `production`은 Phase 5).
- 플래그는 설정 파일 값이 환경변수(`CC_FLAG_<NAME>`)로 override 가능. 런 원장에 적용된 플래그 스냅샷을 기록한다. Phase 3i: Telegram 스위치는 `notify.telegram.enabled`(기본 `false`)이고 `CC_FLAG_NOTIFY_TELEGRAM`이 같은 경로를 override 하며 스냅샷에 `notify_telegram`으로 남는다; 스케줄 워크플로 `pipeline.yml`은 `workflow_dispatch`만(스케줄 OFF)이다. 알려진 플래그 환경 변수: `CC_FLAG_STAGES_<STAGE>`, `CC_FLAG_PUBLISH_TARGET`, `CC_FLAG_NOTIFY_TELEGRAM`.
