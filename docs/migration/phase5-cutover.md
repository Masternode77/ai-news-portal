# Phase 5 — 컷오버 & 레거시 정리 실행 계획

- 착수 승인: 2026-10-31 Josh "PR #84 머지 승인, Phase 5 착수 승인"
- 근거: `REBUILD_BRIEF.md` Phase 5, ADR-005(URL·렌더), ADR-006 M5~M8, ADR-008(라우트 축소 후보), `docs/diagnosis/05-preserve-list.csv`(136 URL)
- 상태 어휘: `started | partial | done | blocked (reason)`. 이 문서는 체크리스트이며 진행 기록은 `docs/STATUS.md`가 단일 진실이다.

## 1. 출발점 (2026-10-31 실측)

| 항목 | 상태 |
|---|---|
| 리빌드 코드 | `main`에 전부 머지됨(PR #57~#81, #84 대기). ADR-006 M6의 "`rebuild/v2` → `main` 머지"는 Phase 2~4 동안 PR 단위로 이미 끝났다. 컷오버는 **Vercel 설정 + 환경 변수 + 데이터**만 남는다 |
| 프로덕션 서빙 | Vercel 프로젝트 `ai-news-portal`(Root Directory 없음 = 레거시 루트 `astro build`, 정적). 생성 파이프라인은 2026-10-11 이후 정지 |
| 새 사이트 | Vercel 프로젝트 `computecurrent-v2-preview`(Root Directory `apps/site`), staging Supabase를 읽음. 라우트는 `/`, `/news/{id}/`, `/column/{slug}/`, `/healthz` 4개뿐 → **보존 URL 136개 중 대부분이 아직 404** |
| DB | Supabase `computecurrent-staging`(서울, 0001→0002) 1개. 프로덕션 프로젝트 없음 |
| 파이프라인 | cron 3회/일, `publish_target: staging`, CLI는 `production`을 거부(`packages/pipeline/bin/pipeline.ts:342`) |
| 레거시 이관 | `migrate-legacy-publications.ts --dry-run`: ready 12(news 5 + column 7)·not_public 13(격리 → `config/redirects.yaml` 410)·missing 0, 이미지 12개 3.5 MB(루트 `public/generated/articles/**`). `--apply` 미구현 |
| ISR revalidate | `apps/site/astro.config.mjs`에 `bypassToken` 없음 → on-demand revalidate 불가. ISR 만료 300 s로 새 글은 5분 안에 노출 |

## 2. Josh 결정 항목 (D1~D5)

| # | 결정 | 권고 | 대안과 트레이드오프 |
|---|---|---|---|
| D1 | 프로덕션 DB | **A. 새 Supabase 프로젝트 `computecurrent-prod`(서울)** + 0001→0002 적용. staging은 튜닝용으로 유지 | B. staging을 프로덕션으로 승격: 가장 빠르지만 shadow 테스트 발행 9건이 그대로 공개되고(비공개 처리 = 데이터 변경 승인), 이후 튜닝용 staging이 없다. C. 레거시 프로젝트(`archived_articles`) 재사용: STOP-THE-LINE 테이블과 같은 프로젝트라 비권고 |
| D2 | Vercel 전환 방식 | **A. `ai-news-portal` 프로젝트의 Root Directory → `apps/site` + Production 환경 변수**(ADR-006 그대로). 롤백 = Instant Rollback(직전 레거시 배포 Promote, 1분 내) | B. 도메인을 `computecurrent-v2-preview`로 이전: 레거시 프로젝트가 온전히 남지만 롤백이 도메인 재할당(인증서·검증 지연 가능)이라 5분 보장이 약하다 |
| D3 | 라우트 범위 | **A. 콘텐츠·정책은 200, 참조 데이터·상업 페이지는 301/410**(ADR-008 B 후보를 이번에 확정) — §3 표 | B. 136개 전부 기능 동등 이식(hubs·entities·data·glossary 참조 데이터 포함): 며칠 추가, 2026-10-11 이후 갱신되지 않은 데이터를 계속 서빙 |
| D4 | 레거시 25건 | **ready 12건을 프로덕션 `publications`로 `--apply`**(slug·`legacy_id` 보존, 이미지 12개는 `apps/site/public/generated/articles/**`로 복사해 같은 URL 유지). 격리 13건은 410(이미 설정) | 이미지를 Supabase Storage로: 외부 서비스 신규 연결(승인) + 경로 재작성 |
| D5 | 태그·백업 | **`legacy-final` 태그(현재 `main` 컷오버 직전 커밋) + 레거시 Supabase 대시보드 백업 1회(Josh)**. JSON·이미지는 태그가 고정 | — |

## 3. 라우트 계획 (D3-A 기준, 136 URL)

| 종류(개수) | 처리 | 데이터 |
|---|---|---|
| news 5, column 7 | 200 | 이관된 `publications` |
| 격리 column 13(보존 목록 2 + 나머지) | 410 | `config/redirects.yaml`(기존) |
| redirect 5 | 301 | `config/redirects.yaml`(기존 4행 + `/author/rowan-hale` 슬래시 없는 변형) |
| `/`, `/column/`, `/archive/`, `/archive/{n}/`(28) | 200, 마지막 페이지를 넘는 `n`은 301 → `/archive/` | `publications` |
| `/category/*` 9, `/region/*` 7, `/company/*` 16 | 200(빈 목록이면 noindex) | `publications`의 `category`·`region`·`tags` + `config/site-taxonomy.yaml`(라벨·태그 매핑, 데이터만) |
| `/author/josh-inn/` | 200 | `publications` |
| 정책 8: about, advertising-policy, ai-disclosure, contact, editorial-policy, methodology, privacy, terms | 200 prerender | 레거시 문구를 Markdown으로 추출(코드 복사 아님, P9). ai-disclosure·methodology는 새 파이프라인 기준으로 고쳐 쓰고 Josh 검토 |
| `/rss.xml`, `/ko/rss.xml`, `/sitemap.xml`, `/robots.txt`, `/ads.txt` | 200 | `publications`; ads.txt는 `PUBLIC_ADSENSE_CLIENT`(이름) 유무에 따라 레거시와 같은 두 형태 |
| `/ko/` | 301 → `/` (새 콘텐츠는 전부 한국어) | — |
| hubs 1+3, entities 1+5, glossary, data 1+3, radar, search, briefing, follow, newsletter, pricing, sample, subscribe | 301 → 가장 가까운 페이지: `/entities/equinix/`·`/entities/digital-realty/` → 같은 `/company/`, 나머지 entities·`/data/*` → `/category/power-grid/`, `/entities/` → `/archive/`, hubs → `/region/us/`, `/glossary/` → `/methodology/`, `/search/` → `/archive/`, `/radar/` → `/`, 상업·구독(briefing·newsletter·pricing·sample·subscribe) → `/contact/`, `/follow/` → `/about/` | `config/redirects.yaml`(24행) |
| `/data/*.csv` 3 | 410 | `config/redirects.yaml` |

리다이렉트 처리: 사이트 미들웨어가 라우트 응답이 404일 때만 `redirects` 테이블(anon RLS 읽기, 인스턴스 캐시 5분)을 조회해 301/410으로 바꾼다. 정상 페이지는 DB 조회가 늘지 않는다.

## 4. 실행 순서 (M5 → M6 → M7 → M8)

| # | 단계 | 누가 | 승인 | 검증 |
|---|---|---|---|---|
| 1 | 사이트 동등성 PR(§3 라우트, 미들웨어, 피드, 정책 페이지, 이미지 12개) — **구현됨(PR #85, 로컬 136/136)** | 세션 | PR 머지(Josh) | `v2:typecheck`·`v2:test`·`v2:build`, 루트 `astro check` |
| 2 | URL 검증 도구 + `rebuild-ci.yml` dispatch 잡(`verify_urls_base`) | 세션 | 1과 같은 PR | staging 프리뷰 대상 136/136 기대값 일치(데이터 없는 404 제외 표시) |
| 3 | `migrate-legacy-publications.ts --apply --target staging\|production` + `.github/workflows/legacy-migrate.yml`(dispatch, production은 confirm `M5 approved`) + CLI 컷오버 플래그(`publish_target: production`은 `--dry-run` 또는 `CC_ALLOW_PRODUCTION_PUBLISH=true` + `SUPABASE_PROD_*` 이름) — **구현됨(PR #85)** | 세션 | PR 머지(Josh) | 단위 테스트(메모리 DB 12행·redirects 44행 멱등, CLI 인터록), `--dry-run` 결과 불변 |
| 4 | D1 프로덕션 Supabase 생성 + 0001→0002 | Josh | **D1** | 테이블 9 + RLS |
| 5 | Actions secrets(이름) `SUPABASE_PROD_URL`·`SUPABASE_PROD_SERVICE_ROLE_KEY`, Vercel `ai-news-portal` Production env(이름) `SITE_DATA_SOURCE=supabase`·`SUPABASE_URL`·`SUPABASE_ANON_KEY`·`SITE_INDEXABLE=true`(+ `PUBLIC_ADSENSE_CLIENT` 유지) | Josh | **§3 env 변경** | 이름 존재 확인(값 미열람) |
| 6 | `legacy-final` 태그 + 레거시 Supabase 백업 | 세션(태그)·Josh(백업) | **D5** | `git ls-remote --tags` |
| 7 | 이관 `--apply`(12행) + redirects 동기화 → 프로덕션 DB | 세션(Actions dispatch) | **D4 (STOP-THE-LINE)** | 행 수 12, redirects 행 수, `/healthz` publishedCount |
| 8 | 프리뷰 리허설: `computecurrent-v2-preview`를 프로덕션 DB로 읽게 한 Preview 배포에 URL 검증 | 세션 | — | 136/136 |
| 9 | **컷오버**: `ai-news-portal` Root Directory → `apps/site`, Production 재배포 | Josh 또는 세션(Vercel 커넥터) | **D2 + 프로덕션 배포** | URL 검증 www 136/136, `/healthz` ok |
| 10 | 파이프라인 프로덕션 전환: schedule 식 `publish_target: production` + 프로덕션 secrets 선택(1~2행 PR) | 세션 | **스케줄 변경** | 첫 cron 런 funnel·Telegram·발행 링크 200 |
| 11 | M7 48h 모니터링: +1h·+24h·+48h URL 검증, ops-check·이슈 알람, Telegram, Vercel runtime errors | 세션 | — | `docs/STATUS.md` 기록 |
| 12 | `docs/runbook.md`·`docs/postmortem.md` — **작성됨(PR #85)** | 세션 | PR | 브리프 항목 5·6 |
| 13 | M8 레거시 제거 PR(제안만, draft) | 세션 | **Josh 별도 승인 전 머지 금지** | — |

1~3·12는 결정과 무관하게 바로 진행한다. 4~10은 D1~D5 답을 받은 뒤 순서대로.

## 5. 롤백

| 상황 | 조치 | 목표 시간 |
|---|---|---|
| 컷오버 직후 사이트 이상(5xx, URL 검증 실패) | Vercel `ai-news-portal` → Deployments → 직전 레거시 Production 배포 **Instant Rollback** | ≤ 1분 |
| 롤백 뒤 정리 | Root Directory 비우기(레거시 빌드 복귀), Production env 4개 제거 | ≤ 5분 |
| 파이프라인 이상 발행 | `pipeline.yml` schedule 주석 PR(드릴 실측 1분 40초) 또는 `publications.status` 비공개(승인) | ≤ 5분 |
| 데이터 손상 | 프로덕션 DB는 이관 12행 + 신규 발행분뿐 → `--apply` 재실행(멱등 upsert) | — |
| 최후 수단 | `legacy-final` 태그 체크아웃 → 재배포 | ≤ 15분 |

`SITE_DATA_SOURCE` 플래그를 `legacy_json`으로 되돌리는 방식(ADR-006 (a))은 Vercel 함수 런타임에 레거시 JSON이 없어 쓸 수 없다(ADR-006 Phase 2 조정) → Instant Rollback이 1차 롤백이다.

## 6. 완료 기준 대조 (브리프 Phase 5)

| 기준 | 증거 |
|---|---|
| 프로덕션이 새 시스템으로 서빙, 48h 무중단 | 4-9 이후 URL 검증 3회 + Vercel runtime errors |
| 기존 URL 100% 접근(또는 301/410) | URL 검증 도구 136/136 |
| runbook, postmortem 존재 | 4-12 |
| 레거시는 태그·백업 보존 후 제거(승인 기록) | 4-6, 4-13 + Josh 승인 기록 |

R3(`insight_essay` 일 0~1)는 컷오버 시점 미충족 허용(B안, 2026-10-24). 3e는 컷오버 직후 착수(보이스 샘플 선행).
