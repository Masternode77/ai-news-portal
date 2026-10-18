# STATUS — computecurrent.com 리빌드 (단일 진실)

| 필드 | 값 |
|---|---|
| `phase` | **Phase 3a — Sources & Ingest** (`REBUILD_BRIEF.md` §6 Phase 3, 모듈 a) |
| `phase_status` | `partial` — 코드·테스트·레지스트리 이관·워크플로 완료, 로컬 검증 통과. 남은 항목: GitHub Actions 라이브 dry-run 실행 결과(`items_fetched` vs Phase 0) 첨부, Josh의 3a 산출물 승인 |
| `last_pass` | Phase 2 `done` 2026-10-18 → PR #57(docs) 머지 `2c5a7bc1`, PR #58(Phase 2) 머지 대기(CI 재실행 중). Phase 3a 착수 승인 2026-10-18(Josh: "착수 승인"). 3a 로컬 검증 2026-10-18: `v2:typecheck` 0 errors, `v2:test` 108/108, `v2:build` OK, dead-proxy 하에 replay·net·rss 테스트 14/14, fixture dry-run 80 소스 ok / items_fetched 6(소스당 캡) / duplicates 474 |
| `baseline_commit` | `2c5a7bc195b954f2cd152132e997f2ae7aef97b9` (origin/main, PR #57 머지) — Vercel READY 배포 커밋은 커넥터 403으로 미확인 |
| `branch` | `rebuild/v2` (Phase 2 코드 + main 머지 `223249a0`) → PR #58. 3a 코드는 로컬 `rebuild/3a-sources-ingest`(`3ff6b7b1`, `f1f23f2c`, `3d3c3b28`)에 있고 #58 머지 후 `rebuild/v2`에 올려 새 draft PR로 낸다 |
| `decisions` | 2026-10-18 Josh: #57·#58 머지 진행, 3a 착수 승인, Supabase `0001_init.sql` 적용 승인(대상 프로젝트·경로 회신 대기). 실행 중 판단(3a): 라이브 어댑터는 CLI `--live`로만 켜진다(기본 OFF, `--dry-run` 필수, `--replay` 배타); `allow_text_use false` 53행은 `rewrite_only`(금지 매체 목록 수령 시 `link_only`); 링크 호스트 제한은 페이지를 실제로 가져오는 `full` 소스에만 적용; 자동 비활성은 DB `sources` 행에서만 일어나고 YAML `reviewed_at`을 그 날짜 뒤로 올리면 해제; `items_fetched`는 소스 간 중복 제거 후 고유 URL 수; 본문 추출은 `full`만, 실패 시 항목은 유지하고 `payload.extraction.ok=false` |
| `pending_approval` | 1) Phase 3a 산출물 승인 → 3b(Normalize) 착수 2) Supabase 프로젝트 선택 + `0001_init.sql` 적용 경로(대시보드 SQL 편집기 vs 세션 `SUPABASE_DB_URL`) 3) 재서술 금지 매체 목록(→ `link_only`) |
| `blockers` | 세션에서 피드 호스트 미도달 → 라이브 증거는 `rebuild-ci.yml`의 `ingest-live-dry-run` 잡(workflow_dispatch, `live_ingest=true`)로만 확보. 미수령 입력: Anthropic API 키(3d), Supabase 키·프로젝트(3h/4), Telegram(3i), 보이스 샘플(3e), 금지 매체 목록(3a), Vercel 재인가(5) — `docs/migration/plan.md` §4 |
| `production_health` | 생성 파이프라인 **정지 중**(heartbeat 2026-10-11T04:31Z, 이슈 #29). 사이트 서빙 정상(정적, `main`에는 docs와 데이터 갱신 커밋만) |
| `next_step` | #58 CI green → ready → merge → `rebuild/v2`에 3a 반영·push → draft PR → `rebuild-ci` 라이브 잡 실행 → 결과를 `docs/migration/notes/3a-sources-ingest.md` §4에 기록 → §7 보고 → Josh 승인 후 3b |
| `updated_at` | 2026-10-18 |

## 세션 로그

| 날짜 | Phase | 상태 | 요약 |
|---|---|---|---|
| 2026-10-17 | 0 | done | 브리프 저장, 인벤토리·파이프라인 지도·funnel(120런, git 118커밋 측정)·에러 분류·판정·보존 목록·CLAUDE.md 초안, `scripts/diagnose/{funnel,urls}.mjs` 신설. PR #57 |
| 2026-10-18 | 0→1 | approved | Josh가 04-verdict·05-preserve-list 승인, 런타임·저장소·재서술 결정 |
| 2026-10-18 | 1 | done | ADR-001~008, target.md, contracts.md, migration/plan.md(추적표 포함). 코드 변경 0. PR #57 누적 |
| 2026-10-18 | 1→2 | approved | Josh: 계획 모드 해제, `rebuild/v2` 신설, 패키지 설치 승인 |
| 2026-10-18 | 2 | done | npm workspaces(`apps/site`, `packages/shared`, `packages/pipeline`), zod 스키마·계약·설정 로더·플래그·로거, no-op 러너 + 선기록 원장 + fixture 어댑터 + CLI, `config/{pipeline,sources}.yaml`, `fixtures/`, `supabase/migrations/0001_init.sql`(미적용), `rebuild-ci.yml`, `CLAUDE.md`, README. 테스트 66, 레거시 무변경. 리뷰 15건 반영. PR #58 |
| 2026-10-18 | 2→3a | approved | Josh: #57·#58 검토·머지 진행, 3a 착수 승인, Supabase 적용 승인. PR #57 머지(`2c5a7bc1`), `main`→`rebuild/v2` 머지 push |
| 2026-10-18 | 3a | partial | 안전 fetch(SSRF·리다이렉트·content-type·2 MiB), 의존성 없는 RSS/Atom/RDF 파서, URL·날짜·HTML 규칙, 라이브 RSS·Epoch 색인 어댑터, 추출기 5종, ingest 재작성(health·auto-disable·캡·중복 제거·items_new·추출), `--live` CLI, 레지스트리 82행 이관 도구 + `config/sources.yaml`, `rebuild-ci.yml`(`ingest-live-dry-run` 잡), contracts §2/§4 개정. 테스트 108. 라이브 dry-run 결과 대기 |

## Phase 3a 완료 기준 대조 (로컬 기준, 라이브 결과는 §4 노트에 추가)

| 기준 | 결과 | 근거 |
|---|---|---|
| 신규 소스 추가 ≤ YAML 10줄 | 통과 | `config/sources.yaml` 82행 중 `extract` 없는 53행 전부 ≤10줄(테스트 `migrate-registry.test.ts`가 강제) |
| 단일 소스 실패가 런을 중단시키지 않음 | 통과 | `ingest-stage.test.ts`: 실패 소스 dead letter + 나머지 진행, 잘못된 항목 개별 dead letter, 어댑터 없음은 해당 소스만 실패; `rss-adapter.test.ts`: 타임아웃·5xx 재시도 1회, 404 미재시도, 비피드 문서 `FEED_PARSE` |
| 사이클당 `items_fetched` 보고 | 부분 | funnel + `stage_events.counts`(sources_ok/failed/auto_disabled, items_new/duplicate/skipped, extract_ok/failed/skipped) + 소스별 `sourceStats`(`--json`). 라이브 수치는 Actions 실행 후 기록 |
| tier·health 추적 | 통과 | `sources` 행: `last_ok_at`, `fail_streak`, `health{success_rate_7d,last_error,last_error_at,items_last_run,auto_disabled_at,recent}`; 연속 실패 N회 → DB `enabled=false` + `SOURCE_AUTO_DISABLED`; `reviewed_at`으로 재활성 — 테스트로 증명 |
| 후보 소스 확장 목록 | 통과 | `docs/migration/notes/3a-source-candidates.md`(URL 전부 "확인 필요") |
| 플래그 기본값 OFF | 통과 | 라이브 어댑터는 `--live`에서만; CI·테스트는 fixture만(R7), dead-proxy 증명 |

## Phase 2 완료 기준 대조

| 기준 | 결과 | 근거 |
|---|---|---|
| CI green (lint / typecheck / test / build) | 통과 | PR #58 `rebuild-ci`·`validate-application`·`visual-qa`·Vercel preview green(`471b45e9`, 리뷰 반영 `be2ad03f` 재확인) |
| `pipeline run --dry-run --fixture sample` 전 Stage no-op 통과 + 런 원장 기록 | 통과 | 7 Stage `done`, `pipeline_runs` 1행(`started`→`done`), `stage_events` 7행, funnel 13컬럼 |
| published 0개에서 사이트 빌드 성공(테스트) | 통과 | `apps/site/test/build-empty.test.ts`, `healthz.test.ts` |
| 기능 플래그로 임의 Stage on/off | 통과 | `CC_FLAG_STAGES_IMAGE=false` → image `skipped`(러너·CLI 테스트), 전 Stage off도 정상 종료 |
| 프로덕션 무영향(`main` 무변경) | 통과 | 레거시 경로 diff 0, 루트 변경은 `package.json`(workspaces·`v2:*`)·lockfile·README뿐 |
