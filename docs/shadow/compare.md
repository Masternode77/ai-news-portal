# Shadow run — 런별 비교표 (Phase 4)

기준선: Phase 0 funnel(`docs/diagnosis/02-funnel.md`, 레거시 120런: 완주 런의 발행 성공률·`passed_gate` 3.7 %). 레거시는 2026-10-11 이후 정지 상태라 "같은 기간" 비교는 Phase 0 기준선과의 비교로 대체한다(브리프 Phase 4 작업 2).

## 1. 런 표 (Telegram 요약 또는 step summary에서 옮김; 값은 원장이 진실)

| # | run_id | 슬롯(KST) | status | fetched (ok/cfg) | new | scored | gate | drafts | qa | published | cost USD | notify | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | `1f37243a`(dry-run, 원장 없음) | 2026-10-27 02:25(dispatch) | partial | 200 (74/80) | 200 | 197 | 19 | 2 | 2 | 0 (none, would 2) | 0.00 | off | secrets 등록 전 첫 전 단계 라이브 dispatch(run 40368348551, `main` `2b40ebcf`): fixture LLM·placeholder 이미지. gate 19 = full 3·brief 16, relevance 하한 미달 155. 선택 1위 uk-desnz "COP31 pavilion partners"(relevance 0.698·total 0.87)는 채점 오탐 후보 → §3 샘플 검토 대상. 실패: insidehpc `SOURCE_UNREACHABLE` ×3, hpcwire `HTTP_403` ×2, capacity-media `HOST_NOT_ALLOWED` ×1(소스 후속 목록과 일치) |
| 1 | `c5bfd8b2`(dry-run, 원장 없음) | 2026-10-30 17:19(dispatch) | partial | 200 (73/80) | 200 | 196 | 17 | 2 | 2 | 0 (none, would 2) | 0.00 | sent ✓ | M4 3단계 secrets 검증 dispatch(run 41025582174, `main` `16c0c13f`): 러너 env에 secrets 5개 `***`(OPENAI만 빈 값), Telegram 전송 1회 성공, fixture LLM. ops-check: Supabase 원장 읽기 OK → `never`(완료 런 0) → 알람 이슈 #78 create(설계된 첫 경보). 실패: doe-newsroom `SOURCE_UNREACHABLE` ×3(20 s 타임아웃), nrc-news `HTTP_403` ×2, insidehpc·capacity-media(후속 목록) |
| 2 | `e2355999` | 2026-10-30 17:23(dispatch) | partial | 200 (75/80) | 200 | 196 | 19 | **0** | 0 | 0 | 0.00 | sent ✓ | M4 4단계 첫 staging 쓰기(run 41026056302, `rebuild/v2` `9ef757d9`, `llm_provider=anthropic`): 원장 행·stage_events·redirects 17행 동기화는 성공했으나 Anthropic 호출 2건 모두 `LLM_REQUEST_REJECTED` 400 "tool_choice: type tool/any are not supported for this model"(Claude Opus 5.5는 강제 tool 호출 거부) → 초안 0·dead letter 2. ops-check는 run 잡과 동시에 돌아 자기 런 완료 전 원장을 읽고 `never` 재경보(#78 그대로). 둘 다 `abc880a7`로 수정(structured outputs `output_config.format`, `ops-check needs: run`) |

## 2. 일별 집계 (완료 기준 1·2·5)

| 날짜 | 런 | done | partial | budget_stop | failed | 미종료 started | published ≥ 1인 런 | 비율 | 비용 합 | 예외 메모 |
|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | |

## 3. 샘플 검토 (완료 기준 3) — Josh

| slug | 제목 | QA 판정(rules) | Josh 판정 | 유형(오탐: 막아야 할 것을 통과 / 미탐: 통과시켜야 할 것을 막음) | 조치(tuning-log #) |
|---|---|---|---|---|---|
| | | | | | |

## 4. 롤백 드릴 (완료 기준 4)

| 일시 | R1 | R2 | R3 | R4 | 총 소요 | 메모 |
|---|---|---|---|---|---|---|
| | | | | | | |
