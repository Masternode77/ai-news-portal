# STATUS — computecurrent.com 리빌드 (단일 진실)

| 필드 | 값 |
|---|---|
| `phase` | **Phase 3a — Sources & Ingest** (`REBUILD_BRIEF.md` §6 Phase 3, 모듈 a) |
| `phase_status` | `done` — 코드·테스트·레지스트리 이관·라이브 dry-run 증거 완료(`docs/migration/notes/3a-sources-ingest.md` §4). PR #59(draft, `rebuild/v2` → `main`) 검토·머지와 3b(Normalize) 착수는 Josh 승인 대기 |
| `last_pass` | Phase 2 `done` → PR #57 머지 `2c5a7bc1`, PR #58 머지 `6666fd64`(Codex 리뷰 4건 반영 `a705b775`). Phase 3a 착수 승인 2026-10-18. 3a 검증 2026-10-18: `v2:typecheck` 0 errors, `v2:test` 119/119, `v2:build` OK, 루트 `astro check` 0 errors, dead-proxy 하 replay·net·rss 18/18, 독립 코드 리뷰 10건 반영(`fa378465`). 라이브 dry-run run 1(39103566574): 80 소스 중 71 ok / 9 failed, `items_fetched` 286; 수정 후 run 2(39104453316, `cecca564`): **76 ok / 4 failed, `items_fetched` 312**(Phase 0 평균 28.1, 캡 30), 추출 68 성공 / 0 실패, ingest 30.2 s. 남은 실패: nrc-news 403, insidehpc TLS, venturebeat 429, capacity-media 도메인 이전 |
| `baseline_commit` | `6666fd64115824eb099a2d16960c267981b09d54` (origin/main, PR #58 머지) — Vercel READY 배포 커밋은 커넥터·세션 네트워크 403으로 미확인 |
| `branch` | `rebuild/v2` (main 머지 포함, 3a 커밋 `f1f23f2c`·`3d3c3b28`·`985cb146`·`fa378465`·`a46ab40d`·`4ebf408d` + 라이브 수정) → PR #59 |
| `decisions` | 2026-10-18 Josh: #57·#58 머지 진행, 3a 착수 승인, Supabase `0001_init.sql` 적용 승인(대상·경로 회신 대기). 실행 중 판단(3a): 모든 런 `--dry-run` 필수(Phase 4 전), 라이브 어댑터는 `--live`로만; `allow_text_use false` 53행은 `rewrite_only`(금지 매체 목록 수령 시 `link_only`); 링크 호스트 제한은 `full` 소스에만, 피드 호스트의 등록 도메인은 항상 허용; `http` 다운그레이드 리다이렉트는 `https`로 재시도; 응답 캡 6 MiB; 자동 비활성은 DB 행에서만, YAML `reviewed_at`으로 해제; `items_fetched` = 소스 간 중복 제거 후 고유 URL; 추출 실패는 항목 유지 + `payload.extraction.ok=false`; 라이브 dry-run은 `rebuild-ci.yml`의 dispatch 전용 잡(별도 워크플로는 기본 브랜치에 없으면 dispatch 불가) |
| `pending_approval` | 1) PR #59(3a) 검토·머지 → 3b(Normalize) 착수 2) Supabase 프로젝트 선택 + `0001_init.sql` 적용 경로(대시보드 SQL 편집기 vs 세션 `SUPABASE_DB_URL`) 3) 재서술 금지 매체 목록(→ `link_only`) 4) nrc-news(tier 1) 403 대응 방향(UA 협의/대체 피드), capacity-media 새 피드 URL 확인 |
| `blockers` | 없음. 미수령 입력: Anthropic API 키(3d), Supabase 키·프로젝트(3h/4), Telegram(3i), 보이스 샘플(3e), 금지 매체 목록(3a), Vercel 재인가(5) — `docs/migration/plan.md` §4 |
| `production_health` | 생성 파이프라인 **정지 중**(heartbeat 2026-10-11T04:31Z, 이슈 #29). 사이트 서빙 정상(정적). `main`에 Phase 2 워크스페이스가 머지됐으나 레거시 빌드 입력은 무변경(Vercel 프리뷰·validate-application green) |
| `next_step` | Josh: PR #59 검토 → 머지 → 3b 킥오프 문구. 병행: Supabase 적용 경로 회신 시 `0001_init.sql` 적용·검증 |
| `updated_at` | 2026-10-18 |

## 세션 로그

| 날짜 | Phase | 상태 | 요약 |
|---|---|---|---|
| 2026-10-17 | 0 | done | 브리프 저장, 인벤토리·파이프라인 지도·funnel(120런, git 118커밋 측정)·에러 분류·판정·보존 목록·CLAUDE.md 초안, `scripts/diagnose/{funnel,urls}.mjs` 신설. PR #57 |
| 2026-10-18 | 0→1 | approved | Josh가 04-verdict·05-preserve-list 승인, 런타임·저장소·재서술 결정 |
| 2026-10-18 | 1 | done | ADR-001~008, target.md, contracts.md, migration/plan.md(추적표 포함). 코드 변경 0. PR #57 누적 |
| 2026-10-18 | 1→2 | approved | Josh: 계획 모드 해제, `rebuild/v2` 신설, 패키지 설치 승인 |
| 2026-10-18 | 2 | done | npm workspaces, zod 스키마·계약·설정 로더·플래그·로거, no-op 러너 + 선기록 원장 + fixture 어댑터 + CLI, `config/{pipeline,sources}.yaml`, `fixtures/`, `supabase/migrations/0001_init.sql`(미적용), `rebuild-ci.yml`, `CLAUDE.md`, README. 리뷰 15건 + Codex 4건 반영. PR #58 머지 |
| 2026-10-18 | 2→3a | approved | Josh: #57·#58 검토·머지 진행, 3a 착수 승인, Supabase 적용 승인 |
| 2026-10-18 | 3a | done | 안전 fetch(SSRF·리다이렉트·content-type·캡·charset), 의존성 없는 RSS/Atom/RDF 파서, URL·날짜·HTML 규칙, 라이브 RSS·Epoch 색인 어댑터, 추출기 5종, ingest 재작성(health·auto-disable·캡·중복 제거·items_new·추출), `--live` CLI, 레지스트리 82행 이관, `rebuild-ci.yml` 라이브 dry-run 잡, contracts §2/§4 개정. 테스트 119. 라이브 dry-run run 2: 76/80 ok, items_fetched 312. PR #59 |

## Phase 3a 완료 기준 대조

| 기준 | 결과 | 근거 |
|---|---|---|
| 신규 소스 추가 ≤ YAML 10줄 | 통과 | `config/sources.yaml` 82행 중 `extract` 없는 53행 전부 ≤10줄(테스트 강제) |
| 단일 소스 실패가 런을 중단시키지 않음 | 통과 | 라이브: 9개 소스 실패 → dead letter, 71개 수집, 런 완주(`partial`). 테스트: 재시도·404·비피드·잘못된 항목·어댑터 없음 |
| 사이클당 `items_fetched` 보고 | 통과 | 라이브 286 vs Phase 0 평균 28.1(캡 30); funnel + `stage_events.counts` + 소스별 stats(`--json`, step summary) — `notes/3a-sources-ingest.md` §4.1 |
| tier·health 추적 | 통과 | `sources` 행 health·auto-disable·`reviewed_at` 재활성(테스트) |
| 후보 소스 확장 목록 | 통과 | `docs/migration/notes/3a-source-candidates.md` |
| 플래그 기본값 OFF | 통과 | `--live` opt-in, 모든 런 `--dry-run` 필수; CI·테스트 fixture만(R7) |

## Phase 2 완료 기준 대조

| 기준 | 결과 | 근거 |
|---|---|---|
| CI green (lint / typecheck / test / build) | 통과 | PR #58 `rebuild-ci`·`validate-application`·`visual-qa`·Vercel preview green, 머지 `6666fd64` |
| `pipeline run --dry-run --fixture sample` 전 Stage no-op 통과 + 런 원장 기록 | 통과 | 7 Stage `done`, `pipeline_runs` 1행(`started`→`done`), `stage_events` 7행, funnel 13컬럼 |
| published 0개에서 사이트 빌드 성공(테스트) | 통과 | `apps/site/test/build-empty.test.ts`, `healthz.test.ts` |
| 기능 플래그로 임의 Stage on/off | 통과 | `CC_FLAG_STAGES_IMAGE=false` → image `skipped`(러너·CLI 테스트), 전 Stage off도 정상 종료 |
| 프로덕션 무영향(`main` 무변경) | 통과 | 레거시 경로 diff 0, 루트 변경은 `package.json`(workspaces·`v2:*`)·lockfile·README뿐 |
