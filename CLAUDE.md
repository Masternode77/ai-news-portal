# CLAUDE.md — computecurrent.com 리빌드 운영 규칙

이 파일은 리빌드 세션의 운영 규칙이다. 편집 정책은 `AGENTS.md`, 실행 단계는 `REBUILD_BRIEF.md`, 현재 상태는 `docs/STATUS.md`, 설계는 `docs/adr/`·`docs/architecture/`·`docs/migration/plan.md`를 본다.

## 0. 세션 시작·종료
- 시작: `REBUILD_BRIEF.md`, `docs/STATUS.md`를 읽는다. 이번 세션의 Phase는 STATUS.md의 `phase`와 Josh의 킥오프 문구가 일치할 때만 실행한다.
- 종료: `docs/STATUS.md`를 갱신하고 브리프 §7 보고 포맷으로 보고한다. 보고 없이 다음 Phase로 넘어가지 않는다.

## 1. Truth anchor
- `docs/STATUS.md`가 단일 진실이다. 직전 Phase가 PASS면 그 이하로 돌아가지 않는다. 돌아가야 하면 `blocked (reason)`으로 보고하고 멈춘다.
- 프로덕션 기준은 `origin/main` + Vercel의 READY 배포 커밋이다. 로컬 HEAD는 기준이 아니다.

## 2. 상태 어휘
`started | partial | done | blocked (reason)` 네 가지만 쓴다. 워커 `done`은 오케스트레이터 검증 전까지 `completed`가 아니다(`AGENTS.md` 참조).

## 3. 승인 게이트
- Phase 간 이동, Phase 3의 모듈(3a~3i) 이동은 Josh의 명시 승인이 필요하다.
- 사전 승인 필요: 패키지 추가(lockfile 재설치 `npm ci`는 예외), DB 스키마 마이그레이션 적용, 스케줄 변경, 프로덕션 배포, 외부 서비스 신규 연결, Vercel 프로젝트·DNS·cron·환경 변수 변경.
- 승인 요청은 §7 보고를 먼저 제출한다.

## 4. STOP-THE-LINE (즉시 중단 후 보고)
- 데이터 손실 가능성: 테이블 drop/truncate, `src/data/*.json`·`public/generated/` 대량 삭제, Supabase `archived_articles` 변경.
- 프로덕션 가용성 영향: `main` 직접 push, 루트 `vercel.json`·`astro.config.mjs` 변경을 수반하는 배포.
- 시크릿 노출 가능성, 예상 밖 파괴적 명령, 런당 LLM/이미지 비용이 `config/pipeline.yaml`의 `budget.run_usd` 초과.
- Phase 0~4에서 `--dry-run`이 아닌 실제 publish 실행 시도(`PUBLISH_TARGET=production`은 Phase 5 컷오버에서만).

## 5. 금지
- 환경 변수 **값** 출력·로그·커밋. 이름만 다룬다. `.env*`, 키 파일, Supabase service role 키 열람 금지(명시 요청 제외). 로거는 키 이름이 credential처럼 보이는 값을 자동으로 가린다(`packages/shared/src/logger.ts`).
- 승인 없는 삭제(테이블·파일·브랜치), force-push, history 재작성.
- 한 번에 20개 파일 이상 자동 편집(사전 계획 제시 필수).
- 레거시 코드를 새 구조로 복사·붙여넣기(P9). 검증된 규칙·프롬프트·스키마만 추출해 재작성한다. `packages/*`·`apps/site`에서 `scripts/`·`src/`(레거시)를 import 하지 않는다.

## 6. 작업 위치와 구조 (Phase 2 이후)
- 리빌드 코드는 `rebuild/v2` 브랜치에 쌓인다(Josh 결정 2026-10-18). `main`은 레거시가 계속 서빙한다. 로컬에서는 `git worktree add ../computecurrent-rebuild rebuild/v2`로 분리해도 된다.
- npm workspaces: `apps/site`(Astro 7 `output: 'server'` + Vercel ISR, `publications`만 읽음), `packages/shared`(`@cc/shared`: zod 스키마·계약·설정 로더·로거), `packages/pipeline`(러너·Stage·어댑터·원장). `config/*.yaml`, `fixtures/`, `supabase/migrations/`, `prompts/`(Phase 3)도 리빌드 영역이다.
- 레거시(`scripts/`, `src/`, `tests/`, `config/*.yml`, `.github/workflows/update-news.yml` 등)는 Phase 5 별도 PR 전까지 건드리지 않는다. 루트 `package.json`은 `workspaces`와 `v2:*` 스크립트만 추가됐고 레거시 스크립트는 그대로다.
- TypeScript는 Node 22의 타입 스트리핑으로 **그대로 실행**된다(빌드 산출물 없음). 따라서 erasable 문법만 쓴다: `enum`·`namespace`·parameter properties 금지(`erasableSyntaxOnly`), 상대 import는 `.ts` 확장자 포함, 타입은 `import type`.
- 명령: `npm run v2:typecheck`, `npm run v2:test`, `npm run v2:build`, `npm run v2:pipeline -- run --dry-run --replay --fixture sample --json`. 레거시 `npm test`는 `astro build`를 돌리므로 리빌드 세션에서는 돌리지 않는다.
- 라이브 수집(3a)·정규화(3b): `CC_FLAG_STAGES_NORMALIZE=true npm run v2:pipeline -- run --dry-run --live --stage ingest,normalize --json`는 실제 피드를 읽되 메모리 원장·DB에만 쓴다. `flags.stages.normalize`는 기본 `false`(3b, contracts §7)라 normalize를 보려면 그 환경 변수가 필요하고, fixture로는 `--fixture dedupe --sources fixtures/sources/dedupe.yaml`(3소스 12건 → 후보 6, `fixtures/db/dedupe.json`의 발행본 1건 포함)이 기준 샘플이다. Phase 4 전에는 모든 런에 `--dry-run`이 필수(`--replay`만 주면 어댑터는 오프라인이어도 실제 원장을 쓰게 되므로 거부), `--live`는 `--replay`와 배타. 세션은 피드 호스트에 닿지 않으므로 라이브 증거는 `.github/workflows/rebuild-ci.yml`의 `ingest-live-dry-run` 잡(workflow_dispatch에서 `live_ingest=true`, 시크릿 없음)의 step summary로 받는다. `config/sources.yaml` 82행은 `packages/pipeline/tools/migrate-legacy-registry.ts`가 1회 생성했고 이후 수동 편집한다(자동 비활성된 소스는 `reviewed_at`을 그 날짜 뒤로 올리면 재활성).
- 채점·선택(3c): `CC_FLAG_STAGES_NORMALIZE=true CC_FLAG_STAGES_SCORE=true npm run v2:pipeline -- run --dry-run --replay --fixture scoring --sources fixtures/sources/scoring.yaml --stage ingest,normalize,score --json`(5소스 13건 → 임계 통과 6 → 선택 2, 소스당 1)이 기준 샘플이다. 루브릭은 `config/scoring.yaml`(CLI `--scoring`)에 데이터로만 있다: 5축 가중치·임계값(full 0.75/brief 0.55, 관련성 하한 `relevance_min` 0.55)·`insight_trigger`·선택 규칙·축별 어휘/패턴/계수. 규칙·임계값·용어를 바꾸면 `version`을 올린다(`candidates.rubric_version = score/<version>`). 모든 후보 행에 `rubric { tier, rank, insight_eligible, reasons }`가 남는다(`supabase/migrations/0002_candidates_rubric.sql`, 미적용). `flags.stages.score`는 기본 `false`. 결정적·LLM 없음; 한·영 동일 사건 묶기나 LLM 숏리스트는 3c 범위 밖이다.
- 생성(3d news_brief): `CC_FLAG_STAGES_NORMALIZE=true CC_FLAG_STAGES_SCORE=true CC_FLAG_STAGES_GENERATE=true npm run v2:pipeline -- run --dry-run --replay --fixture scoring --sources fixtures/sources/scoring.yaml --stage ingest,normalize,score,generate --json`(선택 2 → 초안 2, grounding 1/2)이 기준 샘플이다. 프롬프트는 `prompts/news_brief.md`(front matter `task/version/model_hint/output_schema/max_output_tokens` + 한국어 system prompt, CLI `--prompts-dir`)이고 규칙·문체를 바꾸면 `version`을 올린다(`drafts.prompt_version`, 행이 새로 생김). 금지 표현은 프롬프트에 적지 않고 `config/banned-phrases.yaml`(CLI `--banned-phrases`)에만 둔다 — 본문 `{{banned_phrases}}`가 거기서 렌더링되고 같은 인벤토리로 초안을 검사해 `checks.banned`로 보고한다(차단은 3g `BANNED_PATTERN`). 항목을 바꾸면 그 파일의 `version`을 올린다. 모델은 `NewsBriefDraft`(제목·요약·의미·렌즈·태그)만 쓰고 출처·날짜·slug는 스테이지가 채운다. `llm.provider`는 `fixture`(기본; `fixtures/llm/news_brief/<raw_item_id>.json`, 없으면 `news_brief.sample.json`)·`anthropic`(`ANTHROPIC_API_KEY` 이름만; `ctx.fetch` 경유라 `--replay`에서 차단)·`disabled`. 호출 전 `budget.canSpend` 추정, 실제 비용은 `llm.pricing`(행 없는 모델은 거부). 검사(숫자 grounding·`quote_max_words`)는 보고만, 차단은 3g. `flags.stages.generate`는 기본 `false`. 라이브 생성 증거는 Anthropic 키 수령 후(notes 3d §4.2).
- 기능 플래그: `config/pipeline.yaml`의 `flags.stages.<stage>`와 `flags.publish_target`, 환경 변수 `CC_FLAG_STAGES_<STAGE>`·`CC_FLAG_PUBLISH_TARGET`로 override. 알 수 없는 플래그는 실행 실패다.
- 네트워크: `--replay`에서는 `ctx.fetch`가 throw 한다. 어댑터는 `ctx.fetch`만 쓴다. CI는 fixture만 읽는다(R7).

## 7. 이 레포의 실측 함정 (반드시 기억)
- `scripts/pipeline.mjs`에는 dry-run이 없다. `PIPELINE_OFFLINE=1`은 본문 추출만 끄고 RSS는 계속 가져오며, `LLM_PROVIDER=disabled`도 `src/data` JSON과 폴백 이미지를 쓴다. 진단·replay는 `scripts/diagnose/funnel.mjs`처럼 lib 함수를 메모리에서만 호출한다.
- `npm test`는 `astro build`를 돌리고, `scripts/audit-omo-ultra-current-state.mjs`는 tracked 문서 `docs/omo-ultra-audit.md`를 쓴다. `npm run content:cycle`은 `.cache/content-cycle`을 만든다. 오프라인 레거시 테스트는 `test:quality-gates`, `test:claim-ledger`, `test:signal-clusters`, `test:source-expansion`와 개별 `node --test tests/<file>`.
- 루트 `astro check`(레거시 CI `validate-application`의 `npm run check`)는 루트 전체를 재귀 탐색해 `apps/site`의 `.astro` 파일까지 검사한다. 루트에는 tsconfig가 없어 `.ts` 확장자 import와 `@cc/shared`의 `exports`를 해석하지 못한다. 따라서 `.astro` 파일에서는 **확장자 없는 상대 import만** 쓰고 `@cc/shared`는 `src/lib/*.ts`를 통해서만 쓴다(타입은 `src/lib/render.ts`가 재수출). 양쪽 check를 모두 통과시킨다.
- `.gitignore`의 bare `evidence/`는 `docs/diagnosis/evidence/`도 무시한다. 증거는 `docs/diagnosis/mac-jobs/`, `docs/diagnosis/logs/`에 둔다.
- 레거시 생성은 Josh의 Mac Codex 태스크(00:45/08:45/16:45 KST)에서 돈다(2026-10-11 이후 정지). GitHub Actions는 검증만, Vercel에는 cron이 없다. 클라우드 세션에서는 RSS 호스트·Vercel 로그·Mac 잡 레코드·Astro/Vercel/Supabase 문서 사이트에 접근할 수 없다. `fixtures/rss/sample.xml`은 라이브 캡처가 아니라 커밋된 풀 스냅샷에서 파생한 것이다.
- 구독 모드에서 컬럼 단계 실패는 런 원장 기록 전에 abort 한다(`scripts/pipeline.mjs:445`). `runHistory`는 완주 런만 담는다. 새 러너는 원장을 **먼저** 쓴다.
- 레거시 발행 = JSON 커밋 → `main` push → Vercel 전체 재빌드. 빌드 입력을 깨뜨리는 변경은 곧 서비스 영향이다.
- `prompts/` 디렉토리의 레거시 37파일은 런타임에서 쓰이지 않는다. 실제 레거시 프롬프트는 `scripts/lib/{curate,content,expert-lens,authored-column-engine}.mjs` 인라인이다.
- `config/sourceRegistry.yml`은 엄격한 YAML 파서(PyYAML, `yaml` npm)로 읽히지 않는다(254행). 레거시 로더만 읽을 수 있으니 리빌드는 `config/sources.yaml`을 쓴다.
- `@astrojs/vercel`은 빌드 도구라 `apps/site`의 devDependency다. `npm audit --omit=dev`는 통과하지만 전체 감사에는 `@vercel/routing-utils`가 고정한 `path-to-regexp@6.1.0`(GHSA-9wv6-86v2-598j) 3건이 남는다. 업스트림 갱신 전까지 알려진 항목이다. GHSA-mrhx-c7xc-m3w5(zod <4.6.6)는 `@vercel/cli-config@0.3.3`가 zod 4.1.11을 정확히 고정해 생겼고, 루트 `package.json`의 `overrides`로 그 한 곳만 `^4.6.7`로 올려 해소했다(Josh A안, 2026-10-24; 호이스트된 zod로 dedupe). npm 10.9는 lockfile에 중첩 zod 항목이 이미 있으면 `npm install`이 override를 적용하지 않으므로, 되살아나면 그 lock 항목(`node_modules/@vercel/cli-config/node_modules/zod`)과 디렉토리를 지우고 `npm install`을 다시 돌린다.

## 8. 보고 포맷
`REBUILD_BRIEF.md` §7을 그대로 쓴다. "완료했습니다" 한 줄은 보고가 아니다.
