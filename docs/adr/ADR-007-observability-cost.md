# ADR-007 — 관측·알림·비용 가드

- 상태: Proposed
- 날짜: 2026-10-18
- 관련: ADR-002, ADR-003, 브리프 P5·P7·R6·R7, §5.4 STOP-THE-LINE(비용 상한)

## Context

- 런 원장은 완주 런만 기록(`scripts/pipeline.mjs:445` abort-before-write), 수집 카운터 미기록(`:217` 콘솔만), 격리 목록 무시(`archive-store.mjs:178-184`), 토큰 0(구독 모드). 실패 런 비율은 측정 불가였다(`04-verdict.md` H3).
- 알림은 heartbeat 12h 초과 시 GitHub 이슈 #29뿐(`scripts/lib/operations-monitor.mjs:85`). Telegram 스크립트는 존재하나 미호출(`scripts/send-telegram-photo.mjs`).
- 예산 가드는 60 calls / 120k tokens(`scripts/lib/llm-budget.mjs:8-9`)이지만 구독 모드에서 토큰이 0이라 호출 수만 작동.
- Josh 가정값: 런당 비용 상한 USD 2.

## Options

### A. 선기록 런 원장 + 단계 이벤트 + Telegram 요약 + 달러 예산 가드 (결정)
### B. 현행 GitHub 이슈 모니터만 유지
### C. 외부 APM(Datadog/Sentry) 도입

## Decision

**A.**

### 런 원장(ADR-003 `pipeline_runs`, `stage_events`)

- 런 시작 직후 `pipeline_runs{status:'started', trigger, git_sha}` insert. 단계 시작·종료마다 `stage_events` insert/update. 예외로 프로세스가 죽어도 `started` 행이 남아 "완주하지 않은 런"이 집계된다.
- 종료 시 `funnel` jsonb에 13컬럼(`run_id, started_at, sources_configured, sources_ok, sources_failed, items_fetched, items_new, items_scored, passed_gate, drafts, qa_passed, published, top_error`)을 기록. Phase 0의 `scripts/diagnose/funnel.mjs` 컬럼 정의와 동일해 전후 비교가 가능.
- 수집 단계는 `sources_ok/failed`와 `items_fetched`를 반드시 기록(Phase 0 D3 해소).
- `dead_letters`: 아이템 단위 실패를 격리하고 다음 아이템으로 진행(P5). 런 상태는 `partial`.

### Telegram 요약 (런 종료·실패 시 1건)

```
[CC pipeline] 2026-10-18 00:45 KST · run 7f3a… · done (partial)
fetched 41 (sources 31/34 ok) → new 12 → scored 12 → gate 5 → drafts 2 → qa 2 → published 2
• news_brief: /news/9c1e… — "…" 
• news_brief: /news/4b77… — "…"
insight_essay: skipped (daily cap reached)
failures (top 3): SOURCE_UNREACHABLE ×2 (datacenterdynamics), QUOTE_TOO_LONG ×1
cost USD 0.48 / cap 2.00 · tokens in 61k / out 9k · 23 min
```

- 발행 0건이면 사유 상위 3개를 포함. 실패 런(`failed`, `budget_stop`)은 별도 템플릿(단계·에러·run_id·Actions 링크).
- 전송 실패는 런 결과에 영향 없음(soft).
- 기존 GitHub 이슈 #29 모니터는 heartbeat 대신 `pipeline_runs` 최신 성공 시각을 읽도록 교체(3i).

### 비용 가드

- `LlmAdapter`가 호출마다 `{model, input_tokens, output_tokens, cache_read_tokens, cost_usd}`를 반환하고 러너가 런 누계를 갱신(`pipeline_runs.cost_total_usd`).
- `config/pipeline.yaml`: `budget.run_usd: 2.0`, `budget.soft_warn_usd: 1.5`, `budget.max_calls: 60`.
- 소프트 경고 초과 → 이후 insight_essay 생성 생략. 상한 초과 → 생성 단계 즉시 중단, 이미 QA 통과한 초안은 발행 진행(사이트 무영향), 런 상태 `budget_stop`, Telegram 경고. 상한은 STOP-THE-LINE 항목(§5.4)이므로 초과 자체를 보고.
- 이미지 생성 비용도 같은 누계에 포함.

### 비용 추정 (Anthropic 1st-party 단가, 2026-10-06 캐시: Opus 5.5 $4/$20, Sonnet 5.5 $2/$10, Haiku 5.5 $0.10/$0.50 per MTok; 캐시 읽기 ≈ 0.1×)

| 단계 | 호출 | 모델 | 토큰(in/out) | USD |
|---|---|---|---|---|
| 큐레이션 숏리스트 | 1 | Haiku 5.5 | 12k / 1k | 0.002 |
| news_brief 초안 ×2 | 2 | Opus 5.5 | 8k / 1.5k | 0.124 |
| Expert Lens ×2 | 2 | Opus 5.5 | 6k / 0.8k | 0.080 |
| QA 보조(근거 대조) ×2 | 2 | Haiku 5.5 | 10k / 0.5k | 0.003 |
| **브리프 사이클 소계** | 7 | | | **≈ 0.21** |
| insight_essay(일 1, 3사이클 중 1) | 5 | Opus 5.5 | 12k / 3k | 0.54 |
| 이미지(선택) | 1~2 | 확인 필요 | | 0.04~0.20 |
| **에세이 포함 사이클** | | | | **≈ 0.8~1.0** |

Phase 0 실측 참고: 완주 런의 호출 수 평균 2.4(대부분 생성 없음), 컬럼 발행 런 5~13회, OpenRouter 시절 토큰 최대 37.9k/런. 위 추정은 그보다 보수적이며 USD 2 상한의 50% 이내. 월 추정 USD 60~70(이미지 제외).

### 로그·아티팩트

- 구조화 로그(JSON lines) stdout → Actions 로그 + 런 종료 시 `run-<id>.json` 아티팩트 업로드(90일).
- 로그에 시크릿·원문 전문을 쓰지 않는다(원문은 `raw_items.payload`에만).

## Consequences

- (+) 실패 런·부분 런이 보인다. Phase 0의 생존 편향(H3 측정 불가) 해소.
- (+) 비용이 런·일·월 단위로 집계되고 상한이 실제로 작동.
- (−) Supabase 쓰기 횟수 증가(런당 수십 행) — 무시할 수준.
- (−) Telegram 봇·채팅 ID는 Josh가 발급(§8).

## Rejected alternatives & why

- **B**: heartbeat 기반은 성공만 보고 실패를 숨긴다(현재 outage가 6일간 이슈 1건으로만 표시).
- **C**: 외부 서비스 추가(P8), 현 규모에 과함.

## 확인 필요

1. 이미지 공급자와 단가(OpenAI Images / 플레이스홀더 우선).
2. Telegram 봇 토큰·채팅 ID 발급 시점(Phase 3i 전).
