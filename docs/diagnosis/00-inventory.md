# 00 — 레포 인벤토리 (실측, 2026-10-17, HEAD `e1ee3f2` = origin/main)

브리프 §2 표의 "알려진 내용"을 실측값으로 갱신한다. 모든 항목은 `file:line` 또는 커밋으로 근거를 둔다.

## 1. 브리프 §2 갱신표

| 항목 | 브리프의 가정 | 실측 | 근거 |
|---|---|---|---|
| 프레임워크 / 호스팅 | Astro / Vercel | Astro **7.3.6 정적 빌드(SSG)**, 어댑터 없음, Vercel이 `npm run build` 후 `dist/` 서빙. 서버 코드는 `api/admin/*.js` 6개(관리자 편집용)뿐 | `astro.config.mjs:50-80`(`output` 키 없음), `vercel.json:2-4`, `package.json:80-84` |
| 데이터 저장소 | Supabase (아카이브·검색) | **git에 커밋된 JSON**이 유일한 저장소. Supabase는 선택적 write-only REST upsert이고 Mac 러너가 자격증명을 비워 실질 미사용. 사이트·API 어디에서도 읽지 않음 | `scripts/lib/archive-store.mjs:77-132,156-184`, `scripts/run-subscription-news.mjs:35-43`, `scripts/lib/constants.mjs:80-82`(기본 테이블 `archived_articles`) |
| 수집 주기 | RSS 8시간 | Mac Codex 스케줄 태스크 **00:45 / 08:45 / 16:45 KST** (3런/일). 2026-10-06 이전에는 GitHub Actions 스케줄이 생성, 현재 Actions는 검증만 | `docs/subscription-generation.md:80-82`, `.github/workflows/update-news.yml:3-11`, 커밋 `1fcd7023` |
| 생성 콘텐츠 | 큐레이션 + 한국어 Expert Lens | 4종: (1) signal card/brief, (2) wire 롱폼 "Expert Lens" 메모(영문), (3) 저자 컬럼 "The Current", (4) 링크 전용 헤드라인 레이더. **한국어 텍스트 생성은 없음** — `/ko/`는 수동 승인 4건(`src/data/korea-briefs.json`) | `scripts/lib/content.mjs:269-409`, `scripts/lib/expert-lens.mjs:446-462`, `scripts/lib/authored-column-engine.mjs:1093`, `scripts/lib/korea-briefs.mjs:21,54` |
| 이미지 | OpenAI 우선 생성, 폴백 | **API 이미지 생성 없음**. Codex 매니페스트 조회 → 출처 이미지 포스터 → 로컬 플레이스홀더. 실제 아트워크는 Mac 태스크의 네이티브 이미지 도구로 생성·등록. OpenAI/Gemini 이미지 모듈은 데드코드 | `scripts/lib/image-generator.mjs:167-198`, `scripts/lib/codex-image-provider.mjs:70-89`, `scripts/lib/image-providers/index.mjs:4-8`, `docs/codex-image-workflow.md` |
| 정식 URL | https://www.computecurrent.com | 동일 | `astro.config.mjs:51` |
| 수익화 | AdSense, 프리미엄 구상 | AdSense·GA4는 env 이름으로만 배선(`PUBLIC_ADSENSE_*`, `PUBLIC_GA4_ID`), `/pricing/`·`/subscribe/`·`/sample/`·`/briefing/`은 noindex 정적 페이지 | `.env.example`, `astro.config.mjs:26` |
| 코드 상태 | 90+ 커밋 | **3,229 커밋**(unshallow 후), 09-15 이후 283커밋 중 fix 64. `scripts/lib` 209파일, 테스트 190파일, `src/` 130파일, `public/` 5,083파일 | `git rev-list --count HEAD`, `docs/diagnosis/logs/github-evidence.md` |

## 2. 디렉토리 지도

| 경로 | 파일 수 | 역할 |
|---|---|---|
| `src/pages` 48, `src/components` 41, `src/lib` 13, `src/data` 18, `src/layouts` 2, `src/styles` 6 | 130 | Astro 사이트. 페이지는 `src/data/*.json`을 직접 import |
| `scripts/*.mjs` | 84 | 파이프라인 오케스트레이터·러너·감사·재생성·마이그레이션 스크립트 |
| `scripts/lib/` | 209 (`image-providers/` 10 포함) | 파이프라인 로직 전부 (fetch, curate, content, gates, column engine, store) |
| `scripts/state/pipeline-state.json` | 1 (2.8 MB) | 런 원장(`runHistory` 120), 일별 plan 186일, `publishedIds` 921 |
| `tests/` | 190 `*.test.mjs` + 1 python + `fixtures/` 14 | `node --test`; 네트워크는 전부 stub |
| `api/admin/` | 6 | Vercel Node 함수: 로그인, 대시보드, 기사 편집(→ GitHub API 커밋 → 재빌드) |
| `config/` | 27 | `sourceRegistry.yml`(82 소스), 정책 YAML 7, 금칙어 4, `codex-image-manifest.json`(1,007), `editorial/` 7 |
| `prompts/` | 37 | **런타임에서 참조되지 않음**(모든 프롬프트는 JS 인라인) |
| `public/generated/articles/` | 1,105 디렉토리 | 기사·컬럼 아트워크 (발행 페이지 25개보다 훨씬 많음) |
| `docs/` | 93 | 리포트·런북 ~80, `agent-governance-audit/`, `qa-qc-remediation-evidence/` |
| `.github/workflows/` | 10 | 아래 §5 |
| `.codex/`, `.omx/`, `plans/` | 3 / 1 / 10 | 에이전트 핸드오프·스펙·계획 (역사적) |

없는 것: `supabase/`, `migrations/`, `*.sql`, `data/`, `logs/`, `*.jsonl`, `node_modules/`(세션에서 `npm ci`로 설치), `rebuild/v2` 브랜치.

## 3. 패키지·스크립트

- `package.json`: `compute-current` 0.0.52, `"type": "module"`, Node `22.x`(`.nvmrc` 22.22.0), npm lockfile. 패키지 매니저 필드 없음.
- 의존성 4개: `astro` 7.3.6, `@astrojs/sitemap` 3.7.3, `@astrojs/rss` 4.0.19, `sharp` 0.35.5. dev: `@astrojs/check`, `playwright` 1.62.1, `rss-parser` 3.13.0, `typescript` 5.9.3.
- **없음**: Astro 어댑터, `@supabase/supabase-js`, `openai`, `zod`, vitest/jest, eslint/prettier. LLM·Supabase·이미지 API는 모두 raw `fetch`.
- 주요 스크립트(`package.json:8-78`): `pipeline`(`scripts/pipeline.mjs`), `generate:subscription`/`check:subscription`(`run-subscription-news.mjs`), `build`(`prepare:static-images && astro build` — 빌드 시 `src/data` JSON의 이미지 필드를 재작성할 수 있음 `scripts/prepare-static-images.mjs:32-127`), `test`(source 테스트 → **build** → built 테스트 → 게이트 테스트 4종), `content:gate`(check+build+built 테스트+감사 4종), `test:quality-gates`, `test:claim-ledger`, `test:signal-clusters`, `test:autonomous-desk`, 감사 `audit:*` 15종, 재생성 `regenerate:*` 6종, `content:cycle`(fixture 기반, `.cache/content-cycle` 생성).
- 타입체크 `astro check`. 린터 없음.

## 4. Astro / Vercel 설정

- `astro.config.mjs:14-40`: 빌드 시 `src/data/{latest-news,archived-news,authored-columns,taxonomy-pages,industry-headlines}.json`과 `config/sourceRegistry.yml`을 읽어 sitemap 필터·활성 taxonomy 경로 계산. `sitemap()` 필터(`:53-64`)가 `/admin`, noindex 기사, 비활성 category/region/company를 제외. 리다이렉트 1건(`:66-71`).
- `vercel.json`: cron **없음**, `functions` 블록 없음(타임아웃 기본값), 헤더(`/ads.txt` Content-Type, `/admin*` no-store, 전역 보안 헤더; CSP 없음), 리다이렉트 4건(`:89-110`).
- 발행 경로: JSON 커밋 → `main` push → Vercel Git 통합 빌드. **요청 시점 렌더링 없음** (`src/pages/news/[id].astro:36-53`, `src/pages/column/[slug].astro:20-25`의 `getStaticPaths`). 관리자 편집도 GitHub Contents API로 커밋해 재빌드를 유발(`api/admin/_github.js:124-139,185`).

## 5. GitHub Actions (10개)

| 파일 | 트리거 | 하는 일 | 시크릿/env 이름 |
|---|---|---|---|
| `update-news.yml` ("Application Validation") | push/PR → main, manual | `npm ci` → `npm audit` → `astro check` → 현재상태 감사 → `npm test`(PIPELINE_OFFLINE=0, mock 어댑터) → `content:gate:built` → 감사. **생성·커밋·푸시 없음** (`:3-4`). 2026-10-06 이전엔 schedule 생성 2,500런 | `LLM_PROVIDER=disabled`, `PIPELINE_OFFLINE` |
| `release.yml` | validation 완료 후(workflow_run), manual | 콘텐츠 경로만 바뀐 커밋은 스킵(`:74`), `npm version` + GitHub release | `github.token` |
| `infrastructure-data.yml` | cron `43 */6 * * *` | `scripts/refresh-infrastructure-data.mjs` → `src/data/grid/*.json` 커밋·푸시 | `EIA_API_KEY` |
| `operations-monitor.yml` | cron `17 * * * *` | `scripts/check-operations.mjs` → heartbeat 12h 초과 시 이슈 #29 갱신 | `GITHUB_TOKEN` |
| `weekly-digest.yml` | cron `30 22 * * 0` | 뉴스레터 다이제스트 아티팩트(커밋 없음) | — |
| `visual-qa.yml` | PR, manual | build + playwright 캡처 | — |
| `prod-smoke.yml`, `feed-probe.yml`, `terms-probe.yml`, `curation-model-refresh.yml` | manual | 프로브/에코 | — |

## 6. 환경 변수 **이름** (값 없음)

`.env.example`에 선언: 수익화 `PUBLIC_ADSENSE_CLIENT, PUBLIC_GOOGLE_CMP_READY, PUBLIC_ADSENSE_CONTENT_READY, PUBLIC_ADSENSE_SLOT_{LEADERBOARD,INFEED,ARTICLE,BOX}, PUBLIC_GA4_ID, PUBLIC_ANALYTICS_CONSENT_MODE` · 관리자 `ADMIN_USERNAME, ADMIN_PASSWORD_HASH, ADMIN_SESSION_SECRET, ADMIN_VERCEL_RATE_LIMIT_READY, GITHUB_TOKEN, GH_TOKEN, COMPUTE_CURRENT_GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH` · 파이프라인 `PIPELINE_OFFLINE, PIPELINE_USE_EXISTING_POOL, CONTENT_CYCLE_FIXTURE, FORCE_GENERATION_FAILURE, REFRESH_INTERVAL_HOURS, MAX_ITEMS_FETCHED, MIN_ITEMS_PER_SOURCE_IN_POOL, DAILY_CURATION_TARGET, DAILY_PROCESSING_LIMIT, ITEMS_PER_RUN, FRESH_CANDIDATE_WINDOW_HOURS, LATEST_NEWS_LIMIT, PIPELINE_RETRY_DELAY_MS` · LLM `LLM_PROVIDER, SUBSCRIPTION_INCLUDED_USAGE_CONFIRMED, SUBSCRIPTION_CODEX_BIN, SUBSCRIPTION_CLAUDE_BIN, OPENROUTER_API_KEY, OPENROUTER_MODEL, OPENROUTER_SITE_URL, OPENROUTER_APP_TITLE, EXPERT_LENS_MODEL, EXPERT_LENS_FALLBACK_MODEL, LLM_RUN_BUDGET_TOKENS, LLM_RUN_BUDGET_CALLS` · 컬럼 `AUTHORED_COLUMN_ENABLED, AUTHORED_COLUMN_MODEL, AUTHORED_COLUMNS_PER_DAY, AUTHORED_COLUMN_MIN_GAP_HOURS, AUTHORED_COLUMN_FORCE, AUTHORED_MIN_CHARS, AUTHORED_MAX_CHARS, AUTHORED_MIN_WORDS, AUTHORED_MAX_WORDS, AUTHORED_MIN_HUMAN_STYLE, AUTHORED_MIN_INSIGHT_DENSITY` · 이미지 `IMAGE_PROVIDER, IMAGE2_HERO_SIZE, IMAGE2_OUTPUT_FORMAT, IMAGE2_PUBLIC_DIR` · 아카이브 `SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ARCHIVE_TABLE` · 캐시/배포 `COMPUTE_CURRENT_CACHE_PURGE_URL, COMPUTE_CURRENT_CACHE_PURGE_TOKEN, VERCEL_DEPLOY_HOOK_URL, VERCEL_TOKEN` · 알림 `TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID`(호출 코드 없음) · QA/기타 `PUBLIC_OUTPUT_*, PUBLIC_SURFACE_*, PUBLIC_CONTENT_QUALITY_*, PREVIEW_*, SOURCE_HEALTH_*, EMERGENCY_CLEANUP_ARCHIVE_LIMIT, PUBLIC_CONTENT_REGEN_LIMIT, LONGFORM_TARGET, BRIEF_TARGET, NARRATIVE_DNA_REGENERATE_COUNT, EVAL_ARTICLE_LIMIT, ARTICLE_PAGE_QUALITY_THRESHOLD, WORKSPACE_ROOT`.

코드에서만 읽는 이름(`.env.example`에 없음): `AUTONOMOUS_DESK_LIVE_SCAN, CANDIDATE_MAX_AGE_HOURS, CC_SUBSCRIPTION_LOCK_OWNER, CC_SUBSCRIPTION_JOB_ID, CHATGPT_IMAGE_OAUTH_ACCESS_TOKEN, CHATGPT_IMAGE_OAUTH_ENDPOINT, CODEX_SANDBOX_NETWORK_DISABLED, CURATION_FLOOR, CURATION_FLOOR_MIN_RELEVANCE, CURATION_MODEL, CURATION_SHORTLIST_LIMIT, EIA_API_KEY, EXPERT_LENS_VERSION, GEMINI_API_KEY, GEMINI_API_URL, GEMINI_IMAGE_MODEL, MAX_ITEMS_PER_SOURCE_IN_POOL, OPENAI_API_KEY, OPENAI_IMAGE_*, OPENROUTER_BUDGET_WARNING_PERCENT, OPENROUTER_MONTHLY_BUDGET_USD, PIPELINE_FORCE_SLOT, POOL_MAX_AGE_DAYS, QA_EVIDENCE_DIR`.

기본값(`scripts/lib/constants.mjs`): `REFRESH_INTERVAL_HOURS` 8(`:3`), `MAX_ITEMS_FETCHED` 30(`:5`), `POOL_MAX_AGE_DAYS` 10(`:8`), `DAILY_CURATION_TARGET` 9(`:16`), `DAILY_PROCESSING_LIMIT` 18(`:17`), `ITEMS_PER_RUN` 3(`:18`), `FRESH_CANDIDATE_WINDOW_HOURS` 24(`:19`), `CURATION_FLOOR` 3(`:26`), `LATEST_NEWS_LIMIT` 30(`:28`), `IMAGE_PROVIDER` codex(`:34`), `LLM_PROVIDER` subscription(`:43`). README의 6/2는 드리프트(`README.md:146-147`).

이 세션 컨테이너에는 위 변수 중 어느 것도 설정되어 있지 않다(값 조회 안 함, 이름만 확인).

## 7. 데이터 파일 (`src/data/`, `scripts/state/`)

| 파일 | 레코드 | 상태 (2026-10-17 HEAD) |
|---|---|---|
| `latest-news.json` | 45 | 리더 상세 페이지 **5**(전부 EIA 복원 롱폼), 나머지 카드 전용 |
| `archived-news.json` | 1,020 | 리더 페이지 0, 홈 카드 가시 471, 격리 32, noindex 378, slug 중복 47개/103레코드 |
| `search-index.json` | 1,065 | 파생 사본 |
| `authored-columns.json` | 22 | 공개 20, 격리 2 (#56) |
| `news-pool.json` | 30 | 마지막 풀 스냅샷(10-11), 소스 12개 |
| `pipeline-heartbeat.json` | 1 | `ok`, 마지막 성공 2026-10-11T04:31Z (6일 stale) |
| `source-health.json` | 27 | 전부 `stale`, 5월 데이터 |
| `editorial-cycles.json`, `signal-clusters.json`, `claim-ledger.json` | 5 / 29 / 20 | 5월 "autonomous desk v1" 잔재 |
| `industry-headlines.json` | 87 | 링크 전용 레이더 |
| `taxonomy-pages.json` (45 MB) | categories 9, companies 16, regions 7, archive 22페이지 | 빌드 입력 |
| `korea-briefs.json`, `infrastructure-reference.json`, `grid/*.json` | 4 / hubs 3·entities 5·glossary 12 / 3 | 수동·참조·EIA 스냅샷 |
| `scripts/state/pipeline-state.json` | runHistory 120, dayPlans 186, publishedIds 921 | 런 원장 (상세는 `02-funnel.md`) |

## 8. 소스 레지스트리 (`config/sourceRegistry.yml`, 82행)

| 구분 | 수 |
|---|---|
| `status: active_feed` / `blocked` | 80 / 2 (`ferc-news`, `electimes`) |
| `priority` P0 / P1 / P2 | 11 / 37 / 34 |
| `allow_text_use: true` | 29 (1 blocked) → `activeRegistryFeeds()` 통과 **28** |
| `text_use_basis: unreviewed` (링크 전용) | 52 |
| 텍스트 권리 근거 | US federal public domain 16, Google Cloud docs CC BY 3, arXiv CC0 3(abstract만), Epoch AI CC BY 2, UK OGL 2, Kubernetes CC BY 1, EU Commission 1, ACER 1 |
| 한국어 소스 | 5 (4 링크 전용, 1 blocked) — 텍스트 권리 0 |

## 9. 테스트·도구

- 러너 `node --test`; `tests/helpers/run-node-test-phase.mjs`가 source/built 단계 분리(`:6-15`), `LLM_PROVIDER=disabled` 강제(`:37`). 네트워크는 fetch stub/`fetchImpl` 주입 또는 127.0.0.1 서버.
- 이 세션에서 실행한 오프라인 테스트: `test:claim-ledger` 24/24, `test:signal-clusters` 3/3, 게이트 단위 6파일 30/30, `test:quality-gates` 73/73, `test:source-expansion` 5/5 (모두 pass, 쓰기 없음).
- 기존 진단 도구: `check-operations.mjs --dry-run`, `eval-article-generation.mjs`(`docs/eval-baseline-report.md` 덮어씀), `inspect-public-contract.mjs`, `run-content-cycle.mjs --dry-run-json`(fixture). runHistory를 집계하는 스크립트는 없었음 → `scripts/diagnose/funnel.mjs` 신설.

## 10. 데드코드·드리프트 (리빌드 시 정리 대상, Phase 0에서는 기록만)

| 항목 | 근거 |
|---|---|
| `scripts/lib/image-providers/{index,gemini,openai-image-api,chatgpt-oauth-runtime,local} 2.mjs` 중복 커밋 | `.gitignore:30`은 `scripts/* 2.mjs`만 무시 |
| `scripts/update-news.js` = `import './pipeline.mjs'` no-op (`pipeline.mjs:781` argv 가드) | 추적 에이전트 확인 |
| `prompts/` 37파일 런타임 미참조 | `grep -r "prompts/" scripts src` 0건 |
| `scripts/lib/constants.mjs:137` `FEEDS` 상수 미사용 | 레지스트리로 대체됨 |
| OpenAI/Gemini 이미지 모듈, `send-telegram-photo.mjs`(호출자 없음), Supabase 싱크 | 위 §1 |
| 문서 드리프트: README 스케줄 00:05/08:05/16:05 vs 실제 00:45/08:45/16:45; README `DAILY_CURATION_TARGET` 6 vs 코드 9; `docs/content-pipeline-map.md`의 signal-card 임계값 0.45 vs 코드 0.55 | `README.md:181,146-147`, `docs/subscription-generation.md:80-82`, `scripts/lib/relevance-classifier.mjs:2` |
