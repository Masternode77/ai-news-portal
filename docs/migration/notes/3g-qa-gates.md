# 3g QA Gates — 레거시 읽기와 재작성 결정

Phase 3 모듈 g(`REBUILD_BRIEF.md` §6: `qa/rules/*`(hard 13 → soft 7), `qa/run`, `config/qa.yaml`; 완료 기준 **규칙 추가 = 파일 1개, 판정 100% reason_code, 규칙별 통과율 리포트**, `docs/migration/plan.md` 15행). 설계는 ADR-004(B안: hard/soft 2층 + 1규칙 1파일 + 설정 임계값 + 판정 영속). 착수 승인 2026-10-25 11:47Z(Josh "PR #66 머지하고 3g 착수해"). 레거시는 읽고 규칙·임계값만 추출해 다시 쓴다(P9). §0~§3은 착수 시, §4~§5는 실행 후.

## 0. 실측 요약 (2026-10-25 읽기)

| 사실 | 근거 |
|---|---|
| 레거시 QA는 **7단 fail-closed 스택**이 8파일에 흩어져 있고(`relevance-classifier`, `source-extraction-fail-closed`, `quality-gate`, `expert-insight-engine`, `expert-lens`, `repetition-detector`, `final-publication-integrity`, `authored-column-policy`), 임계값은 코드 상수·일부 env다. 판정은 저장되지 않고 로그로만 남는다 | ADR-004 Context, `docs/diagnosis/02-funnel.md` §3·§7 |
| 저작권 안전 가드(`copyright-safe-*`): 8단어 shingle 중복 비율 > 0.22, 45자 이상 문장의 재사용 비율 > 0.15에서 차단. 정책 파일 `config/copyrightSafeTransformationPolicy.yml`은 **어디서도 읽지 않는다**(값은 코드에 복제돼 있음) | 코드 읽기(2026-10-25 에이전트 인벤토리) |
| 연속 인용 길이 제한은 레거시에 **없다**. Josh 결정(2026-10-18) "연속 인용 ≤ 20단어, 1회"는 신규 규칙 | ADR-004 `QUOTE_TOO_LONG` |
| 금칙어: `banned-phrases.mjs`는 부분 문자열·대소문자 무시·공백 유연 매치. 확정 결함 D2(`bannedPhraseMatches()` 객체에 `.length` 검사 → 미작동), `hook_starts`는 선언만 있고 강제되지 않음. `config/forbiddenPublicPhrases.yml` 82항목은 Jaccard 0.82 수준의 근접 중복과 일반어 오탐 위험("significant", "transform" 류)이 있다 | `docs/diagnosis/04-verdict.md` D2, 코드 읽기 |
| 수치 검증(`numeric-claim-verifier`)은 부분 문자열 매치라 "5"가 "50"에 들어 있으면 근거 있음으로 본다. 출처 충실도(`source-fidelity-claim-check`)는 앞 30개 claim만 어휘 유사도 0.34로 비교 | 코드 읽기 |
| 추출 fail-closed: 본문 500자(브리프)/1,200자(컬럼) 플로어, 보일러플레이트 비율 0.08, 문장 완성도 0.92 | `source-extraction-fail-closed.mjs` |
| 최종 게이트(`final-publication-integrity`)는 실패 항목을 **격리 목록**에 넣고 런을 계속한다 — 격리 목록은 발행 경로가 읽지 않아 사실상 무시됨 | 코드 읽기, `plan.md` §2 "격리 목록 무시" |
| 반복 탐지(`repetition-detector`)는 **기사 간** 지표만 본다: 문장 중복 비율 0.12, 헤딩 0.75, 결론 0.7, 리드 0.8, 동일 구성(blueprint) > 2 | 코드 읽기 |
| 새 구조(Phase 2~3f): `qa` 스테이지는 no-op fail-closed(통과 0), `QaRule { rule, severity, check() }`·`QaVerdict`·`qa_results(draft_id, rule, severity, pass, reason_code, evidence, checked_at)`·`drafts.review_status(none/pending/approved/rejected)`가 계약과 DDL에 이미 있다. 3d가 숫자 grounding·`quote_max_words`·금칙어 `checks.banned`를 **보고만** 하고(차단은 3g), 3f가 `IMAGE_MISSING` soft verdict를 `qa_results`에 쓴다 | contracts §1~§3, `0001_init.sql`, notes 3d·3f |

## 1. 유지 (의도·규칙을 가져온다)

| 항목 | 레거시 | 새 구조에서 |
|---|---|---|
| 저작권 안전 임계값 | shingle 8단어 중복 > 0.22, 45자 이상 문장 재사용 > 0.15 | `SIMILARITY_TOO_HIGH` hard, `config/qa.yaml` params `{ overlap_max: 0.22, shingle_words: 8, sentence_reuse_max: 0.15, copied_sentence_min_chars: 45 }`. 정규화 단어 기준(한글 음절·라틴·숫자), 원문 텍스트 = 제목+본문+소스명+발행일(`sourceTextOf`, 3d와 동일) |
| 추출 플로어 | 본문 < 500자면 fail-closed | `SOURCE_UNREACHABLE` hard, `min_source_chars: 500`. full 권리 소스는 `extraction.ok === false`(시도 후 실패)도 실패. rewrite_only·link_only는 Josh 결정(재서술 허용)대로 raw item 존재만 요구 |
| 금칙어 인벤토리와 매치 규칙 | 부분 문자열·대소문자 무시·공백 유연 | `BANNED_PATTERN` hard = 3d `checks/banned-phrases.ts`의 같은 함수(`config/banned-phrases.yaml`: `phrases` ko/en, `hook_starts`, `patterns`). 3d는 보고, 3g는 차단. D2 결함은 규칙 단위 테스트가 막는다 |
| 수치 근거 검사 | 수치가 출처에 있어야 함(의도) | `UNGROUNDED_NUMBER` hard = 3d `groundingCheck`(한국어 단위어·콤마·소수 정규화 토큰; 부분 문자열 아님) `max_ungrounded: 0` |
| 출처 충실도(고유명사) | 앞 30 claim 어휘 유사도 | `UNGROUNDED_ENTITY` hard: 독자 노출 필드의 라틴 고유명사(대문자 시작·소문자 포함, 전체 대문자 약어 제외)가 출처 텍스트·소스명·`allow` 목록에 없으면 실패 |
| hard/soft, reason_code, 판정 영속 | ADR-004 표 | 규칙 20개 중 qa 스테이지 12개(hard 8, soft 4), image 스테이지 1개(`IMAGE_MISSING`), 상류 단계 5개, 3e 2개 — §3 "코드 배치" |
| 사람 검토 큐 | 없음(격리 목록) | soft 실패 + `auto_pass` 아님 → `drafts.review_status = pending`(ADR-004). 노출(Telegram 링크)은 3i |

## 2. 버릴 것

| 항목 | 이유 |
|---|---|
| 7단 결합 순서와 코드 내 임계값 | ADR-004 B안: 순서·임계값·심각도는 `config/qa.yaml` 데이터, 규칙은 파일 1개. 튜닝 = 설정 PR + `docs/shadow/tuning-log.md` 1행 |
| `config/forbiddenPublicPhrases.yml` 82항목 | 근접 중복·일반어 오탐 위험. 3d PR #65에서 이관한 `config/banned-phrases.yaml`(ko 5·en 43·hook 11·패턴 9)만 정본. 레거시 파일은 Phase 5 퇴역 |
| `copyrightSafeTransformationPolicy.yml` | 읽히지 않는 파일. 값만 `config/qa.yaml` params로 |
| 수치 부분 문자열 매치, 앞 30 claim 어휘 유사도 | 3d 정규화 grounding과 결정적 고유명사 검사로 대체 |
| 격리 목록(final-publication-integrity) | 실패는 `qa_results` 행 + `drafts.review_status`(rejected/pending)로 남고 런은 계속된다. "무시되는 격리"가 아니라 "기록되는 거절" |
| 기사 간 반복 지표(문장 0.12·헤딩·결론·리드·blueprint) | 최근 발행본이 필요한 교차 기사 검사 — Phase 4 shadow에 발행본이 쌓인 뒤 `QaEvidence.recentPublishedTitles`(지금은 빈 배열) 기반 규칙으로 추가. 3g는 **기사 내** 반복(`READABILITY_LOW` 동일 시작구)만 |
| 컬럼(insight_essay) 플로어(밀도 0.75, 사람다움 0.84, 섹션 ≥ 4) | `INSIGHT_DENSITY_LOW`·`HUMAN_STYLE_LOW`는 3e와 함께(B안: 3e는 Phase 5 전환 이후) |
| `SEO_FIELDS_MISSING`의 80~160자 description 창 | 한국어 요약 첫 단락은 대부분 160자를 넘는다(fixture 2건 모두). 하한 80자만 두고 OG 이미지 유무는 3h(퍼블리셔가 채움) |

## 3. 바꿀 것

| 항목 | 새 설계 | 비고 |
|---|---|---|
| 설정 | `config/qa.yaml`(`QaConfig` zod strict, CLI `--qa`): `version` + `rules[]`(순서 = 실행 순서) 각 `{ rule(UPPER_SNAKE = 파일명 = reason_code), severity hard\|soft, enabled(기본 true), auto_pass(soft만; hard에 있으면 로드 실패), stage qa\|image(기본 qa), params{} }`. 중복 rule·알 수 없는 키 로드 실패. 임계값은 전부 `params`에만 — 코드에는 기본값만 있고 설정이 이긴다(`READABILITY_LOW.max_same_opening` 코드 2 / 설정 3) | contracts §4 |
| 레지스트리 | `packages/pipeline/src/qa/rules/<CODE>.ts`가 `rule: QaRule`을 export, `qa/registry.ts`가 `QA_RULES` Map으로 모은다. **설정이 무엇을 돌릴지 정하고 레지스트리는 무엇이 있는지만 말한다**: 설정에 있는데 파일이 없으면 `QA_RULE_UNKNOWN`으로 런 실패, 파일이 있는데 설정에 없으면 돌지 않음. 테스트가 `rules/*.ts` 전부가 등록돼 있고 자기 이름을 rule·reason_code로 내는지 확인 | ADR-004 "규칙 추가 = 파일 1개 + 단위 테스트 + 설정 1행" |
| 스테이지 | `stages/qa.ts`: `QaInput { drafts, rawItems, sources, candidates }` → `QaOutput { passed, verdicts, stats }`. 초안마다 `QaEvidence { sourceText(3d sourceTextOf), source, rawItem, candidate, bannedPhrases, recentPublishedTitles: [], now }`를 만들고 enabled `stage: qa` 규칙을 **설정 순서로 전부** 실행(첫 hard 실패에서 멈추지 않음 — 튜닝 데이터), 모든 verdict를 `qa_results`에 upsert(`draft_id, rule, checked_at`, evidence에 `qa_version`·`params` 포함) | ADR-004 실행 규약 |
| 판정 | hard 실패 1건↑ → `rejected`(`drafts.review_status = rejected`); soft 실패 중 `auto_pass` 아닌 것 1건↑ → `held`(`pending`, 사람 검토 큐); 그 외 `passed` → image·publish로. `auto_pass`로 통과한 soft 실패도 verdict·`by_rule.auto_passed`로 남는다 | `decide()` |
| 규칙 오류 | 규칙이 throw(예: params 타입 오류 `QA_PARAM_INVALID`)하면 삼키지 않고 **실패 verdict**(`evidence.error = "QA_RULE_ERROR: …"`, hard면 거절)로 기록하고 로그. 런은 계속 | fail-closed |
| 코드 배치(ADR-004 20개) | **qa 스테이지 12**: hard `SCHEMA_INVALID`(body.brief가 `NewsBrief`로 파싱; 출처 필드·slug 포함), `SOURCE_UNREACHABLE`, `QUOTE_TOO_LONG`(원문과 연속 공유 단어 > 20 또는 인용부호 span > 1; 3d `longestCommonRun` 재사용), `SIMILARITY_TOO_HIGH`, `UNGROUNDED_NUMBER`, `UNGROUNDED_ENTITY`, `LANG_MISMATCH`(4개 `*_ko` 필드 전체의 글자 중 한글 비율 ≥ 0.6; 숫자·단위·구두점은 분모에서 제외), `BANNED_PATTERN`; soft `RUBRIC_BELOW_TARGET`(3c `candidates.total` ≥ 0.70; 후보가 없으면 판단 보류=통과), `READABILITY_LOW`(평균 문장 어절 ≤ 40, 동일 2어절 시작구 ≤ 3), `SEO_FIELDS_MISSING`(제목 ≤ 70자, 요약 첫 단락 ≥ 80자), `THIN_EXPERT_LENS`(문장 ≥ 3, 구체 토큰(숫자·단위·라틴 고유명사) ≥ 3). **image 스테이지 1**: `IMAGE_MISSING`은 3f대로 이미지 스테이지가 내되 심각도는 `config/qa.yaml`의 `stage: image` 행에서 읽는다(규칙 파일 없음; 3f notes §5.5 결정). **상류 5**: `DATE_INVALID`는 3a ingest가 `date_missing/date_future/date_invalid` skip으로(raw item 미생성), `DUPLICATE_OF_PUBLISHED`는 3b, `RIGHTS_VIOLATION`은 3a 어댑터 `TEXT_USE_NOT_AUTHORIZED` + 3c 권리 상한, `BUDGET_EXCEEDED`는 3d/러너 `budget_stop`, `EXTRACTION_CONTAMINATED`(보일러플레이트 0.08·완성도 0.92)는 **미구현 — 3a 추출기 후속**(§5). **3e 2**: `INSIGHT_DENSITY_LOW`·`HUMAN_STYLE_LOW` | ADR-004 표 |
| 규칙 모양 | 모든 규칙은 `verdict(config, pass, evidence, now)` 헬퍼로 같은 모양을 돌려주고(severity는 설정에서, `reason_code = rule`, `evidence.params`), brief가 유효하지 않으면 `skipped: brief_invalid`로 **실패**(SCHEMA_INVALID가 원인을 말한다), 출처 텍스트가 없으면 비교 규칙은 `skipped: no_source_text`로 통과(SOURCE_UNREACHABLE가 잡는다) | `qa/verdict.ts`, `qa/text.ts` |
| replay 증거 입력 | fixture RSS 어댑터가 라이브 어댑터처럼 `content:encoded`를 `body_preview`(태그 제거, `ingest.body_preview_chars` 상한; link_only·abstract 범위는 제외)로 싣는다. `fixtures/rss/scoring-wire-a.xml` 부산 기사에 2단락 본문(944자)을 추가 — replay에는 페이지 추출이 없어 description 492자만으로는 full 소스가 `SOURCE_UNREACHABLE`(< 500)에 걸렸다 | R7, `fixtures/README.md` |
| 관측 | `stage_events.counts { drafts, qa_passed, rejected, held, verdicts, hard_failed, soft_failed, auto_passed, rule_errors }`, funnel `qa_passed`, `--json` `qaStats { …, rules, by_rule{checked,passed,failed,auto_passed}, decisions[{draft_id, slug, title_ko, source_id, outcome, failed_rules, auto_passed_rules, failed_evidence}] }`, step summary "QA (3g)" 절(규칙별 통과율 표 + 초안별 판정·증거) | 완료 기준 "규칙별 통과율 리포트" |
| 플래그 | `flags.stages.qa`는 Phase 2부터 `true`(no-op fail-closed)였다. 공통 절차 5에 맞춰 **기본 `false`**로 내린다 — 꺼지면 `skipped`로 `passed`가 비어 image·publish 입력이 0(fail-closed 유지). 켜기는 `CC_FLAG_STAGES_QA=true` | contracts §7 |
| 한계(의도된) | `UNGROUNDED_ENTITY`는 라틴 문자 고유명사만 본다(한국어 고유명사는 형태소 분석 없이 결정적으로 가르기 어렵다 — Phase 4 측정 후 결정). `LANG_MISMATCH` 0.6은 ADR-004 "확인 필요 2" 그대로. 번역 유사도 `TRANSLATION_TOO_CLOSE`(임베딩)는 ADR-004대로 Phase 4 측정 후 | §5 |

## 4. 완료 기준 대조

| 기준 | 결과 | 근거 |
|---|---|---|
| 규칙 추가 = 파일 1개 | 통과 | `qa/rules/<CODE>.ts` + 단위 테스트 + `config/qa.yaml` 1행. 러너(`stages/qa.ts`)·레지스트리는 건드리지 않는다(레지스트리는 `rules/*`를 import해 Map으로 모을 뿐). `qa-rules.test.ts`가 디렉토리의 모든 파일이 등록·자기 이름을 내는지 검사 |
| 판정 100% reason_code | 통과 | 모든 verdict `reason_code = rule`, evidence에 `qa_version`·`params`; `qa_results` 행 수 = 초안 × 규칙(fixture 2 × 12 = 24). 규칙 throw도 실패 verdict(`QA_RULE_ERROR`)로 기록 — `qa-stage.test.ts` |
| 규칙별 통과율 리포트 | 통과 | `qaStats.by_rule`·`stage_events.counts`·step summary "QA (3g)" 표(규칙별 checked/passed/failed/auto-passed/pass rate + 초안별 판정·실패 증거) |
| hard → reject, soft → 큐/`auto_pass` | 통과 | hard 실패 → `rejected`(drafts 행 `rejected`), soft 실패 → `held`(`pending`), `auto_pass` → 통과 + 기록 — 테스트 |
| 설정이 실행을 결정 | 통과 | 설정에만 있는 규칙 → `QA_RULE_UNKNOWN` 런 실패, `enabled: false` → 미실행, 임계값 변경은 params만 — 테스트(`qa-stage`, 공유 `qa-config`) |
| 플래그 기본값 OFF | 통과 | `flags.stages.qa: false`; 기본 런 `qa: skipped (flag_off)`, image 입력 0(fail-closed) — `cli.test.ts` |
| 3d 보고 항목의 차단 전환 | 통과 | 숫자 grounding → `UNGROUNDED_NUMBER`, `quote_max_words` → `QUOTE_TOO_LONG`, `checks.banned` → `BANNED_PATTERN`(같은 함수) |
| 라이브 초안에서의 동작(관찰) | 미실행 | Anthropic 키 미수령(3d 라이브 생성 선행). 수령 후 `generate,qa` 라이브 dry-run으로 §4.2 채움 |

### 4.1 fixture dry-run (`scoring`, 2026-10-25T12:23Z)

`CC_FLAG_STAGES_NORMALIZE=true CC_FLAG_STAGES_SCORE=true CC_FLAG_STAGES_GENERATE=true CC_FLAG_STAGES_QA=true CC_FLAG_STAGES_IMAGE=true npm run v2:pipeline -- run --dry-run --replay --fixture scoring --sources fixtures/sources/scoring.yaml --stage ingest,normalize,score,generate,qa,image --json`

fetched 13 (5/5 ok) → new 13 → scored 13 → gate 6 → selected 2 → drafts 2 → **qa 24 verdicts: passed 1 · rejected 1 · held 0** → image passed 1 · placeholder 1 · `IMAGE_MISSING` 0 → publish skipped(not selected). 런 `done`, 비용 0, 154 ms.

| 초안 | 판정 | 실패 규칙 | 증거 |
|---|---|---|---|
| `scoring-wire-a` 부산 1.2 GW(full, body_preview 800자) | **passed** | — | 12/12 통과 |
| `scoring-wire-b` KEPCO 345 kV(rewrite_only) | **rejected** | `UNGROUNDED_NUMBER`(hard) | `ungrounded: ["2027"]` — fixture 응답에 일부러 넣은 미근거 연도(3d에서 보고 1/2였던 바로 그 건). soft `RUBRIC_BELOW_TARGET`(total 0.6862 < 0.70, tier brief)·`THIN_EXPERT_LENS`(concrete 2 < 3: "1 GW", "RFS")는 `auto_pass`로 기록만 |

규칙별: 12규칙 × 2 = 24 checked; 실패 3(`UNGROUNDED_NUMBER` 1, `RUBRIC_BELOW_TARGET` 1 auto, `THIN_EXPERT_LENS` 1 auto), 나머지 9규칙 2/2. `rule_errors 0`. 같은 수치를 `cli.test.ts`(3g 케이스)·`qa-stage.test.ts`(end to end)·`rebuild-ci.yml` smoke가 고정한다.

### 4.2 라이브

미실행. Anthropic 키 수령 → 3d 라이브 생성 dry-run과 같은 런에서 `--stage ingest,normalize,score,generate,qa`로 실제 초안의 규칙별 통과율을 받아 여기와 `docs/shadow/tuning-log.md` 첫 행에 적는다. 그때까지 임계값은 ADR-004·레거시 값 그대로다.

## 5. 열린 질문

1. **`LANG_MISMATCH` 0.6** — ADR-004 "확인 필요 2". 영문 고유명사·단위가 많은 브리프(fixture wire-a는 한글 비율 약 0.9)에서 샘플로 검증 후 조정(설정만).
2. **`UNGROUNDED_ENTITY` 범위** — 라틴 고유명사만. 한국어 기관·인물명(예: "한전"은 출처 영문 "KEPCO"와 대응)은 결정적으로 가르기 어렵다. Phase 4에서 오탐·미탐을 보고 `allow` 목록 또는 한·영 별칭 표(설정)로 보강할지 결정.
3. **`EXTRACTION_CONTAMINATED`** — ADR-004 hard 13 중 유일한 미구현. 보일러플레이트 비율 0.08·문장 완성도 0.92는 추출기(3a) 측정값이므로 `payload.extraction`에 지표를 남기는 3a 후속 + `SOURCE_UNREACHABLE` 옆 규칙 1파일. 승인 대상 아님(코드만), 3h 전후 소규모 PR 제안.
4. **기사 간 반복·`TRANSLATION_TOO_CLOSE`** — 발행본이 쌓이는 Phase 4 shadow에서 `recentPublishedTitles` 기반 규칙과 임베딩 유사도(비용 측정 후 soft)로 추가.
5. **held 초안의 처리** — `pending` 초안은 다음 런에서 같은 draft id로 다시 판정되고(upsert), 사람 승인(`approved`) → 발행 경로는 3h 퍼블리셔·3i Telegram 링크에서 잇는다. `auto_pass`를 끄는 시점(soft → 실제 큐)은 Phase 4 첫 주 통과율을 보고.
6. **`SEO_FIELDS_MISSING`의 OG 이미지** — 3h가 `publications.image`를 채우므로 규칙은 제목·description만. 발행 후 검증이 필요하면 3h에서 publish 전 검사 추가.
7. **rewrite_only 소스의 본문 길이** — Josh 결정대로 raw item 존재만 요구한다. 피드 요약이 너무 짧은 소스(예: 1문장 description)에서 브리프 품질이 떨어지면 `SOURCE_UNREACHABLE`에 `min_feed_chars`(rewrite_only용) params를 추가하는 것으로 대응(설정 1행 + 규칙 파일 수정).
