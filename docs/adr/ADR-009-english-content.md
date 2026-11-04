# ADR-009 — 모든 기사를 영어로 발행한다

- 상태: Accepted
- 날짜: 2026-11-04
- 결정: Josh — "모든 기사는 반드시 영문으로 해야 해. 우리의 타깃 고객은 영미권 국가 독자들이다."
- 세부 결정(같은 날 AskUserQuestion):
  - 기존 한국어 브리프는 영문으로 재생성하고 같은 URL을 유지한다. QA를 통과하지 못하면 비공개로 돌린다.
  - 전환 PR이 머지되기 전까지 cron은 계속 발행한다. 그 사이에 나온 한국어 브리프도 같은 방식으로 재생성한다.
  - 편집 관점은 글로벌을 기본으로 한다. 원문이 뒷받침할 때만 APAC·한국 시각을 더하고, 이것을 차별점으로 삼는다.
- 관련: ADR-004(QA 게이트), ADR-005(발행 경로), `REBUILD_BRIEF.md` Appendix A(`news_brief`·`insight_essay` 필드). 그 필드 정의 가운데 언어(`*_ko`)는 이 ADR로 대체된다.

## Context

리빌드 브리프는 한국어 `news_brief`를 전제로 짜였다. 그래서 언어가 프롬프트 한 곳이 아니라 다섯 층에 묶여 있었다.

| 층 | 묶인 내용 |
|---|---|
| 스키마 | `title_ko`·`summary_ko`·`why_it_matters_ko`·`expert_lens_ko`, 3e `*_ko` |
| 프롬프트 | 한국어 system prompt, 한국 독자 관점 |
| QA | `LANG_MISMATCH`가 한글 비율 0.6 미만을 hard로 거절 |
| 금지어 | 프롬프트에 한국어 목록만 렌더링 |
| 사이트 | 기사 본문 `*_ko` 키, `lang="ko"`, 한국어 RSS |

사이트 UI는 이미 영어였다(2026-11-03 디자인 D3). 발행된 브리프는 2026-11-04 기준 약 13~15건이고, 이관한 레거시 12건은 영어다.

## Decision

1. **출력 언어는 영어(미국식 철자)다.** 소스 언어는 바꾸지 않는다. 한국어 소스(etnews 등)는 계속 수집하고 영어로 재서술한다. 한국 시장 정보는 영미권 독자에게 우위가 된다.
2. **필드 이름을 언어 중립으로 바꾼다.**
   - `NewsBrief`: `title`·`summary`·`why_it_matters`·`expert_lens`. 길이 하한·상한은 영어 기준으로 다시 잡았다(요약 300~2,400자 등).
   - `InsightEssay`: `title`·`thesis`·`body`·`counterpoint`·`implications`. 3e 착수 전이라 데이터가 없다.
   - 이 전환 전에 쓴 초안·발행 행은 `*_ko` 키를 가진다. `storedBriefField()`(`@cc/shared`)와 사이트 렌더러가 두 키를 모두 읽는다. 새 행은 영어 키로만 쓴다.
3. **프롬프트** `prompts/news_brief.md` 2026-11-04.1을 영어로 다시 썼다(2026-11-04.2: 원문에 없는 상위 지역명으로 넓히지 않는다 — staging 정탐 "Midwest", tuning-log 7행). 사실 권위·재서술 규칙은 그대로다. 다음을 더했다.
   - 한국어 수치는 값을 유지한 채 영어 표기로 쓴다(3억 600만 달러 → $306 million).
   - 한국어 고유명사는 원문의 라틴 표기 → 공식 영문명 → 표준 로마자 순으로 쓴다.
   - 한글은 쓰지 않는다.
   - 제목은 sentence case로 쓴다.
4. **QA**(`config/qa.yaml` 2026-11-04.1 → .2: 첫 staging 런의 영어 토큰화 오탐 반영, tuning-log 6행)
   - `LANG_MISMATCH`: `language: en, min_ratio: 0.98`로, 라틴 문자 비율을 본다.
   - `UNGROUNDED_ENTITY`:
     - 문장 첫 단어의 평범한 대문자(`Operators`)와 달력 단어는 고유명사로 보지 않는다.
     - `unchecked_source_languages: [ko]`: 한국어 소스의 로마자 고유명사는 기록만 하고 검사하지 않는다. 문서화된 한계이며, 숫자는 계속 대조한다.
     - `allow`에 지역 단어 `Asia-Pacific`·`Asia`·`Southeast Asia`·`Southeast Asian`을 넣었다(APAC 관점용).
     - 한 글자 관사("A")도 문장 첫 단어로 보고, 소문자 하이픈 접미어("Brussels-run", "AI-era")는 이름에서 뗀다.
   - 고유명사 추출이 마침표를 넘어 이어 붙던 결함("Monday. Delivery")을 고쳤다. 영어 본문에서 처음 드러났다.
   - `SEO_FIELDS_MISSING` 제목 상한은 90자, `THIN_EXPERT_LENS`는 문장 첫 단어를 구체 토큰으로 세지 않는다.
   - 영어 원문을 영어로 재서술하면 `QUOTE_TOO_LONG`·`SIMILARITY_TOO_HIGH`가 실질적으로 작동하기 시작한다. 임계값은 그대로 두고 staging에서 통과율을 잰다.
5. **금지어**(`config/banned-phrases.yaml` 2026-11-04.1): 프롬프트는 영어 목록과 금지 첫머리를 보여 준다. `unsourced_attribution_en`을 추가했다. 한국어 항목은 계속 검사한다.
6. **사이트**: 기사 본문은 영어 키로 렌더링하고, `*_ko` 키도 계속 렌더링한다. `/rss.xml`은 영어 피드다. `/ko/rss.xml`은 보존 URL이라 200을 유지하며 같은 영어 항목을 내보낸다. 푸터의 "Korean RSS" 링크는 뺐다.
7. **기존 한국어 브리프**: `pipeline regenerate`가 처리한다(워크플로 `.github/workflows/regenerate-briefs.yml`).
   - 대상: 제목에 한글이 있는 발행 브리프, 최신순.
   - 방법: 저장된 원문(raw item)에서 generate → qa → image → publish를 다시 돌려 같은 slug 행을 덮어쓴다. id와 첫 `published_at`은 유지한다.
   - QA 실패는 `unpublished`로 돌린다.
   - 처리하지 못한 건(생성 오류·예산 소진)은 그대로 두고 다음 실행이 다시 집는다.
   - 원장 행에 `flags.mode = "regenerate"`를 남긴다. `pipeline ops`는 이 행을 주기 런으로 세지 않는다.
   - 프로덕션 실행은 승인 항목이다. confirm 문구 `ADR-009 approved`와 `CC_ALLOW_PRODUCTION_PUBLISH`가 둘 다 필요하다.

## Consequences

- 같은 원문을 같은 언어로 재서술하므로 표절 방지 규칙이 거절을 더 많이 낼 수 있다. 첫 staging 런에서 통과율을 측정하고, 필요하면 프롬프트를 보정한다(`version` 상승).
- 한국어 소스 기사의 고유명사 환각은 QA가 잡지 못한다. 숫자 grounding과 프롬프트 규칙이 남은 방어선이다(문서화된 한계).
- `publications.search`(0001 마이그레이션)의 FTS 식은 `body ->> 'summary_ko'`를 본다. 현재 이 식을 쓰는 코드가 없어 마이그레이션은 하지 않았다. 검색을 도입할 때 `summary`로 바꾸는 마이그레이션이 필요하다(승인 항목).
- 3e(`insight_essay`)는 영어로 쓴다. 보이스 샘플이 한국어여도 되지만, 템플릿과 보이스 문서는 영어 출력 기준으로 작성한다.

## Rejected alternatives & why

- **키는 `*_ko`로 두고 내용만 영어로 쓴다**: 변경이 가장 작다. 하지만 이름이 내용을 거짓으로 설명하게 되고, 3e가 같은 혼동을 물려받는다. 3e 착수 전인 지금이 바꾸기 가장 싼 때다.
- **영어·한국어 이중 발행**: 독자가 영미권이라 한국어판의 가치가 낮다. 생성 비용은 두 배가 되고, QA·URL·SEO(hreflang) 표면도 두 배가 된다.
- **기존 한국어 브리프 비공개 처리**: 비용과 시간은 가장 적다. 하지만 Josh가 URL 유지를 택했다.
