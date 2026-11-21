# 3e insight_essay — 레거시 읽기와 설계 (The Current 칼럼 재개)

Phase 3 모듈 e(`REBUILD_BRIEF.md` §6 3e, Appendix A `insight_essay`). 착수 결정은 Josh가 2026-11-16에 내렸다. "블로그가 하나도 발행 안 됨"의 대상이 The Current 칼럼임을 확인했고, 착수 방식으로 "기존 칼럼 7편으로 착수"를 골랐다(AskUserQuestion).

진행 순서는 다음과 같고, 각 단계마다 Josh의 승인이 필요하다.

1. 문체 가이드와 템플릿 승인 (이 문서)
2. 구현
3. 샘플 3편 승인
4. 스케줄 활성

## 0. 원인 — 왜 칼럼이 0편인가 (2026-11-16 실측)

| 사실 | 근거 |
|---|---|
| 뉴스 브리프는 정상 발행 중이다. 최근 8일 cron 22회가 모두 success였고, 회당 0~2건이 발행됐다. | `pipeline.yml` run 42439666479 … 43796277928의 `run summary` |
| The Current의 마지막 글은 2026-10-11이다. 공개 칼럼은 7편이고 모두 레거시다. | www `/column/`(배포 `dpl_DGwQTRjM7AJjSMEG1HA72V5o8jUX`) |
| 레거시 칼럼 생성기는 Josh Mac의 Codex 태스크였다. 2026-10-11 이후 정지됐고, M8(PR #90)에서 코드도 삭제됐다. | CLAUDE.md §7, STATUS 2026-11-02 |
| 대체 모듈 3e는 재계획(2026-10-23, B안 2026-10-24)에 따라 "컷오버 후, 보이스 샘플 수령 뒤"로 미뤄져 있었다. 리빌드 파이프라인에는 칼럼 생성 경로가 아직 없다. | `REBUILD_BRIEF.md` §6 재계획 메모, STATUS `next_step` |
| 이미 있는 연결부는 다음과 같다. | 각 파일 |
| - 채점 단계가 `insight_potential` 축과 `insight_trigger` 0.7을 갖고 있고, 후보마다 `rubric.insight_eligible`을 남긴다. | `config/scoring.yaml` |
| - `caps.essays_per_day: 1`이 설정돼 있다. | `config/pipeline.yaml` |
| - 스키마 `InsightEssay`가 정의돼 있다(ADR-009 영문 필드). | `@cc/shared` |
| - 사이트가 `column/` slug와 `insight_essay`를 The Current로 표시한다. | `apps/site` |
| 비어 있는 부분은 다음과 같다. | |
| - 생성 스테이지가 `news_brief`만 만든다. | `stages/generate.ts` |
| - 발행 스테이지는 `insight_essay`를 거부한다. | `stages/publish.ts:34` "no publisher mapping yet" |
| - QA의 `SCHEMA_INVALID`도 `insight_essay`를 거부한다. | `SCHEMA_INVALID.ts` "arrives with 3e" |

**결론:** 칼럼을 쓰는 코드가 지금은 없다. 결함이 아니라 계획상 남아 있던 모듈이다.

## 1. 레거시에서 읽은 것

### 1.1 칼럼 22편 (`fixtures/legacy/authored-columns.json`, `authored_column_v1`)

- **공개 7 / 격리 15.** 격리 사유는 둘 중 하나다.
  - 출처의 텍스트 사용권이 없음: `source_rights:text_use_not_authorized:<source>`. hpcwire·storagereview·techcrunch·toms-hardware·semiconductor-engineering·bloomberg·servethehome가 해당한다.
  - 본문 추출 실패: `extraction_artifact:missing_or_invalid`.
- **공개 7편의 출처는 모두 텍스트 사용권이 `full`이다.** EIA, Epoch AI, European Commission, Kubernetes Blog가 여기에 든다. 원문 전문이 있어야 1,000단어 이상의 논증을 근거 위에 세울 수 있다.
  - 2026-11-08 Samsung SDS 브리프가 반례다. 본문 27자 출처로 쓰다가 "Seoul"을 지어냈다.

공개 7편 실측:

| 지표 | 범위 |
|---|---|
| 본문 길이 | 1,144~1,915단어 |
| 소제목 | 4~6개, 매번 새로 지음 |
| 1인칭 표지 | 3~35회 |
| 출처 | 대부분 1곳(Hormuz만 2곳) |

공통 구조는 다섯 단계다.

1. 사실 문단: 수치와 출처
2. 판단 문단: 경계 명시
3. 분석 2~3절
4. 반론 1절: 고유 제목
5. 조건부 관찰점 2~3개

### 1.2 `persona-charter.json` v2 (legacy-final)

정직 규칙 7개, 10개의 standing positions, voice do/don't가 들어 있다. P9에 따라 코드는 복사하지 않았다. 검증된 규칙만 추려 `content/voice/josh_voice.md`로 다시 썼다.

## 2. 유지 · 버림 · 변경

| 구분 | 항목 | 새 구조에서 |
|---|---|---|
| 유지 | 정직 규칙(인터뷰·현장 방문 주장 금지, 수치마다 출처, 마일스톤 구분, 법·보험·회계는 실사 질문으로) | 보이스 §2(hard). QA는 `UNGROUNDED_NUMBER`·`UNGROUNDED_ENTITY`·`BANNED_PATTERN`이 맡는다. |
| 유지 | standing positions 10개 | 보이스 §4. 본문에 언급하지 않는 내부 시험 질문으로 쓴다. |
| 유지 | 구조(사실 → 판단 → 분석 → 반론 → 조건부 관찰) | `content/templates/insight_essay.md` |
| 유지 | 고유 소제목, 은퇴한 제목 목록, 말줄임표·수사의문문 금지 | 보이스 §6. 새 QA soft 규칙 후보(§4). |
| 변경 | 출처 자격 | `text_rights: full` 소스(28곳)이면서 본문 추출 성공·충분한 분량인 후보만 칼럼 대상으로 한다. 레거시 격리 15편의 원인을 차단한다. |
| 변경 | 제목 패턴 "X is a Y, not a Z" | 공개 7편 중 4편이 이 패턴이다. 최근 5편 중 1회까지만 허용한다(보이스 §6). |
| 변경 | 언어 | 영어(ADR-009). 레거시 칼럼도 영어였다. |
| 버림 | 레거시 생성 경로(Mac Codex, `blog-engine-v4`, 13회 LLM 호출 다단계 재작성, JSON 커밋 발행) | 리빌드 파이프라인의 generate → qa → image → publish를 쓴다. 호출은 1~2회. |
| 버림 | 쓰기 시점 자동 격리 | 3g QA 판정과 `drafts.review_status`로 대신한다. |

## 3. 설계 초안 (구현 단계에서 확정)

1. **트리거**
   - 3c 채점에서 `insight_eligible`(insight_potential ≥ 0.7)이고 출처가 `text_rights: full`이며 본문이 충분한 후보 중 최상위 1건을 고른다.
   - 상한은 하루 `caps.essays_per_day`(1)건이다. 오늘(KST) 이미 칼럼을 발행했으면 건너뛴다.
   - 같은 후보가 news_brief로도 선택될 수 있다. 두 유형은 slug가 달라(`news/…` / `column/…`) 충돌하지 않는다.
2. **생성**
   - `prompts/insight_essay.md`: front matter와 영어 system prompt로 구성한다. 보이스 파일과 템플릿을 렌더링해 넣고, 금지어는 `{{banned_phrases}}`로 넣는다.
   - 모델은 `InsightEssayDraft`(title·deck·thesis·body·counterpoint·implications·tags)만 쓴다.
   - 출처·날짜·slug·이미지·바이라인은 스테이지가 채운다.
   - 최근 5편의 제목과 소제목을 프롬프트에 넣어 반복을 막는다.
3. **스키마 변경**(`@cc/shared` `InsightEssay`)
   - `deck` 추가: 레거시 칼럼에도 있었고, 사이트 표시와 meta description에 쓴다.
   - `body` 하한을 5,000자에서 실측 기준(약 4,500자 ≈ 800단어)으로 조정한다.
   - `sources` 하한 2 → 결정 D1에 따른다.
4. **QA**
   - 기존 규칙(`SCHEMA_INVALID`, `QUOTE_TOO_LONG`, `SIMILARITY_TOO_HIGH`, `UNGROUNDED_NUMBER`, `UNGROUNDED_ENTITY`, `LANG_MISMATCH`, `BANNED_PATTERN`, `DUPLICATE_EVENT`)이 칼럼 필드도 읽게 한다.
   - 칼럼 전용 soft 규칙 `ESSAY_STRUCTURE`를 1파일로 추가한다. 검사 항목은 소제목 수, 반론·관찰 절의 존재, 은퇴한 제목, 말줄임표다.
5. **이미지**: 브리프와 같다(플레이스홀더, static store). 레거시 칼럼 7편의 히어로 이미지는 그대로 둔다.
6. **발행**: `insight_essay`를 `publications` 행에 매핑한다(`column/<slug>-YYYY-MM-DD`, content_type `insight_essay`, 바이라인 Josh Jiwoon Inn).
7. **사이트**: 새 본문 키(deck·thesis·body·counterpoint·implications)를 렌더링한다. 레거시 키(`article_body`)는 그대로 읽는다. 목록·RSS·사이트맵은 이미 `column/`을 처리한다.
8. **플래그**: ~~`flags.stages.essay`와 `CC_FLAG_STAGES_ESSAY`~~ → 구현에서 **`essay.enabled`(기본 false)와 `CC_FLAG_ESSAY`**로 바꿨다(§6). 스테이지 이름이 DB enum(`cc_stage_name`)이라 새 스테이지를 만들면 마이그레이션(승인 항목)이 필요하기 때문이다. cron에서 켜는 것은 4단계(스케줄 활성) 승인 항목이다.
9. **비용**: 칼럼 1편은 입력 약 6k 토큰(원문 최대 12,000자 포함), 출력 약 3k 토큰이다. `claude-opus-5-5` 단가($4/$20 per Mtok) 기준 약 $0.08~0.12로 추정하며, 실측해서 보고한다. 런당 한도 $2.0 안이다.

## 4. Josh 결정이 필요한 것

| # | 질문 | 권고 |
|---|---|---|
| D1 | 출처 하한. Appendix A는 2개 이상이지만, 공개 7편 중 6편은 1곳이었다. | **1개 이상(1차 출처)**. 같은 사건의 다른 원문이 런에 있으면 추가한다. 2개를 강제하면 대상이 크게 줄고, 출처를 끼워 넣는 경향이 생긴다. |
| D2 | 바이라인 | **Josh Jiwoon Inn + 기존 AI 고지**(레거시와 같다) |
| D3 | 스케줄 활성 후 발행 방식 | **QA 통과 시 자동 발행**(브리프와 같다). 샘플 3편 승인을 첫 게이트로 둔다. |
| D4 | 대상 출처 제한: `text_rights: full` 28곳(정부·규제기관·Epoch AI·Kubernetes·arXiv 등) | **제한한다.** 레거시 격리 15편의 원인이었다. 상업 매체 기사는 브리프로만 다룬다. |

## 5. 구현 범위 예상 (승인 뒤, PR 1~2개)

약 18~22개 파일이다. 20개를 넘으면 착수 전에 목록을 다시 제시한다.

| 범위 | 파일 |
|---|---|
| shared | 스키마 1, 설정 스키마 1(플래그) |
| pipeline | essay 생성 스테이지 또는 generate 확장 1~2, prompt 1, QA 규칙 확장 3~4 + `ESSAY_STRUCTURE` 1, publish 매핑 1, state·러너 1 |
| site | render 1~2 |
| config | `pipeline.yaml`·`qa.yaml` |
| fixtures | fixture LLM 응답 2 |
| 테스트 | 4~5 |
| 문서 | STATUS·CLAUDE.md·contracts |

검증은 다음 순서로 한다.

1. typecheck와 테스트, 그리고 replay 기준 샘플(칼럼 1편 생성 → QA → 발행했을 글).
2. staging 라이브 런으로 샘플 3편을 만들어 Josh에게 검토용 링크로 보낸다.

## 6. 2단계 구현 기록 (2026-11-16, PR #102)

Josh "3e 1단계 승인"(보이스·템플릿·D1~D4 권고안) → 파일 목록 재제시(약 45개, §5의 20 초과) → **"승인 — PR #102 하나"**와 기본값 E1~E4 권고안.

### 6.1 결정 (E1~E4)

| # | 항목 | 확정 |
|---|---|---|
| E1 | 칼럼 대상 | `rubric.insight_eligible`이고 브리프 임계를 통과(tier ≠ null)했고 채점 total이 `essay.min_total` 0.60 이상이며(3단계 튜닝 2026-11-17, §7.2), 출처가 `text_rights: full`이고 `text_scope`가 abstract가 아니며, 추출이 실패하지 않았고, 본문이 `essay.min_source_chars` 2,000자 이상이며, 그 raw item으로 칼럼 초안을 쓴 적이 없는 후보 중 insight_potential → total 순 최상위 1건 |
| E2 | 하루 한도(KST) | 오늘 발행 칼럼 ≥ `caps.essays_per_day`(1)이면 건너뜀(`ESSAY_DAILY_CAP`), 오늘 생성 시도 ≥ `essay.max_attempts_per_day`(2)이면 건너뜀(`ESSAY_ATTEMPTS_EXHAUSTED`). 메모리 DB 행처럼 `created_at`이 없으면 시도로 세지 않는다 |
| E3 | QA | 브리프 hard 규칙 8개를 같은 임계로 적용, `THIN_EXPERT_LENS`는 브리프 전용(`content_types`), 새 soft `ESSAY_STRUCTURE`는 자동 통과 없음 → 위반 시 보류(`pending`) |
| E4 | 타임아웃 | `llm.timeout_ms` 90 s → 180 s(칼럼 응답 약 3.5k 토큰) |

### 6.2 구조

- **스위치**: `essay.enabled` / `CC_FLAG_ESSAY`(`packages/shared/src/config/flags.ts`, 스냅샷 `essay`). 스테이지 플래그가 아니다.
- **생성**: generate가 브리프를 다 쓴 뒤 `draftEssay`로 칼럼 1편을 시도한다(`stages/essay.ts`의 순수 함수 + `stages/generate.ts`). 결과는 `generateStats.essay`(`off|drafted|skipped|failed|budget_stopped` + 사유)이고, 비용·토큰은 합계에 들어간다. 초안은 `drafts`(content_type `insight_essay`, `body.essay`·`body.checks`(grounding·quote·banned·words·headings)·`body.source`)에 쓴다.
- **프롬프트**: `prompts/insight_essay.md`(version 2026-11-16.1, max_output_tokens 8000)는 `<!-- include: ../content/voice/josh_voice.md -->`·`<!-- include: ../content/templates/insight_essay.md -->` 줄로 보이스와 템플릿을 렌더링한다(`adapters/prompts/file.ts` `resolveIncludes`: 상대 경로·레포 안·1단계·front matter 제거). 보이스·템플릿을 바꾸면 프롬프트 version을 올린다. 사용자 메시지 = 소스 패킷 + 최근 칼럼 5편의 제목·소제목.
- **QA**: `qa/text.ts` `readerOf`가 브리프(`body.brief`)와 칼럼(`body.essay`)을 같은 모양(제목·필드·설명·출처명)으로 넘긴다. 브리프의 필드·순서는 3g와 같아 브리프 판정은 바뀌지 않는다(기존 테스트 전부 그대로 통과). `SCHEMA_INVALID`는 `InsightEssay`를 검증한다. 기사 간 제목(`DUPLICATE_EVENT`, `ESSAY_STRUCTURE`의 대조형 제목)은 브리프는 `normalize.published_window_days` 안의 칼럼 외 전부와, 칼럼은 기간과 무관하게 최근 칼럼 10편(`RECENT_ESSAYS`)과 비교한다(대조형 제목 규칙은 날짜가 아니라 연속 5편을 센다). 같은 사건을 브리프와 칼럼이 함께 다루는 것은 의도된 동작이기 때문이다.
- **`ESSAY_STRUCTURE`**(soft, qa 2026-11-16.1): 본문 `##` 절 2~3, 반론·관찰 각 `##`로 시작, 소제목 4~6, 소제목 모양(12단어·90자 이하, 끝 구두점 없음 = 사이트가 소제목으로 렌더링하는 조건), 은퇴 소제목, 단어 수(본문 750~1,400 · 절 140~330 · 전체 1,050~2,000 = 템플릿 범위 ± 약 5 %), `##` 외 Markdown, 말줄임표, 질문 첫 문장, "X is a Y, not a Z" 제목(직전 4편에 같은 형태가 있으면 실패).
- **이미지**: `imageSubjectOf` — 칼럼은 deck을 요약, thesis를 "why"로 써서 `prompts/image.md`를 그대로 쓴다.
- **발행**: `publicationFromEssay` → `publications` 행(slug `column/<제목 단어>-YYYY-MM-DD`(KST), content_type `insight_essay`, body = `deck`·`thesis`·`article_body`(본문+반론+관찰, `##` 표식을 뗀 소제목 줄)·`meta_description`(deck)·`headings`·출처 필드·checks·generation). 레거시 칼럼과 같은 모양이라 **사이트 코드 변경은 0**이다. 바이라인(Josh Jiwoon Inn)·AI 고지·`/column/` 목록·RSS·사이트맵은 기존 로직이 처리한다. 테스트가 사이트 렌더러를 실행해 소제목이 전부, 그리고 소제목만 h2가 되는지 확인한다.
- **운영 도구**: `pipeline review`(shadow-review)가 칼럼 전문(deck·thesis·세 절, 소제목은 `####`)·단어 수·소제목을 보여 준다(3단계 샘플 검토용). Telegram 요약에도 칼럼 제목이 나온다.

### 6.3 검증

- `npm run v2:typecheck` 0 errors · `npm run v2:test` **356/356**(신규: `essay.test.ts` 16, CLI 기준 샘플 1, review 1, flags 1) · `npm run v2:build` OK.
- **replay 기준 샘플**: `CC_FLAG_ESSAY=true CC_FLAG_STAGES_NORMALIZE=true CC_FLAG_STAGES_SCORE=true CC_FLAG_STAGES_GENERATE=true CC_FLAG_STAGES_QA=true CC_FLAG_STAGES_IMAGE=true CC_FLAG_PUBLISH_TARGET=staging npm run v2:pipeline -- run --dry-run --replay --fixture essay --sources fixtures/sources/essay.yaml --stage ingest,normalize,score,generate,qa,image,publish --json` → 1건(tier full, insight 0.975) → drafts 2(브리프 1 · 칼럼 1, 1,309단어 · 소제목 5) → QA 2 통과(verdict 26, 실패 0) → published 2(`news/…` · `column/in-northvale-…-<KST 날짜>`). `CC_FLAG_ESSAY` 없이 같은 명령은 칼럼 `off` · published 1.
- 기존 기준 샘플(scoring 3g: 초안 2 → 통과 1 · 거절 1, verdict 26 / 3h: published 1)은 값이 그대로다. 단 3g의 `qaStats.rules`는 13 → 14(`ESSAY_STRUCTURE` 포함)로 바뀌었다.
- CI(`rebuild-ci.yml`): 3g/3h replay 단계의 불변식 `verdicts = drafts × rules`는 `content_types` 뒤로 성립하지 않아(브리프는 `ESSAY_STRUCTURE` verdict가 없다) `verdicts = Σ by_rule.checked`(= 26)로 바꿨고, 3e replay 단계(초안 2 → QA 2 → 발행 2, `ESSAY_STRUCTURE` 통과 1)를 추가했다.

### 6.4 남은 위험·한계

- **근거 규칙의 엄격도**: `UNGROUNDED_ENTITY` 0건·`UNGROUNDED_NUMBER` 0건을 칼럼에도 그대로 적용한다. 분석 글은 원문에 없는 기관·지역명을 쓰고 싶어 하므로 거절이 많을 수 있다. 3단계 샘플에서 실측한 뒤 YAML로만 조정한다.
- **유사도 비율의 희석**: `SIMILARITY_TOO_HIGH`는 비율이라 1,300단어 칼럼에서는 붙여 넣은 문단이 희석된다. 복사는 `QUOTE_TOO_LONG`의 연속 20단어 상한이 막는다(테스트로 확인). 원문을 촘촘히 바꿔 쓴 표현은 브리프보다 덜 잡힐 수 있다.
- **스키마 하한**: 본문 4,500자 미만 응답은 호출 비용을 쓰고도 `SCHEMA_INVALID`로 버려진다(구조화 출력에서 길이 제약이 빠지기 때문).
- **dispatch 입력**: `pipeline.yml`의 workflow_dispatch 입력이 이미 10개다. 3단계에 쓸 `essay` 입력은 GitHub 입력 한도를 확인한 뒤 별도 소변경으로 넣는다(이 PR은 워크플로를 바꾸지 않는다).

## 7. 3단계 — staging 샘플 3편 (Josh "3단계 진행해", 2026-11-17)

- **샘플 모드**: E2 하루 한도(발행 1·시도 2)를 staging에도 그대로 적용하면 샘플 3편에 2~3일이 걸린다. 그래서 `CC_FLAG_ESSAY=sample`(`essay.sample`)로 staging 검토 런에서만 하루 한도를 푼다. 다음은 그대로다.
  - 런당 1편
  - 같은 raw item 재작성 금지
  - 런 예산 $2
  - production 발행 타깃이면 `ConfigError`로 거부
- **dispatch 입력**: `pipeline.yml`에 `essay`(`off|on|sample`, 기본 off)를 추가했다. 입력은 11개가 된다. 브랜치에서 비용 없는 fixture dry-run dispatch로 워크플로 유효성을 먼저 확인한다. schedule 런은 `CC_FLAG_ESSAY=false`로 고정이다(4단계 승인 전).
- **샘플 런**: 브랜치에서 dispatch 1회에 칼럼 최대 1편이 나온다.
  - 입력: `dry_run=false live=true stages_on=true publish_target=staging llm_provider=anthropic essay=sample notify=false`
  - 칼럼 후보가 없으면(`NO_ELIGIBLE_CANDIDATE`) 칼럼 없이 끝난다.
- **검토**: `shadow-review.yml`에 `run_id`를 넣어 칼럼 전문, QA 판정, 원문 발췌를 본다. 통과한 칼럼은 staging `publications`에 발행되고, staging을 읽는 프리뷰에서 렌더링된다.

### 7.1 결과 (2026-11-17)

| 런 | 결과 | 칼럼 | QA | 비용 |
|---|---|---|---|---|
| 43999241074 · 43999546544 | staging `fetch failed` → 원인 코드 로깅 뒤 `ENOTFOUND`(복구 직후 DNS) | — | — | $0 |
| 44001686797 | 칼럼 1편 | "The £12 billion Vanguard decision is a 2030 supply signal for UK site screens" (UK DESNZ, 1,583단어, 소제목 5) | hard 9 통과, 유사도 0.004, `ESSAY_STRUCTURE` 통과, soft 자동 통과 `RUBRIC_BELOW_TARGET`·`READABILITY_LOW` | 칼럼 $0.172 · 런 $0.29 |
| 44002228964 | 칼럼 1편 | "Britain's clean energy hiring drive chases the electricians data halls need" (UK DESNZ 채용박람회, 1,536단어) | hard 9 통과, 유사도 0.018, `ESSAY_STRUCTURE` 통과 | 칼럼 $0.183 · 런 $0.27 |
| 44002693147 | 칼럼 없음 | `NO_ELIGIBLE_CANDIDATE`(후보 186 중 자격 0) | — | 런 $0.07 |

관찰은 다음과 같다.

1. **보이스·구조**: 사실 문단 → 판단과 근거 경계 → 마일스톤 사다리 → 반론 양보 → 조건부 관찰 3개 순서가 템플릿대로 나온다. 1인칭은 판단에만 쓰였고 추론 표시가 명시적이다.
2. **주제 적합도**: 샘플 2는 원문에 데이터센터 언급이 없다(칼럼이 추론임을 명시). 채점 total이 0.556으로 브리프 임계 0.55 바로 위다.
3. **후보 공급**: 같은 풀에서 자격 후보는 2건이었고 둘 다 uk-desnz였다. 하루 1편 상한이면 날마다 1편이 나오지 않을 수 있다.
4. **문체 반복**: "The release"로 시작하는 문장이 5~7회다(soft `READABILITY_LOW`, 자동 통과).
5. **렌더링**: staging 프리뷰(`computecurrent-v2-preview`)에서 deck, Key argument, h2 소제목 5개, 바이라인, AI 고지, 출처가 그대로 나온다.

### 7.2 튜닝 (2026-11-17, Josh "계속 진행해줘")

§7.1 관찰 2·4에 대한 권고안을 반영했다. 되돌리려면 YAML 값을 0으로 내리거나 프롬프트 버전을 되돌리면 된다.

| 항목 | 변경 | 근거 |
|---|---|---|
| 주제 적합도 | `essay.min_total` 0.60(`EssayConfig`, `config/pipeline.yaml`). `essayIneligibility`가 `below_threshold` 다음에 `below_min_total`로 거른다 | 샘플 2(total 0.556, 원문에 데이터센터 언급 없음)는 빠지고 샘플 1(0.610)은 남는다 |
| 문체 반복 | `prompts/insight_essay.md` 2026-11-16.1 → **2026-11-17.1**: 출처 언급 위치와 호칭을 바꿔 쓰고, 같은 두 단어로 시작하는 문장을 3회 이하로 쓴다(`READABILITY_LOW`의 `max_same_opening 3`·`opening_words 2`와 같은 기준) | 샘플 1·2에서 "The release" 시작 문장이 5~7회 |
| 진단 | `generateStats.essay.ineligible`: 탈락 후보를 첫 실패 규칙별로 센다. `NO_ELIGIBLE_CANDIDATE` 사유 끝에 `(<규칙> <수>, …)` 꼴로 붙는다 | 샘플 3의 "186 중 0"은 왜 0인지 보여 주지 않았다 |

튜닝 후 샘플 런 44008702867(`6604255d`, 03:14Z)은 칼럼 없이 끝났다($0). 직전 런 뒤 50분 동안 새 항목은 7건이었고, 후보 186건 중 브리프 임계를 넘은 것은 1건이었다. 칼럼 탈락 사유는 not_insight_eligible 180, below_threshold 5, below_min_total 1이다.

이것은 연속 런으로 staging 풀이 소진된 결과로 본다. 남은 후보는 대부분 48시간이 넘은 항목이라 timeliness가 0.06이다(가중 0.2). 같은 항목이 schedule 런에서 신선할 때(3~8시간, 0.75~1.0) 채점되면 total이 약 0.14~0.19 높다. 샘플 1(Vanguard)은 오래된 상태에서 0.610이었다. 그래서 schedule 런의 칼럼 후보 공급은 staging 샘플이 보여 준 것보다 많을 것이다(추정, 미측정). 4단계 뒤 `eligible`·`ineligible`을 1주 보고 판단한다. 프로덕션 schedule 12런(11/12~11/16)의 풀은 브리프 임계 통과가 1~9건, insight_eligible이 6~13건이었다(교집합은 로그에 없음).

프롬프트 2026-11-17.1은 아직 라이브 칼럼으로 확인하지 못했다. 같은 raw item은 다시 쓰지 않으므로 새 자격 후보가 있어야 한다.


## 8. 4단계 — schedule 런 칼럼 활성 (Josh "A안 승인, PR #104 머지하고 4단계 진행해", 2026-11-17)

이 승인은 §7 샘플 품질 승인(D3)을 겸한다. PR #104는 `1549c9e7`로 머지됐다.

- **변경**: `.github/workflows/pipeline.yml`의 `CC_FLAG_ESSAY`가 schedule 런에서 `true`다. dispatch는 그대로 `essay` 입력(off/on/sample)을 따른다. `config/pipeline.yaml`의 `essay.enabled`는 파일 기본값 `false`로 둔다(replay 테스트·CI가 칼럼을 쓰지 않도록).
- **동작**: 하루 세 번(00:45·08:45·16:45 KST) 프로덕션 런마다 브리프 뒤에 칼럼 자격 후보를 찾는다(E1). 하루 발행 1편·생성 시도 2회(E2)가 상한이다. QA를 통과하면 자동 발행되고(D3), `ESSAY_STRUCTURE` 위반은 보류(`pending`)로 남는다.
- **비용**: 칼럼 1편에 약 $0.17~0.18이 든다. 시도 상한 때문에 하루 최대 약 $0.36이고, 런 예산 `budget.run_usd` $2.0 안이다.
- **관찰 (1주)**: 런마다 `generateStats.essay`의 `outcome`·`eligible`·`ineligible`과 Telegram 요약을 본다. 공급이 부족하면 두 가지를 판단한다. 하나는 `config/scoring.yaml` `insight_trigger` 0.7 → 0.6이고, 다른 하나는 `text_rights: full` 소스 추가(현재 82개 중 29개)다.
- **보류 칼럼 검토**: `shadow-review.yml`을 `target=production status=pending`으로 dispatch한다.
- **되돌리기**: `pipeline.yml` 1줄을 되돌리는 PR이다(스케줄 변경 = 승인 항목). 발행된 칼럼은 `publications.status`로 비공개 처리한다.

### 8.1 첫 production 칼럼 시도 (2026-11-17, Josh "수동으로 production 런 한 번 돌려줘, essay on")

07:45Z cron은 15:12Z까지 시작되지 않았다(GitHub cron 지연·누락). 그래서 Josh 지시로 `pipeline.yml`을 수동 dispatch했다. 입력은 `dry_run=false live=true stages_on=true publish_target=production llm_provider=anthropic essay=on notify=true`, main `c1a2ae59`다.

- **런 44111671329**(`e3089069`): `partial`, 3분, $0.31.
  - 브리프 2편 중 1편 발행(`/news/8c10a914c6a5e32f/`), 1편은 `UNGROUNDED_ENTITY`로 거절됐다.
  - 칼럼은 `ec-press-corner`(EU State aid 공공 대출 보증 규정 협의) 후보로 시도했으나 실패했다. `SCHEMA_INVALID: reply is not JSON (7272 chars, stop_reason max_tokens)`.
  - 칼럼 호출 수치: input 11,782 · output **8,000**(= `max_output_tokens`) · 약 94초 · $0.207.
- **원인 1 — 토큰 상한**: `max_tokens`에는 사고(adaptive thinking)와 답이 함께 들어간다. staging 샘플 2편은 비용으로 역산하면 출력이 약 6,200~6,800토큰으로 상한 8,000에 가까웠다. 이번에는 사고가 길어 답이 7,272자에서 잘렸다.
- **원인 2 — 비용 가드 구멍**: 실패한 생성은 초안 행 없이 dead letter만 남긴다. 그래서 `max_attempts_per_day`(E2)에 세지지 않았다. 고치지 않으면 다음 schedule 런마다 같은 후보를 다시 시도하고, 매번 약 $0.21을 쓰고 실패할 수 있었다.
- **수정**:
  - `prompts/insight_essay.md` `max_output_tokens` 8000 → **12000**. 규칙·문체는 그대로라 버전은 올리지 않았다.
  - `llm.timeout_ms` 180000 → **240000**. 약 85토큰/초 기준으로 12,000토큰이면 약 140초다.
  - `essayHistory`가 오늘(KST)의 칼럼 dead letter(`dead_letters`, stage generate, `payload.content_type = insight_essay`)를 `attemptsToday`에 더한다. 실패한 raw item은 `essayed`로 표시하지 않으므로 다음 날 다시 시도할 수 있다.
  - 칼럼 1회 최악 비용은 $0.29(input $0.05 + output 12,000 × $20/M)이고, 하루 최대 약 $0.58이다.

### 8.2 첫 production 칼럼 발행 (2026-11-17, Josh "머지 후 수동런으로 바로 확인해")

PR #106을 merge `8eea5c7e`로 머지했고, 배포 `dpl_EqCBE26d…`는 READY다. 같은 입력으로 수동 dispatch를 한 번 더 돌렸다.

- **런 44113712308**(`069c7a16`, main `8eea5c7e`): `partial`, 3분, $0.27. `partial`은 수집 실패 2건(fierce-network HTTP 403, acer-news 미도달) 때문이다.
  - 새 항목 1, 후보 184, 브리프 임계 통과 8이었다. 발행은 3편으로, 브리프 2편과 **칼럼 1편**이다.
- **칼럼**: "Europe's AI dividend arrives as equipment exports while its own build costs rise"
  - 주소: `/column/europe-s-ai-dividend-arrives-as-equipment-exports-while-its-own-2026-11-18/`
  - 원문: `ec-press-corner` `speech_26_2470`, EU 2026 가을 경제전망 발표 발언이다.
  - 분량: 1,482단어(본문 969, 반론 235, 함의 214), 소제목 5개.
  - 생성: 프롬프트 2026-11-17.1, output 6,386토큰(`end_turn`, 상한 12,000 안), 약 70초, $0.171.
- **QA**: hard 규칙은 모두 통과했다. 유사도 0.015, 숫자 18개가 모두 근거가 있었고 미근거 고유명사는 0개였다. `ESSAY_STRUCTURE`도 통과했다. soft 자동 통과는 두 가지다.
  - `READABILITY_LOW`: "The Commission"으로 시작하는 문장이 4회로 상한 3을 넘었다. 샘플의 "The release" 5~7회보다 줄었다.
  - `RUBRIC_BELOW_TARGET`
- **사이트**: www에서 200으로 열린다. 제목·deck, 섹션 표시 "The Current", 바이라인(Josh Jiwoon Inn), Key argument, h2 소제목 5개, 출처(European Commission, 2026-11-17), AI 고지가 모두 나온다.
- **KST 11/18 한도**: 발행 1/1, 시도 2/2(앞선 `max_tokens` 실패 1 + 이번 1)다. 이 날은 칼럼을 더 쓰지 않는다.
- **cron**: 07:45Z 슬롯은 15:23Z에도 시작되지 않았다. 첫 schedule 칼럼 런 확인은 다음 슬롯으로 넘긴다.

### 8.3 칼럼 대표 이미지 (2026-11-17, Josh "새로운 신규 이미지를 생성해서 붙여주세요")

**왜 이미지가 없었나**
- production 런은 생성 이미지를 올릴 호스팅이 없다. 그래서 정적 플레이스홀더(`/images/placeholder-brief.svg`, `placeholder: true`)를 기록한다(§3f, Phase 5 Codex PR #86).
- 사이트 `displayImage`는 플레이스홀더를 보여 주지 않는다. 그래서 첫 칼럼은 이미지 없이 나갔다.
- 레거시 칼럼 12편은 이미지 파일을 레포 `apps/site/public/generated/articles/<dir>/hero.webp`(1536×864 webp)에 커밋했고, 행의 `image.path`가 그 파일을 가리킨다. 이미지는 ChatGPT 이미지(`imageProvider: codex`)로 만들었다.

**이번 칼럼에 붙인 이미지**
- **생성**: Higgsfield MCP, `gpt_image_2_6`, 16:9 1536×864, quality high, 2.75 크레딧, job `b74a2150`.
- **장면**: 수출 부두에 포장된 변압기·배전반·냉각 모듈, 물 건너편에 짓다 만 데이터센터 골조. 글자·로고·사람은 없다. 프롬프트는 `prompts/image.md` 제약을 따랐다.
- **파일**: `apps/site/public/generated/articles/column-europe-s-ai-dividend-arrives-as-equipment-exports-while-its-own-2026-11-18/hero.webp`(webp q82, 154 KB).
- **연결 도구**: `packages/pipeline/tools/set-publication-image.ts`와 워크플로 `.github/workflows/publication-image.yml`.
  - 파일이 체크아웃에 있는지 확인한 뒤 slug로 찾은 행의 `image`만 바꾸고, 다시 읽어 확인한다.
  - production apply는 confirm `image approved` + `CC_ALLOW_PRODUCTION_PUBLISH`가 필요하다.
  - 순서: 파일 커밋 → main 배포 READY → dispatch apply. 순서가 바뀌면 깨진 이미지가 보인다.
- **세션 환경**: 개인 환경 `ai-news-portal`에서 Higgsfield CDN 호스트(`d8j0ntlcm91z4.cloudfront.net`)를 허용했다. 생성된 파일을 받기 위해서다.

**다음 런부터 자동 이미지 (설계, 승인 대기)**
- **생성기**: 파이프라인에는 OpenAI 이미지 어댑터(`image.provider: openai`, `gpt-image-2`, 1536×1024 webp, `image.pricing` $0.07)가 이미 있다. `ctx.fetch`로 호출하고 테스트도 있다. `pipeline.yml`이 `OPENAI_API_KEY` 시크릿을 이름으로 넘긴다(등록 여부는 미확인).
  - Higgsfield를 Actions에서 부르려면 별도 HTTP API 키와 어댑터가 필요하다. 문서 호스트(docs.higgsfield.ai)는 세션에서 막혀 있어 API 스펙을 확인하지 못했다.
- **호스팅**: 어느 생성기를 쓰든 생성 파일을 서빙할 곳이 필요하다. 후보는 셋이다.
  - (a) Supabase Storage 공개 버킷(기존 서비스, 버킷 생성 = 마이그레이션 승인 항목)과, 사이트에서 같은 도메인으로 서빙하는 `/media/...` 프록시 라우트.
  - (b) Vercel Blob(새 서비스 연결 = 승인 항목).
  - (c) 파이프라인이 이미지를 레포에 커밋하는 방식. main 자동 push라 쓰지 않는다.
- **범위**: 칼럼만이다. 브리프는 지금처럼 플레이스홀더로 두어 비용을 키우지 않는다(칼럼 하루 최대 1편 × 이미지 1장).

### 8.4 칼럼 이미지 자동 생성 (2026-11-18, Josh "머지 승인을 한다. 이미 선택 권고안 대로 진행해")

PR #107은 merge `e47bba1e`로 머지됐고 배포 `dpl_E8mtJSAY…`는 READY다.
- `publication-image.yml` production apply(런 44244625759)가 첫 칼럼 행의 `image`를 Higgsfield 파일로 바꿨고, 다시 읽어 확인했다(`verified: true`).
- www 칼럼 페이지에 `<figure class="article-hero">`와 `og:image`가 나온다.

이어서 권고안을 구현했다. 생성기는 OpenAI `gpt-image-2`, 저장은 Supabase Storage와 사이트 `/media`, 대상은 칼럼만이다.

| 부분 | 내용 |
|---|---|
| 체인 | `image.essay`(`ImageChainConfig`)가 있으면 insight_essay가 그 체인을 쓴다. 브리프는 기본 체인(플레이스홀더)이다. `ImageRequest.content_type`, `ImageChain.orderFor(contentType)`, 스테이지는 초안마다 체인을 고른다. |
| 플래그 | `CC_FLAG_ESSAY_IMAGE=openai`(빈 값은 무시, 스냅샷 `essay_image`). `pipeline.yml`은 schedule 런과 `dry_run=false`·`llm_provider=anthropic`·`essay≠off` dispatch에만 `openai`를 준다. 그 밖(replay·CI·fixture)은 `placeholder`다. |
| 저장 | `image.storage { kind: supabase, bucket: article-images, public_path: /media }`. served 런은 그 런의 Supabase 클라이언트(service role, 새 시크릿 없음)로 공개 버킷을 첫 사용 때 만들고(이미지 MIME만, 10 MB), `<slug>/<variant>-<sha256 10자>.<ext>`로 올린다. 행 경로는 `/media/<key>`다. 플레이스홀더 SVG는 거절해 정적 플레이스홀더로 남긴다. `kind: none`이면 예전처럼 정적 store를 쓰고 유료 공급자를 체인에서 뺀다. |
| 사이트 | `apps/site/src/pages/media/[...path].ts` + `src/lib/media.ts`. 키 모양(영숫자·`._-` 세그먼트 8개 이하, webp/png/jpg)과 `SITE_DATA_SOURCE=supabase`·https `SUPABASE_URL`일 때만 `<SUPABASE_URL>/storage/v1/object/public/<bucket>/<key>`를 가져온다. 응답은 `cache-control: public, max-age=31536000, immutable`이고, 그 밖은 404다. 버킷 이름은 `MEDIA_BUCKET`(선택, 기본 `article-images`)이라 Vercel 환경 변수를 바꿀 필요가 없다. |
| 키 없음 | 칼럼 체인만 openai인데 `OPENAI_API_KEY`가 없으면 `IMAGE_KEY_MISSING`으로 플레이스홀더를 쓰고 `IMAGE_MISSING`(soft, 자동 통과)을 남긴다. 런과 브리프는 그대로 간다. 기본 체인에 openai를 두면 예전처럼 시작 시 `ConfigError`다. |
| 비용 | 칼럼 1편당 이미지 1장, `image.pricing gpt-image-2` $0.07(ADR-007 추정 — Josh 확인 필요)이다. 하루 칼럼 상한 1편이라 하루 최대 약 $0.07~0.14다. |

### 8.5 Higgsfield 칼럼 이미지 (2026-11-19, Josh "A안 승인")

**왜 이 경로인가**
- OpenAI Images API는 API 키만 받는다(OAuth 없음). `OPENAI_API_KEY` 시크릿이 없어서 `pipeline.yml`은 칼럼에도 플레이스홀더를 준다(PR #108).
- Higgsfield는 Claude 커넥터(OAuth)로 이미 연결돼 있지만 Actions에서 부를 API 키는 없다. 그래서 생성은 Claude 예약 작업이 하고, 저장과 행 연결은 Actions 워크플로가 한다.
- 승인 범위(Josh "A안 승인"): 이 PR 머지, 반복 예약 작업 생성, 그 작업의 production 이미지 쓰기(confirm `image approved`)를 상시 승인으로.

**흐름**
1. 예약 작업이 `publication-image.yml`을 `target=production mode=list-missing`으로 dispatch한다. 잡 로그의 JSON `missing[]`(slug·title·deck·thesis·tags)을 읽고, 비어 있으면 끝낸다.
2. 칼럼마다 Higgsfield `generate_image`를 부른다: `gpt_image_2_6`, 16:9, `1536x864`, resolution `2k`, quality `high`, webp. 프롬프트는 아래 규칙을 따른다.
3. `target=production mode=apply slug=<slug> source_url=<CDN URL> alt=<한 문장> provider=higgsfield model=gpt_image_2_6 prompt=<프롬프트> confirm="image approved"`로 dispatch한다.
4. 워크플로가 URL을 받는다(허용 호스트, 리다이렉트 거부, 10 MB, magic bytes). 버킷 `article-images`에 `<slug>/hero-<sha256 10자>.webp`로 올리고, 행을 `/media/<key>`로 바꾼 뒤 다시 읽어 확인한다(`verified: true`).
5. 사이트는 ISR 만료(300 s) 뒤 대표 이미지와 `og:image`를 보여 준다.

**프롬프트 규칙** (첫 칼럼 이미지와 같은 결, `prompts/image.md` 제약)
- "Photorealistic editorial hero image for an article on <주제>."로 시작하고, 칼럼 thesis를 하나의 물리적 장면(설비·부지·송전·냉각·건설 현장 등)으로 옮긴다. 은유는 장면 안의 사물로만 표현한다.
- 16:9 넓은 구도, 주 피사체 하나, 카드·OpenGraph 크롭을 위한 차분한 여백, 자연광, 다큐멘터리 산업 사진 톤.
- 금지: 로고·브랜드·읽히는 글자·숫자·워터마크·사람·국기·보케 장식·보라색 그라데이션.
- alt는 장면을 영어 한 문장으로 쓴다.

**설정·코드**
- `config/pipeline.yaml` `image.import { allowed_hosts: [d8j0ntlcm91z4.cloudfront.net], max_bytes: 10485760, timeout_ms: 30000 }`(스키마 `ImageImportConfig`, contracts 개정 15). 파이프라인 런은 이 값을 읽지 않는다.
- `set-publication-image.ts`
  - `--source-url`: `checkSourceUrl`·`downloadSourceImage`·`sniffImageMime`·`plannedImportPath`·`storeSourceImage`. 행을 먼저 읽어(`planImage`) slug가 틀리면 아무것도 올리지 않는다. dry-run은 받고 검사만 한다. 저장 경로가 계획과 다르면 `IMAGE_STORE_PATH_MISMATCH`.
  - `--list-missing`: `listMissingImages`·`needsImage`. 이미지가 없거나 플레이스홀더인 최신 파이프라인 칼럼(`legacy_id` 없음, 최신 50편 중 최대 `--limit`)만 고른다. 레거시 칼럼은 건드리지 않는다.
  - 로그는 stderr, stdout은 JSON 결과만이다.
- 워크플로: `mode`에 `list-missing` 추가, `source_url` 입력 추가, `slug`·`path`·`alt` 필수 해제(도구가 검사), `run-name`에 target·mode·slug.

**한계**
- 파일 크기: Higgsfield 2k high webp는 약 1.4 MB다(첫 칼럼 원본 1,397,026 바이트). 재압축하려면 `sharp`(lockfile에 astro의 optional 의존성으로 이미 있음)를 `packages/pipeline` 의존성으로 선언해야 하고, 이는 패키지 추가 승인 항목이다. `/media`는 immutable 캐시라 첫 요청 뒤에는 CDN이 내준다.
- 예약 작업은 Higgsfield·GitHub 도구가 있는 Claude 세션에 묶인다. 그 세션이 끝나면 작업도 멈춘다. 그때는 `list-missing`으로 밀린 칼럼을 확인하고 같은 절차를 손으로 돌린다.
- 비용: Higgsfield 크레딧 장당 2.75(2k high). 칼럼은 하루 최대 1편이다.

### 8.6 staging 샘플 4 (2026-11-20, Josh "2·3 승인, 반영하고 샘플 1회 더 돌려")

권고 2·3(11/17 반영: `min_total` 0.60, 프롬프트 2026-11-17.1)을 실제 칼럼으로 처음 확인했다. 런 44692207005(main `71cf6d99`, staging, `essay=sample`, $0.34).

| 항목 | 결과 |
|---|---|
| 칼럼 | Epoch AI 분석 "Anthropic's S-1 commitments point to a slower curve and one heavy counterparty", 1,524단어, 소제목 5, $0.25 |
| 권고 2 (주제 적합도) | total 0.611로 `min_total` 통과. AI 컴퓨트 수요·거래상대방 집중을 용량 공급자·대주 관점으로 다뤄 주제가 맞다 |
| 사실 검사 | 숫자 22/22 근거, 인용 최장 18단어, 금지어 0, `ESSAY_STRUCTURE` 통과 |
| 거절 | `UNGROUNDED_ENTITY` "Anthropic Direct TPU" — 원문은 "Anthropic Direct"와 "TPUs". 규칙은 초안 복수 → 원문 단수만 맞추고 반대 방향은 맞추지 않았다(오탐) |
| 권고 3 (문체) | "Epoch AI"로 시작하는 문장 8회(`max_same_opening` 3, soft 자동 통과). 출처명 시작은 규칙이 막지 못했다 |

Josh "1·2 승인, PR 올리고 샘플 다시 돌려"로 두 가지를 고쳤다(tuning-log 11).
1. `UNGROUNDED_ENTITY`(qa 2026-11-20.1): 이름 안의 약어 단수가 원문 복수로도 근거 확인된다. 약어도 원문 어느 쪽 형태에도 없으면 그대로 실패한다(테스트).
2. 칼럼 프롬프트 2026-11-20.1: `source_name`으로 시작하는 문장은 최대 2개, 나머지는 문장 안·끝 귀속이나 서술형 호칭("the analysis", "its authors"). 반환 전 같은 두 단어 시작 문장 수를 세어 고친다.

같은 raw item으로는 칼럼을 다시 쓰지 않으므로, 확인 샘플은 다른 후보로 나온다.
