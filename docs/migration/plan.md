# 마이그레이션 계획 (Phase 2~5)

ADR-006의 단계 M1~M8을 실행 단위로 풀어 쓴다. 각 단계는 Josh 승인 게이트를 지나며, 롤백 방법이 없는 단계는 없다.

## 1. 순서와 롤백

| # | Phase | 작업 | 산출물 | 완료 기준 | 롤백 |
|---|---|---|---|---|---|
| 1 | 2 | `rebuild/v2` 브랜치 + worktree(`git worktree add ../computecurrent-rebuild rebuild/v2`) | 브랜치 | `main` 무변경 | 브랜치 삭제 |
| 2 | 2 | npm workspaces 뼈대(`apps/site`, `packages/shared`, `packages/pipeline`), TypeScript 설정, `node --test` | 디렉토리·package.json | `npm test --workspaces` green | 브랜치 폐기 |
| 3 | 2 | `packages/shared`: zod 스키마(ADR-003 테이블, Appendix A), 계약 인터페이스, 설정 로더 | `contracts.md` 그대로 컴파일 | 타입체크 통과 | — |
| 4 | 2 | `packages/pipeline` no-op 러너 + 원장(메모리/DB) + CLI 플래그 | `pipeline run --dry-run --fixture sample` | 모든 Stage no-op 통과·원장 기록 | — |
| 5 | 2 | fixture 체계: Phase 0 풀 스냅샷에서 RSS 10개 녹화(`fixtures/rss`), LLM 응답 샘플(`fixtures/llm`) | 파일 | replay 네트워크 0(프록시 차단 테스트) | — |
| 6 | 2 | CI 워크플로(`rebuild-ci.yml`: lint/typecheck/test/build, 네트워크 차단 환경변수) | `.github/workflows/rebuild-ci.yml` | green | 워크플로 삭제 |
| 7 | 2 | `apps/site` 데이터 접근층 + `SITE_DATA_SOURCE` 플래그 + "published 0개 빌드 성공" 테스트 | `apps/site/src/lib/publications.ts` | 빈 DB로 build 성공 | 플래그 legacy_json |
| 8 | 2 | Supabase staging 스키마 마이그레이션(§5.6 승인) | `supabase/migrations/0001_init.sql` | 테이블 9 + RLS | `DROP SCHEMA v2_staging`(승인) |
| 9 | 2 | `CLAUDE.md`(06 초안), `docs/STATUS.md`, README 로컬 실행법 | 문서 | — | — |
| 10 | 3a | Sources & Ingest | `stages/ingest`, `adapters/source/rss`, `config/sources.yaml`(82행 이관 + text_rights) | 소스 추가 ≤ 10줄, 단일 소스 실패 격리 테스트, `items_fetched` 보고 | 플래그 OFF |
| 11 | 3b | Normalize & Dedupe | `stages/normalize` | 동일 기사 3소스 fixture → 1, 발행본 중복 reject | 플래그 OFF |
| 12 | 3c | Scoring & Selection | `stages/score`, `config/scoring.yaml` | 항목별 점수+reason, 임계값 설정만으로 변경 | 플래그 OFF |
| 13 | 3d | news_brief 생성 | `stages/generate/news_brief`, `prompts/news_brief.md`, `adapters/llm/anthropic` | fixture → 스키마 통과, 수치 grounding 통과율 보고 | 플래그 OFF |
| 14 | 3e | insight_essay 생성 | `stages/generate/insight_essay`, `prompts/insight_essay.md`, `content/voice/josh_voice.md`(Josh 제공), `content/templates/insight_essay.md` | 샘플 3편 Josh 승인 | 플래그 OFF |
| 15 | 3f | Image | `stages/image`, `adapters/image/{placeholder,openai}` | 전부 실패 fixture에서도 발행 진행 | 플래그 OFF |
| 16 | 3g | QA Gates | `qa/rules/*`(hard 13 → soft 7), `qa/run`, `config/qa.yaml` | 규칙 추가 = 파일 1개, 판정 100% reason_code, 규칙별 통과율 리포트 | 플래그 OFF |
| 17 | 3h | Publisher | `publishers/site`(upsert + revalidate), `config/redirects.yaml`, 레거시 25건 이관 스크립트(dry-run) | 발행이 빌드와 무관(테스트), slug 충돌 방지 | 플래그 OFF / staging만 |
| 18 | 3i | Scheduler·Alerting·Cost | `.github/workflows/pipeline.yml`, `notify/telegram`, `budget` | 실패·성공 알림 fixture 테스트, 예산 트리거 테스트 | 워크플로 비활성 |
| 19 | 4 | Shadow run ≥ 3일, `PUBLISH_TARGET=staging`, 프리뷰 배포, `docs/shadow/{compare,tuning-log}.md`, 롤백 드릴 | 문서·측정 | Phase 4 완료 기준 5개 | 워크플로 비활성 |
| 20 | 5 | `legacy-final` 태그 + 백업(승인), 레거시 25건 이관 실행, URL 136 전수 검증, Vercel Root Directory·플래그 전환, 48h 모니터링 | runbook, postmortem | 48h 무중단, URL 100% | 플래그 되돌리기 / 이전 배포 Promote / 태그 재배포 |
| 21 | 5 | 레거시 제거 PR(별도 승인) | PR | — | PR 미머지 |

## 2. 모듈 ↔ 레거시 파일 매핑 (P9: 읽고 재작성, 복붙 금지)

| 모듈 | 대체되는 레거시 파일 | 추출할 것 | 버릴 것 |
|---|---|---|---|
| 3a ingest | `scripts/lib/fetch-feeds.mjs`, `source-registry.mjs`, `source-fetch.mjs`, `scripts/update-industry-headlines.mjs`, `config/sourceRegistry.yml`, `config/sourcePriority.yml` | 레지스트리 82행과 권리 메타, 소스 균형 선택 아이디어, Epoch HTML 인덱스 규칙, 이월 로직 | 풀 상한 30, 콘솔 전용 카운터, 레거시 `FEEDS` 상수 |
| 3b normalize | `normalize.mjs`(URL 정규화·id), `fetch-feeds.mjs:343-348`, `curate.mjs:192-207`, `content-quarantine.mjs` | id 규칙(URL 보존), utm 제거 목록 | `www.`·trailing slash 미정규화, 퍼지 중복 부재 |
| 3c score | `relevance-classifier.mjs`(어휘·차원), `rank.mjs`, `curate.mjs`(plan·슬롯), `config/relevance-routing-rules.yml`, `signalScoringPolicy.yml`, `editorialCyclePolicy.yml` | 차원 어휘, 0.75/0.55 출발값, 일·런 캡 개념 | LLM 숏리스트 폴백 체인의 암묵 동작, 슬롯 락 |
| 3d news_brief | `content.mjs` enrichContent + 인라인 프롬프트, `expert-lens.mjs`, `expert-insight-engine.mjs`, `anti-template-rewrite.mjs`, `prompts/`(미사용 37파일 중 `narrative-dna`, `longform-draft` 참고) | 프롬프트 의도·필드 정의, Expert Lens 구조 | 영문 메모 포맷(한국어 `news_brief`로 대체), 템플릿 재작성기 |
| 3e insight_essay | `authored-column-engine.mjs`(패스 구조·리뷰), `authored-column-policy.mjs`(플로어), `claim-ledger.mjs`, `config/editorial/persona-charter.json`, `blogArchetypes.yml`, `editorialArchetypesV2.yml` | 초안→보이스→수리→리뷰 패스 개념, claim ledger 포맷, 페르소나 | 플로어 하드코딩, `.length` 결함, 2h 타임아웃 |
| 3f image | `image-generator.mjs`, `codex-image-provider.mjs`, `image-providers/*`(데드코드 포함), `config/codex-image-manifest.json`, `prepare-static-images.mjs` | provenance 필드, 플레이스홀더 자산, 매니페스트의 기존 아트워크 매핑 | 빌드 시 JSON 재작성, Mac 전용 등록 절차 |
| 3g qa | `source-extraction-fail-closed.mjs`, `quality-gate.mjs`, `repetition-detector.mjs`, `banned-phrases.mjs`, `final-publication-integrity.mjs`, `unsupported-claim-guard.mjs`, `numeric-claim-verifier.mjs`, `source-fidelity-claim-check.mjs`, `reader-copy-guard.mjs`, `copyright-safe-*`, `config/bannedPhrases.yml` 외 3종, `copyrightSafeTransformationPolicy.yml` | 임계값·금칙어·수치 검증 알고리즘·반복 지표 | 7단 결합 순서, 코드 내 임계값, 격리 목록 무시 |
| 3h publisher | `archive-store.mjs`, `state-store.mjs`, `authored-column-store.mjs`, `restore-eia-public-inventory.mjs`, `rebuild-taxonomy-pages.mjs`, `sitemap-builder.mjs`, `column-surface.mjs`, `public-surface-eligibility.mjs`, `api/admin/_github.js` | 공개 자격 조건(`isPublicLongformArticle` 10개 조건 → `publications.status`), sitemap 필터 | JSON 쓰기·커밋 발행, EIA 복원 재생성 |
| 3i scheduler | `scripts/run-subscription-news.mjs`, `subscription-job.mjs`, `subscription-operation-lock.mjs`, `scripts/pipeline.mjs` 오케스트레이션, `llm-budget.mjs`, `operations-monitor.mjs`, `check-operations.mjs`, `record-pipeline-heartbeat.mjs`, `send-telegram-photo.mjs` | 동시성 1 원칙, 예산 개념, 이슈 모니터 | Mac 잠금·worktree, heartbeat 파일, 90분 데드라인 |
| site | `src/pages/**`(48), `src/components/**`, `astro.config.mjs:14-40`, `src/lib/seo-safeguards.js` | 라우트·SEO 규칙·noindex 조건 | 빌드 시 JSON import, `getStaticPaths` 콘텐츠 라우트 |

## 3. R1~R8 추적표

| 요구사항 | 충족 설계 요소 | 검증 방법 |
|---|---|---|
| R1 주기 소싱(8h) | ADR-002 cron `45 15,23,7 * * *`, `stages/ingest`, `config/sources.yaml` tier | `pipeline_runs.funnel.items_fetched` 런별 ≥ 1, 소스 health |
| R2 사이클당 1~2 `news_brief` | `caps.briefs_per_cycle`, `stages/score` 선택 상·하한, 3d, ADR-004 재서술 허용으로 풀 확장 | 7일 이동평균 `published` ≥ 1/런 (Phase 4 기준 80%) |
| R3 `insight_essay` 일 0~1 | `caps.essays_per_day`, `scoring.insight_trigger`, 3e 보이스 파일 | Josh 샘플 승인, `publications.content_type` 집계 |
| R4 파이프라인 장애 ≠ 서빙 중단 | ADR-005 SSR/ISR + `publications`만 읽기, ADR-002 Actions 분리, P5 dead_letters | 파이프라인 강제 실패 중 사이트 200 (Phase 4 드릴) |
| R5 플러그앤플레이 | ADR-001 워크스페이스, `contracts.md` Adapter·QaRule, `sources.yaml` ≤ 10줄, `qa/rules/<RULE>.ts` 1파일 | 3a·3g 완료 기준 |
| R6 설명 가능한 게이트 | ADR-004 reason_code, `qa_results`, `candidates.reject_reason` | 판정 100% reason_code (SQL 검사) |
| R7 재현성 | `fixtures/`, `--replay`, CI 네트워크 0, 결정적 규칙 | CI에서 외부 호출 0 (프록시 차단 테스트) |
| R8 URL·데이터·SEO 보존 | ADR-003 `legacy_id`·slug 규칙, ADR-005 301 맵·sitemap, `05-preserve-list.csv` 전수 검증 | 136 URL → 200/301 (Phase 5) |

## 4. 선행 입력 (Josh)

| 입력 | 필요 시점 | 상태 |
|---|---|---|
| Anthropic API 키(Actions secret) | Phase 3d | 미수령 |
| Supabase 프로젝트 선택·service role·anon 키(값은 Actions/Vercel에만) | Phase 2 M8 | 미수령 |
| Telegram 봇 토큰·채팅 ID | Phase 3i | 미수령 |
| 보이스 샘플 5~10편 → `content/voice/josh_voice.md` | Phase 3e 전 | 미수령 |
| 재서술 금지 매체 목록 | Phase 3a | 미수령 |
| 이미지 공급자 결정(플레이스홀더 우선 vs OpenAI) | Phase 3f | 미결정(가정: 플레이스홀더 우선) |
| Vercel 커넥터 팀 스코프 재인가 | Phase 2(한도 확인), Phase 5(설정 변경) | 미완 |
| Mac 잡 레코드(선택) | — | 미수령 |

## 5. 진행 상태

| 날짜 | 단계 | 상태 | 비고 |
|---|---|---|---|
| 2026-10-18 | 1 | done | `rebuild/v2`를 Phase 1 docs head(`b081e9d0`)에서 분기(Josh 결정). worktree 대신 브랜치 전환으로 수행 |
| 2026-10-18 | 2 | done | npm workspaces + `tsconfig.base.json` + Node 22 타입 스트리핑(`tsx` 불필요). 신규 의존성 4종 승인·설치, `@astrojs/vercel`은 devDependency |
| 2026-10-18 | 3 | done | `packages/shared`: 테이블·콘텐츠·설정 스키마, Stage/Adapter/QaRule/DbPort/Ledger/Budget 계약, YAML 로더, `CC_FLAG_*` 플래그, 리댁션 로거. 테스트 28 |
| 2026-10-18 | 4 | done | `packages/pipeline`: 선기록 원장(memory·supabase), DbPort 2종, no-op Stage 7(QA는 fail-closed), fixture 어댑터, 예산 가드, CLI. 테스트 25 |
| 2026-10-18 | 5 | done | `fixtures/rss/sample.xml`(커밋된 풀 스냅샷 파생, 라이브 캡처 아님), `fixtures/llm/news_brief.sample.json`(합성). `--replay`에서 fetch throw 테스트 |
| 2026-10-18 | 6 | done | `.github/workflows/rebuild-ci.yml`(pinned SHA, fixtures only). 첫 실행은 PR에서 |
| 2026-10-18 | 7 | done | `apps/site`: `output: 'server'` + Vercel ISR 300s, `publications` 데이터층(`supabase`/`legacy_json`/`empty`), `/healthz`, 빈 상태 빌드 테스트. 테스트 13 |
| 2026-10-18 | 8 | **written, not applied** | `supabase/migrations/0001_init.sql`(DDL·인덱스·RLS). 적용은 프로젝트 선택 + §5.6 승인 후 |
| 2026-10-18 | 9 | done | `CLAUDE.md`, README "Rebuild v2" 절, `docs/STATUS.md` |
