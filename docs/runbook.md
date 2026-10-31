# Runbook — computecurrent.com 파이프라인·사이트 운영

브리프 Phase 5 항목 5: 자주 하는 변경 여섯 가지의 절차. 각 절차는 10줄 이내다. 공통 규칙은 `CLAUDE.md`를 따른다: 설정 변경은 YAML 값과 그 파일의 `version`을 함께 바꾸고, 환경 변수는 이름만 다루며, 검증 명령은 `npm run v2:typecheck`·`npm run v2:test`다.

## 1. 소스 추가

1. `config/sources.yaml`에 행을 하나 추가한다: `id`(소문자 kebab, 고유), `name`, `url`, `type: rss|html|api`, `tier`, `enabled: true`, `text_rights: full|rewrite_only|link_only`, `terms_url`, `reviewed_at`(오늘), `language`.
2. 권리가 불분명하면 `link_only`로 시작한다. full text는 이용 조건을 확인한 소스만 쓴다.
3. 형식이 RSS/Atom이 아니면 어댑터가 필요하다(4절 참조). RSS/Atom은 코드 변경이 없다.
4. `npm run v2:test`(설정 strict 로드)를 돌리고 PR을 연다.
5. 머지 뒤 `rebuild-ci.yml`을 `live_ingest=true`로 dispatch해 step summary에서 그 소스의 `items_fetched`와 오류를 확인한다.
6. 연속 실패로 자동 비활성되면 원인을 고친 뒤 `reviewed_at`을 그 날짜 뒤로 올려 재활성한다.

## 2. QA 규칙 추가

1. `packages/pipeline/src/qa/rules/<CODE>.ts` 파일 1개를 만든다. `CODE`는 UPPER_SNAKE이고 그대로 reason_code가 된다.
2. 파일은 `QaRule { rule, check(draft, evidence, config) }`만 내보낸다. 임계값은 `config.params`에서 읽고 코드에 쓰지 않는다.
3. `packages/pipeline/src/qa/registry.ts`에 import 1줄을 추가한다(러너 수정은 없다).
4. `config/qa.yaml`의 `rules[]`에 실행 순서대로 1행을 넣고(`severity hard|soft`, soft면 `auto_pass`, `params`) `version`을 올린다.
5. `packages/pipeline/test/qa-rules.test.ts`에 통과·실패 사례를 추가하고, 규칙·verdict 개수가 들어간 테스트(qa-stage, cli, qa-config)와 rebuild-ci smoke를 갱신한다.
6. 설정에 있는데 파일이 없으면 런이 `QA_RULE_UNKNOWN`으로 실패하고, 파일만 있고 설정에 없으면 돌지 않는다.

## 3. 퍼블리셔 추가

1. `packages/pipeline/src/adapters/publisher/<name>.ts`에 `PublisherAdapter`(`publish`, 선택 `unpublish`·`syncRedirects`·`revalidate`)를 구현한다.
2. 네트워크는 `ctx.fetch`로만 쓴다(`--replay`에서 차단된다). 자격 증명은 `env[이름]`으로만 읽고 로그에 남기지 않는다.
3. `packages/pipeline/bin/pipeline.ts`의 `buildAdapters`에서 `publishers`에 등록한다.
4. 실패는 세기만 하고 런을 깨지 않는다(site 퍼블리셔의 revalidate 처리와 같다). 결정은 `publishStats.decisions`에 남긴다.
5. 메모리 DB와 fake fetch로 단위 테스트를 쓰고, fixture replay 샘플이 바뀌지 않는지 확인한다.
6. 외부 서비스 신규 연결이므로 머지 전에 Josh 승인을 받는다(CLAUDE.md §3).

## 4. 콘텐츠 타입 추가

1. `packages/shared/src/schema/content.ts`에 zod 스키마를 추가하고, `cc_content_type` enum에 값을 더하는 마이그레이션 SQL을 `supabase/migrations/`에 쓴다(적용은 Josh 승인).
2. `prompts/<task>.md`(front matter `task/version/model_hint/output_schema/max_output_tokens`)를 만든다. 금지 표현은 `config/banned-phrases.yaml`에만 둔다.
3. generate 스테이지에 그 task 분기를 추가한다. 모델은 본문 필드만 쓰고 출처·날짜·slug는 스테이지가 채운다.
4. QA 규칙이 새 필드를 읽도록 `briefOf` 계열 헬퍼를 확장하고, 필요한 규칙은 2절 절차로 추가한다.
5. 사이트 `apps/site/src/lib/render.ts`의 `KNOWN_FIELDS`에 새 본문 필드를 추가하고, 목록 라벨은 `listing.ts`의 `contentLabel`에 추가한다.
6. 기능 플래그(`flags.stages.<stage>` 또는 caps)는 기본 off로 두고 fixture replay 샘플과 테스트를 갱신한다.

## 5. 임계값 변경

1. 바꿀 값이 어느 파일에 있는지 찾는다: 채점·선택은 `config/scoring.yaml`, QA는 `config/qa.yaml` `params`, 비용은 `config/pipeline.yaml` `budget`, 수집은 `config/sources.yaml`.
2. 값을 바꾸고 같은 파일의 `version`을 올린다(`candidates.rubric_version`·verdict `qa_version`에 기록된다).
3. `docs/shadow/tuning-log.md`에 날짜, 파일, 이전 값 → 새 값, 근거(런 id·`compare.md` 행)를 1행 남긴다.
4. `npm run v2:test`를 돌린다. 개수가 고정된 테스트가 깨지면 기대값과 근거를 함께 고친다.
5. 효과는 다음 런의 funnel(`compare.md` §1)과 `pipeline review` 덤프로 확인한다. 코드는 바꾸지 않는다.

## 6. 장애 시 롤백

1. 사이트 이상(5xx, URL 검증 실패): Vercel `ai-news-portal` → Deployments에서 직전 정상 Production 배포를 **Instant Rollback**한다(1분 이내).
2. 컷오버 자체를 되돌릴 때: 1을 한 뒤 Root Directory를 비우고 Production env(`SITE_DATA_SOURCE`·`SUPABASE_URL`·`SUPABASE_ANON_KEY`·`SITE_INDEXABLE`)를 제거한다.
3. 파이프라인이 잘못 발행할 때: `.github/workflows/pipeline.yml`의 `schedule`을 주석 처리하는 PR을 머지한다(드릴 실측 1분 40초). 이미 나간 글은 `publications.status`를 비공개로 바꾼다(데이터 변경 승인).
4. 비용 폭주: `config/pipeline.yaml` `budget.run_usd`를 낮추거나 `CC_FLAG_STAGES_GENERATE=false`로 dispatch한다. 생성만 멈추고 QA 통과분은 발행된다.
5. 확인: `rebuild-ci.yml` dispatch `verify_base_url=https://www.computecurrent.com`(136 URL), `/healthz`, `pipeline ops`.
6. 최후 수단: `legacy-final` 태그를 체크아웃해 재배포한다(15분 이내). 사후에 `docs/postmortem.md`에 원인과 재발 방지 장치를 추가한다.
