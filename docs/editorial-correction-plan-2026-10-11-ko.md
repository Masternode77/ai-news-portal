# Compute Current 기사 정정 계획 (독립 검증 반영판)

기준일: 2026년 10월 11일 / 검증 기준 커밋: `396bd6f` (PR #47 head, main `32e6e87` 위에 1커밋)

이 문서는 ChatGPT Pro 검수 보고서(`docs/editorial-quality-audit-2026-10-11.md`, PR #47)의 주장을 저장소 데이터·코드·테스트로 독립 재검증한 결과와, 그 결과를 반영해 수정한 정정 계획이다. 원 보고서를 대체하지 않고 보완한다.

## 1. 요약

- 보고서의 정량 주장(발행 27편, 38,156단어, Kubernetes `supplied extract` 11회, EIA 5편 아라비아 숫자 0건, 신규 가드 5편 적발·15편 경고)은 저장 데이터와 정확히 일치한다. 테스트 주장(130/130, 27/27)도 재실행으로 확인했다.
- P0 사실 지적(운용리스 회계, Gilroy 연표, Texas 허가 기관, Taalas 대금, CDU 열 경계, Blender 추론 proxy)은 모두 본문에서 확인되는 실제 문제다. 다만 세 건은 보고서의 설명 자체를 손봐야 한다. 회계는 IFRS 16이 아니라 ASC 842가 1차 기준이고, ERCOT 칼럼(9월 16일 발행)은 보고서가 언급한 9월 21일 TCEQ 지시를 알 수 없는 시점의 글이며, 800 VDC 칼럼은 본문이 이미 한계를 밝히고 있어 제목·덱과 일부 문장만 문제다.
- 보고서가 놓친 더 큰 결함은 저장된 원문 추출 자체다. NVIDIA financing·Quantum·Eaton 세 칼럼의 `cleaned_source_text`는 HPCwire 관련기사 목록으로 오염돼 있고, Switch IPO 칼럼의 원문은 191자, Samsung 칼럼의 원문은 주간 요약 기사다. 이 다섯 편은 "문장을 고치면 되는" 수준이 아니라 근거 자체를 다시 확보해야 하는 대상이다.
- 정정은 저장된 원문 증거로 뒷받침되는 범위에서만 문장 단위로 수행하고, 각 기사에 correction note와 수정일을 남긴다. 자동 비공개·일괄 치환·재생성은 하지 않는다. 원문 재확인이 필요한 항목은 이 문서 6절에 남긴다.

## 2. 보고서 주장 대조표

| 주장 | 검증 결과 | 비고 |
|---|---|---|
| 발행 기사 27편(칼럼 22 + EIA 5), 1,087 고유 레코드, 38,156단어 | 일치 | `articlePagePublished=true` 기준 재집계 |
| Kubernetes 칼럼 `supplied extract` 11회, coding-agent 칼럼 `the extract I have` 반복 | 일치 (11회 / 4회) | |
| EIA 5편 본문에 아라비아 숫자 0건 | 일치 | 원문에는 수치가 풍부함(예: 2026년 부하 +1.9%, ERCOT 연평균 10%) |
| 집중 테스트 130/130, 신규 가드 27/27 | 일치 | `LLM_PROVIDER=disabled PIPELINE_OFFLINE=0` 재실행 |
| 운용리스가 자산·부채를 모두 off-balance-sheet로 유지 (NVIDIA financing) | 오류 확인, 보고서 설명 보완 필요 | 미국 하이퍼스케일러는 US GAAP 적용 대상이라 ASC 842가 1차 기준. ASC 842도 운용리스 사용권자산·리스부채를 재무상태표에 인식한다. "capital lease"는 ASC 840 시대 용어(현행은 finance lease). IFRS 16은 보조 근거 |
| Gilroy: 2020→2026을 4년으로 표현 | 오류 확인, 추가 결함 발견 | "2026년 7월 착공"과 "last month 착공"은 저장 원문에 없음. "San Jose 남서쪽 30마일"은 방향 오류(Gilroy는 남동쪽)이며 거리도 원문에 없음 |
| Texas 허가를 Railroad Commission에 연결 | 오류 확인 | Texas 발전설비 air permit 발급 기관은 TCEQ. 개별 허가 기록은 네트워크 차단으로 대조 불가 |
| Taalas: 체결을 대금 지급으로 표현 | 오류 확인 | 원문은 "definitive agreement"; 거래 조건 비공개 여부도 원문에 없음 |
| Delta CDU: 150 kW 정격으로 200 kW 랙 지원 주장 | 오류 확인 | 원문은 "최대 150 kW 방열", 공랭 설비의 air handler·열 봉쇄에 의존한다고 명시 |
| ERCOT: 구조적 배급·미래 기한·계약 결론 확대 | 확인, 단 보고서 연표 수정 | 칼럼은 9월 16일 발행, 원문은 9월 3일 EIA 기사. "9월 21일 TCEQ 지시"를 칼럼에 접목하면 안 됨. 수정은 EIA 문장 범위로 축소 |
| Sandbox·Gym-class: 보험·책임 단정 | 확인 | 가설·예측 문장은 유지하되 "현행 약관은 ~를 담보하지 않는다"류 단정은 진단 질문으로 전환 |
| Intel: Blender를 추론 성능 근거로 사용 | 확인 | "Rendering is a proxy for inference compute" 명시적 오류. "the first integrated GPU I have seen" 가공 경험 포함 |
| 800 VDC: 시설 내부 배전과 계통연계 혼동 | 부분 확인 | 본문은 "does not eliminate the power queue"를 명시. 문제는 제목·덱, "two-year substation replacement cycle", "18~30개월" 등 출처 없는 수치, "480 V AC→800 V DC at the rack" 원문 미기재 |
| EU ratings URL에 과거 논지 잔존 | 확인 | slug `brussels-turned-waste-heat-into-a-permit-condition…` 유지. 본문 첫 단락의 정정 설명은 유지 |
| 라이브 사이트맵 26 URL, Vercel production 커밋 | 검증 불가 | 이 세션에서 computecurrent.com·gov.texas.gov 등 외부 호스트 접근이 차단됨. 생산 배포 정렬 주장을 하지 않는다 |

## 3. 보고서가 놓친 문제

1. **원문 추출 오염 (엔진 결함).** `9ccadbbb854d8c11`(NVIDIA financing), `0a214f44a3ae4610`(Quantum), `2cc01594647686aa`(Eaton)의 `cleaned_source_text`는 본문이 아니라 HPCwire 사이드바 teaser 묶음이다. `extraction_qa`는 boilerplate_ratio 0, sentence_completion_score 1로 통과시켰다. NVIDIA financing 칼럼의 핵심 사실(Apollo·BlackRock 등 6개사, $500B)은 피드 `contentText`에만 있다. Quantum 칼럼의 그림은 Oratomic $300M·Hyperion 조각을 "근거"로 표시한다. 추출 QA에 "관련기사 teaser 오염" 검사(짧은 문장 조각 다수, `…` 종결, 제목형 문장 연속)가 필요하다.
2. **Switch IPO 칼럼은 191자 원문 위에 1,337단어를 얹었다.** "Tier-1 facilities", "Nevada and Michigan utilities", "operating for more than a decade", "track record of energization"은 모두 원문에 없다. P1이 아니라 근거 부재 기준 P0다.
3. **Samsung 칼럼의 원문은 "Chip Industry Week in Review" 주간 요약이고, 저장 추출문에는 zHBM·zNAND-O·BV-NAND·Kioxia 37 Gb/mm²·NEO 세부가 없다.** 피드 snippet의 "Memory density increases"만 확인된다. 제품 세부 주장은 전체 roundup 재확인 전까지 "출처 귀속 유지 + 재확인 필요"로 표시한다.
4. **반복 문장.** "I track data center capacity the way most people/analysts track chip supply…"가 Gilroy·Switch·Sandbox 세 칼럼의 서두에 변형 반복된다. 반복 검출기가 칼럼 간 lead 유사도를 잡지 못한 사례다.
5. **가공된 이력·persona 노출이 보고서 집계보다 넓다.** "I have argued for two years"(ERCOT), "I have argued before"(Amazon Texas), "I have written before"(Eaton), "the first integrated GPU I have seen"(Intel), "Two Standing Positions Apply Directly"(NVIDIA 소제목), "I argue from two standing positions"(Gilroy), "This position rests on two standing views"(Delta), "The standing position I argue from"(Intel). 새 가드의 정규식은 이 중 일부만 잡는다.
6. **가드 적용 범위.** 새 reader-copy 가드는 `authoredColumnQualityResult`에만 연결돼 있다. EIA 복원 경로(`eia-restoration-inventory.mjs`)와 subscription 생성 경로는 통과하지 않는다. 또한 `(supplied|provided)\s+(extracts?|excerpts?)` 규칙은 "the vendor provided excerpts of the contract" 같은 정상 문장을 오탐할 수 있으므로 운영 반영 전 샘플 검토가 필요하다.
7. **EIA 기사 본문은 `config/eiaRestorationArticles.json`에서 파생된다.** `latest-news.json`만 고치면 복원 스크립트 재실행 시 되돌아간다. 두 곳을 함께 수정해야 한다.

## 4. 수정된 우선순위

| 등급 | 기사 | 이번 PR에서 수행하는 정정 | 추가 재확인 필요 |
|---|---|---|---|
| P0 | NVIDIA financing | 리스 회계 문장 정정(ASC 842/IFRS 16), 자금조달 단계 구분, persona 소제목 교체, 오염된 그림 라벨 교체 | HPCwire 원문 전체 대조(추출 오염) |
| P0 | Amazon Gilroy | 4년 연표 정정, 착공·통전 단계 분리, 방향·거리 삭제, standing position 문장 교체 | 착공 시점은 Tom's Hardware/WSJ 원문 재확인 |
| P0 | Amazon Texas gas | 허가 기관 TCEQ로 정정, "building"→계획 단계, 가공 기한(Q3 2026) 삭제, 의존성 제거 표현 완화 | 실제 TCEQ 허가 기록 |
| P0 | AMD/Taalas | "paid"→체결, 조건 비공개 표현 수정, 설계 기간 수치를 가정으로 표시 | 없음 |
| P0 | Delta CDU | 150 kW 정격과 200 kW 랙 분리, 공랭 시설의 air-side 한계 명시, 출하 일정 가정 표시 | 없음 |
| P0 | ERCOT | "I own this thesis outright" 등 제거, "2년간 주장" 삭제, Q4 2026 기한 삭제, 배급 결론을 조건부로, 그림 라벨 정리 | 주지사 조치의 날짜·범위(원문 접근 시) |
| P0 | Sandbox escapes | 보험·책임 단정을 진단 질문으로, 반복 서두 교체 | 없음 |
| P0 | Gym-class | OpenClaw를 "model provider"로 부른 문장 정정, 약관 단정 완화, 가공 기한 완화 | 없음 |
| P0 | Intel iGPU | Blender→추론 proxy 문장 삭제·대체, "free at the margin" 수정, 가공 경험 삭제, 그림 라벨 정리 | 없음 |
| P0 | NVIDIA 800 VDC | 제목·덱 수정, 출처 없는 리드타임 수치 제거, 변환 단계 설명을 원문 범위로, 그림 라벨 정리 | 없음 |
| P0(신규) | Switch IPO | 원문에 없는 회사 이력·시설 등급 삭제, S-1 내용은 "기대"로 명시, 그림 정리 | Bloomberg 원문(유료) |
| P1 | Kubernetes | 작성 과정 표현 11+5건을 원문 기준 표현으로 재작성(부재 주장 강화 금지), 그림 제목 교체 | 없음 |
| P1 | Coding-agent | "the extract I have" 4건 재작성, 그림 제목 교체 | 없음 |
| P1 | Samsung | 밀도→랙 전력 직결 문장 완화, 출처 귀속 명시 | 전체 roundup 대조 |
| P1 | Quantum, Eaton | 오염된 그림 항목 교체, 가공 이력 문장 수정 | HPCwire 원문 전체 대조 |
| P1 | Efficiency, SK hynix, Hormuz | 확정적 산업 타임라인·직결 인과 문장 완화 | 없음 |
| P1 | EIA 5편 | 원문의 수치·기간·지역·계약 당사자를 본문에 추가(config와 latest-news 동시 수정) | 없음 |
| P2 | Malaysia, EU ratings, Cooling procurement | 변경 없음 또는 최소 편집 | 없음 |

## 5. 정정 원칙과 메커니즘

- 근거는 저장소에 있는 원문(`cleaned_source_text`, 피드 `contentText`/`snippet`)만 사용한다. 저장 원문에 없는 사실은 추가하지 않고, 기존 문장이 저장 원문으로 뒷받침되지 않으면 귀속을 바꾸거나 삭제한다.
- 문장 단위 교체를 스크립트로 수행하고, 각 교체는 원문 문자열이 정확히 1회 존재할 때만 적용한다. 본문 전체 재생성은 하지 않는다.
- 각 수정 레코드에 `corrections: [{ date, summary }]`를 추가하고 `updatedAt`을 갱신한다. 칼럼·뉴스 상세 페이지는 본문 아래에 "Corrections and updates" 블록을 렌더링하고, 구조화 데이터에 `dateModified`와 `correction`을 넣는다. correction note 문구도 reader-copy 가드의 검사 대상에 포함한다.
- `publishedAt`, slug, URL, 이미지, `authored_quality` 통과 상태는 바꾸지 않는다. 자동 비공개는 하지 않는다. 다만 6절의 재확인이 끝나기 전까지 해당 칼럼을 내릴지 여부는 운영 판단 사항으로 남긴다.
- 수정 후 `authoredColumnQualityResult`를 수정 칼럼 전체에 다시 실행해 통과 여부를 기록하고, 집중 테스트·reader-copy 감사·`content:gate`를 실행해 실제 결과를 보고한다.

## 6. 네트워크 재확인이 필요한 항목 (이 세션에서 수행 불가)

- 라이브 사이트맵 URL 수와 coding-agent 칼럼의 운영 게시 여부.
- Vercel production 배포 커밋과 로컬 체크아웃 비교(AGENTS.md 생산 기준선 규칙). Vercel API 호출은 403으로 거부됐다.
- HPCwire(NVIDIA financing·Quantum·Eaton), Tom's Hardware(Gilroy 착공 시점), Semiconductor Engineering(Samsung 세부), Bloomberg(Switch) 원문 전체 대조.
- Texas 주지사 9월 조치의 날짜·범위와 Pecos County 발전소의 TCEQ 허가 기록.

## 7. 후속 엔진 작업 (이 PR 범위 밖)

1. 추출 QA에 관련기사 teaser 오염 검사를 추가하고, 오염 시 장문 생성을 차단한다.
2. reader-copy 가드를 EIA 복원 경로와 subscription 경로에도 연결하고, 오탐 샘플 검토 후 `--strict`를 운영 게이트에 넣는다. → 2026-10-11 별도 변경으로 완료. 적용 범위·규칙 검토·게이트 편입 결정은 `docs/reader-copy-gate-decision-2026-10-11.md`에 기록.
3. 칼럼 간 lead 문장 유사도를 반복 검출기에 추가한다.
4. 보고서 4절의 claim ledger(상태 값 포함)와 근거량 기반 길이 정책은 그대로 유효하다.

## 8. 정정 로그

정정은 문장 단위 교체 스크립트로 적용했고(교체 문자열은 각각 정확히 1회 일치해야 적용), 각 레코드에 `corrections[]`와 갱신된 `updatedAt`을 기록했다. 아래 note는 기사 페이지의 "Corrections and updates" 블록과 구조화 데이터 `correction`에 그대로 노출된다. EIA 5편은 `config/eiaRestorationArticles.json`의 본문 배열도 함께 수정했다.

| 기사 ID | 등급 | 제목 | 게재된 correction note (독자용 원문) |
|---|---|---|---|
| `col_2a7e9ab01954bb9f` | P1 | I read OpenAI's monthly-doubling coding-agent curve as demand, not as a cost line | Replaced references to the drafting system's input with references to Epoch AI's analysis, keeping every statement about what Epoch does not report bounded to the figures it published, and replaced a figure that repeated the headline with the reported usage figures. |
| `col_5be9ec4d110578c9` | P1 | Up to 3× pod density is a benchmark, not a RAM budget cut | Replaced references to the drafting system's input with references to the Kubernetes Blog post itself, without strengthening any claim about what the post omits; added the post's reported memory limits, run times and sandbox counts; removed process assurances and persona language; and replaced a figure that repeated the headline with the three benchmarks. |
| `col_82697d9ea33d8c58` | P2 | Malaysia’s server-trade gap turns permit enforcement into a capacity-risk signal | 변경 없음 (근거와 본문이 일치) |
| `col_b3a7a5ab60c3b9b1` | P1→변경 없음 | EU data center ratings could make heat reuse a commercial test | 변경 없음 (근거와 본문이 일치) |
| `col_55e9ccd7116252dd` | P0 | ERCOT's six-week demand record turns Texas interconnection into a capacity gate | Removed process and persona language, limited the description of the Texas moratorium and ERCOT audit to what the EIA reported, converted an invented audit deadline and a rationing conclusion into conditional readings, removed an unsourced rate-case timing figure, and rebuilt both figures from the EIA numbers. |
| `col_4fcaacca965031d9` | P2 | Cooling Capacity Should Set the Server Procurement Envelope | 변경 없음 (근거와 본문이 일치) |
| `col_776dcf6e9c89b581` | P0 (신규) | Switch's IPO Is a Grid-Timing Disclosure Test, Not a Demand Story | Removed company history, facility-tier and utility-relationship claims that Bloomberg's one-sentence report does not support, stated explicitly that the column describes what a data-center prospectus would need to show, replaced a repeated opening device, and rewrote the figure. |
| `col_13e55e0a75a620db` | P0 | Sandbox Escapes Move Liability From Model Risk To Infrastructure Security | Converted categorical statements about insurance coverage and liability frameworks into diligence questions and labeled forecasts, replaced a repeated opening device, and rewrote clipped figure labels. |
| `col_fca83bb71323a3ba` | P1 | Quantum networking hardware is not AI infrastructure yet | Removed figure rows and a statistic that came from unrelated HPCwire stories captured alongside the announcement, limited the description of the partnership to HPCwire's summary, and removed a claimed personal observation history. |
| `col_b6074069a1555367` | P0 | NVIDIA's $500 Billion Financing Bet Assumes Compute Acts Like Infrastructure | Corrected the description of lessee accounting for operating leases (ASC 842 and IFRS 16 both put right-of-use assets and lease liabilities on the balance sheet), separated the stated $500 billion financing ambition from committed or funded capital, replaced a persona heading, and replaced a figure label that had been built from a contaminated source extract. |
| `col_69cab7b291d16a59` | P0 | AMD's Taalas Bet Only Pays If Inference Models Stop Changing | Corrected the lead to describe a signed definitive agreement rather than a completed payment, labeled design-cycle and ship-date figures as the column's assumptions, and rewrote clipped figure labels. |
| `col_24b7abd6a12c5e63` | P0 | Delta's 150kW CDU is a retrofit admission, not a roadmap win | Separated the CDU's 150 kW rating from the 200 kW rack draw the source reports, stated that a liquid-to-air unit still depends on the hall's air-side heat rejection, removed unsourced ship dates and timeline figures, replaced persona language, and rebuilt both figures as a rating-versus-rack-power comparison. |
| `col_4af3df9a2131c335` | P0 | Gym-class hack shifts agent liability from theory to contract | Corrected the description of OpenClaw (the report calls it an AI agent and names no model provider), reframed categorical statements about insurance coverage and liability as the column's reading with the governing terms and jurisdiction unknown, fixed an inconsistent forecast horizon, and rewrote clipped figure labels. |
| `col_7c5e4b3b0b775337` | P1 | Efficiency as strategy means supply stays tight longer than capex implies | Made the two-to-five-year efficiency horizon a conditional rather than a firm industry timeline, removed universal statements about power as the binding constraint, and rewrote clipped figure labels. |
| `col_f73d297e3be9969c` | P1 | Eaton's quantum contract is a grid-planning bet, not a quantum bet | Reframed a funded research program as a procurement signal rather than a demonstrated grid-planning bottleneck, removed a claimed prior-writing reference, and completed a clipped figure label. |
| `col_ad15e2d4c145e30d` | P1 | SK hynix's tiered-memory pitch is a margin-defense play, not an architecture breakthrough | Labeled the margin-defense motive and market-condition statements as the column's inferences rather than reported facts, removed an unsourced HBM capacity figure, and completed clipped figure labels. |
| `col_4dd46fdfbc30fd72` | P0 | Intel's integrated workstation GPU could be an edge-inference cost story | Removed the claim that rendering is a proxy for inference and labeled the edge-inference thesis as an extrapolation pending an inference benchmark, corrected "free at the margin" to account for incremental device costs, removed unsourced configuration, battery and latency figures, replaced persona language, and rebuilt the figures from the reported benchmarks. |
| `col_3dbd354c8bc9107d` | P0 | Amazon's Gilroy site proves zoning lead time beats community consensus | Corrected the project chronology (the four-year span runs from the 2020 application to the 2024 close of public comment, not to a construction start), removed an unsourced construction-start date and an incorrect direction from San Jose, stopped inferring firm power from neighboring retail, replaced persona language, and rewrote clipped figure labels. |
| `col_4425d817371fe825` | P0 | Amazon's Texas gas plant is a queue-jumping move, not a climate story | Corrected the permitting agency (air-quality permits for Texas generating units are issued by TCEQ, not the Railroad Commission), described the plant as planned rather than under construction, removed an invented permit deadline, stopped describing on-site generation as eliminating delivery dependencies, removed a claimed prior-advocacy reference, and rebuilt the figure from the source. |
| `col_292b67321a052acf` | P0 | NVIDIA's 800 VDC hybrid rack is a retrofit path inside the fence, not more grid capacity | Retitled and reframed the column so that the hybrid rack is described as an in-facility retrofit rather than a substation or interconnection workaround, removed unsourced interconnection lead-time and input-voltage figures, replaced "native 800 VDC substations" with the facilities NVIDIA describes, and rebuilt the figure from the post's own figures. |
| `col_ba22f5ea8bef96e6` | P1 | Hormuz volatility exposed diesel backup as an unhedged margin line | Replaced statements that Brent moves translate directly into diesel cost with a description of the basis and lag between crude and delivered fuel, fixed an earnings-call timing error, and rebuilt both figures from the EIA figures without clipped labels. |
| `col_414c93d7b5969906` | P1 | Samsung's vertical-stacking play moves the constraint from memory supply to packaging and thermal delivery | Labeled the memory announcements as roadmap and concept disclosures from a weekly roundup, separated package power density from rack power, softened a conclusion that memory supply is no longer a constraint, and completed a clipped figure label. Product details remain as attributed to Semiconductor Engineering's roundup. |
| `eia-data-center-load-timing` | P1 | Data-center load is turning spare generation into a timing problem | Added the EIA's forecast load growth rates, scenario design, generation shares and modeled regional price effects; the analysis is otherwise unchanged. |
| `eia-server-cooling-forecast` | P1 | Cooling makes server growth a two-part electricity forecast | Added the AEO2026 release date, the commercial electricity-intensity threshold, the cooling-intensity and efficiency assumptions and the 2050 cooling difference between cases; the analysis is otherwise unchanged. |
| `eia-virginia-peak-load` | P1 | Virginia's commercial power growth is becoming a peak-load test | Added PJM's Dominion-zone peak-load figures, growth forecast and the EIA's hourly peak distribution; the analysis is otherwise unchanged. |
| `eia-nuclear-data-center-contracts` | P1 | Nuclear power contracts do not erase data-center delivery risk | Added the counterparties, contracted capacities, ramp terms, restart target and regulatory steps reported by the EIA; the analysis is otherwise unchanged. |
| `eia-texas-large-loads` | P1 | Texas needs to distinguish approved large loads from live demand | Added the EIA's approved-capacity, application-queue, utilization and scenario figures with their forecast year; the analysis is otherwise unchanged. |

검증 결과(실행 시점 기준)는 PR 설명과 `docs/editorial-quality-audit-2026-10-11.md`의 독립 검증 부록에 기록한다.
