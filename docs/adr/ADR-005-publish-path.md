# ADR-005 — 발행 경로 (서빙·생산 분리)

- 상태: Proposed (Josh 사전 결정 2026-10-18: Supabase Postgres + Astro SSR/ISR)
- 날짜: 2026-10-18
- 관련: ADR-002, ADR-003, ADR-006, 브리프 P1·R4·R8

## Context

- 현재 발행 = `src/data/*.json` 커밋 → `main` push → Vercel 전체 정적 재빌드. 요청 시점에 읽히는 저장소가 없다(`astro.config.mjs:50` `output` 미설정 = static, `src/pages/news/[id].astro:36-53`·`src/pages/column/[slug].astro:20-25`의 `getStaticPaths`). 관리자 편집도 GitHub API 커밋으로 재빌드를 유발한다(`api/admin/_github.js:124-139`).
- 러너는 발행 전에 `npm test`(= `astro build` 포함)와 `content:gate`를 돌린다(`scripts/run-subscription-news.mjs:15-27`). 빌드·테스트 실패가 곧 발행 실패다. 10-11 이후 정지도 발행 전 단계(`restore-eia-public-inventory.mjs`) 실패에서 시작했다.
- 브리프 P1: "발행이 사이트 전체 재빌드 성공에 의존하는 구조는 금지(SSR/ISR 또는 on-demand revalidation 사용)". R4: 파이프라인 실패 중 사이트 가용성 100%. R8: 기존 URL 100% 접근 또는 301.
- 보존 대상 URL 136개(`docs/diagnosis/05-preserve-list.csv`): news 5, 컬럼 20(+격리 2), taxonomy 32, archive 페이지 28(est), author 1, hubs 3, entities 5, 정적 27, 피드·자산 8, 리다이렉트 5.
- 기술 사실: Astro 7.3.6은 `output: 'static' | 'server'`만 지원하고(`node_modules/astro/dist/types/public/config.d.ts:295-316`), on-demand 렌더링에는 어댑터가 필요하다. `@astrojs/vercel` 11.0.15가 `astro ^7.0.0`을 peer로 요구한다(npm registry 2026-10-18 조회). Vercel 문서는 Astro에서 `adapter: vercel({ isr: true })` 또는 `isr: { expiration, bypassToken }` 구성을 안내한다(`vercel.com/docs/frameworks/frontend/astro`; 문서 예시는 구 import 경로 `@astrojs/vercel/serverless`를 쓰므로 11.x 실제 경로는 Phase 2에서 확인).

## Options

### A. Astro `output: 'server'` + `@astrojs/vercel` + ISR, published 테이블을 요청 시점에 읽기 (결정)

- 기사·컬럼·목록 페이지는 서버 렌더링 + ISR 캐시(`expiration` 300s). 정적 정책 페이지(`/about/` 등 27개)는 `export const prerender = true`로 빌드 시 고정.
- 발행 = `publications` 행 insert/update → ISR `bypassToken`으로 해당 경로 on-demand revalidate(실패해도 최대 5분 뒤 자연 갱신).
- 장점: 파이프라인과 사이트 배포가 완전히 분리된다. 빌드는 코드 변경 때만. 발행 지연 ≤ 5분. R4 충족.
- 단점: 어댑터·DB 의존 추가, 요청당 DB 읽기(ISR로 완화), Vercel 함수 호출 과금, DB 장애 시 캐시 만료 후 렌더 실패 가능(아래 Consequences의 완화책).

### B. 정적 빌드 유지 + Supabase 저장 + 발행 시 Deploy Hook으로 재빌드

- 장점: 사이트 코드 변경 최소, DB 장애가 서빙에 영향 없음(정적).
- 단점: 발행이 여전히 빌드 성공에 의존(빌드 입력이 DB로 바뀔 뿐). 빌드 10~15분(Phase 0 Actions 로그 기준 `astro build` 포함 테스트 13분) → 발행 지연. P1 문구상 "on-demand revalidation" 범주에 들어가지만 "재빌드 성공 의존"은 그대로.

### C. 정적 빌드 유지 + 데이터 레이어만 분리(JSON → DB 스냅샷 export → 커밋)

- 장점: 가장 작은 변화.
- 단점: 커밋 기반 발행 유지, git 이력이 데이터로 오염되는 현재 문제(09-15 이후 283커밋 중 173이 자동 데이터 커밋) 지속, P1 위반.

### D. 전면 SSR(ISR 없음)

- 단점: 모든 요청이 DB를 때려 비용·지연 상승, DB 장애가 즉시 가용성 문제. ISR 없이 갈 이유가 없다.

## Decision

**A.** 상세:

| 라우트 | 렌더 | 데이터 소스 | 캐시 |
|---|---|---|---|
| `/news/{id}/`, `/column/{slug}/` | on-demand | `publications` (status=published, slug 일치) | ISR expiration 300s, 발행 시 revalidate |
| `/`, `/archive/{n}/`, `/category|region|company/{slug}/`, `/hubs`, `/entities`, `/author/josh-inn/` | on-demand | `publications` + 참조 데이터(JSON 유지 가능) | ISR 300s |
| `/rss.xml`, `/ko/rss.xml`, `/sitemap.xml`, `/robots.txt`, `/ads.txt` | on-demand | `publications` | ISR 300s (sitemap은 600s) |
| 정적 정책·안내 페이지 27개, `/data/*` | prerender | 없음 / `src/data/grid/*.json` | 빌드 시 |
| `/admin*`, `/api/admin/*` | on-demand, ISR 제외 | — | no-store (현행 헤더 유지) |

URL 보존(R8):

- `publications.slug`에 레거시 경로를 그대로 저장한다: news는 `news/{16hex id}`, 컬럼은 `column/{slug}`. 새 콘텐츠도 같은 규칙(`news/{id}`는 새 모델의 콘텐츠 해시 16hex, 컬럼은 `slugify(headline)[0:64]-YYYY-MM-DD`).
- 301 맵: `vercel.json` 기존 4건 + `astro.config.mjs` 1건을 `redirects` 테이블 또는 `config/redirects.yaml`로 옮기고 미들웨어가 처리. 격리 컬럼 2건은 404 유지(복구 시 같은 slug).
- 컷오버 검증: `scripts/diagnose/urls.mjs` 출력 136개 URL을 새 배포에 전수 요청해 200/301만 허용(Phase 5 체크리스트).

장애 격리(R4):

- 파이프라인 실패 → `publications` 변화 없음 → 사이트는 마지막 발행 상태를 계속 서빙.
- DB 장애 → ISR 캐시가 만료되기 전까지는 정상. 만료 후 렌더 실패 시 Vercel이 stale 응답을 유지하는지(stale-if-error)는 **확인 필요**. 보강책: (1) 렌더 실패 시 애플리케이션 레벨에서 마지막 성공 응답을 반환하는 서버 캐시(Vercel Data Cache 또는 Edge Config에 최근 N개 페이지 스냅샷) 또는 (2) 일 1회 `publications` → JSON 스냅샷을 정적 폴백으로 빌드에 포함. Phase 2에서 (2)를 기본으로 두고 (1)은 측정 후 결정.
- 빌드 실패 → 이전 배포 유지(Vercel 기본). 발행과 무관.

사이트 데이터 접근층(Phase 2 `apps/site/src/lib/publications.ts`): anon 키 + RLS(`publications` published만 SELECT, ADR-003). published 0개여도 모든 페이지가 빈 상태로 렌더되어야 한다(브리프 Phase 2 완료 기준).

## Consequences

- (+) P1·R4·R8 충족. 발행 지연 분 단위. 데이터 커밋이 git에서 사라진다.
- (+) 관리자 편집도 DB 쓰기 + revalidate로 바뀌어 GitHub API 커밋 경로(`api/admin/_github.js`)가 필요 없어진다.
- (−) 어댑터 전환은 사이트 코드 전반(페이지 48개)의 데이터 접근을 바꾸는 작업이다. Phase 2에서 데이터 접근층만 먼저 만들고, 페이지는 레거시 JSON과 DB를 플래그로 전환(ADR-006 Strangler).
- (−) Vercel 함수·ISR 과금과 플랜 한도(함수 maxDuration, cron) 확인 필요 — 커넥터 재인가 후.
- (−) `prepare-static-images.mjs`가 빌드 시 JSON 이미지 필드를 재작성하는 현행 동작(`scripts/prepare-static-images.mjs:32-127`)은 폐기 대상. 이미지 경로는 발행 시점에 확정해 `publications.image`에 저장.

## Rejected alternatives & why

- **B**: 빌드 성공 의존이 남아 P1 위반, 발행 지연 10분+.
- **C**: 현재 문제의 원인(커밋 기반 발행) 유지.
- **D**: ISR을 뺄 이유가 없음.

## 확인 필요

1. `@astrojs/vercel` 11.x의 ISR 옵션 이름·import 경로(로컬 설치 후 타입 확인).
2. Vercel ISR의 origin 실패 시 stale 제공 여부, 플랜별 함수 한도.
3. Supabase 프로젝트 재사용 여부(기존 `archived_articles` 테이블이 있는 프로젝트)와 리전(서울 ↔ Vercel 함수 리전 지연).
