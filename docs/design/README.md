# 사이트 디자인 작업 기록 (docs/design)

사이트 디자인 전용 세션의 진행 기록이다. 단일 진실은 `docs/STATUS.md`(메인 창이 반영)이고, 이 문서는 디자인 게이트 진행만 기록한다. 상태 어휘: `started | partial | done | blocked (reason)`.

| 게이트 | 내용 | 상태 | 산출물 |
|---|---|---|---|
| D1 | 레거시 복구 타당성 조사(코드 변경 없음) | `done` (2026-11-03) | `restore-feasibility.md`, `screenshots/d1/` 16장 |
| D2 | 홈·기사·목록 시안 + 방향 승인(Josh) | `done` (시안, 2026-11-03) — 방향 승인 대기 | `d2-direction.md`, `d2/*.html`, `screenshots/d2/` 12장 |
| D3 | `apps/site` 디자인 시스템 적용, draft PR | 대기 | — |
| D4 | 머지(Josh 지시) + 프로덕션 READY + www 136/136 | 대기 | — |

## 로그

- 2026-11-03 D1: `legacy-final`(`ebd7f6a1`) 정적 빌드 86페이지와 현재 `apps/site`(legacy_json)를 데스크톱·모바일로 비교했다. 권고안은 C(하이브리드)다. D2 결정 항목 5개는 `restore-feasibility.md` §8에 있다.
- 2026-11-03 D2: Josh가 D1 권고안 5개를 승인했다("권고안대로 진행한다"). 홈·기사(브리프·칼럼)·목록 정적 시안과 디자인 시스템 명세, D3 파일 계획(약 22~24파일)을 작성했다. 결정 항목은 `d2-direction.md` §6에 있다.
