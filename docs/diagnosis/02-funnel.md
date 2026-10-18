# 02 — Funnel 실측 (runs since 2026-08-30)

생성: `node scripts/diagnose/funnel.mjs --since 2026-08-30 --git-history --replay --out docs/diagnosis/02-funnel.csv`
(generated_at 2026-10-17T18:05:38.518Z). 원본 CSV: [`02-funnel.csv`](./02-funnel.csv) — 120행, 13 기본 컬럼 + 진단 컬럼(`branch, day, slot, column_published, column_reason, llm_calls, llm_failures, consistency, commit, labels`).

## 0. 읽는 법 — 측정값과 추정값

| 컬럼 | 출처 | 라벨 |
|---|---|---|
| `run_id`, `started_at` | `runHistory[].at` (`scripts/pipeline.mjs:577` `now`) | measured(state) |
| `sources_configured` | 해당 런이 커밋된 시점의 `config/sourceRegistry.yml`에 `activeRegistryFeeds()` (`scripts/lib/source-registry.mjs:159`) 적용. 커밋이 없는 Mac 시절 2런은 HEAD 레지스트리 | measured(git-registry) / measured(head-registry) |
| `sources_ok`, `sources_failed` | **state에 기록되지 않음** (`fetchNewsPoolResult`가 `authorizedSourceCount/failedSourceCount`를 반환하지만 `scripts/pipeline.mjs:217`이 콘솔에만 출력하고 원장에는 쓰지 않음). 커밋된 풀의 distinct 소스 수를 하한으로 표기 `>=N` | est(lower-bound) / n/a |
| `items_fetched` | 런을 커밋한 "chore: refresh news surface and archive" 커밋의 `src/data/news-pool.json` 길이 (`git show`) | measured(git) — 118/120런 |
| `items_new` | 그 KST 일자의 `dayPlans[day].curatedIds` 중 처음 등장한 ID 수 (첫 런에 귀속) | est |
| `items_scored` | `runHistory[].processedIds.length` | measured(state) |
| `passed_gate` | relevance 게이트 통과 = `processed − archiveOnly − (signalCard − blocked)` (`scripts/pipeline.mjs:648-666` 산술) | measured(derived) |
| `drafts` | `passed_gate − blockedCount` (quality·insight 게이트 통과 → Expert Lens 생성 대상) | measured(derived) |
| `qa_passed` | full 런의 `publishedCount` (= repetition 게이트 통과, `scripts/pipeline.mjs:757`) | measured(state) |
| `published` | `processedIds ∩ dayPlans[day].visibleIds` (최종 integrity 동기화 후 공개 가시, `scripts/lib/curate.mjs:285-290`) + 컬럼 발행 1 | measured(state) |
| `top_error` | `blockedItems[].reason` ∪ `repetitionBlockedItems` ∪ `column:<reason>` ∪ `llm_failure` 최빈값, 없으면 `archiveOnlyItems[].reason` | measured(state) |

**생존 편향 경고**: 구독 모드(10-06 이후)에서 컬럼 단계 실패는 상태 기록 전에 런을 abort 한다(`scripts/pipeline.mjs:445`, `scripts/lib/openrouter.mjs:19-21`). 따라서 `runHistory`에는 **완주한 런만** 있다. 실패 런 수는 Mac 잡 레코드(`docs/diagnosis/mac-jobs/`)가 들어와야 복원된다. PR #55 본문은 2026-10-12/13에 러너 4단계(`restore-eia-public-inventory.mjs`) 실패 5회, 10-14부터 Mac 로컬 git 손상으로 `git fetch` 실패를 서술한다(원장 외 증거).

## 1. 요약 (120 runs, 2026-08-30 → 2026-10-11)

| 지표 | 값 |
|---|---|
| 런 수 | 120 (full 2 / existing_only 55 / normalization_only 63) |
| `items_fetched` (118런 측정) | min 11 / mean 28.1 / max 30 — 상한 `MAX_ITEMS_FETCHED` 30 (`scripts/lib/constants.mjs:5`) |
| 풀 distinct 소스 (118런) | min 1 / mean 10.1 / max 15 |
| `items_scored` 합 | 108 |
| `passed_gate` 합 (relevance) | 4 (3.7% of scored) |
| `drafts` 합 (quality+insight 통과) | 2 |
| `qa_passed` 합 (repetition 통과) | 2 |
| 공개 가시 wire 아이템 합 | 6 (signal card 포함; 리더 상세 페이지가 생긴 news 레코드는 118 커밋 전체에서 **0**) |
| 컬럼 발행 | 4 (git 기준 신규 컬럼 레코드 3) |
| 발행 0 런 | 113 / 120 |
| `llmUsage.failures > 0` 런 | 3 |
| 단계 카운트 정합성 불일치 | 0 |
| 16h 초과 스케줄 공백 | 4 |

스케줄 공백(3런/일 기준 결측 슬롯):
- 2026-09-06T00:51Z → 2026-09-07T06:16Z: 29 h
- 2026-09-13T00:53Z → 2026-09-16T18:47Z: 90 h
- 2026-10-05T21:55Z → 2026-10-06T17:12Z: 19 h
- 2026-10-06T17:12Z → 2026-10-11T03:41Z: 106 h

### 1.1 런 분기(branch)

| branch | runs | meaning | writer site |
|---|---|---|---|
| full | 2 | at least one full-memo candidate passed relevance+quality+insight gates; Expert Lens generated; repetition gate ran | `scripts/pipeline.mjs:753-768` |
| existing_only | 55 | items were picked and classified but none qualified for a full memo; only signal cards / archive-only records written; `publishedCount` hard-coded 0 | `scripts/pipeline.mjs:555-566` (`publishExistingOnly`) |
| normalization_only | 63 | plan had nothing to pick for the slot; existing records re-normalized; column stage still runs | `scripts/pipeline.mjs:609-640` |

### 1.2 주간 집계

| ISO week | runs | full / existing_only / normalization_only | items_fetched avg (measured:git) | items_scored | passed_gate | drafts | qa_passed | published wire (visible) | columns | zero-publish runs |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-W35 | 1 | 0 / 0 / 1 | 21.0 (n=1) | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| 2026-W36 | 27 | 1 / 9 / 17 | 23.9 (n=27) | 17 | 1 | 1 | 1 | 0 | 0 | 27 |
| 2026-W37 | 22 | 1 / 7 / 14 | 27.4 (n=22) | 11 | 2 | 1 | 1 | 0 | 0 | 22 |
| 2026-W38 | 13 | 0 / 8 / 5 | 30.0 (n=13) | 13 | 0 | 0 | 0 | 0 | 1 | 12 |
| 2026-W39 | 21 | 0 / 11 / 10 | 30.0 (n=21) | 20 | 1 | 0 | 0 | 0 | 0 | 21 |
| 2026-W40 | 31 | 0 / 16 / 15 | 30.0 (n=31) | 35 | 0 | 0 | 0 | 1 | 2 | 28 |
| 2026-W41 | 5 | 0 / 4 / 1 | 30.0 (n=3) | 12 | 0 | 0 | 0 | 5 | 1 | 2 |

### 1.3 텍스트 권리 소스 수 변화 (`sources_configured`)

| from | to | sources_configured (activeRegistryFeeds at commit registry) |
|---|---|---|
| 2026-08-30 | 2026-09-02 | 1 |
| 2026-09-02 | 2026-09-02 | 8 |
| 2026-09-02 | 2026-09-10 | 9 |
| 2026-09-10 | 2026-10-04 | 22 |
| 2026-10-04 | 2026-10-04 | 24 |
| 2026-10-04 | 2026-10-11 | 28 |

근거: `config/sourceRegistry.yml` 변경 커밋 — 09-03 `5c7cd306`/`c2be4690`(공공 피드 도입), 09-10 `703391a2`(rights-clean 확장), 10-04 `27fc11d2`, 10-05 `5f80debd`(24→28). 82행 중 `allow_text_use: true` 29, `activeRegistryFeeds` 통과 28 (`scripts/lib/source-registry.mjs:113-135` 권리·`reviewed_at` 365일 검사).

## 2. GitHub Actions 시절 커밋 기준 측정 (118 content-cycle 커밋, measured:git)

| ISO week | content-cycle commits | pool size min/mean/max | distinct pool sources min/mean/max | text feeds configured | new reader pages (news) | new columns |
|---|---|---|---|---|---|---|
| 2026-W35 | 1 | 21/21.0/21 | 1/1.0/1 | 1 | 0 | 0 |
| 2026-W36 | 27 | 11/23.9/30 | 1/4.7/8 | 1,8,9 | 0 | 0 |
| 2026-W37 | 22 | 21/27.4/30 | 5/9.7/15 | 9,22 | 0 | 0 |
| 2026-W38 | 13 | 30/30.0/30 | 11/11.7/13 | 22 | 0 | 1 |
| 2026-W39 | 21 | 30/30.0/30 | 12/12.8/14 | 22 | 0 | 0 |
| 2026-W40 | 31 | 30/30.0/30 | 11/12.6/15 | 22,24,28 | 0 | 2 |
| 2026-W41 | 3 | 30/30.0/30 | 12/12.7/13 | 28 | 0 | 0 |

`new reader pages`는 커밋 전후 `latest-news.json` 차이 중 `isPublicLongformArticle()`(`scripts/lib/public-surface-eligibility.mjs:26`)을 통과하는 신규 ID 수. 118커밋 합계 **0** — Actions 시절 wire 파이프라인은 리더 상세 페이지를 한 건도 만들지 못했고, 사이트의 news 상세 5건은 전부 EIA 복원 인벤토리(`scripts/restore-eia-public-inventory.mjs`)에서 온다.

## 3. 탈락 사유

### 3.1 wire 아이템 (runHistory)

| 단계 | 사유 | 건수 |
|---|---|---|
| relevance → archive_only | `infrastructure_relevance_below_signal_threshold` | 48 |
| quality/insight blocked | `expert_insight_missing_fields named_companies` | 2 |
| repetition blocked | (없음) | 0 |

### 3.2 컬럼 단계 결과 (120런)

| column outcome (`authoredColumn.reason`) | runs |
|---|---|
| `no_qualifying_story` | 102 |
| `published` | 4 |
| `min_gap_not_reached:3.6h<4h` | 1 |
| `verify:copied_source_sentence` | 1 |
| `verify:fewer_than_4_sections` | 1 |
| `draft:invalid_structured_heading` | 1 |
| `verify:unsupported_numeric_claims:18 months,12 months,18 months` | 1 |
| `voice:invalid_structured_heading` | 1 |
| `min_gap_not_reached:2.7h<4h` | 1 |
| `verify:insight_density_below_0.78` | 1 |
| `draft:invalid_structured_essay` | 1 |
| `verify:insight_density_below_0.75` | 1 |
| `min_gap_not_reached:3.8h<4h` | 1 |
| `voice:OpenRouter request failed: 402 model=anthropic/claude-sonnet-4.5 {"error":{"message"` | 1 |
| `draft:OpenRouter request failed: 402 model=anthropic/claude-sonnet-4.5 {"error":{"message"` | 1 |
| `min_gap_not_reached:0.4h<4h` | 1 |

### 3.3 컬럼 후보 선택 진단 (10-04 이후 기록된 런의 누계)

| column selection rejection (summed `selectionDiagnostics.counts` over runs that recorded it) | candidates |
|---|---|
| abstract_only | 562 |
| extraction_ineligible | 405 |
| relevance_below_threshold | 120 |
| already_covered | 22 |
| qualifying | 13 |
| stale_story | 13 |
| expert_insight_incomplete | 10 |
| invalid_identity | 0 |
| text_rights_unauthorized | 0 |
| unclean_evidence | 0 |
| insufficient_facts | 0 |
| digest_roundup | 0 |

### 3.4 저장 레코드의 integrity 격리 사유 (`latest-news.json` + `archived-news.json`, `public_status=quarantined` 32건, 복수 사유)

| integrity / quarantine reason on stored records | records |
|---|---|
| `extraction_artifact:missing_or_invalid` | 30 |
| `article_detail:visible_body_below_4500` | 12 |
| `article_detail:paragraphs_below_8` | 12 |
| `article_detail:sections_below_5` | 12 |
| `article_detail:words_below_650` | 12 |
| `source_rights:extraction_artifact_invalid` | 10 |
| `article_detail:source_extraction:cleaned_source_text_below_1200` | 10 |
| `article_detail:source_extraction:source_evidence_length_below_1200` | 10 |
| `extraction_qa:can_generate_longform_not_true` | 10 |
| `article_detail:source_extraction:cleaned_source_text_below_500` | 9 |
| `article_detail:source_extraction:source_evidence_length_below_500` | 9 |
| `article_detail:ellipsis_truncation_artifact` | 5 |
| `source_fidelity:unsupported_metadata_claims:5` | 4 |
| `source_fidelity:unsupported_metadata_claims:4` | 3 |
| `source_fidelity:unsupported_claims:7` | 1 |

## 4. 소스별 funnel (dayPlans curatedItems, 2026-08-30 이후 75건)

| sourceRegistryId | curated (since 08-30) | archive_only | signal_card | full_memo |
|---|---|---|---|---|
| arxiv-cs-dc | 30 | 14 | 16 | 0 |
| arxiv-cs-ar | 9 | 6 | 3 | 0 |
| doe-newsroom | 7 | 6 | 1 | 0 |
| gao-reports | 4 | 4 | 0 | 0 |
| google-cloud-ai-releases | 4 | 4 | 0 | 0 |
| google-cloud-compute-releases | 4 | 4 | 0 | 0 |
| uk-desnz | 3 | 3 | 0 | 0 |
| arxiv-cs-pf | 3 | 1 | 2 | 0 |
| ec-press-corner | 3 | 3 | 0 | 0 |
| ftc-press | 2 | 2 | 0 | 0 |
| kubernetes-blog | 2 | 2 | 0 | 0 |
| nrc-news | 1 | 1 | 0 | 0 |
| federal-register-doe | 1 | 1 | 0 | 0 |
| eia-today-in-energy | 1 | 1 | 0 | 0 |
| epoch-ai-data-insights | 1 | 1 | 0 | 0 |

## 5. 일별 plan 소진 (2026-09-15 이후)

| KST day | curated | processed | visible after integrity |
|---|---|---|---|
| 2026-09-17 | 3 | 5 | 0 |
| 2026-09-18 | 1 | 4 | 0 |
| 2026-09-19 | 0 | 0 | 0 |
| 2026-09-20 | 0 | 4 | 0 |
| 2026-09-21 | 4 | 2 | 0 |
| 2026-09-22 | 3 | 5 | 0 |
| 2026-09-23 | 3 | 4 | 0 |
| 2026-09-24 | 3 | 4 | 0 |
| 2026-09-25 | 3 | 3 | 0 |
| 2026-09-26 | 0 | 2 | 0 |
| 2026-09-27 | 0 | 0 | 0 |
| 2026-09-28 | 0 | 0 | 0 |
| 2026-09-29 | 4 | 6 | 0 |
| 2026-09-30 | 6 | 6 | 0 |
| 2026-10-01 | 2 | 4 | 0 |
| 2026-10-02 | 2 | 3 | 0 |
| 2026-10-03 | 0 | 2 | 0 |
| 2026-10-04 | 2 | 2 | 0 |
| 2026-10-05 | 0 | 12 | 1 |
| 2026-10-06 | 9 | 6 | 4 |
| 2026-10-07 | 8 | 3 | 0 |
| 2026-10-11 | 9 | 3 | 1 |

`curated`는 그날 큐레이션된 후보(상한 `DAILY_CURATION_TARGET` 9), `processed`는 처리된 ID 누계, `visible`은 최종 integrity 동기화 후 공개 가시 ID.

## 6. 오프라인 replay (결정적 게이트 재실행, 네트워크·LLM 0)

| 집합 | 건수 | distinct 소스 | 저장 tier | 재분류 tier | drift |
|---|---|---|---|---|---|
| `news-pool.json` | 30 | 12 | {'archive_only': 30} | {'archive_only': 30} | 0 |
| curatedItems since 08-30 | 75 | 15 | {'archive_only': 53, 'signal_card': 22} | {'archive_only': 53, 'signal_card': 22} | 0 |

- 임계값: full_memo ≥ 0.75, signal_card ≥ 0.55 (`scripts/lib/relevance-classifier.mjs:1-2`). drift 0 → 분류기는 저장 당시와 동일하게 동작(현재 코드로 재분류해도 결과 불변).
- 추출 fail-closed 재실행(`scripts/lib/source-extraction-fail-closed.mjs:33`): 저장된 `contentText`는 스니펫 길이라 `cleaned_source_text_below_1200` 75/75 → **est:snippet-only** (실제 런은 본문을 재추출하므로 이 수치는 "풀 스냅샷만으로는 롱폼 불가"를 뜻할 뿐 실제 추출 QA 결과가 아님).
- 금칙어 재검사: 리더 페이지 5건 중 hit 0.

## 7. 브리프 §6 Phase 0 판단 기준 적용

| 가설 | 기준 | 측정 | 판정 |
|---|---|---|---|
| H1 소스 풀 부족 | `sources_ok/configured < 70%` 또는 사이클당 `items_new < 20` | `sources_ok` 미기록; 풀 distinct 소스 평균 10.1 / 설정 22~28 (하한 기준 36~45%); 일평균 신규 curated 2 (est); 풀 상한 30 도달 평균 28.1 | **지지** (풀은 가득 차지만 공공·CC 피드 10여 개로만 채워짐) |
| H2 게이트 과도 | `items_scored ≥ 20`이고 `passed_gate/items_scored < 5%`, 또는 `qa_passed/drafts < 50%`이고 사유 1~2개 집중 | scored 108, passed_gate 4 (3.7%), 사유 상위 2개 점유 100%; qa_passed/drafts 100% | **지지** (relevance 게이트 단일 지점에서 96%가 탈락; 그 뒤 게이트는 표본이 4건뿐) |
| H3 코드 결함 | 예외 종료 런 > 20%, 단계 카운트 불일치, 중복 발행, 단계 순서 오류 | 완주 런 정합성 불일치 0, 중복 publishedIds 0; **예외 종료 런은 원장에 남지 않아 측정 불가**(PR #55: 10-12/13 5회 연속 실패 서술); 아카이브 slug 중복 47개/103레코드; 10-04 하루 7개 fix PR이 각각 "직전 라이브 런이 0건 발행한 코드 원인"을 기록 | **부분 지지** (완주 런의 산술은 깨끗하나 abort 경로·회귀 fix 이력이 결함을 증명) |

세부 판정과 기여도 순위는 [`04-verdict.md`](./04-verdict.md).

## 8. 전체 런 표 (13 기본 컬럼, 120행)

| run_id | started_at | sources_configured | sources_ok | sources_failed | items_fetched | items_new | items_scored | passed_gate | drafts | qa_passed | published | top_error |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-08-30T18:31:40.328Z | 2026-08-30T18:31:40.328Z | 1 | >=1 | n/a | 21 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-08-31T01:22:10.751Z | 2026-08-31T01:22:10.751Z | 1 | >=1 | n/a | 21 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-08-31T15:03:33.059Z | 2026-08-31T15:03:33.059Z | 1 | >=1 | n/a | 21 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-08-31T20:44:26.104Z | 2026-08-31T20:44:26.104Z | 1 | >=1 | n/a | 21 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-01T01:48:01.373Z | 2026-09-01T01:48:01.373Z | 1 | >=1 | n/a | 21 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-01T12:33:03.246Z | 2026-09-01T12:33:03.246Z | 1 | >=1 | n/a | 21 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-01T18:17:14.186Z | 2026-09-01T18:17:14.186Z | 1 | >=1 | n/a | 11 | 0 | 1 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-02T01:00:43.263Z | 2026-09-02T01:00:43.263Z | 1 | >=1 | n/a | 11 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-02T12:06:01.843Z | 2026-09-02T12:06:01.843Z | 1 | >=1 | n/a | 11 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-02T18:30:51.927Z | 2026-09-02T18:30:51.927Z | 1 | >=1 | n/a | 11 | 6 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-02T22:25:19.332Z | 2026-09-02T22:25:19.332Z | 8 | >=6 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-02T23:20:58.218Z | 2026-09-02T23:20:58.218Z | 9 | >=8 | n/a | 30 | 0 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-02T23:52:43.468Z | 2026-09-02T23:52:43.468Z | 9 | >=8 | n/a | 27 | 0 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-03T01:01:08.551Z | 2026-09-03T01:01:08.551Z | 9 | >=8 | n/a | 27 | 0 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-03T01:15:28.198Z | 2026-09-03T01:15:28.198Z | 9 | >=8 | n/a | 27 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-03T12:05:19.423Z | 2026-09-03T12:05:19.423Z | 9 | >=7 | n/a | 25 | 0 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-03T18:26:18.319Z | 2026-09-03T18:26:18.319Z | 9 | >=6 | n/a | 26 | 0 | 1 | 1 | 1 | 1 | 0 | column:no_qualifying_story |
| 2026-09-04T00:58:11.574Z | 2026-09-04T00:58:11.574Z | 9 | >=6 | n/a | 28 | 0 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-04T08:40:29.159Z | 2026-09-04T08:40:29.159Z | 9 | >=6 | n/a | 28 | 0 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-04T09:21:35.200Z | 2026-09-04T09:21:35.200Z | 9 | >=6 | n/a | 28 | 0 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-04T09:58:46.263Z | 2026-09-04T09:58:46.263Z | 9 | >=6 | n/a | 28 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-04T12:07:18.253Z | 2026-09-04T12:07:18.253Z | 9 | >=6 | n/a | 27 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-04T18:13:46.990Z | 2026-09-04T18:13:46.990Z | 9 | >=6 | n/a | 28 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-05T00:51:58.545Z | 2026-09-05T00:51:58.545Z | 9 | >=6 | n/a | 29 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-05T11:16:19.416Z | 2026-09-05T11:16:19.416Z | 9 | >=6 | n/a | 29 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-05T15:23:53.987Z | 2026-09-05T15:23:53.987Z | 9 | >=6 | n/a | 27 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-05T17:14:48.181Z | 2026-09-05T17:14:48.181Z | 9 | >=6 | n/a | 27 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-06T00:51:31.017Z | 2026-09-06T00:51:31.017Z | 9 | >=6 | n/a | 26 | 0 | 1 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-07T06:16:36.536Z | 2026-09-07T06:16:36.536Z | 9 | >=6 | n/a | 23 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-07T13:29:36.545Z | 2026-09-07T13:29:36.545Z | 9 | >=6 | n/a | 23 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-07T19:04:01.355Z | 2026-09-07T19:04:01.355Z | 9 | >=6 | n/a | 22 | 1 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-08T01:08:48.096Z | 2026-09-08T01:08:48.096Z | 9 | >=6 | n/a | 22 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-08T12:07:14.624Z | 2026-09-08T12:07:14.624Z | 9 | >=6 | n/a | 23 | 0 | 1 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-08T18:25:54.976Z | 2026-09-08T18:25:54.976Z | 9 | >=6 | n/a | 25 | 0 | 0 | 0 | 0 | 0 | 0 | column:min_gap_not_reached:3.6h<4h |
| 2026-09-09T01:13:04.010Z | 2026-09-09T01:13:04.010Z | 9 | >=6 | n/a | 26 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-09T12:19:26.864Z | 2026-09-09T12:19:26.864Z | 9 | >=5 | n/a | 21 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-09T18:25:03.307Z | 2026-09-09T18:25:03.307Z | 9 | >=6 | n/a | 28 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-10T01:01:46.880Z | 2026-09-10T01:01:46.880Z | 9 | >=6 | n/a | 30 | 0 | 1 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-10T07:14:02.834Z | 2026-09-10T07:14:02.834Z | 22 | >=11 | n/a | 30 | 0 | 2 | 1 | 1 | 1 | 0 | column:verify:copied_source_sentence |
| 2026-09-10T08:42:26.027Z | 2026-09-10T08:42:26.027Z | 22 | >=12 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-10T12:13:07.906Z | 2026-09-10T12:13:07.906Z | 22 | >=12 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-10T12:47:21.846Z | 2026-09-10T12:47:21.846Z | 22 | >=12 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-10T18:15:15.152Z | 2026-09-10T18:15:15.152Z | 22 | >=13 | n/a | 30 | 4 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-11T00:58:59.821Z | 2026-09-11T00:58:59.821Z | 22 | >=14 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-11T12:11:39.553Z | 2026-09-11T12:11:39.553Z | 22 | >=14 | n/a | 30 | 0 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-11T18:18:20.588Z | 2026-09-11T18:18:20.588Z | 22 | >=15 | n/a | 30 | 1 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-12T01:04:18.786Z | 2026-09-12T01:04:18.786Z | 22 | >=15 | n/a | 30 | 0 | 1 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-12T11:36:19.999Z | 2026-09-12T11:36:19.999Z | 22 | >=13 | n/a | 30 | 0 | 1 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-12T17:44:10.993Z | 2026-09-12T17:44:10.993Z | 22 | >=12 | n/a | 30 | 0 | 1 | 1 | 0 | 0 | 0 | expert_insight_missing_fields named_companies |
| 2026-09-13T00:53:11.329Z | 2026-09-13T00:53:11.329Z | 22 | >=12 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-16T18:47:02.256Z | 2026-09-16T18:47:02.256Z | 22 | >=11 | n/a | 30 | 3 | 2 | 0 | 0 | 0 | 1 | infrastructure_relevance_below_signal_threshold |
| 2026-09-17T01:19:51.286Z | 2026-09-17T01:19:51.286Z | 22 | >=12 | n/a | 30 | 0 | 1 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-17T12:35:30.036Z | 2026-09-17T12:35:30.036Z | 22 | >=11 | n/a | 30 | 0 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-17T18:54:49.515Z | 2026-09-17T18:54:49.515Z | 22 | >=11 | n/a | 30 | 1 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-18T01:14:55.063Z | 2026-09-18T01:14:55.063Z | 22 | >=11 | n/a | 30 | 0 | 1 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-18T12:13:46.521Z | 2026-09-18T12:13:46.521Z | 22 | >=12 | n/a | 30 | 0 | 1 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-18T18:12:37.889Z | 2026-09-18T18:12:37.889Z | 22 | >=12 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-19T01:09:00.046Z | 2026-09-19T01:09:00.046Z | 22 | >=12 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-19T11:56:04.039Z | 2026-09-19T11:56:04.039Z | 22 | >=12 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-19T17:52:44.691Z | 2026-09-19T17:52:44.691Z | 22 | >=11 | n/a | 30 | 0 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-20T01:00:35.088Z | 2026-09-20T01:00:35.088Z | 22 | >=11 | n/a | 30 | 0 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-20T12:16:39.792Z | 2026-09-20T12:16:39.792Z | 22 | >=13 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-20T18:08:53.326Z | 2026-09-20T18:08:53.326Z | 22 | >=13 | n/a | 30 | 4 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-21T01:02:18.720Z | 2026-09-21T01:02:18.720Z | 22 | >=12 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-21T14:00:12.649Z | 2026-09-21T14:00:12.649Z | 22 | >=13 | n/a | 30 | 0 | 2 | 1 | 0 | 0 | 0 | expert_insight_missing_fields named_companies |
| 2026-09-21T19:55:50.463Z | 2026-09-21T19:55:50.463Z | 22 | >=13 | n/a | 30 | 3 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-22T01:35:34.869Z | 2026-09-22T01:35:34.869Z | 22 | >=13 | n/a | 30 | 0 | 1 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-22T12:34:23.559Z | 2026-09-22T12:34:23.559Z | 22 | >=12 | n/a | 30 | 0 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-22T18:39:05.154Z | 2026-09-22T18:39:05.154Z | 22 | >=12 | n/a | 30 | 3 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-23T01:27:14.466Z | 2026-09-23T01:27:14.466Z | 22 | >=12 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-23T12:44:55.946Z | 2026-09-23T12:44:55.946Z | 22 | >=13 | n/a | 30 | 0 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-23T18:57:04.559Z | 2026-09-23T18:57:04.559Z | 22 | >=12 | n/a | 30 | 3 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-24T01:19:50.289Z | 2026-09-24T01:19:50.289Z | 22 | >=12 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-24T12:43:19.036Z | 2026-09-24T12:43:19.036Z | 22 | >=13 | n/a | 30 | 0 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-24T18:55:47.819Z | 2026-09-24T18:55:47.819Z | 22 | >=14 | n/a | 30 | 3 | 1 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-25T01:25:39.294Z | 2026-09-25T01:25:39.294Z | 22 | >=14 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-25T12:45:06.492Z | 2026-09-25T12:45:06.492Z | 22 | >=13 | n/a | 30 | 0 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-25T19:12:37.081Z | 2026-09-25T19:12:37.081Z | 22 | >=13 | n/a | 30 | 0 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-26T01:29:09.709Z | 2026-09-26T01:29:09.709Z | 22 | >=13 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-26T12:12:58.684Z | 2026-09-26T12:12:58.684Z | 22 | >=13 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-26T18:27:13.460Z | 2026-09-26T18:27:13.460Z | 22 | >=13 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-27T01:20:36.886Z | 2026-09-27T01:20:36.886Z | 22 | >=13 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-27T12:58:32.285Z | 2026-09-27T12:58:32.285Z | 22 | >=13 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-27T18:57:54.309Z | 2026-09-27T18:57:54.309Z | 22 | >=13 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-28T01:34:54.377Z | 2026-09-28T01:34:54.377Z | 22 | >=13 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-28T15:22:17.133Z | 2026-09-28T15:22:17.133Z | 22 | >=13 | n/a | 30 | 4 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-28T21:09:40.772Z | 2026-09-28T21:09:40.772Z | 22 | >=15 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-29T02:34:41.553Z | 2026-09-29T02:34:41.553Z | 22 | >=15 | n/a | 30 | 0 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-29T14:01:02.432Z | 2026-09-29T14:01:02.432Z | 22 | >=12 | n/a | 30 | 0 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-29T19:54:17.966Z | 2026-09-29T19:54:17.966Z | 22 | >=14 | n/a | 30 | 6 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-30T02:02:49.468Z | 2026-09-30T02:02:49.468Z | 22 | >=13 | n/a | 30 | 0 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-30T13:38:14.765Z | 2026-09-30T13:38:14.765Z | 22 | >=12 | n/a | 30 | 0 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-09-30T19:55:43.760Z | 2026-09-30T19:55:43.760Z | 22 | >=14 | n/a | 30 | 2 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-10-01T02:03:36.111Z | 2026-10-01T02:03:36.111Z | 22 | >=14 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-10-01T14:26:09.597Z | 2026-10-01T14:26:09.597Z | 22 | >=14 | n/a | 30 | 0 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-10-01T20:14:28.958Z | 2026-10-01T20:14:28.958Z | 22 | >=14 | n/a | 30 | 2 | 1 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-10-02T02:09:50.283Z | 2026-10-02T02:09:50.283Z | 22 | >=14 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-10-02T13:49:38.136Z | 2026-10-02T13:49:38.136Z | 22 | >=11 | n/a | 30 | 0 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-10-02T19:50:52.362Z | 2026-10-02T19:50:52.362Z | 22 | >=13 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-10-03T01:53:43.948Z | 2026-10-03T01:53:43.948Z | 22 | >=13 | n/a | 30 | 0 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-10-03T12:28:57.858Z | 2026-10-03T12:28:57.858Z | 22 | >=11 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-10-03T18:37:01.308Z | 2026-10-03T18:37:01.308Z | 22 | >=11 | n/a | 30 | 2 | 2 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-10-04T02:33:24.486Z | 2026-10-04T02:33:24.486Z | 22 | >=11 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-10-04T08:20:01.412Z | 2026-10-04T08:20:01.412Z | 22 | >=11 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:verify:fewer_than_4_sections |
| 2026-10-04T08:49:59.885Z | 2026-10-04T08:49:59.885Z | 22 | >=11 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:draft:invalid_structured_heading |
| 2026-10-04T09:20:47.601Z | 2026-10-04T09:20:47.601Z | 22 | >=11 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:verify:unsupported_numeric_claims:18 months,12 months |
| 2026-10-04T09:51:56.286Z | 2026-10-04T09:51:56.286Z | 22 | >=11 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:voice:invalid_structured_heading |
| 2026-10-04T10:31:52.065Z | 2026-10-04T10:31:52.065Z | 22 | >=11 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 1 |  |
| 2026-10-04T13:11:31.441Z | 2026-10-04T13:11:31.441Z | 24 | >=12 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:min_gap_not_reached:2.7h<4h |
| 2026-10-04T17:17:48.065Z | 2026-10-04T17:17:48.065Z | 28 | >=12 | n/a | 30 | 0 | 3 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-10-04T17:57:33.976Z | 2026-10-04T17:57:33.976Z | 28 | >=13 | n/a | 30 | 0 | 3 | 0 | 0 | 0 | 0 | column:no_qualifying_story |
| 2026-10-04T18:58:25.513Z | 2026-10-04T18:58:25.513Z | 28 | >=13 | n/a | 30 | 0 | 3 | 0 | 0 | 0 | 0 | column:verify:insight_density_below_0.78 |
| 2026-10-04T19:58:06.717Z | 2026-10-04T19:58:06.717Z | 28 | >=13 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:draft:invalid_structured_essay |
| 2026-10-04T21:04:49.361Z | 2026-10-04T21:04:49.361Z | 28 | >=13 | n/a | 30 | 0 | 3 | 0 | 0 | 0 | 1 | column:verify:insight_density_below_0.75 |
| 2026-10-04T22:05:30.235Z | 2026-10-04T22:05:30.235Z | 28 | >=12 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 1 |  |
| 2026-10-05T01:51:47.793Z | 2026-10-05T01:51:47.793Z | 28 | >=12 | n/a | 30 | 0 | 0 | 0 | 0 | 0 | 0 | column:min_gap_not_reached:3.8h<4h |
| 2026-10-05T15:56:48.034Z | 2026-10-05T15:56:48.034Z | 28 | >=13 | n/a | 30 | 9 | 3 | 0 | 0 | 0 | 1 | column:voice:OpenRouter request failed: 402 model=anthropic/ |
| 2026-10-05T21:55:48.663Z | 2026-10-05T21:55:48.663Z | 28 | >=13 | n/a | 30 | 0 | 3 | 0 | 0 | 0 | 3 | column:draft:OpenRouter request failed: 402 model=anthropic/ |
| 2026-10-06T17:12:20.309Z | 2026-10-06T17:12:20.309Z | 28 | n/a | n/a | n/a | 7 | 3 | 0 | 0 | 0 | 0 | column:min_gap_not_reached:0.4h<4h |
| 2026-10-11T03:41:53.057Z | 2026-10-11T03:41:53.057Z | 28 | n/a | n/a | n/a | 6 | 3 | 0 | 0 | 0 | 2 | infrastructure_relevance_below_signal_threshold |
