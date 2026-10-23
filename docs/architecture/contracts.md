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
  budget: Budget;                  // 누계 USD, canSpend(estimateUsd): boolean
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
});
export const LlmResponse = z.object({
  text: z.string(),
  json: z.unknown().optional(),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number(), cacheReadTokens: z.number().default(0) }),
  costUsd: z.number().nonnegative(),
  model: z.string(),
  stopReason: z.string(),
});

export interface ImageAdapter {
  readonly provider: string;      // 'placeholder' | 'openai' | 'fixture'
  generate(req: { prompt: string; alt: string; slug: string }, ctx: StageContext): Promise<ImageResult>;
}
export const ImageResult = z.object({
  path: z.string(),                        // 저장 경로 또는 URL
  alt: z.string(),
  provenance: z.object({ provider: z.string(), model: z.string().optional(), prompt: z.string(), generatedAt: z.string().datetime() }),
  placeholder: z.boolean(),
  costUsd: z.number().nonnegative(),
});

export interface PublisherAdapter {
  readonly target: "site" | "blog" | "social";
  /** 멱등: slug 충돌 시 기존 행 갱신, 새 slug 생성 금지(충돌 정책은 config). */
  publish(item: PublicationInput, ctx: StageContext): Promise<{ slug: string; url: string }>;
  unpublish?(slug: string, ctx: StageContext): Promise<void>;
  revalidate?(paths: string[], ctx: StageContext): Promise<void>;   // site만
}

export interface QaRule {
  readonly rule: string;                   // reason_code와 동일 (ADR-004 표)
  readonly severity: "hard" | "soft";
  check(draft: Draft, evidence: QaEvidence, cfg: QaRuleConfig): Promise<QaVerdict> | QaVerdict;
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
  stages: { ingest: true, normalize: false, score: false, generate: true, qa: true, image: true, publish: true }   # normalize: 3b, score: 3c 기본 OFF (§7)
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
image: { provider: placeholder, fallback_chain: [placeholder] }
notify: { telegram: { enabled: true } }
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

`config/scoring.yaml`(Phase 3c, `ScoringConfig`, CLI `--scoring`): `version`(→ `rubric_version = score/<version>`), 루브릭 5축 가중치(relevance 0.35, timeliness 0.2, impact 0.2, reader_value 0.15, insight_potential 0.1; 합 1 검증), tier 임계값(full 0.75, brief 0.55; full ≥ brief 검증) + 관련성 축 하한 `relevance_min: 0.55`(레거시 게이트가 관련성 단독이었던 것을 보존: 영향도·독자 가치만으로는 통과 불가), `insight_trigger: 0.7`, `selection { per_source_max: 1, abstract_max_tier: brief, failed_extraction_max_tier: brief }`(추출 실패한 full 소스 아이템은 reader_value를 rewrite_only로 계산하고 full 등급 불가), 그리고 축별 규칙 데이터 — `relevance`(레거시 8차원 가중 어휘 136쌍, AI·인프라·소비자·약한 인접·화석·인접 주제 어휘, `formula`·`lifts`·`caps` 계수, 정형 고시 가드 패턴, 한국어 별칭 42·증시 패턴), `timeliness`(시간 버킷 5 + `beyond`·`unknown_date`), `impact`(신호 9: GW/MW·금액 정규식, 하이퍼스케일러·칩·한국 주요 행위자·거래 동사·규제 용어), `reader_value`(권리·tier·본문 길이·지역 용어·수치 패턴·abstract 상한), `insight_potential`(테마 6 + 다차원 폭 보너스). 엔진의 모양(축·이름 붙은 lift/cap)은 코드, 숫자·용어·패턴은 전부 이 파일. 정규식 문자열은 로드 시 컴파일 검증, 알 수 없는 키는 오류.

`config/qa.yaml`: 규칙 목록·순서·severity·임계값·`auto_pass`(soft).

`config/redirects.yaml`: `[{ from: "/author/rowan-hale", to: "/author/josh-inn/", status: 301 }, …]` (레거시 5건).

zod로 전부 검증(`packages/shared/src/config/schema.ts`). 알 수 없는 키는 오류(`strict()`).

## 5. 멱등 키 규약

| 대상 | 키 |
|---|---|
| raw_item | `canonical_url` (unique). Phase 3b 개정: 행 `id`는 `rawItemId(canonical_url)` = uuid5 모양의 sha1(`computecurrent:raw_item:<url>`)로 ingest가 upsert 전에 찍는다 — 충돌 시 PK가 바뀌지 않고, normalize·score가 행을 다시 읽지 않고 참조한다 |
| candidate | `raw_item_id + ':' + rubric_version`. Phase 3b: normalize의 중복 **탈락**은 `rubric_version = normalize/<normalize.version>`, `selected=false`, `reject_reason = "<CODE>: <method>=<duplicate_of>"`(코드: `DUPLICATE_OF_PUBLISHED` \| `DUPLICATE_IN_POOL`)로 기록되고, 살아남은 후보는 메모리로 score에 넘어간다. Phase 3c: score는 **모든** 후보를 `rubric_version = score/<scoring.version>`으로 upsert — `scores`(5축)·`total`·`selected`·`reject_reason = "<CODE>: <key>=<value>,…"`(코드: `BELOW_THRESHOLD` \| `NOT_SELECTED`)·`rubric`(tier·rank·insight_eligible·축별 reason). 같은 아이템이 다음 런 풀에 다시 들어오면 같은 행을 덮어쓴다(이월 로직 없음) |
| draft | `candidate_id + ':' + content_type + ':' + prompt_version` |
| qa_result | `draft_id + ':' + rule + ':' + checked_at` |
| publication | `slug` (news: `news/` + sha1(canonical_url + title)[0:16] — 레거시 규칙 유지; essay: `column/` + slugify(title)[0:64] + `-YYYY-MM-DD`) |
| run | uuid; 재실행은 새 run, 아이템 키는 그대로라 중복 발행 불가 |

## 6. 프롬프트 파일 규약

`prompts/<task>.md` 머리말:

```
---
task: news_brief
version: 2026-10-18.1
model_hint: claude-opus-5-5
output_schema: NewsBrief
---
```

`drafts.prompt_version`에 `version`을 기록한다. 레거시 인라인 프롬프트(`curate.mjs:58-73`, `content.mjs:159-184`, `expert-lens.mjs:403-426`, `authored-column-engine.mjs:830-1478`)는 3d/3e에서 추출·재작성하며 복붙하지 않는다(P9).

## 7. 기능 플래그 규약

- 모든 Stage·Adapter·Publisher에 `enabled`. 기본값은 Phase 3 이식 직후 `false`, Phase 4에서 `true`. 적용: 3a ingest는 네트워크 스위치 `--live`(기본 OFF)가 플래그 역할을 하고, 3b normalize는 `flags.stages.normalize: false`(테스트·CI smoke·dry-run 증거는 `CC_FLAG_STAGES_NORMALIZE=true`로 켠다), 3c score는 `flags.stages.score: false`(`CC_FLAG_STAGES_SCORE=true`).
- 플래그는 설정 파일 값이 환경변수(`CC_FLAG_<NAME>`)로 override 가능. 런 원장에 적용된 플래그 스냅샷을 기록한다.
