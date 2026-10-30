# Shadow run — 런별 비교표 (Phase 4)

기준선: Phase 0 funnel(`docs/diagnosis/02-funnel.md`, 레거시 120런: 완주 런의 발행 성공률·`passed_gate` 3.7 %). 레거시는 2026-10-11 이후 정지 상태라 "같은 기간" 비교는 Phase 0 기준선과의 비교로 대체한다(브리프 Phase 4 작업 2).

## 1. 런 표 (Telegram 요약 또는 step summary에서 옮김; 값은 원장이 진실)

| # | run_id | 슬롯(KST) | status | fetched (ok/cfg) | new | scored | gate | drafts | qa | published | cost USD | notify | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | `1f37243a`(dry-run, 원장 없음) | 2026-10-27 02:25(dispatch) | partial | 200 (74/80) | 200 | 197 | 19 | 2 | 2 | 0 (none, would 2) | 0.00 | off | secrets 등록 전 첫 전 단계 라이브 dispatch(run 40368348551, `main` `2b40ebcf`): fixture LLM·placeholder 이미지. gate 19 = full 3·brief 16, relevance 하한 미달 155. 선택 1위 uk-desnz "COP31 pavilion partners"(relevance 0.698·total 0.87)는 채점 오탐 후보 → §3 샘플 검토 대상. 실패: insidehpc `SOURCE_UNREACHABLE` ×3, hpcwire `HTTP_403` ×2, capacity-media `HOST_NOT_ALLOWED` ×1(소스 후속 목록과 일치) |
| 1 | `c5bfd8b2`(dry-run, 원장 없음) | 2026-10-30 17:19(dispatch) | partial | 200 (73/80) | 200 | 196 | 17 | 2 | 2 | 0 (none, would 2) | 0.00 | sent ✓ | M4 3단계 secrets 검증 dispatch(run 41025582174, `main` `16c0c13f`): 러너 env에 secrets 5개 `***`(OPENAI만 빈 값), Telegram 전송 1회 성공, fixture LLM. ops-check: Supabase 원장 읽기 OK → `never`(완료 런 0) → 알람 이슈 #78 create(설계된 첫 경보). 실패: doe-newsroom `SOURCE_UNREACHABLE` ×3(20 s 타임아웃), nrc-news `HTTP_403` ×2, insidehpc·capacity-media(후속 목록) |
| 2 | `e2355999` | 2026-10-30 17:23(dispatch) | partial | 200 (75/80) | 200 | 196 | 19 | **0** | 0 | 0 | 0.00 | sent ✓ | M4 4단계 첫 staging 쓰기(run 41026056302, `rebuild/v2` `9ef757d9`, `llm_provider=anthropic`): 원장 행·stage_events·redirects 17행 동기화는 성공했으나 Anthropic 호출 2건 모두 `LLM_REQUEST_REJECTED` 400 "tool_choice: type tool/any are not supported for this model"(Claude Opus 5.5는 강제 tool 호출 거부) → 초안 0·dead letter 2. ops-check는 run 잡과 동시에 돌아 자기 런 완료 전 원장을 읽고 `never` 재경보(#78 그대로). 둘 다 `abc880a7`로 수정(structured outputs `output_config.format`, `ops-check needs: run`) |
| 3 | `375fc076` | 2026-10-30 17:33(dispatch) | partial | 200 (75/80) | 0 (all seen) | 196 | 19 | 2 | 0 | 0 | 0.08 | sent ✓ | run 41027154027(`rebuild/v2` `abc880a7`, `llm_provider=anthropic`): **structured outputs 정상** — Opus 5.5 호출 2건 `end_turn`(in 2,809/2,863 · out 1,627/1,480 토큰, $0.044/$0.041), 초안 2(semiconductor-engineering `news/65121580186fd621`, power-engineering `news/395ab43dd9d772f5`), QA hard `UNGROUNDED_NUMBER` ×2(증거 "450억"·"1")로 둘 다 rejected(power-eng는 `RUBRIC_BELOW_TARGET` soft auto_pass 추가) → 발행 0. 원장 행 done·stage_events 7·dead letter 0·redirects 17. ops-check(run 잡 뒤) `ok` → 이슈 #78 recovered 코멘트 + close(알람 왕복 검증 완료). 요약의 `no publication: ingest: 0 new items`는 오보(200건 전부 run 2에서 `raw_items`에 들어가 new 0이지만 196건 재채점·2건 생성) → `zeroPublishedReasons` 수정. **같은 후보 2건이 run 2·3에서 연속 선택·생성**(거절 초안 재생성 루프, 런당 ≈ $0.09) → 후속 PR 제안 |

## 2. 일별 집계 (완료 기준 1·2·5)

| 날짜 | 런 | done | partial | budget_stop | failed | 미종료 started | published ≥ 1인 런 | 비율 | 비용 합 | 예외 메모 |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-30 | 2 (staging: `e2355999`, `375fc076`; dispatch) | 0 | 2 | 0 | 0 | 0 | 0 | 0 % | 0.08 | run 2는 LLM 400(`abc880a7`로 수정), run 3는 QA 거절 2. 처리되지 않은 예외 0(dead letter 2는 run 2의 400, 수정됨). cron 활성 전이라 기준 1·2 집계는 cron 첫날부터 |

## 3. 샘플 검토 (완료 기준 3) — Josh

초안 본문은 staging Supabase 대시보드 `drafts`(`review_status = rejected|none`, `body.brief`)와 `qa_results`(`evidence`)에서 읽는다(프리뷰 사이트는 발행본만 보여 준다).

| slug | 제목 | QA 판정(rules) | Josh 판정 | 유형(오탐: 막아야 할 것을 통과 / 미탐: 통과시켜야 할 것을 막음) | 조치(tuning-log #) |
|---|---|---|---|---|---|
| `news/65121580186fd621` | semiconductor-engineering "Chip Industry Week in Review 162"(run 3, 2026-10-30) | rejected — `UNGROUNDED_NUMBER`(evidence "450억") | | 의심 미탐(통과시켜야 할 것을 막음): 원문이 "$45B"처럼 `B` 축약을 썼다면 grounding이 `billion/bn`만 읽어 `450억`(=45e9)을 못 맞춘다 — 원문 대조 필요. 맞으면 코드 후속(숫자 축약 `B/M/K`) | |
| `news/395ab43dd9d772f5` | power-engineering "Uprates galore: DOE's $5 billion loan for Constellation's nuclear fleet"(run 3, 2026-10-30) | rejected — `UNGROUNDED_NUMBER`(evidence "1") + `RUBRIC_BELOW_TARGET`(soft, auto_pass) | | 의심 미탐: 단독 "1"(예: 1호기·1년·1차)이 원문에 숫자로 없을 때 — 원문·초안 대조 필요 | |

## 4. 롤백 드릴 (완료 기준 4)

| 일시 | R1 | R2 | R3 | R4 | 총 소요 | 메모 |
|---|---|---|---|---|---|---|
| | | | | | | |
