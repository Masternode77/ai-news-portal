# ADR-008 — UI 단순화 제안 (선택, 제안만 — v1 구현 범위 밖)

- 상태: Proposed (구현 없음)
- 날짜: 2026-10-18
- 관련: 브리프 §3 Non-goals("UI는 깨진 곳만 고친다"), ADR-005

## Context

`docs/diagnosis/05-preserve-list.csv` 기준 공개 라우트 136개 중 리더 상세 페이지는 25개(news 5 + 컬럼 20)뿐이다. 나머지 111개는 taxonomy·archive·정적·피드·리다이렉트다. 사이트 코드 48페이지·41컴포넌트가 25개 콘텐츠를 서빙하고 있고, 관리자 UI(`/admin*`, `api/admin/*` 6함수)는 GitHub API 커밋 방식에 묶여 있다.

## Options

- A. 현행 라우트 전부 유지(v1 기본).
- B. 라우트 축소: `/sample/ /pricing/ /briefing/ /subscribe/`(noindex 4개), `/data/*`(EIA 그리드 6개), `/hubs /entities /glossary`(참조 데이터 9개), `/radar/`(링크 전용 레이더)를 Phase 5 이후 별도 결정.
- C. 관리자 UI를 Supabase 기반 편집(또는 Supabase Studio 직접 사용)으로 교체.

## Decision (제안)

v1은 **A**. 다만 Phase 5 이후 검토 항목으로 기록:

1. `/admin*` + `api/admin/*`: ADR-005 이후 GitHub 커밋 경로가 사라지므로 Supabase Studio + RLS로 대체하고 코드 삭제(보안 표면 축소).
2. noindex 상업 페이지 4개: 수익화 계획 확정 전까지 유지.
3. taxonomy 32개 중 catalog가 비는 company 페이지: sitemap 제외 로직을 `publications` 집계로 교체.
4. `/radar/` 링크 레이더: 재서술 허용(ADR-004)으로 역할이 줄어들므로 홈 섹션으로 흡수 검토.

## Consequences

없음(제안). 구현 시 각 항목이 별도 ADR·승인 대상.

## Rejected alternatives & why

- v1에서 B·C 구현: 브리프 Non-goal.
