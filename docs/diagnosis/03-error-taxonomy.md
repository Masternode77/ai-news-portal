# 03 — 에러 분류 (상위 10 + 확정 결함)

증거 소스: `scripts/state/pipeline-state.json`(120런), `src/data/*.json` 격리 사유, `origin/main` 09-15 이후 fix 커밋 64건, PR #37~#56 본문, GitHub 이슈 #29, `docs/*-report.md`. 접근 불가(명시): Vercel 런타임 로그(커넥터 403), Mac 잡 레코드·로그, Supabase. "책임 위치"는 오류를 내는 코드이지 반드시 고쳐야 할 코드는 아니다.

## 1. 상위 10 에러 유형

| # | 코드 / 증상 | 단계 | 빈도 (근거) | 발생·책임 `file:line` | 분류 |
|---|---|---|---|---|---|
| 1 | `infrastructure_relevance_below_signal_threshold` — 후보가 archive_only로 탈락 | relevance | 48 아이템 / 108 처리 (runHistory); dayPlans curated 75 중 53 archive_only; 현재 풀 30/30 | `scripts/lib/relevance-classifier.mjs:1-2,836-865`; 입력은 공공·arXiv 피드 (`config/sourceRegistry.yml` 권리 게이트 `scripts/lib/source-registry.mjs:113-135`) | config/data (풀 구성) + gate |
| 2 | 컬럼 `no_qualifying_story` — 후보 전부 거절 | column selection | 102 / 120 런; 거절 누계 `abstract_only` 562, `extraction_ineligible` 405, `relevance_below_threshold` 120, `already_covered` 22 (`selectionDiagnostics.counts`) | `scripts/lib/authored-column-engine.mjs:80` (거절 코드), `:566,602-637` | config/data + gate |
| 3 | 러너 4단계 `restore-eia-public-inventory.mjs` 실패 → Mac 발행 전면 중단 (`source_fidelity:unsupported_claims`, `unsupported_numeric_claims`) | post-pipeline gate | 2026-10-12/13 5회 연속 (PR #55 서술); 10-11 `93341dd` 이후 모든 런 | `scripts/lib/eia-restoration-inventory.mjs`(빈 `claim_ledger`), `scripts/lib/unsupported-claim-guard.mjs:15`, `scripts/lib/final-publication-integrity.mjs:66-111` | code-defect (데이터·게이트 불일치, #56으로 수정) |
| 4 | Mac 로컬 git 손상 → `git fetch` 실패 → 런 시작 불가 | trigger | 2026-10-14 이후 전 런 (PR #55); heartbeat 10-11 이후 stale, 이슈 #29 open | `scripts/subscription-job.mjs:101-105` (`git fetch origin` → 불일치 시 throw); 레포 밖 원인 | external (Mac 환경) |
| 5 | 구독 모드 컬럼 실패 → 런 abort(상태 기록 전) — 생존 편향 | column / ledger | 측정 불가(원장에 없음). 완주 런의 컬럼 품질 실패 사유 10종 기록: `verify:copied_source_sentence`, `verify:fewer_than_4_sections`, `draft:invalid_structured_heading/essay`, `voice:invalid_structured_heading`, `verify:unsupported_numeric_claims`, `verify:insight_density_below_0.78/0.75`, OpenRouter 402 ×2 | `scripts/pipeline.mjs:445` (`result.failure` → `rethrowSubscriptionFailure`), `scripts/lib/openrouter.mjs:19-21`, 상태 쓰기 `:753-774` 뒤 | code-defect |
| 6 | 추출 fail-closed 탈락 (`cleaned_source_text_below_1200/500`, `ellipsis_truncation_artifact`, `sentence_completion_score_below_0.92`, 관련기사 오염) | extraction | 아카이브 격리 32건 중 `extraction_artifact:missing_or_invalid` 30, `source_extraction:*` 10+9; 5월 긴급 정리 295건; fix 커밋 12건(10-11 리드 경계 시리즈 7, 10-14 elision, 10-16 `%`) | `scripts/lib/source-extraction-fail-closed.mjs:33-115`, `scripts/lib/source-fetch.mjs:284-311` (정규식 추출), `scripts/lib/truncation-detector.mjs` | gate + code-defect (추출기 정밀도) |
| 7 | 컬럼 품질 플로어 반복 조정 (insight density 0.78→0.75, 어형 변화 미집계, 구조 헤딩) | column policy | 10-04 PR #40, #42; runHistory `verify:insight_density_below_*` 2건 | `scripts/lib/authored-column-policy.mjs:122-290`, `scripts/lib/insight-density-score.mjs` | gate (튜닝 부재) |
| 8 | 스루풋 로직 결함 — 슬롯 락, 일일 캡이 processed를 셈, 아카이브 레코드가 컬럼 후보에서 제외, 드래프트 JSON 파싱 실패로 유일 후보 유실 | selection | 10-04 PR #37, #39, #41 본문 ("live run after #N published nothing") | `scripts/lib/curate.mjs:219-249,267-278`(수정됨), `scripts/pipeline.mjs:389-452`, `authored-column-engine.mjs` 드래프트 계약 | code-defect (수정됨, 회귀 테스트 `tests/daily-throughput.test.mjs`) |
| 9 | 리더 카피/금칙어/템플릿 게이트의 오탐·누락 (10-11 하루 fix 26건) | QA | fix 커밋 26 (`docs/diagnosis/logs/github-evidence.md`); 격리 `article_detail:forbidden_phrase`, `public_template_phrase` 각 1 | `scripts/lib/reader-copy-guard.mjs`, `scripts/audit-reader-copy.mjs`, `config/bannedPhrases.yml`, `config/forbiddenPublicPhrases.yml` | gate (규칙이 코드에 분산, 1규칙 1파일 아님) |
| 10 | `expert_insight_missing_fields named_companies` — 인사이트 필드 불완전으로 signal card 강등 | insight gate | 2 아이템 (runHistory blocked); 컬럼 거절 `expert_insight_incomplete` 10 | `scripts/lib/expert-insight-engine.mjs:355,585,591` (`SOURCE_EXPERT_INSIGHT_INVALID` throw `content.mjs:221`) | gate |

보조 항목(빈도 낮음·별도 레인): EIA 데이터 리프레시 워크플로 transient 실패 9/40런(`infrastructure-data.yml`, PR #52/#53) — 콘텐츠 파이프라인과 무관하나 `main` 커밋 트래픽의 대부분(105/283)을 차지해 이력 가독성을 해침; OpenRouter 402 예산 소진 2건(10-05, 구독 전환 전); 이미지 fix 3건(아트워크 보존·유일성).

## 2. 확정 코드 결함 (Phase 0에서 수정하지 않음, 기록만)

| ID | 결함 | 위치 | 영향 |
|---|---|---|---|
| D1 | 컬럼 단계 실패(품질 거절 포함)가 구독 모드에서 런을 abort → 원장 미기록, wire 결과 유실, `news-pool.json`·이미지는 이미 써짐 | `scripts/pipeline.mjs:445,450`, `scripts/lib/openrouter.mjs:19-21`; 주석 `:387-388`과 모순 | 관측 불가 + 부분 쓰기 |
| D2 | `bannedPhraseMatches()`는 객체를 반환하는데 `.length`를 검사 → 컬럼 정책의 금칙어 검사 미작동, `banned_phrase_count` 항상 undefined | `scripts/lib/authored-column-policy.mjs:200,211-212` vs `scripts/lib/banned-phrases.mjs:49-56` | 반복 게이트가 대신 잡고 있어 발행 영향은 제한적 |
| D3 | 수집 단계 카운터 폐기 (`authorizedSourceCount/failedSourceCount`) | `scripts/lib/fetch-feeds.mjs:456` → `scripts/pipeline.mjs:217` (콘솔 로그만, 원장 미기록) | H1 측정 불가 |
| D4 | 최종 integrity 격리 목록 무시 | `scripts/lib/archive-store.mjs:178-184` → `pipeline.mjs:547/621/743` | 격리가 조용히 일어남 |
| D5 | 비구독 모드에서 `expertInsight` undefined → TypeError 가능 | `scripts/lib/content.mjs:346-348,366` | 레거시 OpenRouter 경로 |
| D6 | 라이브러리 내부 `process.exit` | `scripts/lib/subscription-provider.mjs:58-60` | 호출자가 정리 불가 |
| D7 | 아카이브 slug 중복 47개/103레코드 (예: `chip-industry-week-in-review` 10회); 컬럼 slug 충돌 시 조용히 교체 | `scripts/lib/normalize.mjs:112`, `scripts/lib/authored-column-store.mjs:34-38` | R8 보존 시 URL 모호성 |
| D8 | `prompts/` 37파일 미사용, 이미지 공급자 데드코드 + `* 2.mjs` 중복 커밋, `scripts/update-news.js` no-op, `constants.mjs:137` `FEEDS` 미사용 | §00 §10 | 유지보수 혼란 |
| D9 | 러너 후속 단계(`npm test` → `astro build`, `audit-omo-ultra-current-state.mjs`)가 tracked 문서를 쓰고 90분 데드라인을 소모 | `scripts/run-subscription-news.mjs:15-27`, `package.json:34` | 발행이 빌드·테스트 성공에 결합 (P1) |
| D10 | 문서 드리프트 (스케줄, 기본값, 임계값) | `README.md:146-147,181`, `docs/content-pipeline-map.md` | 운영 혼선 |

## 3. 단계별 집계

| 단계 | 에러 유형 수 | 비고 |
|---|---|---|
| trigger / 환경 | #4 | 레포 밖, 현재 outage의 직접 원인 |
| source / pool | #1(입력 측면), D3 | 측정 공백 |
| extraction | #6 | fix 12건, 격리 사유 1위 |
| selection / scoring | #1, #2, #8 | 탈락의 96% |
| generation | #5, #7, D1 | abort 경로 |
| QA / integrity | #3, #9, #10, D2, D4 | 게이트가 코드에 분산 |
| publish / deploy | D9 | 재빌드 결합 |
| observability | D1, D3, D4 | 원장 생존 편향 |

## 4. 증거 한계

- 실패 런 횟수와 단계는 Mac 잡 레코드가 없어 PR 서술로만 알 수 있다(`docs/diagnosis/mac-jobs/README.md`).
- Vercel 빌드 실패·런타임 오류는 커넥터 재인가 후 확인.
- Supabase 테이블 상태는 코드로만 추정(쓰기 전용, 러너가 비활성화).
