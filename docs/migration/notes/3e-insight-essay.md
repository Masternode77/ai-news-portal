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
8. **플래그**: `flags.stages.essay`(기본 false)와 `CC_FLAG_STAGES_ESSAY`. cron에서 켜는 것은 4단계(스케줄 활성) 승인 항목이다.
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
