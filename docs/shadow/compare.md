# Shadow run — 런별 비교표 (Phase 4)

기준선: Phase 0 funnel(`docs/diagnosis/02-funnel.md`, 레거시 120런: 완주 런의 발행 성공률·`passed_gate` 3.7 %). 레거시는 2026-10-11 이후 정지 상태라 "같은 기간" 비교는 Phase 0 기준선과의 비교로 대체한다(브리프 Phase 4 작업 2).

## 1. 런 표 (Telegram 요약 또는 step summary에서 옮김; 값은 원장이 진실)

| # | run_id | 슬롯(KST) | status | fetched (ok/cfg) | new | scored | gate | drafts | qa | published | cost USD | notify | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | `1f37243a`(dry-run, 원장 없음) | 2026-10-27 02:25(dispatch) | partial | 200 (74/80) | 200 | 197 | 19 | 2 | 2 | 0 (none, would 2) | 0.00 | off | secrets 등록 전 첫 전 단계 라이브 dispatch(run 40368348551, `main` `2b40ebcf`): fixture LLM·placeholder 이미지. gate 19 = full 3·brief 16, relevance 하한 미달 155. 선택 1위 uk-desnz "COP31 pavilion partners"(relevance 0.698·total 0.87)는 채점 오탐 후보 → §3 샘플 검토 대상. 실패: insidehpc `SOURCE_UNREACHABLE` ×3, hpcwire `HTTP_403` ×2, capacity-media `HOST_NOT_ALLOWED` ×1(소스 후속 목록과 일치) |

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
