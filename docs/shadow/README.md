# Phase 4 — Shadow run 런북 (ADR-006 M4)

착수 승인 2026-10-26(Josh "74머지 및 phase 4 착수 승인"). 목적: 레거시가 프로덕션을 서빙하는 동안 새 파이프라인을 실제 주기로 돌려 **staging 프로젝트에만** 쓰고, 데이터로 게이트를 조정한다(`REBUILD_BRIEF.md` Phase 4). 상태는 `docs/STATUS.md`, 측정은 `compare.md`, 설정 변경은 `tuning-log.md`.

## 0. 완료 기준 (브리프 그대로)

| # | 기준 | 측정 위치 |
|---|---|---|
| 1 | 최소 3일(8 h 주기 9런 이상) 연속 처리되지 않은 예외 0 | `pipeline_runs.status`(`failed` 0, `started` 미종료 0) + `dead_letters` 검토 — `pipeline ops`, `compare.md` |
| 2 | 런의 80 % 이상에서 발행 가능한 `news_brief` ≥ 1 | funnel `published`(staging) — `compare.md` |
| 3 | Josh 샘플 검토에서 hard-QA 오탐 0, 미탐은 튜닝 로그로 해소 | `compare.md` §3 샘플 표 + `tuning-log.md` |
| 4 | 롤백 드릴 완료·소요 시간 기록 | §4 |
| 5 | 런당 비용 상한 이내(`budget.run_usd` 2.0) | `pipeline_runs.cost_total_usd`, Telegram 요약 |

## 1. 선행 입력 (Josh; 값은 어디에도 적지 않는다)

| 입력 | 어디에 | 비고 |
|---|---|---|
| Supabase **staging 프로젝트**(ADR-006 M2: 별도 프로젝트 권장 — 같은 마이그레이션을 그대로 적용하고 스키마 분기 코드가 필요 없다) | Supabase 대시보드 | `supabase/migrations/0001_init.sql` → `0002_candidates_rubric.sql` 순서로 SQL 편집기에서 적용(사전 승인 항목, 2026-10-18 승인·프로젝트 미정) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | GitHub Actions secrets(파이프라인) | 이름 그대로. 샘플 검토용 사이트 프리뷰는 **별도 v2 프리뷰 Vercel 프로젝트**(§2-5)에 `SUPABASE_URL` + `SUPABASE_ANON_KEY` + `SITE_DATA_SOURCE=supabase`(Vercel 프로젝트 신설·환경 변수 = 승인 항목; 프로덕션 프로젝트 불변) |
| `ANTHROPIC_API_KEY` | Actions secret | `config/pipeline.yaml` `llm.provider`를 `anthropic`으로 바꾸는 커밋과 함께(지금은 `fixture`) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Actions secrets | 첫 메시지는 dispatch `notify=true`로 확인 |
| (선택) `OPENAI_API_KEY` | Actions secret | 이미지 공급자 전환은 3f notes §5.2 결정 후 |
| Shadow 기간 | 기본 3일(브리프 §8) | 연장 가능 |

## 2. 가동 순서 (M4 체크리스트)

1. **마이그레이션 적용** — staging 프로젝트 SQL 편집기에서 0001 → 0002. 확인: `pipeline_runs`·`publications`·`redirects` 테이블 존재, `publications_anon_read_published` 정책 존재.
2. **secrets 등록** — §1의 이름으로 Actions secrets. 값은 세션·로그·문서에 두지 않는다.
3. **드라이런 dispatch** — `pipeline.yml` 수동 실행: `dry_run=true, live=true, stages_on=true, publish_target=none, notify=true`. 기대: step summary에 funnel·"Notify (3i)" 절, Telegram에 요약 1건(`notify.sent true`). 실패하면 secrets 이름부터 확인한다.
4. **첫 staging 쓰기** — `dry_run=false, live=true, stages_on=true, publish_target=staging, notify=true, ops_check=true`. CLI는 `--live` 없이 또는 `SUPABASE_*` 이름 없이 non-dry-run을 거부하고, `production` 타깃은 Phase 5까지 거부한다. 기대: `pipeline_runs` 행 1(`started` → `done|partial`), `stage_events` 7, `publications` ≥ 0, `ops` OK.
5. **프리뷰 사이트** — 현재 Vercel 프로젝트는 Root Directory가 레거시(루트 `vercel.json` → `npm run build`·`dist`)라 `rebuild/v2` 프리뷰도 레거시 앱을 빌드하고, `apps/site`의 `/healthz`·`publications` 읽기는 그 배포에 없다(Root Directory 전환은 Phase 5 M6). 따라서 환경 변수만 넣어서는 아무것도 보이지 않는다. 샘플 검토용 프리뷰는 **별도 Vercel 프로젝트**로 만든다: 같은 레포, Root Directory `apps/site`, Production Branch `rebuild/v2`, 환경 변수 `SITE_DATA_SOURCE=supabase`·`SUPABASE_URL`·`SUPABASE_ANON_KEY`(staging anon). Vercel 프로젝트 신설은 CLAUDE.md §3 승인 항목이고 프로덕션 프로젝트는 건드리지 않는다. 확인: 그 프로젝트의 `/healthz`가 `dataSource supabase`·`publishedCount`를 보고한다. 프로젝트 없이도 샘플 검토는 가능하다 — staging Supabase 대시보드의 `publications` 테이블(`status published`)을 직접 읽는다(대체 경로).
6. **스케줄 켜기** — 3·4가 green이면 `pipeline.yml`의 `schedule` 주석을 해제하고 `llm.provider: anthropic`으로 바꾸는 1줄 PR. 스케줄 변경은 CLAUDE.md §3·AGENTS.md의 **별도 명시 승인 항목**이라 Phase 4 착수 승인에 포함되지 않는다 — 스케줄 활성화를 지정한 승인 문구를 `docs/STATUS.md` `decisions`에 날짜와 함께 남긴 뒤에만 PR을 연다. 승인이 있어도 secrets 등록 전에는 켜지 않는다 — 켜면 3회/일 ConfigError 런만 쌓인다. **구현(2026-10-29, cron PR)**: `schedule` 활성 + cron 런 기본값 고정(`github.event_name == 'schedule'` → `dry_run=false live=true stages_on publish_target=staging notify ops_check`, `--trigger schedule`) + `CC_FLAG_LLM_PROVIDER`(파일 `llm.provider`는 `fixture` 유지 — replay 테스트·CI 보호; shadow 런과 `llm_provider=anthropic` dispatch만 실제 모델).
7. **매 런 기록** — `compare.md`에 run_id·슬롯·funnel·비용·notify를 한 줄씩(Telegram 요약을 그대로 옮겨도 된다). `pipeline ops --json`을 하루 1회(`ops_check=true` dispatch; `ops-check` 잡의 알람 단계가 stale/never/failing/unknown을 마커 이슈 1개로 올리고 회복 시 닫는다 — 3i notes §5.3).
8. **샘플 검토** — Josh가 staging `publications`(프리뷰 URL)에서 "발행했을 글"을 읽고 `compare.md` §3에 오탐/미탐 표시. 조정은 `config/{scoring,qa,banned-phrases}.yaml` **값만** 바꾸고 `version`을 올리며 `tuning-log.md`에 적는다.
9. **롤백 드릴** — §4. 1회 실측.
10. **3일 평가** — §0 표를 채워 §7 보고 → Phase 5 승인 요청.

## 3. 원칙

- 프로덕션 무영향: `main`·레거시 파일·`vercel.json`·`astro.config.mjs` 불변, `PUBLISH_TARGET=production` 금지(CLI가 거부).
- 모든 런은 원장이 먼저다(`started` 행). 실패 런도 남는다. 예외 0 = `failed` 0 + 미종료 `started` 0 + 처리되지 않은 dead letter 0(dead letter 자체는 P5 정상 동작).
- 비용은 런마다 `cost_total_usd`; `budget_stop`이 나오면 그 자체가 보고 항목(STOP-THE-LINE은 상한 **초과**).
- 튜닝은 설정 변경만(코드 변경은 모듈 PR). 임계값·가중치·어휘·금칙어는 각 YAML의 `version`을 올린다.

## 4. 롤백 드릴 (목표 ≤ 5분)

레거시가 계속 서빙하므로 Phase 4의 "롤백"은 **새 파이프라인을 멈추는 것**이다.

| 단계 | 동작 | 예상 |
|---|---|---|
| R1 | Actions → `Pipeline v2 (rebuild)` → Disable workflow(또는 `schedule` 주석 PR) | 1분 |
| R2 | 진행 중 런이 있으면 Cancel(concurrency `cc-pipeline`이라 1개) | 1분 |
| R3 | 프리뷰 사이트 `SITE_DATA_SOURCE=empty`로 변경(또는 그대로 둠 — 프로덕션과 무관) | 2분 |
| R4 | 확인: 프로덕션 200, `pipeline ops`가 다음 슬롯에 `stale`를 보고하는지(알람 경로 검증) | 1분 |

실측 시각·소요를 `compare.md` §4에 적는다. Phase 5 컷오버의 롤백(플래그 되돌리기·이전 배포 Promote·`legacy-final` 재배포)은 ADR-006 M6.

## 5. 이 세션이 할 수 있는 것 / 없는 것

- 할 수 있음: 코드·워크플로·문서·`compare.md` 갱신(Josh가 Telegram 요약이나 step summary를 붙여 주면), 설정 튜닝 PR, `pipeline ops --from <덤프>` 분석.
- 없음: secrets 값 취급, Supabase SQL 적용(대시보드), Vercel 프로젝트 신설·환경 변수 변경(§3 승인 항목; Josh가 지시하면 Vercel 커넥터로 대신할 수는 있다). dispatch는 Actions 트리거로 가능하나 secrets 없이는 ConfigError로 끝난다. 피드 호스트·Vercel 로그 접근 불가.
