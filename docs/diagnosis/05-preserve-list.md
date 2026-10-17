# 05 — 보존 목록 (R8: 기존 URL·데이터·SEO 자산)

생성 스크립트: `node scripts/diagnose/urls.mjs --out docs/diagnosis/05-preserve-list.csv` (네트워크 0, 쓰기는 CSV만). 전체 URL 목록은 [`05-preserve-list.csv`](./05-preserve-list.csv) (136행, 컬럼 `url,type,source_file,record_id,indexable,label`).

## 1. 공개 URL (컷오버 시 100% 접근 또는 301)

| 유형 | 수 | 생성 근거 | 보존 방식 제안 |
|---|---|---|---|
| `/news/{id}/` 리더 상세 | **5** (전부 EIA 복원 롱폼) | `isPublicLongformArticle()` `scripts/lib/public-surface-eligibility.mjs:26`; 라우트 `src/pages/news/[id].astro:36-53`; id = sha1(url+title)[0:16] `scripts/lib/normalize.mjs:77-80` | 동일 id 유지 (새 모델의 `publications.slug`에 legacy id를 그대로 저장) |
| `/column/{slug}/` 컬럼 | **20** 공개 + 2 격리(현재 404) | `publishedColumns()` `scripts/lib/column-surface.mjs:22`; slug = slugify(headline)[0:64]-YYYY-MM-DD `scripts/lib/authored-column-engine.mjs:1031` | slug 그대로 유지; 격리 2건은 404 유지 또는 복구 시 동일 slug |
| `/category/{slug}/` | 9 | `src/data/taxonomy-pages.json` | 카테고리 slug 고정 (`power-grid, data-centers, cloud-capacity, semiconductors, cooling, capital-markets, regulation, supply-chain, ai-infrastructure`) |
| `/region/{slug}/` | 7 | 동일 | `us, europe, apac, middle-east, global, eu, korea` |
| `/company/{slug}/` | 16 | 동일; 비활성은 sitemap 제외(`astro.config.mjs:37-40`) | 유지 또는 301 → 상위 허브 |
| `/archive/{n}/` | 28 (est; catalog total/18, `src/pages/archive/[page].astro:12-22`) | — | 페이지 수 변동 허용, 1페이지는 `/archive/` |
| `/author/josh-inn/` | 1 | `config/editorial/persona-charter.json` | 유지 (+ 기존 301 `/author/rowan-hale` → `/author/josh-inn/`) |
| `/hubs/{slug}/`, `/entities/{slug}/` | 3 + 5 | `src/data/infrastructure-reference.json` | 유지 |
| 정적 페이지 | 27 | `src/pages/*.astro` (admin 제외) | 유지; `/subscribe/ /pricing/ /sample/ /briefing/`는 noindex 유지 (`astro.config.mjs:26`) |
| 피드·자산 | 8 (`/rss.xml`, `/ko/rss.xml`, `/sitemap.xml`, `/robots.txt`, `/ads.txt`, `/data/{capacity,demand,ercot}.csv`) | `src/pages/*.ts` | 경로 고정 (AdSense `ads.txt`, 검색엔진 sitemap) |
| 리다이렉트 | 5 | `vercel.json:89-110` (4), `astro.config.mjs:66-71` (1) | 새 301 맵에 그대로 이관 |

주의: 아카이브 1,020 레코드 중 리더 페이지가 없는 레코드(카드 전용 471, noindex 378, 격리 32)는 URL이 없다. 다만 `archived-news.json`의 `slug` 필드는 검색 전용이고 중복 47건이 있어, 새 모델에서 slug를 URL 키로 쓰려면 id 기반을 유지해야 한다.

## 2. 데이터 (유지·백업)

| 자산 | 위치 | 처리 |
|---|---|---|
| 발행 레코드 | `src/data/latest-news.json`(45), `archived-news.json`(1,020), `search-index.json`(1,065), `authored-columns.json`(22) | `legacy-final` 태그 + 새 `publications`로 마이그레이션(id·slug·publishedAt·body·image·provenance). 격리·noindex 플래그 보존 |
| 런 원장 | `scripts/state/pipeline-state.json` | 읽기 전용 보관(히스토리 분석용), 새 `pipeline_runs`로 이관하지 않음 |
| 이미지 | `public/generated/articles/`(1,105 디렉토리), `public/generated/*`, `public/fallbacks/`, `config/codex-image-manifest.json`(1,007 entries: fingerprint, sha256, provider, model, generatedAt) | 발행 25건이 참조하는 이미지와 매니페스트 항목은 필수 보존; 나머지는 보관 후 정리(별도 승인) |
| EIA 복원 스펙 | `config/eiaRestorationArticles.json`, `scripts/lib/eia-restoration-inventory.mjs` | 리더 페이지 5건의 원천 — 보존 |
| 그리드 데이터 | `src/data/grid/*.json` + `infrastructure-data.yml` 레인 | 별도 레인으로 그대로 유지 |
| 한국어 브리프·참조 | `src/data/korea-briefs.json`, `infrastructure-reference.json`, `industry-headlines.json` | 유지 |
| Supabase `archived_articles` | 쓰기 전용, 러너가 비활성화 (`scripts/run-subscription-news.mjs:35-43`) | **drop 금지**(STOP-THE-LINE). Phase 1 ADR-003에서 재사용 여부 결정, 그 전까지 손대지 않음 |
| 관리자 감사 로그 | `src/data/admin-audit-log.json` (비어 있음) | 유지 |

## 3. 도메인·SEO·수익화 설정 (코드에서 확인된 범위)

- 도메인 `https://www.computecurrent.com` (`astro.config.mjs:51`), Vercel 프로젝트 `ai-news-portal` (팀 스코프 `masternode77s-projects`). DNS·도메인 설정은 Vercel 커넥터 재인가 후 확인.
- sitemap: `@astrojs/sitemap` 필터(`astro.config.mjs:53-64`) + `src/pages/sitemap.xml.ts`(`scripts/lib/sitemap-builder.mjs`). robots: `src/pages/robots.txt.ts`. RSS: `src/pages/rss.xml.ts`, `/ko/rss.xml.ts`.
- AdSense: `/ads.txt` 라우트(`src/pages/ads.txt.ts`)와 Content-Type 헤더(`vercel.json:6-14`), env 이름 `PUBLIC_ADSENSE_*`, 광고 정책 페이지 `/advertising-policy/`. GA4: `PUBLIC_GA4_ID`, 동의 모드 `src/scripts/basic-analytics-consent.js`.
- 보안 헤더(`vercel.json:67-87`)와 admin no-store 헤더 — 새 배포에도 동일 적용.
- 검색 콘솔 설정은 레포에 없음(Josh 확인 필요).

## 4. 재사용 가치가 있는 규칙·프롬프트·설정 (복붙 금지, 추출 후 재작성 — P9)

| 자산 | 위치 | 비고 |
|---|---|---|
| 소스 레지스트리와 권리 메타데이터 | `config/sourceRegistry.yml` (82행: feed, domain, allow_text_use, text_use_basis, terms_url, reviewed_at, pool_max_age_days), `docs/source-rights-review.md`, `docs/source-expansion-2026-09.md` | `config/sources.yaml`의 출발점 |
| 금칙어·템플릿 패턴 | `config/bannedPhrases.yml`, `forbiddenPublicPhrases.yml`, `forbiddenAIPhrases.yml`, `boilerplatePatterns.yml`, `config/editorial/internal-public-banned-phrases.json` | QA 규칙 `BANNED_PATTERN` 입력 |
| 관련성 어휘·차원 가중치 | `scripts/lib/relevance-classifier.mjs` DIMENSIONS/AI_TERMS/INFRA_TERMS, `config/relevance-routing-rules.yml`, `config/signalScoringPolicy.yml` | 3c 루브릭 초안 |
| 추출 fail-closed 규칙 | `scripts/lib/source-extraction-fail-closed.mjs:33-115`, `truncation-detector.mjs`, `related-story-contamination.mjs`, `boilerplate-detector.mjs` | `SOURCE_UNREACHABLE`·추출 QA 규칙 |
| 수치 근거·claim ledger | `scripts/lib/claim-ledger.mjs`, `numeric-claim-verifier.mjs`, `unsupported-claim-guard.mjs`, `source-fidelity-claim-check.mjs` | `UNGROUNDED_NUMBER` |
| 반복 탐지 | `scripts/lib/repetition-detector.mjs:7-23,331-425` | `READABILITY_LOW`/반복 |
| 저작권 안전 변환 정책 | `config/copyrightSafeTransformationPolicy.yml` (단락 중복 0.22, 문장 재사용 0.15) | `QUOTE_TOO_LONG` |
| 프롬프트(인라인) | 큐레이션 `scripts/lib/curate.mjs:58-73`, 보강 `content.mjs:159-184`, Expert Lens `expert-lens.mjs:403-426`, 컬럼 패스 `authored-column-engine.mjs:830,867,895,933,983,1478`, 페르소나 `config/editorial/persona-charter.json` | `prompts/news_brief.md` 등으로 파일화할 원문; `prompts/` 디렉토리의 37파일은 미사용이므로 참고만 |
| 콘텐츠 tier·라우트 정책 | `config/editorial/content-tier-policy.json`, `config/publishingRoutePolicy.yml`, `config/blogLengthPolicy.yml` | 발행 tier 초기값 |
| 회귀 지식(테스트) | `tests/*.test.mjs` 190개, 특히 `related-story-contamination`, `truncation-detector`, `quoted-elisions`, `numeric-claim-verifier`, `eia-public-restoration`, `repetition-detector`, `daily-throughput`, `source-extraction-fail-closed`, `publication-integrity-boundary` + `tests/fixtures/` 14 | 새 fixture 체계의 씨앗 |
| 운영 문서 | `docs/subscription-generation.md`, `docs/mac-column-image-automation.md`, `docs/codex-image-workflow.md`, `docs/automation-runbook.md` | 레거시 운영 절차(Phase 5 전까지 유효) |

## 5. 보존하지 않아도 되는 것 (제안, 삭제는 별도 승인)

`prompts/` 미사용 37파일, `scripts/lib/image-providers/* 2.mjs` 및 OpenAI/Gemini 이미지 모듈, `scripts/update-news.js`, `constants.mjs:137` `FEEDS`, 5월 autonomous-desk v1 데이터(`editorial-cycles.json`, `signal-clusters.json`, `claim-ledger.json` — 단 claim ledger 포맷은 재사용), `docs/` 역사 리포트 ~60개(아카이브 폴더로 이동), `.codex/NEXT.md`, `.omx/`.
