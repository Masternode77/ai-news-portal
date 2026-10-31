# Shadow run — 런별 비교표 (Phase 4)

기준선: Phase 0 funnel(`docs/diagnosis/02-funnel.md`, 레거시 120런: 완주 런의 발행 성공률·`passed_gate` 3.7 %). 레거시는 2026-10-11 이후 정지 상태라 "같은 기간" 비교는 Phase 0 기준선과의 비교로 대체한다(브리프 Phase 4 작업 2).

## 1. 런 표 (Telegram 요약 또는 step summary에서 옮김; 값은 원장이 진실)

| # | run_id | 슬롯(KST) | status | fetched (ok/cfg) | new | scored | gate | drafts | qa | published | cost USD | notify | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | `1f37243a`(dry-run, 원장 없음) | 2026-10-27 02:25(dispatch) | partial | 200 (74/80) | 200 | 197 | 19 | 2 | 2 | 0 (none, would 2) | 0.00 | off | secrets 등록 전 첫 전 단계 라이브 dispatch(run 40368348551, `main` `2b40ebcf`): fixture LLM·placeholder 이미지. gate 19 = full 3·brief 16, relevance 하한 미달 155. 선택 1위 uk-desnz "COP31 pavilion partners"(relevance 0.698·total 0.87)는 채점 오탐 후보 → §3 샘플 검토 대상. 실패: insidehpc `SOURCE_UNREACHABLE` ×3, hpcwire `HTTP_403` ×2, capacity-media `HOST_NOT_ALLOWED` ×1(소스 후속 목록과 일치) |
| 1 | `c5bfd8b2`(dry-run, 원장 없음) | 2026-10-30 17:19(dispatch) | partial | 200 (73/80) | 200 | 196 | 17 | 2 | 2 | 0 (none, would 2) | 0.00 | sent ✓ | M4 3단계 secrets 검증 dispatch(run 41025582174, `main` `16c0c13f`): 러너 env에 secrets 5개 `***`(OPENAI만 빈 값), Telegram 전송 1회 성공, fixture LLM. ops-check: Supabase 원장 읽기 OK → `never`(완료 런 0) → 알람 이슈 #78 create(설계된 첫 경보). 실패: doe-newsroom `SOURCE_UNREACHABLE` ×3(20 s 타임아웃), nrc-news `HTTP_403` ×2, insidehpc·capacity-media(후속 목록) |
| 2 | `e2355999` | 2026-10-30 17:23(dispatch) | partial | 200 (75/80) | 200 | 196 | 19 | **0** | 0 | 0 | 0.00 | sent ✓ | M4 4단계 첫 staging 쓰기(run 41026056302, `rebuild/v2` `9ef757d9`, `llm_provider=anthropic`): 원장 행·stage_events·redirects 17행 동기화는 성공했으나 Anthropic 호출 2건 모두 `LLM_REQUEST_REJECTED` 400 "tool_choice: type tool/any are not supported for this model"(Claude Opus 5.5는 강제 tool 호출 거부) → 초안 0·dead letter 2. ops-check는 run 잡과 동시에 돌아 자기 런 완료 전 원장을 읽고 `never` 재경보(#78 그대로). 둘 다 `abc880a7`로 수정(structured outputs `output_config.format`, `ops-check needs: run`) |
| 3 | `375fc076` | 2026-10-30 17:33(dispatch) | partial | 200 (75/80) | 0 (all seen) | 196 | 19 | 2 | 0 | 0 | 0.08 | sent ✓ | run 41027154027(`rebuild/v2` `abc880a7`, `llm_provider=anthropic`): **structured outputs 정상** — Opus 5.5 호출 2건 `end_turn`(in 2,809/2,863 · out 1,627/1,480 토큰, $0.044/$0.041), 초안 2(semiconductor-engineering `news/65121580186fd621`, power-engineering `news/395ab43dd9d772f5`), QA hard `UNGROUNDED_NUMBER` ×2(증거 "450억"·"1")로 둘 다 rejected(power-eng는 `RUBRIC_BELOW_TARGET` soft auto_pass 추가) → 발행 0. 원장 행 done·stage_events 7·dead letter 0·redirects 17. ops-check(run 잡 뒤) `ok` → 이슈 #78 recovered 코멘트 + close(알람 왕복 검증 완료). 요약의 `no publication: ingest: 0 new items`는 오보(200건 전부 run 2에서 `raw_items`에 들어가 new 0이지만 196건 재채점·2건 생성) → `zeroPublishedReasons` 수정. **같은 후보 2건이 run 2·3에서 연속 선택·생성**(거절 초안 재생성 루프, 런당 ≈ $0.09) → PR #79 merge `7a697c05`(`selection.skip_review_status`). 샘플 2건 판정은 §3(미탐 1 · 정탐(경계) 1) |

## 2. 일별 집계 (완료 기준 1·2·5)

| 날짜 | 런 | done | partial | budget_stop | failed | 미종료 started | published ≥ 1인 런 | 비율 | 비용 합 | 예외 메모 |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-30 | 2 (staging: `e2355999`, `375fc076`; dispatch) | 0 | 2 | 0 | 0 | 0 | 0 | 0 % | 0.08 | run 2는 LLM 400(`abc880a7`로 수정), run 3는 QA 거절 2. 처리되지 않은 예외 0(dead letter 2는 run 2의 400, 수정됨). cron 활성 전이라 기준 1·2 집계는 cron 첫날부터 |

## 3. 샘플 검토 (완료 기준 3) — Josh

초안 본문은 `.github/workflows/shadow-review.yml` dispatch(`pipeline review`; step summary·아티팩트·잡 로그 `review.md`)로 읽는다 — 초안 전문·규칙별 최신 QA verdict·미근거 숫자 주변 원문 발췌. 대시보드 직접 열람(`drafts.body.brief`, `qa_results.evidence`)도 같은 데이터다(프리뷰 사이트는 발행본만 보여 준다). 관찰(2026-10-31): 두 초안 모두 원문이 피드 발췌 800자(`extraction_ok false`, `rewrite_only`)라 `SOURCE_UNREACHABLE`(min 500) 통과 — 주간 라운드업처럼 긴 글은 발췌 앞부분만 반영된다(초안도 "원문 발췌는 이 대목에서 끊겨"라고 적음). 튜닝 후보: `min_source_chars` 상향 또는 rewrite_only 소스의 본문 추출 보강(3a) — Josh 판단.

| slug | 제목 | QA 판정(rules) | Josh 판정 | 유형(오탐: 막아야 할 것을 통과 / 미탐: 통과시켜야 할 것을 막음) | 조치(tuning-log #) |
|---|---|---|---|---|---|
| `news/65121580186fd621` | semiconductor-engineering "Chip Industry Week in Review 162"(run 3, 2026-10-30) → 초안 "SK hynix, 메모리 공급 제약 2030년까지 지속 전망…" | rejected — `UNGROUNDED_NUMBER`(evidence "450억"; 다른 hard 7·soft 4 전부 통과, rubric 0.7429) | **미탐**(세션 판정 2026-10-31, `shadow-review` run 41164162469; Josh 확정 대기) | 원문 대조로 확정: 원문(피드 발췌 800자, extraction_ok false)에 "a proposed $«45»B NAND flash fab"가 있고 초안은 "450억 달러(45B 달러)"로 썼다 — 값은 맞다. `NUMBER` 정규식이 `billion/bn/million/mn/thousand`와 한국어 조/억/만/천만 읽고 통화 축약 `B/M/K`를 모르니 원문 "45B"는 비스케일 45로, 초안 "450억"은 4.5e10으로 비교돼 불일치. 초안 품질 자체는 양호(hard 7 통과) | 코드 후속 제안(3d notes §5-11): `NUMBER`에 `B/M/K`(+`bn`식 소문자 `k`) 스케일 추가 + 단위 테스트(`$45B` ↔ `450억`, `10GB`·`5MW` 오탐 없음). 승인 뒤 PR |
| `news/395ab43dd9d772f5` | power-engineering "Uprates galore: DOE's $5 billion loan for Constellation's nuclear fleet"(run 3, 2026-10-30) → 초안 "DOE, Constellation 원전 출력 증강에 최대 50억 달러 조건부 대출 약정… 약 1.1GW 추가" | rejected — `UNGROUNDED_NUMBER`(evidence "1") + `RUBRIC_BELOW_TARGET`(soft auto_pass, 0.6984 < 0.7) | **정탐(경계)**(세션 판정 2026-10-31; Josh 확정 대기) | "1"은 렌즈의 "약 1.1GW는 단일 신규 원전 **1기**에 맞먹는 규모다"에서 나왔다 — 원문(800자 발췌)에는 "1.1 gigawatts"·"$5 billion"만 있고 단독 "1"은 없다(검색 결과 "원문에 그 숫자가 없음"). 즉 규칙은 설계대로 동작했고, 초안이 원문에 없는 비교 수치(신규 원전 1기 ≈ 1.1 GW)를 렌즈에 넣은 것이 원인. 50억 달러·1.1GW·6곳은 전부 정상 grounding(`numbers 3`) | 프롬프트 후속 제안(3d): 렌즈·의미 단락에서 비교·추정 수치는 숫자 대신 말로 쓰거나("대형 원전 한 기") 원문 수치만 인용 — `prompts/news_brief.md` 규칙 1줄 + `version` 상승. 임계값·규칙 변경 없음 |

## 4. 롤백 드릴 (완료 기준 4)

| 일시 | R1 | R2 | R3 | R4 | 총 소요 | 메모 |
|---|---|---|---|---|---|---|
| | | | | | | |
