# 3i Scheduler · Alerting · Cost guard — 레거시 읽기와 재작성 결정

Phase 3 모듈 i(`REBUILD_BRIEF.md` §6: ADR-002/007 구현 — 런 종료 시 Telegram 요약(funnel 표 + 발행 링크 + 실패 상위 3개 + 비용), 런당 비용 상한 초과 시 생성 중단(사이트 무영향); `docs/migration/plan.md` 17행: `.github/workflows/pipeline.yml`, `notify/telegram`, `budget`). 완료 기준: **실패·성공 알림 fixture 테스트 / 예산 트리거 테스트 / 워크플로 비활성**. 착수 승인 2026-10-26(Josh "머지 진행해 그리고 다음단계도 이어서 계속 진행해줘"). 레거시는 읽고 규칙만 추출해 다시 쓴다(P9). §0~§3은 착수 시, §4~§5는 실행 후.

## 0. 실측 요약 (2026-10-26 읽기, `rebuild/v2` `45a9d26e`)

| 사실 | 근거 |
|---|---|
| 레포의 Telegram 코드는 `scripts/send-telegram-photo.mjs` 하나뿐: `POST https://api.telegram.org/bot<token>/sendPhoto` multipart(`chat_id`·고정 caption·`artifacts/homepage.png`), 환경 변수 이름 `TELEGRAM_BOT_TOKEN`·`TELEGRAM_CHAT_ID`, 없으면 "missing; skipping" 후 exit 0, 비2xx는 throw → exit 1. **타임아웃·재시도 없음, 호출하는 곳 없음**(package.json·워크플로·`pipeline.mjs` 0건). `sendMessage`·parse_mode는 어디에도 없다 | `send-telegram-photo.mjs:4-5,8-11,14-27,32-35`, `docs/diagnosis/00-inventory.md:65`, `01-pipeline-map.md:88`, ADR-007:10 |
| heartbeat는 **파일**이다: `src/data/pipeline-heartbeat.json`(tracked, 사이트 빌드에 실림) `{status, last_pipeline_run_at, last_successful_pipeline_at}`; `status === 'ok'`일 때만 success 시각 갱신. 파이프라인은 쓰지 않고(import 없음) Mac 태스크가 생성·테스트·게이트 통과 뒤 수동으로 `record-pipeline-heartbeat.mjs ok`를 돌린다 → 실패 런은 이전 `ok` heartbeat를 12시간 동안 남긴다. 현재 값 `2026-10-11T04:31:41Z`(정지 이후 그대로) | `scripts/lib/pipeline-heartbeat.mjs:3-14`, `record-pipeline-heartbeat.mjs:3-9`, `docs/subscription-generation.md:151-157`, `run-subscription-news.mjs:108` |
| 모니터 `.github/workflows/operations-monitor.yml`(cron `17 * * * *`, `issues: write`, 216런 전부 success) → `check-operations.mjs`: heartbeat 평가(`staleAfterHours: 12`), OpenRouter 월 예산(`OPENROUTER_MONTHLY_BUDGET_USD`·`_WARNING_PERCENT` 80, 키 사용량 엔드포인트) → GitHub 이슈 동기화: 본문 마커 `<!-- operations-monitor:<key> -->`로 기존 이슈 탐색, **상태 전이 때만 쓰기**(healthy+open → closed `recovered`, alert+none → create, alert+open 같은 state 마커 → no-op, 그 외 reopen/update), `unknown`도 alert, 라벨 없음, 종료 코드 1은 운영 오류(fetch·동기화 실패)뿐. 공개 배너(`freshness-monitor.mjs`)는 **8시간**을 stale로 쓴다(모니터 12시간과 불일치). 살아 있는 증거: 이슈 #29 | `operations-monitor.yml:4-38`, `check-operations.mjs:14-55,78-87`, `operations-monitor.mjs:85-140,175-182,243-317`, `freshness-monitor.mjs:6-20`, `docs/operations-monitor.md:7-25` |
| 예산 `scripts/lib/llm-budget.mjs`: 프로세스 단위 `{calls, promptTokens, completionTokens, totalTokens, failures}`, 기본 **120,000 토큰 / 60 호출**(`LLM_RUN_BUDGET_TOKENS`·`_CALLS`), `assertLlmBudget()`가 모든 LLM 호출 전에 throw(`LlmBudgetExceededError`). 구독 모드는 usage 없이 호출만 기록 → 토큰 항상 0, 호출 캡만 작동. USD 회계 없음. 초과 시 구독 모드는 `rethrowSubscriptionFailure`로 **런 전체 abort·원장 없음**, openrouter 모드는 컬럼 "none this run"·렌즈 폴백 후 발행 계속. `runHistory` 항목마다 `llmUsage{calls, failures, prompt/completion/total_tokens, token_budget, call_budget}` | `llm-budget.mjs:8-9,27-53,59-69`, `openrouter.mjs:19-21,110-137`, `authored-column-engine.mjs:1210-1219`, `pipeline.mjs:445,450,569,639,771`, ADR-007:11,67 |
| 스케줄: Mac Codex 태스크 00:45/08:45/16:45 KST(레포에 타이머 없음, "This document creates no timer"); 퇴역한 GH 생성 워크플로는 00:05/08:05/16:05였고 `README.md:181`이 아직 그 시각을 적고 있다(D10). `update-news.yml`은 스케줄 없음(push/PR/dispatch). 다른 cron: operations-monitor 매시, infrastructure-data 6시간, weekly-digest 주 1회 | `docs/subscription-generation.md:80-83`, `01-pipeline-map.md:9`, `03-error-taxonomy.md:35`, `update-news.yml:5-10` |
| 동시성 1은 **git-dir mkdir 락**(`<git-common-dir>/subscription-news.lock`, 소유자 UUID 파일, `CC_SUBSCRIPTION_LOCK_OWNER` 이름으로 증명, TTL·stale 자동 해제 없음 → 수동 삭제)과 잡 레코드(`subscription-jobs/<uuid>.json`, 상태 기계 `starting → started → generating → awaiting_artwork → failed \| published \| no_change`, 러너 lease `wx`, `origin/main` SHA 일치 요구, detached worktree, PID 생존 확인). 러너 데드라인 **90분**(`AbortController` → SIGTERM → 5 s 뒤 SIGKILL), 11단계에 `npm run check`·`npm test`(= astro build)·`content:gate`가 포함돼 데드라인을 소모(D9). CI·Vercel·production 환경에서는 실행 거부 | `subscription-operation-lock.mjs:7-53`, `subscription-job.mjs:10-193`, `run-subscription-news.mjs:14-66,111-165` |
| 런 요약은 콘솔 3종(`[pipeline] completed. published N full memos, N signal cards …`, "completed with no new article pages", "normalization-only pass")뿐, 링크·메시지 없음. 수집 카운터(`authorizedSources/failedSources`)는 로그만(D3). **중단 런은 원장에 남지 않는다**: `rethrowSubscriptionFailure` throw → `main().catch` → `process.exit(1)`이 `runHistory` append(`:571/:641/:774`)보다 먼저 온다(D1). 빈 풀이면 원장 항목 자체가 없다. `runHistory`는 120건으로 잘라 보관, `last_error` ≤ 1,000자 | `pipeline.mjs:217,599-600,642,696-698,776-789`, `openrouter.mjs:19-21`, `03-error-taxonomy.md:13,26,28`, `subscription-job.mjs:157` |
| 새 구조(Phase 2~3h): 런 원장은 **선기록**(`pipeline_runs` `started` → `finishRun`), 단계마다 `stage_events`, 아이템 실패는 `dead_letters`(P5), 런 상태 `done \| partial \| budget_stop \| failed`; 달러 예산 `budget { run_usd 2.0, soft_warn_usd 1.5, max_calls 60 }`(`createBudget`: `canSpend`·`record`·`stop(reason)`), 3d generate는 호출 전 `canSpend`, 도중 불가면 `budget.stop` → 러너가 `budget_stop`(exit 1)으로 끝내되 완료 초안은 qa·image·publish로 흘림, 3f 이미지는 호출 전 `canSpend`; `notify/console.ts`가 ADR-007 레이아웃을 로그에만 쓴다(`notify: { telegram: { enabled } }`, Telegram은 "Phase 3i"); `config/pipeline.yaml` `schedule { cron "45 15,23,7 * * *", timezone UTC, slot_hours 8 }`, `StageContext.now`는 "예정 슬롯 시각"; 러너는 `ctx.fetch`로만 네트워크(`--replay`는 throw); `rebuild-ci.yml`만 있고 파이프라인 워크플로는 없다 | `runner.ts`, `budget.ts`, `stages/generate.ts`, `notify/console.ts`, `config/pipeline.yaml:5-8,53-56,104-106`, ADR-002:49-62, ADR-007:19-55 |

## 1. 유지 (의도·규칙을 가져온다)

| 항목 | 레거시 | 새 구조에서 |
|---|---|---|
| 동시성 1 — 생성 런은 한 번에 하나 | mkdir 락이면 실패(큐 없음) | Actions `concurrency: { group: cc-pipeline, cancel-in-progress: false }`(ADR-002): 겹치면 **대기**, 진행 중 런은 취소하지 않음 |
| 런 데드라인·단계 타임아웃 | 90분 데드라인 + 단계 타임아웃(구독 모드는 우회) | `timeout-minutes: 45`(Phase 0 Actions 실측 20~34분 + 여유); 단계·호출 타임아웃은 어댑터에 항상 켜져 있음(3a/3d/3f) |
| 예산은 **호출 전에** 확인하고 런마다 기록 | `assertLlmBudget` 호출 전, `llmUsage`를 runHistory에 | `budget.canSpend` 호출 전(3d·3f), `pipeline_runs.cost_total_usd` + `--json budget { spent_usd, calls, state, stop_reason }`; 60 호출 캡 유지 |
| 환경 변수 **이름** `TELEGRAM_BOT_TOKEN`·`TELEGRAM_CHAT_ID` | 같은 이름 | `notify.telegram.bot_token_env`·`chat_id_env`(기본값 동일), 값은 환경에만 |
| 알림 실패는 런을 깨지 않음 | 호출이 없어서 자연히 그랬음 | `NotifyResult { sent, skipped, attempts, error }`로 보고만(3h revalidate 규칙과 동일) |
| 이슈 모니터 의미론: 마커로 기존 이슈 찾기, 상태 전이 때만 쓰기, 회복 시 close, 재발 시 reopen, `unknown ≠ healthy` | `operations-monitor.mjs:243-317` | Phase 4에서 `pipeline ops` 종료 코드 위에 그대로 올린다(이 모듈은 판정과 텍스트까지) |
| stale 임계 = 1.5 슬롯 | 12시간 하드코딩(배너는 8시간) | `schedule.slot_hours × 1.5`에서 **파생**(8 → 12시간), 한 값만 쓴다 |
| 오류 문자열 상한·이력 상한 | `last_error` ≤ 1,000자, 이력 120건 | 메시지 본문 ≤ `max_chars`(3,800, Bot API 4,096), 오류 200자, decisions 100건(기존) |

## 2. 버릴 것

| 항목 | 이유 |
|---|---|
| git-dir mkdir 락·소유자 UUID·잡 레코드·detached worktree·`origin/main` SHA 게이트 | 발행이 커밋이 아니다(ADR-005); 동시성은 Actions concurrency 그룹 하나로 끝난다 |
| `src/data/pipeline-heartbeat.json`·`record-pipeline-heartbeat.mjs`·`schedule-content-cycle.mjs`의 heartbeat 쓰기 | heartbeat는 **원장**이다: 최근 `done/partial` `pipeline_runs` 행(ADR-007 "모니터 교체"). 성공만 보고 실패를 숨기던 파일을 없앤다 |
| `sendPhoto` 홈 스크린샷 | 호출된 적 없음. 텍스트 `sendMessage` 요약으로 대체 |
| OpenRouter 월 키 사용량 모니터·`evaluateContentOperations`/`fetchWorkflowRuns` 사장 코드 | 공급자는 Anthropic이고 비용은 원장에서 나온다 |
| 생성 데드라인 안의 `npm test`/`astro build`/감사(D9) | P1: 발행은 빌드와 무관. 파이프라인 워크플로는 테스트·빌드를 돌리지 않는다(ADR-002 "CI 분리") |
| 토큰만 세는 예산(구독 모드에서 0) · 자식 프로세스 env 스크럽 | 달러 예산(3d)이 이미 있고 단일 프로세스다 |

## 3. 바꿀 것

| 항목 | 새 설계 | 비고 |
|---|---|---|
| 요약 1건/런 — 성공·실패 모두 | `notify/summary.ts` `buildRunSummary(result) → RunSummary { run_id, status, started_local(KST), funnel, published[{slug,url,content_type,title,action}], failures[{code,count,sample}] 상위 N, zero_published_reasons, stages, cost{spent,cap,soft_warn,calls,state,stop_reason,tokens} }` → `renderNotification`: done/partial은 요약 템플릿(`[CC pipeline] <KST> · run <8자> · <status>` / funnel 한 줄 / `• news_brief: /news/…/ — "제목"` / `no publication: <첫 차단 단계>` / `failures (top 3): CODE ×n (sample)` / `cost USD x / cap y · calls n · tokens in/out · 시간` / `dry-run · replay · fixture …` / Actions 링크), failed/budget_stop은 실패 템플릿(`⚠ … · BUDGET_STOP`, `BUDGET_EXCEEDED: <stop_reason> — generation stopped, QA-passed drafts still published`, `stage errors: …`). 스테이지 밖 crash는 `formatRunCrash`(원장 행은 이미 `failed`). RunResult만 읽고 원장은 읽지 않는다 | ADR-007 템플릿 |
| "발행 0건이면 사유" | `zeroPublishedReasons`: 파이프라인 순서로 **처음** 멈춘 단계 한 줄(skipped flag_off·error·빈 출력: `ingest: 0/N sources ok`, `score: 0 passed the brief threshold`, `qa: 0 passed (rejected n, held n)`, `publish: target none (dry, n would publish)` …). 나머지는 failures 줄이 든다 | 메아리(뒤 단계의 0)는 적지 않는다 |
| 실패 상위 3개 | `collectFailures`: 단계 오류·소스 오류·generate 실패·QA 거절 규칙(auto_pass 제외)·이미지 공급자 실패·publish 실패·예산 정지를 taxonomy 코드로 집계, 빈도순, `notify.summary.top_failures` | funnel `top_error`와 같은 `errorCode` |
| Telegram 전송 | `notify/telegram.ts` `createTelegramNotifier({ config, botToken, chatId })`: `POST <base_url>/bot<token>/sendMessage` JSON `{ chat_id, text, disable_web_page_preview }` **plain text(parse_mode 없음)**, `ctx.fetch`만 사용(`--replay`는 `NETWORK_DISABLED` 실패로 기록·재시도 없음), 타임아웃 `timeout_ms`, 재시도는 429(`retry_after` 존중)/5xx/네트워크만 `max_retries`회, 다른 4xx는 즉시 실패(`TELEGRAM_HTTP_400: <description>`), 토큰은 URL에만 있고 오류·로그에서 **스크럽**(`[redacted]`), 본문은 `max_chars`에서 머리부터 보존하며 자름. 결과는 `NotifyResult`(sent/skipped/attempts/error/ms) → `--json notify`, 로그, step summary "Notify (3i)" | 소프트 실패 |
| 스위치 | `notify.telegram.enabled`(기본 `false`) + 환경 변수 `CC_FLAG_NOTIFY_TELEGRAM`(플래그 로더에 추가, 경로 `notify.telegram.enabled`, 원장 flags 스냅샷에 `notify_telegram`). 켜져 있으면 시작 시 `TELEGRAM_BOT_TOKEN`·`TELEGRAM_CHAT_ID`가 **이름으로** 있어야 한다(3h revalidate·3d 키와 같은 fail-fast; 없으면 `ConfigError`) | contracts §7 |
| Notifier 계약 | `@cc/shared` `Notifier { channel, send(NotifyMessage { kind run_summary\|run_failure, runId, status, text }, NotifyContext { fetch, logger }) → NotifyResult }`. CLI가 런 뒤에 한 번 호출; 러너는 모른다 | P3 |
| 비용 가드(완료 기준 "예산 트리거 테스트") | 3d·3f 그대로: `canSpend` → `BudgetExceededError`(첫 호출부터 불가) 또는 `budget.stop(reason)`(도중) → 런 `budget_stop`, 이후 단계는 산출물로 계속. 3i는 `RunResult.budget { spent_usd, calls, state, stop_reason }`를 더하고 실패 템플릿이 그것을 첫 줄에 쓴다 | end-to-end 테스트 `notify-summary.test.ts`, 기존 `cli.test.ts`·`runner.test.ts` |
| 운영 점검(모니터 교체) | `ops/check.ts` `assessOperations(pipeline_runs 행, { now, slotHours }) → OpsReport { status ok\|stale\|never\|failing, last_success, hours_since_success, last_run, consecutive_failures, crashed(started 행 2시간 초과), running, window_24h{runs,done,partial,budget_stop,failed,published,cost_usd}, cost_7d_usd, reasons }` + `formatOpsReport`. CLI `pipeline ops [--from <json>] [--json]`: Supabase(`SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY` 이름만) 또는 `--from`(`pipeline run --json` 결과·`{runs}`·배열), 종료 코드 0 ok / 1 그 외 / 2 설정 오류 | ADR-007 "heartbeat 대신 pipeline_runs" |
| 워크플로 `.github/workflows/pipeline.yml` | `workflow_dispatch`만(inputs: live, fixture, sources, stages_on, publish_target none\|staging, notify, ops_check, log_level), **`schedule` 블록은 주석**(켜는 것은 스케줄 변경 = 승인 항목), `concurrency cc-pipeline / cancel-in-progress false`, `timeout-minutes 45`, 시크릿 6종 **이름만**(없으면 빈 값 → CLI가 미설정으로 처리), `--dry-run` 고정(Phase 4 M4에서 제거), step summary + 런 JSON·로그 아티팩트 90일, exit 2만 실패. `pull_request` 트리거 없음(포크 시크릿). `ops-check` 잡은 입력으로만, 시크릿 없으면 skip | ADR-002 표 |
| 슬롯 시각 | 러너 `ctx.now`(예정 슬롯)·`funnel.started_at` 그대로; 요약 머리는 `notify.summary.timezone`(Asia/Seoul 고정 오프셋)으로 표시 | ADR-002 |
| README 주기 표기 드리프트(D10) | 리빌드 절에 00:45/08:45/16:45 KST = `45 15,23,7 * * *` UTC를 적는다(레거시 절은 Phase 5 퇴역 시 정리) | 문서만 |

## 4. 완료 기준 대조

| 기준 | 결과 | 근거 |
|---|---|---|
| 실패·성공 알림 fixture 테스트 | 통과 | `notify-summary.test.ts`: done(발행 1, 제목 링크, QA 거절 코드, 비용·모드·Actions 링크), publish_target none(사유 "target none (dry, 1 would publish)"), qa flag off(사유 "fail-closed"), 전 소스 실패(partial, `SOURCE_UNREACHABLE ×1 (eia-today-in-energy)`, 사유 "ingest: 0/1 sources ok"), budget_stop(실패 템플릿 `⚠ … · BUDGET_STOP` + `BUDGET_EXCEEDED: …`), crash 템플릿. `telegram-notifier.test.ts`: 전송 1회(plain text, 토큰은 URL에만·로그 0회), disabled/status_filtered, 토큰·chat id 없음(이름만), 5xx 재시도 후 성공, 429 `retry_after` 대기, 400 즉시 실패+description, 네트워크 오류 스크럽(`[redacted]`), `--replay` `NETWORK_DISABLED` 재시도 없음, 타임아웃, `max_chars` 자르기 |
| 예산 트리거 테스트 | 통과 | `notify-summary.test.ts` budget_stop(scoring fixture, `max_calls 1`: 초안 1 뒤 정지, `budget.calls 1`, `stop_reason` 기록, 실패 템플릿) + 기존 `cli.test.ts`(exit 1, `funnel.top_error BUDGET_EXCEEDED`)·`runner.test.ts`(정지 뒤 단계 계속) |
| 워크플로 비활성 | 통과 | `.github/workflows/pipeline.yml`: `workflow_dispatch`만, `schedule` 주석, `--dry-run` 고정, `concurrency cc-pipeline`, `timeout-minutes 45`, 시크릿 이름만, 아티팩트 90일, `pull_request` 없음 |
| Telegram 요약(funnel + 발행 링크 + 실패 상위 3 + 비용) | 통과 | §4.1 텍스트; `--json summary`·로그 `run summary`·step summary "Notify (3i)"가 같은 텍스트 |
| 상한 초과 시 생성 중단·사이트 무영향 | 통과(3d·3f 유지) | `budget_stop`에서 qa·image·publish는 산출물로 계속; 발행은 빌드와 무관(3h) |
| 모니터 교체(heartbeat → `pipeline_runs`) | 통과 | `ops/check.ts` + `pipeline ops`: ok/stale(1.5 슬롯)/never/failing(연속 2)/crashed(started 2 h 초과) — `ops-check.test.ts` 5건, `cli.test.ts`(`--from` ok exit 0 / stale exit 1 / Supabase 이름 없음 exit 2) |
| 플래그/스위치 기본값 OFF | 통과 | `notify.telegram.enabled: false`; `CC_FLAG_NOTIFY_TELEGRAM` override(공유 `config.test.ts`·`flags` 스냅샷 `notify_telegram`); 켜면 시크릿 이름 2개 필수(`ConfigError`) |
| 라이브(실제 Telegram 전송·Actions 런·Supabase ops, 관찰) | 미실행 | 봇 토큰·채팅 ID·Supabase 미수령; 워크플로 dispatch는 시크릿 등록 뒤 Phase 4 M4에서 |

### 4.1 fixture dry-run (`scoring`, 2026-10-26T09:48Z)

`CC_FLAG_STAGES_NORMALIZE=true CC_FLAG_STAGES_SCORE=true CC_FLAG_STAGES_GENERATE=true CC_FLAG_STAGES_QA=true CC_FLAG_STAGES_IMAGE=true CC_FLAG_PUBLISH_TARGET=staging CC_FLAG_NOTIFY_TELEGRAM=true TELEGRAM_BOT_TOKEN=<dummy> TELEGRAM_CHAT_ID=0 npm run v2:pipeline -- run --dry-run --replay --fixture scoring --sources fixtures/sources/scoring.yaml --stage ingest,normalize,score,generate,qa,image,publish --json`

런 `done`, exit 0, `budget { spent_usd 0, calls 2, state ok }`, 원장 flags `notify_telegram: true`, `notify { channel telegram, sent false, skipped null, attempts 1, error "NETWORK_DISABLED: replay mode forbids network access" }`(`--replay`가 fetch를 막았고 재시도 없이 soft 실패로 기록; 더미 토큰 문자열은 stdout·stderr에 0회). `summary.text`:

```
[CC pipeline] 2026-10-26 18:48 KST · run 249c19a8 · done
fetched 13 (sources 5/5 ok) → new 13 → scored 13 → gate 6 → drafts 2 → qa 1 → published 1
• news_brief: /news/920a329a451a5000/ — "Microsoft, 부산 AI 데이터센터 캠퍼스에 1.2 GW 용량 계약 체결"
failures (top 1): UNGROUNDED_NUMBER ×1 (news/732e5467dd67c011)
cost USD 0.00 / cap 2.00 · calls 2 · tokens in 4k / out 2k · 229 ms
dry-run · replay · fixture scoring · trigger local
```

같은 런을 기본값(플래그 전부 off, Telegram off, `sample` fixture)으로 돌리면 `notify.skipped = disabled`이고 요약은 `fetched 6 (sources 80/80 ok) → … → published 0` + `no publication: normalize: skipped (flag_off)`. `node packages/pipeline/tools/ingest-dry-run-summary.ts <json>`의 "Notify (3i)" 절이 전달 결과와 텍스트를 그대로 싣는다.

### 4.2 ops dry-run

`npm run v2:pipeline -- ops --from <위 JSON>` → `[CC ops] … · OK / last completed run: 249c19a8 done at … (0 h ago, published 1) / 24 h: runs 1 (done 1, …) · published 1 · USD 0.00 · 7 d USD 0.00`, exit 0. 같은 덤프의 `started_at`·`ended_at`을 48시간 전으로 바꾸면 `STALE`(stale after 12 h = slot 8 h × 1.5), exit 1(`cli.test.ts`).

## 5. 열린 질문

1. **Telegram 봇·채팅 ID** — Josh 발급(브리프 §8). Actions secrets 이름 `TELEGRAM_BOT_TOKEN`·`TELEGRAM_CHAT_ID`로 등록 후 `pipeline.yml`을 `notify=true`로 dispatch하면 라이브 증거가 생긴다(Phase 4 M4 체크리스트).
2. **스케줄 켜기** — `pipeline.yml`의 `schedule` 주석 해제 + `--dry-run` 제거는 Phase 4 shadow 착수 승인과 함께(CLAUDE.md §3 스케줄 변경·§4). 60일 비활성 규칙은 `infrastructure-data.yml` 커밋이 막고 있다(ADR-002).
3. **이슈 알람** — `pipeline ops` 종료 코드 위에 레거시 `operations-monitor` 의미론(마커·상태 전이·recovered close)을 Phase 4에서 워크플로 단계로 올린다. 구현 위치(워크플로 스크립트 vs `ops` 하위 명령 `--issue`)는 Josh 선택; `issues: write` 권한이 필요하다.
4. **공개 신선도 배너** — 레거시 홈의 `freshness-monitor`(8시간)는 heartbeat 파일을 읽는다. 새 사이트는 `publications` 최신 `published_at`(anon RLS)로 대체하고 임계는 12시간으로 통일 제안(Phase 5 사이트 PR).
5. **소프트 경고 동작** — ADR-007 "소프트 경고 초과 → insight_essay 생략"은 3e와 함께. 지금은 요약에 `budget soft warning` 줄만 남긴다.
6. **요약 언어** — 템플릿은 ADR-007대로 영문 라벨 + 한국어 제목. 한국어 라벨을 원하면 `notify.summary`에 `labels` 테이블을 더해 데이터로 두면 된다(코드 변경 없이).
7. **Supabase 읽기 권한** — `ops`는 service role 이름을 쓴다. 매시 모니터가 그 키를 들고 도는 것이 과하면 `pipeline_runs`만 읽는 별도 키(Phase 4 Supabase 설정 항목).
