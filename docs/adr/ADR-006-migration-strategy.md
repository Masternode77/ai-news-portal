# ADR-006 — 마이그레이션 전략

- 상태: Proposed
- 날짜: 2026-10-18
- 관련: ADR-001~005, 브리프 Phase 2~5, §5.4·§5.5, R4·R8

## Context

- 프로덕션은 `main`의 레거시 정적 사이트가 서빙 중이고 생성 파이프라인은 2026-10-11 이후 정지 상태(이슈 #29). 사이트 자체는 정상.
- 보존 자산 136 URL·발행 JSON 4종·이미지 1,105 디렉토리·레지스트리·규칙(`05-preserve-list.md`).
- 브리프: Strangler 패턴, shadow run ≥ 3일(9런+), 컷오버 플래그, `legacy-final` 태그 + DB 백업, 롤백 5분 드릴, 레거시 삭제는 별도 PR.

## Options

### A. 빅뱅(새 구조 완성 후 한 번에 교체)
### B. Strangler(병렬 운행 → 플래그 컷오버 → 레거시 제거) (결정)
### C. 병렬 사이트(새 도메인/서브도메인에서 운영 후 DNS 전환)

## Decision

**B.** 단계와 롤백:

| 단계 | 내용 | 롤백 | 승인 |
|---|---|---|---|
| M0 (Phase 1 종료) | `docs/` 설계 문서 머지 | 없음(문서) | Josh |
| M1 (Phase 2) | `rebuild/v2` 브랜치·worktree 생성, 워크스페이스 뼈대, no-op 러너, fixture, CI, `apps/site` 데이터 접근층(플래그 `SITE_DATA_SOURCE=legacy_json|supabase`, 기본 legacy_json) | 브랜치 폐기. `main` 무변경 | Josh (Phase 2 게이트) |
| M2 (Phase 2) | Supabase 스키마 마이그레이션 적용(스테이징 스키마 `v2_staging` 또는 별도 프로젝트) | `DROP SCHEMA v2_staging` (승인 후) | §5.6 사전 승인 |
| M3 (Phase 3a~3i) | 모듈별 이식, 플래그 기본 `enabled: false`, dry-run은 staging 스키마에만 기록 | 모듈 플래그 OFF | 모듈별 Josh |
| M4 (Phase 4) | Actions 스케줄 가동, `PUBLISH_TARGET=staging`. 프리뷰 배포(`rebuild/v2` 브랜치 → Vercel 프리뷰 URL)가 staging 스키마를 읽음. 레거시 Mac 태스크는 그대로(정지 상태면 그대로 둠) | 워크플로 비활성화 | Josh |
| M5 (Phase 5 준비) | 레거시 JSON → `publications` 이관 스크립트(dry-run → 승인 → 실행), URL 전수 검증(136 → 200/301), `legacy-final` 태그, Supabase·JSON 백업 | 백업에서 복원 | Josh (STOP-THE-LINE 항목) |
| M6 (Phase 5 컷오버) | `rebuild/v2` → `main` 머지, Vercel Root Directory `apps/site`, `SITE_DATA_SOURCE=supabase`, `PUBLISH_TARGET=production`, 사이트맵·robots 갱신 | (a) 환경변수 플래그 되돌리기(≤ 5분), (b) Vercel 이전 배포 Promote(≤ 5분), (c) `legacy-final` 태그 체크아웃 후 재배포 | Josh |
| M7 | 48h 모니터링(Telegram·funnel·가용성). 이상 시 M6 롤백 | — | — |
| M8 | 레거시 제거 PR(`scripts/`, `src/`, `tests/` 레거시, `prompts/` 37파일, 데드코드) | PR 미머지 | Josh 별도 승인 |

플래그 정의(`config/pipeline.yaml` + Vercel/Actions 환경변수):

- `SITE_DATA_SOURCE`: `legacy_json` | `supabase` | `empty` (사이트). Phase 2 조정: 미설정이면 `empty`로 동작해 배포가 데이터 소스를 명시적으로 선택하게 한다(`legacy_json`은 로컬·strangler 기간용이며 Vercel 함수 런타임에는 레거시 JSON이 없다)
- `PUBLISH_TARGET`: `none` | `staging` | `production` (파이프라인)
- 모듈별 `stages.<name>.enabled`

Shadow run 기준(Phase 4 완료 조건과 동일): 3일 연속 처리되지 않은 예외 0, 런의 80% 이상에서 발행 가능한 `news_brief` ≥ 1, Josh 샘플 검토 hard-QA 오탐 0, 롤백 드릴 ≤ 5분 실측, 런당 비용 상한 이내.

레거시 Mac 태스크: Phase 4 동안 손대지 않는다(현재 정지 상태). Josh가 Mac git을 복구해 재가동하면 레거시가 `main`에 계속 커밋하므로 `rebuild/v2`는 정기적으로 `main`을 머지한다(데이터 파일 충돌은 `main` 우선).

백업: M5에서 `src/data/*.json`·`public/generated/`·`config/codex-image-manifest.json`을 `legacy-final` 태그로 고정하고, Supabase는 `pg_dump`(또는 대시보드 백업) 1회. 기존 `archived_articles` 테이블은 건드리지 않는다.

## Consequences

- (+) 프로덕션 무중단, 모든 단계에 플래그·롤백 존재(R4).
- (+) 컷오버 전 URL 전수 검증으로 R8 보장.
- (−) Phase 4 동안 Supabase staging 스키마와 프리뷰 배포 운영 비용(소액).
- (−) `rebuild/v2`가 `main`과 오래 분기되면 머지 비용 증가 → 주 1회 `main` 머지 규칙.

## Rejected alternatives & why

- **A 빅뱅**: 롤백 불가 구간이 생기고 R4 위반 위험.
- **C 병렬 사이트**: 도메인·SEO 분산, R8의 "같은 URL" 보존과 충돌.
