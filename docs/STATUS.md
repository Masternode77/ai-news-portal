# STATUS — computecurrent.com 리빌드 (단일 진실)

| 필드 | 값 |
|---|---|
| `phase` | **Phase 2 — 뼈대 구축 (Skeleton + Contracts + Test Harness + CI)** (`REBUILD_BRIEF.md` §6) |
| `phase_status` | `done` — 워크스페이스·계약·no-op 러너·fixture·CI·사이트 데이터층·CLAUDE.md·README 완료, 로컬 검증 통과. Josh 승인(Phase 3a 착수) 대기 |
| `last_pass` | Phase 1 승인 + Phase 2 착수 2026-10-18 (Josh: `rebuild/v2` 브랜치, 패키지 설치 전부 승인). Phase 2 검증 2026-10-18: `v2:typecheck` 0 errors, `v2:test` 66/66, `v2:build` OK(SITE_DATA_SOURCE=empty), CLI dry-run 7 Stage done, 플래그 OFF → `skipped`, 레거시 경로 diff 0, 레거시 오프라인 테스트 105/105, 루트 `astro check` 레거시 baseline과 동일 |
| `baseline_commit` | `e1ee3f245e521929c43c977b8264c6048433d321` (origin/main) — Vercel READY 배포 커밋은 커넥터 403으로 미확인 |
| `branch` | `rebuild/v2` (Phase 2 코드, `b081e9d0`에서 분기) → draft PR. docs 전용 PR #57(`claude/tender-bell-o5si5j`)은 독립 머지 가능 |
| `decisions` | 2026-10-18 Josh: 런타임 = GitHub Actions + API 키(ADR-002), 저장소·발행 = Supabase + Astro SSR/ISR(ADR-003/005), 링크 전용 매체 재서술 허용(ADR-004), Phase 2 브랜치 = `rebuild/v2`, 신규 의존성(zod·yaml·@supabase/supabase-js·@astrojs/vercel) 승인. 실행 중 판단: `@astrojs/vercel`은 빌드 도구라 devDependency(prod 감사 0건 유지), `.astro` 파일은 확장자 없는 import만(루트 `astro check` 호환), fixture는 커밋된 풀 스냅샷 파생(라이브 피드 미도달) |
| `pending_approval` | 1) Phase 2 산출물 승인 → Phase 3a(Sources & Ingest) 착수 2) Supabase 프로젝트 선택 + `supabase/migrations/0001_init.sql` 적용(M2, §5.6) 3) ADR 대비 조정 2건 확인: `drafts.review_status`·`pipeline_runs.flags` 컬럼 추가, `dead_letters` unique(run_id, stage, ref_id) |
| `blockers` | 없음. 미수령 입력(Phase 3 전): Anthropic API 키(3d), Supabase 키·프로젝트(3h/4), Telegram(3i), 보이스 샘플(3e), 재서술 금지 매체 목록(3a), Vercel 재인가(5) — `docs/migration/plan.md` §4 |
| `production_health` | 생성 파이프라인 **정지 중**(heartbeat 2026-10-11T04:31Z, 이슈 #29). 사이트 서빙 정상(정적, `main` 무변경) |
| `next_step` | Josh가 Phase 2 PR 검토 → 승인 시 Phase 3a. 킥오프 문구: 브리프 Appendix D Phase 3(모듈별). 공통 절차 1~5, 플래그 기본값 false, dry-run 샘플 첨부 |
| `updated_at` | 2026-10-18 |

## 세션 로그

| 날짜 | Phase | 상태 | 요약 |
|---|---|---|---|
| 2026-10-17 | 0 | done | 브리프 저장, 인벤토리·파이프라인 지도·funnel(120런, git 118커밋 측정)·에러 분류·판정·보존 목록·CLAUDE.md 초안, `scripts/diagnose/{funnel,urls}.mjs` 신설. PR #57 |
| 2026-10-18 | 0→1 | approved | Josh가 04-verdict·05-preserve-list 승인, 런타임·저장소·재서술 결정 |
| 2026-10-18 | 1 | done | ADR-001~008, target.md, contracts.md, migration/plan.md(추적표 포함). 코드 변경 0. PR #57 누적 |
| 2026-10-18 | 1→2 | approved | Josh: 계획 모드 해제, `rebuild/v2` 신설, 패키지 설치 승인 |
| 2026-10-18 | 2 | done | npm workspaces(`apps/site`, `packages/shared`, `packages/pipeline`), zod 스키마·계약·설정 로더·플래그·로거, no-op 러너 + 선기록 원장 + fixture 어댑터 + CLI, `config/{pipeline,sources}.yaml`, `fixtures/`, `supabase/migrations/0001_init.sql`(미적용), `rebuild-ci.yml`, `CLAUDE.md`, README. 테스트 66, 레거시 무변경 |

## Phase 2 완료 기준 대조

| 기준 | 결과 | 근거 |
|---|---|---|
| CI green (lint / typecheck / test / build) | 로컬 통과; GitHub Actions `rebuild-ci.yml`은 PR에서 확인 | `npm run v2:typecheck`(tsc ×2 + astro check 0 errors), `npm run v2:test` 66/66, `npm run v2:build` |
| `pipeline run --dry-run --fixture sample` 전 Stage no-op 통과 + 런 원장 기록 | 통과 | 7 Stage `done`, `pipeline_runs` 1행(`started`→`done`), `stage_events` 7행, funnel 13컬럼(fetched 150 / sources 5/5) |
| published 0개에서 사이트 빌드 성공(테스트) | 통과 | `apps/site/test/build-empty.test.ts`(SITE_DATA_SOURCE=empty → `.vercel/output` 생성), `healthz.test.ts`(publishedCount 0) |
| 기능 플래그로 임의 Stage on/off | 통과 | `CC_FLAG_STAGES_IMAGE=false` → image `skipped`(러너·CLI 테스트), 전 Stage off도 정상 종료 |
| 프로덕션 무영향(`main` 무변경) | 통과 | `main` 미접촉, 레거시 경로 diff 0, 루트 변경은 `package.json`(workspaces·`v2:*`)·lockfile·README뿐 |
