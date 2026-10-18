# ADR-004 — QA 게이트 설계

- 상태: Proposed (Josh 사전 결정 2026-10-18: 링크 전용 소스의 재서술 허용, 연속 인용 ≤20단어·출처 필수)
- 날짜: 2026-10-18
- 관련: ADR-003(`qa_results`), ADR-007(튜닝 로그), 브리프 Appendix B, R2·R5·R6, `AGENTS.md` Editorial Rules

## Context

Phase 0 실측(`docs/diagnosis/02-funnel.md` §3·§7, `04-verdict.md`):

- 7단 fail-closed 스택이 코드 8파일에 분산돼 있고(`scripts/lib/{relevance-classifier,source-extraction-fail-closed,quality-gate,expert-insight-engine,expert-lens,repetition-detector,final-publication-integrity,authored-column-policy}.mjs`), 임계값 일부만 env로 노출된다.
- 채점 108건 → relevance 통과 4(3.7%) → 초안 2 → 리더 페이지 0. 탈락 사유의 100%가 `infrastructure_relevance_below_signal_threshold`와 `expert_insight_missing_fields`에 집중. 재분류 drift 0 → 설계된 임계값과 입력의 불일치.
- 컬럼 레인: 120런 중 발행 4, 플로어(insight density 0.78→0.75, 사람다움 0.84, 섹션 ≥4, 수치 100% claim ledger 일치)가 하루에 3번 조정됐다.
- 10-11 하루 reader-copy 게이트 fix 26건: 규칙이 코드이므로 오탐 수정이 곧 배포였다.
- 확정 결함 D2: `bannedPhraseMatches()` 객체에 `.length` 검사(`scripts/lib/authored-column-policy.mjs:211-212`) → 금칙어 검사 미작동.
- 재사용 가치(`05-preserve-list.md` §4): 금칙어 YAML 4종, 저작권 안전 변환 정책(단락 중복 0.22, 문장 재사용 0.15), 추출 fail-closed 규칙, claim ledger·수치 검증, 반복 탐지 임계값.
- Josh 결정: 링크 전용 매체 52개를 `news_brief`(원문 재서술 + 출처 링크) 소재로 허용. 따라서 인용·유사도 게이트가 **hard**여야 한다.

## Options

### A. 현행 7단 스택을 그대로 이식 (임계값만 env)

- 장점: 검증된 규칙.
- 단점: 규칙이 코드에 묶여 R5·R6 미충족, hard/soft 구분 없음, 오탐 수정 = 코드 배포, 판정 저장 없음.

### B. hard/soft 2층 + 1규칙 1파일 + 설정 임계값 + 판정 영속 (결정)

- Appendix B 그대로. 각 규칙은 `qa/rules/<RULE>.ts` 한 파일, `{rule, severity, pass, reason_code, evidence}` 반환, 임계값은 `config/qa.yaml`.
- 장점: R5(규칙 추가 = 파일 1개), R6(모든 판정에 reason_code + `qa_results`), Phase 4 튜닝이 설정 변경만으로 가능.
- 단점: 규칙 간 순서·의존(예: 추출 QA 통과 후에만 수치 검증)을 러너가 관리해야 함.

### C. LLM-judge 단일 게이트

- 장점: 구현 단순.
- 단점: 비결정적(R7 위반), 설명 가능성 낮음(R6), 비용 증가.

## Decision

**B.** 규칙 카탈로그(초기 임계값은 Phase 0 실측·현행 설정에서 가져오고 Phase 4에서 튜닝):

### Hard (실패 시 reject, `candidates.reject_reason` 또는 `qa_results`)

| reason_code | 적용 단계 | 초기 기준 | 출처(현행) |
|---|---|---|---|
| `SCHEMA_INVALID` | draft 직후 | zod `NewsBrief`/`InsightEssay` 파싱 실패 | 신규 |
| `SOURCE_UNREACHABLE` | ingest/extract | 출처 URL HEAD/GET 실패(재시도 2회), 추출 본문 < 500자 | `source-extraction-fail-closed.mjs:7-8` (500/1200) |
| `EXTRACTION_CONTAMINATED` | extract | 보일러플레이트 비율 > 0.08, 관련기사 오염, 문장 완성도 < 0.92 | `source-extraction-fail-closed.mjs:33-115` |
| `QUOTE_TOO_LONG` | qa | 원문과 연속 일치 > 20단어, 또는 인용 2회 이상 | 신규 (Josh 결정) |
| `SIMILARITY_TOO_HIGH` | qa | 단락 중복 > 0.22 또는 문장 재사용 > 0.15 | `config/copyrightSafeTransformationPolicy.yml` |
| `UNGROUNDED_NUMBER` | qa | 초안 수치가 출처 본문 또는 claim ledger에 없음 | `unsupported-claim-guard.mjs:15`, `numeric-claim-verifier.mjs` |
| `UNGROUNDED_ENTITY` | qa | 출처에 없는 고유명사(회사·인물) | `source-fidelity-claim-check.mjs` |
| `DUPLICATE_OF_PUBLISHED` | dedupe | canonical_url 일치, 또는 제목 유사도 ≥ 0.85 + 7일 내 발행본 | `normalize.mjs:77-80`, `repetition-detector.mjs` |
| `DATE_INVALID` | ingest | 출처 발행일 미래 또는 파싱 불가, 또는 > `pool_max_age_days` | `fetch-feeds.mjs` 10일 창 |
| `LANG_MISMATCH` | qa | `*_ko` 필드의 한글 비율 < 0.6 | 신규 |
| `BANNED_PATTERN` | qa | `config/bannedPhrases.yml` 등 4종 매치 | `banned-phrases.mjs:49` (객체 반환 → 배열로 재설계) |
| `RIGHTS_VIOLATION` | select | `sources.text_rights=link_only`인데 본문 사용 시도(재서술 모드 아님) | `source-registry.mjs:113-135` |
| `BUDGET_EXCEEDED` | generate | 런 누적 비용 ≥ 상한 | ADR-007 |

### Soft (flag + human-review 큐, `config/qa.yaml`의 `auto_pass`로 자동 통과 가능)

| reason_code | 초기 기준 | 출처 |
|---|---|---|
| `RUBRIC_BELOW_TARGET` | 편집 루브릭 합계 < 70/100 | `signalScoringPolicy.yml` 82/70/55 |
| `READABILITY_LOW` | 평균 문장 길이 > 40어절 또는 동일 시작구 반복 ≥ 3 | `repetition-detector.mjs:7-23` |
| `SEO_FIELDS_MISSING` | meta description(80~160자) 또는 OG 이미지 없음 | `seo-safeguards.js` |
| `IMAGE_MISSING` | 이미지 생성 실패 → 플레이스홀더로 발행 | `image-generator.mjs:167-198` |
| `THIN_EXPERT_LENS` | `expert_lens_ko` < 3문장 또는 구체 명사 < 3 | `expert-insight-engine.mjs` |
| `INSIGHT_DENSITY_LOW` | insight_essay 밀도 < 0.70 (현행 0.75를 완화 시작값으로) | `authored-column-policy.mjs` |
| `HUMAN_STYLE_LOW` | 사람다움 < 0.80 (현행 0.84) | 동일 |

### 관련성 tier(선택 단계, QA 아님)

`config/scoring.yaml`: full ≥ 0.75, brief ≥ 0.55(현행 유지, `relevance-classifier.mjs:1-2`). 단 **입력 풀이 달라지므로**(재서술 허용으로 상업 매체 포함) Phase 4 첫 주에 통과율을 재측정하고 0.65/0.45 대안을 A/B로 기록한다.

### 실행 규약

- 러너: `qa/run.ts`가 규칙을 `config/qa.yaml`의 순서로 실행, hard 첫 실패에서 중단하지 않고 **전부 실행해 기록**(튜닝 데이터 확보), 최종 판정은 hard 하나라도 fail → reject.
- 모든 판정을 `qa_results`에 `{draft_id, rule, severity, pass, reason_code, evidence, checked_at}`로 저장(R6).
- human-review 큐: soft fail 초안은 `drafts.review_status='pending'`으로 두고 Telegram 요약에 링크. Phase 4에서는 `auto_pass: true`로 통과시켜 shadow 데이터를 모은다.
- 튜닝 절차: 임계값 변경은 `config/qa.yaml` PR + `docs/shadow/tuning-log.md` 1행(변경 전/후 통과율, 근거 run_id). 코드 변경 없이 수행.
- 규칙 추가: `qa/rules/<RULE>.ts` + 단위 테스트(fixture) + `config/qa.yaml` 등록. 3줄 이상의 러너 변경이 필요하면 설계 위반으로 본다.

### 재서술 허용에 따른 추가 안전장치

- `news_brief.summary_ko`는 한국어 재서술이므로 영문 원문과의 연속 일치는 인용부호 안에서만 발생해야 한다. `QUOTE_TOO_LONG`는 영문 원문 토큰 기준, `SIMILARITY_TOO_HIGH`는 번역 유사도(문장 임베딩 코사인 ≥ 0.92를 soft `TRANSLATION_TOO_CLOSE`로 추가, Phase 4 측정 후 hard 승격 검토).
- `source_url`·`source_name`·`published_at_source` 필수(`SCHEMA_INVALID`).
- 매체별 예외: `sources.yaml`의 `text_rights: link_only`는 재서술도 금지(Josh가 지정하는 매체), `rewrite_only`는 재서술 허용·인용 제한, `full`은 공공·CC.

## Consequences

- (+) R5·R6 충족, Phase 4 튜닝이 설정만으로 가능, 오탐 수정이 배포를 요구하지 않음.
- (+) 금칙어 `.length` 결함(D2) 같은 문제는 규칙 단위 테스트에서 잡힌다.
- (−) 규칙 수 20개로 초기 구현 부담. 3g에서 hard 13개를 먼저, soft는 `auto_pass`로 시작.
- (−) 번역 유사도 규칙은 임베딩 호출 비용(Haiku 또는 로컬 모델)이 든다. Phase 4에서 측정.

## Rejected alternatives & why

- **A**: R5·R6 미충족, 현재 fix 폭주의 구조적 원인.
- **C**: 비결정적, 설명 불가, R7 위반.

## 확인 필요

1. 재서술 금지 매체 목록(Josh, Phase 3a 전).
2. 한국어 비율 기준 0.6의 적정성(샘플로 검증).
