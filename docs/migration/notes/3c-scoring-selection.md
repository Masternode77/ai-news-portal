# 3c Scoring & Selection — 레거시 노트 (유지 / 버릴 / 바꿀)

읽은 레거시: `scripts/lib/relevance-classifier.mjs`(865행), `scripts/lib/rank.mjs`, `scripts/lib/curate.mjs`, `scripts/lib/constants.mjs`, `config/relevance-routing-rules.yml`, `config/signalScoringPolicy.yml`, `config/editorialCyclePolicy.yml`, `config/sourcePriority.yml`. 코드는 한 줄도 옮기지 않았다(P9). 아래 표의 값은 **설정 데이터**로만 가져와 `config/scoring.yaml`에 적고, 엔진은 `packages/pipeline/src/stages/score.ts`에 새로 썼다.

## 0. 실측 요약

| 항목 | 레거시 | 근거 |
|---|---|---|
| 게이트 임계값 | relevance ≥ 0.75 `full_memo`, ≥ 0.55 `signal_card`, 그 아래 `archive_only`. `relevance-routing-rules.yml`의 0.75/0.55와 일치. Phase 0 실측: 채점 108건 중 통과 4(3.7%) | `relevance-classifier.mjs:1-2`, `config/relevance-routing-rules.yml:1-3`, `docs/diagnosis/02-funnel.md` |
| 관련성 점수 | 8차원 가중 어휘(직접 AI 인프라·데이터센터·클라우드 용량·반도체·전력망·냉각·자본시장·엔터프라이즈 AI 인프라). 용어 매치 가중치, 제목 매치 ×1.35, 용어당 상한 0.55, 차원 상한 1. 종합 = 1위 ×0.58 + 2위 ×0.22 + 폭 보너스 min(0.14, 0.22 이상 차원 수 ×0.035) + 직접 AI ≥ 0.75면 +0.08 | `relevance-classifier.mjs:282-427`(어휘), `445-460`(용어 채점), `744-748`(종합) |
| 조합 끌어올림 | AI+인프라 용어 동시 → 직접 AI +0.22; AI+DC ≥ 0.35 → 직접 AI ≥ 0.78; AI+전력망 ≥ 0.35+DC ≥ 0.2 → ≥ 0.82; DC+전력망 ≥ 0.35 → ≥ 0.7; AI+클라우드 ≥ 0.4 → ≥ 0.64; 소비자 AI만 → ≤ 0.28 | `relevance-classifier.mjs:705-742` |
| 상한(cap) | 엔터프라이즈만(물리·시장 차원 < 0.22) ≤ 0.72; 약한 AI 인접 ≤ 0.44; 인프라 용어 없음 ≤ 0.38(AI 있음)/0.28; 한국어 증시 잡담(관련주·수혜주·급등) + 물리 인프라 용어 없음 ≤ 0.38; 화석·공룡 ≤ 0.2; 인접 주제(스포츠 AI·법률·노동시장·소비자 하드웨어) ≤ 0.62; 정형 고시(docket) + compute 문맥 없음 ≤ 0.44; abstract 범위 소스는 `full_memo` 불가 | `relevance-classifier.mjs:750-795`, `802-805` |
| 정형 고시 가드 | Federal Register·FERC 소스(`federal-register-`·`ferc-` 접두어, 호스트 4종)에서 제목 패턴 17종("notice of availability", "combined notice of filings", "hydroelectric", "market-based rate"…) 또는 본문 "take notice that"이면 compute 문맥 용어(data center·gpu·large load·co-locate…)가 없는 한 상한 | `relevance-classifier.mjs:114-245`, `555-580` |
| 한국어 처리 | 한국어 별칭 29종을 영어 어휘로 치환(데이터 센터→data center, 전력망→grid, 액침 냉각→immersion cooling…) 뒤 같은 영어 어휘로 채점 | `relevance-classifier.mjs:246-275` |
| 순위(풀 정렬) | 최신성 버킷(≤3h 32, ≤8h 24, ≤18h 18, ≤30h 12, ≤48h 8, 그 외 2) + 관련성 ×42 + 완전성(snippet > 80자 +5, 본문 > 180자 +7, 카테고리 +2) − 같은 소스 반복 4점씩 | `rank.mjs:3-43` |
| 선택 | LLM(OpenRouter) 큐레이션 → 실패 시 결정적 폴백(소스·카테고리 다양성 ≤ 4). 플로어 3건(relevance ≥ 0.55, 전문 소스 우선), fresh 창 24 h, 최대 168 h, 일 목표 9·처리 상한 18·런당 3. 사이클 정책: 분석 2~3건, `allow_zero_publish: true` | `curate.mjs:141-230`, `constants.mjs:16-27`, `editorialCyclePolicy.yml` |
| 신호 점수 정책 | 9차원 100점(인프라 관련성 20, 근거 품질 15, 수치 구체성 10, 상업·운영 영향 10+10, 긴급성 10, 다중 출처 5, 독자 결정 가치 10, 참신성 10), 임계 82/70/55 | `config/signalScoringPolicy.yml` — 런타임에서 참조하는 코드 없음(정책 문서) |
| 근거 저장 | `infrastructure_relevance_reasons` 문자열 배열(차원:점수(용어 3개) + cap 코드)을 풀 JSON에 보관. 선택·탈락 사유는 저장하지 않음(큐레이션 로그만) | `relevance-classifier.mjs:808-828`, `curate.mjs:227` |

## 1. 유지 (규칙·값을 설정 데이터로 가져온다)

| 규칙 | 값·내용 | 새 위치 | 근거 |
|---|---|---|---|
| 임계값 0.75 / 0.55 | `thresholds.full: 0.75`, `thresholds.brief: 0.55`(ADR-004: Phase 4에서 0.65/0.45 A/B) | `config/scoring.yaml` `thresholds` | contracts §4 |
| 8차원 어휘와 가중치 | 용어·가중치 전부(136쌍), 제목 가중 0.35, 용어당 상한 0.55 | `scoring.yaml` `relevance.dimensions`, `relevance.title_boost`, `relevance.term_cap` | `relevance-classifier.mjs:282-427` |
| AI·인프라·소비자·약한 인접·화석·인접 주제 어휘 | 6개 목록 그대로 | `relevance.ai_terms` 등 | `:15-112` |
| 종합 공식·조합 끌어올림·상한 | 계수 전부(0.58/0.22/0.035/0.14/0.08, 0.22/0.78/0.82/0.7/0.64/0.28, 0.72/0.44/0.38/0.28/0.2/0.62/0.44) | `relevance.formula`, `relevance.lifts`, `relevance.caps` — 규칙의 **모양**은 코드(이름 붙은 규칙 7개·cap 7개), **숫자는 전부 설정** | `:705-795` |
| 정형 고시 가드 | 소스 id 접두어·호스트, 제목 패턴 17종, 본문 패턴 2종, compute 문맥 용어 68종·패턴 3종 | `relevance.procedural_notice` | `:114-245` |
| 한국어 별칭·증시 잡담·물리 인프라 패턴 | 29 별칭(정규식 → 리터럴 29+3건으로 전개), 증시 패턴, 물리 인프라 패턴 | `relevance.korean` | `:246-280` |
| 최신성 버킷 | 3/8/18/30/48 h 경계, 점수는 32점 만점을 1로 정규화(1 / 0.75 / 0.56 / 0.38 / 0.25 / 0.06) | `timeliness.buckets`, `timeliness.beyond` | `rank.mjs:3-11` |
| 소스 다양성 | 같은 소스 반복 감점 → 선택 단계의 `selection.per_source_max: 1` | `scoring.yaml` `selection` | `rank.mjs:41`, `curate.mjs` 폴백 |
| 사이클당 선택 수 | 사이클 정책 2~3 → 브리프 기본 1~2 | `config/pipeline.yaml` `caps.briefs_per_cycle { min: 1, max: 2 }`(이미 있음) | 브리프 3c, R2 |
| abstract 범위 소스 상한 | `text_scope: abstract`(arXiv)는 `full` 등급 불가 → `brief` | `selection.abstract_max_tier: brief` | `:802-805` |
| 인사이트 트리거 | 인사이트 잠재력 ≥ 0.7 | `insight_trigger: 0.7` | contracts §4, 브리프 3e |

## 2. 버릴 것

| 항목 | 이유 | 근거 |
|---|---|---|
| LLM 큐레이션 + 폴백 체인 | 비결정적(R7), 폴백이 암묵적으로 다른 규칙을 적용해 설명 불가(R6). 3c는 LLM 없이 결정적으로 채점·선택한다. LLM 숏리스트(한·영 동일 사건 묶기 등)는 Anthropic 키 수령 후 별도 모듈로 검토 | `curate.mjs:40-140`, plan.md 37행 |
| 일 계획·슬롯 락·플로어 채우기 | `dayPlan`·`publishedIds`·슬롯은 레거시 상태 파일에 묶인 개념. 플로어(임계 미달이어도 3건 채움)는 "0건 발행 허용"과 모순이라 버린다: 임계 미달은 선택하지 않고 `shortfall`로 보고한다 | `curate.mjs:141-230` |
| `rank.mjs` 완전성 점수(카테고리 +2) | 카테고리는 레거시 분류기 산출물. 본문 길이·권리는 `reader_value` 축이 맡는다 | `rank.mjs:32-38` |
| `signalScoringPolicy.yml` 9차원 100점 | 런타임에서 쓰이지 않는 정책 문서. 5축 루브릭(브리프)으로 대체. 근거 품질·수치 구체성·상업 영향은 impact·reader_value 축의 신호로 흡수 | `config/signalScoringPolicy.yml` |
| 일 목표 9·처리 상한 18·런당 3·fresh 24 h·최대 168 h | 사이클 캡은 `caps.briefs_per_cycle`, 신선도는 `timeliness` 축과 3a `pool_max_age_days`가 맡는다 | `constants.mjs:16-27` |
| 도메인 기반 `sourcePriority.yml` tier | 3a가 `config/sources.yaml`의 `tier`를 소스별로 들고 있다 | `config/sourcePriority.yml` |

## 3. 바꿀 것

| 항목 | 새 설계 | 비고 |
|---|---|---|
| 입력·출력 | `ScoreInput { candidates, rawItems, sources }` → `ScoreOutput { candidates(채점 완료, 전부), selected, stats }`. 후보는 `raw_item_id`로 raw item(제목·본문·발행일)과 소스(tier·권리·범위)를 찾는다 | contracts §1 개정 |
| 5축 루브릭 | `relevance`(§1의 8차원 엔진) · `timeliness`(발행일 vs 슬롯 시각 `ctx.now`, 버킷) · `impact`(규모·행위자·거래 신호: GW/MW·금액·하이퍼스케일러·칩·한국 주요 행위자·거래 동사·규제, 신호별 가중, 제목 가중) · `reader_value`(텍스트 권리·본문 길이·tier·한국/APAC 지역·수치 구체성, abstract 범위 상한) · `insight_potential`(전력 전략·용량 계획·부지·자본·한국/APAC·쟁점 프레이밍 테마 + 다차원 폭 보너스) | 각 축 0~1, `scores` jsonb |
| 총점 | `total = Σ weights[axis] × score[axis]`, 가중치 0.35/0.2/0.2/0.15/0.1(합 1, 로드 시 검증) | contracts §4 |
| 등급 | `relevance < thresholds.relevance_min`(0.55) → `BELOW_THRESHOLD`(총점 무관; 레거시 게이트가 관련성 단독이었던 것을 보존), `total ≥ thresholds.full` → `full`, `≥ thresholds.brief` → `brief`, 미달 → `BELOW_THRESHOLD`. abstract 범위 소스는 `brief` 상한. full 권리 소스인데 **긍정 추출 표식**(`payload.extraction.ok = true`, 3a)이 없는 아이템 — 추출 실패(`ok: false`) 또는 미시도(`ingest.extract_bodies: false`, `extract.kind: none`) — 은 피드 텍스트만 있으므로 reader_value를 `rewrite_only`로 계산하고 **코드에서** `brief` 상한을 건다(설정 키 없음, fail-closed; AGENTS.md: 검증 안 된 소스로 장문 생성 금지; Codex PR #61 P1 3건). replay fixture는 추출이 없으므로 full 권리 와이어도 `brief`가 상한이다 | ADR-004; 관련성 하한은 라이브 런 1에서 추가(§4.2) |
| 선택 | 통과 후보를 total(동점: timeliness → canonical_url) 내림차순, 소스당 `selection.per_source_max`(1)까지, `caps.briefs_per_cycle.max`(2)까지 `selected=true`. 통과 수 < `min`이면 채우지 않고 `shortfall` 보고 | R2, `allow_zero_publish` |
| 탈락 사유 | `reject_reason = "<CODE>: <key>=<value>[,…]"` — `BELOW_THRESHOLD: relevance=0.17,relevance_min=0.55` · `BELOW_THRESHOLD: total=0.41,brief=0.55` · `NOT_SELECTED: rank=3,max=2` · `NOT_SELECTED: source_cap=<source_id>,rank=2` | normalize와 같은 형식(R6) |
| 근거 저장 | `candidates.rubric` jsonb(신규 컬럼, `supabase/migrations/0002_candidates_rubric.sql`): `{ tier, rank, insight_eligible, reasons: { relevance, timeliness, impact, reader_value, insight_potential } }` — 축마다 사람이 읽는 한 줄(매치 용어·버킷·신호·상한) | 브리프 "항목별 점수와 근거를 저장" |
| 행 기록 | **모든** 후보를 `candidates`에 upsert(`raw_item_id`, `rubric_version = score/<scoring.version>`). 재런은 같은 행을 덮어쓴다(`run_id` 갱신). 캡에 밀린 후보는 다음 런에 다시 풀에 들어오면 재채점된다(이월 로직 없음) | ADR-003 멱등 키 |
| 설정 파일 | `config/scoring.yaml`(별도 파일, contracts §4) — `version`, `weights`, `thresholds`, `insight_trigger`, `selection`, `relevance`, `timeliness`, `impact`, `reader_value`, `insight_potential`. zod strict(`ScoringConfig`), 정규식 문자열은 로드 시 컴파일 검증. CLI `--scoring <path>` | 임계값·가중치·어휘 변경 = 설정 변경 |
| 플래그 | `flags.stages.score: false`(기본 OFF, contracts §7). 테스트·CI smoke·dry-run 증거는 `CC_FLAG_STAGES_SCORE=true` | 브리프 공통 절차 5 |
| 관측 | `stage_events.counts { candidates, passed, full, brief, below_threshold, selected, not_selected, insight_eligible, shortfall }` + `--json` `scoreStats.decisions`(≤100건: url·source·scores·total·tier·selected·reject_reason·reasons) + step summary 절 | ADR-007 |
| funnel | `passed_gate` = 임계값 통과 수(Phase 0의 정의와 같아 3.7%와 비교 가능), `selected`는 stage counts | `docs/diagnosis/02-funnel.md` |

## 4. 완료 기준 대조 (2026-10-20)

| 기준 | 결과 | 근거 |
|---|---|---|
| 모든 후보에 항목별 점수 + reason | 통과 | `candidates` 행마다 `scores`(5축)·`total`·`rubric.reasons`(축별 한 줄: 매치 용어·버킷·신호·상한). fixture 13건 전부, 재런은 같은 행 upsert — `score-stage.test.ts`, `cli.test.ts`, `rebuild-ci.yml` smoke |
| 임계값 변경이 설정만으로 가능 | 통과 | 같은 후보에 `thresholds` 0.95/0.9 → 전부 `BELOW_THRESHOLD`·`shortfall 1`, 0.4/0.3 + `max 3` → 통과 3, `per_source_max 2` → 선택 3, `max 1` → `NOT_SELECTED: rank=2,max=1`, 가중치 relevance 1.0 → `total = relevance`. 코드 변경 0 — `score-stage.test.ts` "thresholds, weights and caps come from config only" |
| 선택 결과 설명 가능 | 통과 | `selected=true` 행은 `rubric.rank`, 나머지는 `reject_reason`(`BELOW_THRESHOLD: total=…,brief=…` / `NOT_SELECTED: rank=…,max=…` / `NOT_SELECTED: source_cap=…,rank=…`) + `stage_events.counts` + `--json` `scoreStats.decisions` + step summary 표·축별 reason |
| 플래그 기본값 OFF | 통과 | `flags.stages.score: false`; 기본 런은 `score: skipped (flag_off)`, 증거 런은 `CC_FLAG_STAGES_SCORE=true` |
| 결정적·네트워크 0 | 통과 | LLM·fetch 호출 없음; `--replay`에서 실행. 같은 입력·같은 `now`면 같은 행 |

### 4.1 fixture dry-run (`scoring`, 5소스 13건, 2026-10-23T16:00Z 재측정 · 루브릭 2026-10-23.3)

`CC_FLAG_STAGES_NORMALIZE=true CC_FLAG_STAGES_SCORE=true npm run v2:pipeline -- run --dry-run --replay --fixture scoring --sources fixtures/sources/scoring.yaml --stage ingest,normalize,score --json` → `done`, funnel `items_scored 13 → passed_gate 6`, score 75 ms. 후보 13 · 통과 6(full 0 · brief 6) · 미달 7 · 선택 2 · 미선택 4 · insight-eligible 6 · shortfall 0.

첫 측정(2026-10-20T09:05Z, 루브릭 2026-10-20.1)은 통과 6(full 4 · brief 2)이었다. 두 가지가 바뀌었다: ① Codex 2차 반영으로 full 권리 와이어(wire-a)도 replay에는 `payload.extraction.ok = true` 표식이 없어 reader_value가 `rewrite_only`(−0.10)로 계산되고 `brief` 상한에 걸린다(라이브에서는 추출 성공 시 full 복귀) ② fixture 발행일이 고정이라 timeliness가 0.56/0.38 → 0.06으로 감쇠했다. 순위·선택·미달 사유는 그대로다.

| # | 선택 | total | tier | R | T | I | V | P | 소스 | 아이템 | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | ✓ | 0.797 | brief | 1.00 | 0.06 | 1.00 | 0.90 | 1.00 | wire-a (t1 full) | Microsoft 1.2 GW Busan | selected |
| 2 |  | 0.753 | brief | 0.94 | 0.06 | 1.00 | 0.75 | 1.00 | wire-a | Incheon $1.4B PF 300 MW | `NOT_SELECTED: source_cap=scoring-wire-a,rank=2` |
| 3 | ✓ | 0.686 | brief | 0.84 | 0.06 | 0.90 | 0.67 | 1.00 | wire-b | KEPCO 345 kV Saemangeum (EN) | selected |
| 4 |  | 0.680 | brief | 0.84 | 0.06 | 0.95 | 0.67 | 0.84 | wire-b | 한국전력 345kV 변전소 준공 (KO, 같은 사건) | `NOT_SELECTED: rank=4,max=2` |
| 5 |  | 0.629 | brief | 0.97 | 0.06 | 0.35 | 0.75 | 0.96 | wire-a | Seoul liquid cooling PUE 1.15 | `NOT_SELECTED: rank=5,max=2` |
| 6 |  | 0.575 | brief | 0.85 | 0.06 | 0.59 | 0.47 | 0.76 | federal-register | Combined Notice: 500 MW large-load DC | `NOT_SELECTED: rank=6,max=2` (compute 문맥 → 상한 해제) |
| 7 |  | 0.463 | – | 0.97 | 0.06 | 0.00 | 0.47 | 0.40 | arxiv | liquid cooling 150 kW thermal limits | `BELOW_THRESHOLD` (impact 0) |
| 8 |  | 0.421 | – | 0.70 | 0.06 | 0.45 | 0.10 | 0.60 | wire-c | Nvidia·SK hynix HBM4 | `BELOW_THRESHOLD` (reader_value 0.10) |
| 9 |  | 0.303 | – | 0.43 | 0.06 | 0.35 | 0.47 | 0.00 | federal-register | NOA Final EIS hydroelectric relicensing | `BELOW_THRESHOLD` (`caps=procedural_notice(0.44)`) |
| 10 |  | 0.286 | – | 0.70 | 0.06 | 0.00 | 0.10 | 0.15 | wire-c | Enterprise AI Kubernetes operator | `BELOW_THRESHOLD` (`caps=enterprise_only(0.72)`) |
| 11 |  | 0.208 | – | 0.38 | 0.06 | 0.00 | 0.32 | 0.15 | wire-b | AI 데이터센터 관련주 급등 | `BELOW_THRESHOLD` (`caps=korean_market_chatter(0.38)`) |
| 12 |  | 0.117 | – | 0.16 | 0.06 | 0.00 | 0.32 | 0.00 | wire-b | Stegosaurus fossil auction | `BELOW_THRESHOLD` (`caps=hard_archive(0.2)`) |
| 13 |  | 0.072 | – | 0.00 | 0.06 | 0.00 | 0.40 | 0.00 | wire-a | Photo app pet portraits | `BELOW_THRESHOLD` (`caps=weak_ai_adjacent(0.44)`) |

축별 reason 예(1위): relevance `dims=direct_ai_infrastructure:1.00(ai data center/gpu clusters) data_center:1.00(data center/data centers/campus) power_grid:1.00(grid/interconnection/substatio…` · timeliness `age=88.5h,bucket=beyond` · impact `signals=capacity_gw(1.2 gw),capacity_mw(200 mw),money_billion($2.1 billion),hyperscaler(microsoft),korea_major(kepco),deal_action(signs)` · reader_value `rights=full→rewrite_only(extraction_missing,+0.2),tier=1(+0.2),body=492ch(+0.15),region=korean/busan/kepco(+0.2),figures(+0.15)` · insight_potential `themes=power_strategy(interconnection/substation),capacity_planning(capacity/phase),site_selection(campus),capital(financing),korea_apac(busan);breadth=6dims(+0.15)`.

읽는 법: 소스당 1 규칙이 wire-a의 2위를 밀어내 wire-b가 2번째 슬롯을 받았고, 한·영 같은 사건(3·4위)은 토큰 규칙으로는 묶이지 않아 둘 다 통과했다(3b 열린 질문 1과 같은 한계; 이번 fixture에선 사이클 캡이 중복 발행을 막았다). timeliness는 fixture 발행일이 고정이라 실행 시각에 따라 내려간다(테스트는 `now` 고정).

다른 fixture: `dedupe` 6 후보 → 통과 3(full 0·brief 3; 첫 측정 10-20은 통과 4(full 1·brief 3), 차이는 timeliness 감쇠와 wire-a 상한) → 선택 2(wire-a 0.724 brief, wire-b 0.633 brief). `sample`(Google 릴리스노트·GAO·EC 연설 등 30건 중 6) → 통과 0, `shortfall 1`, 선택 0 — 레거시가 "플로어"로 채우던 상황을 새 구조는 0건 + 보고로 처리한다.

### 4.2 라이브 dry-run

**런 1 — [Actions run 39400530432](https://github.com/Masternode77/ai-news-portal/actions/runs/39400530432)** (`rebuild/v2` `864d93c7`, `--dry-run --live --stage ingest,normalize,score`, 메모리 원장·DB, 시크릿 없음, 2026-10-20T09:25Z, 64 s, status `partial` = 소스 실패 6).

| 단계 | 결과 |
|---|---|
| ingest | 80 소스 74 ok / 6 실패(nrc-news 403, insidehpc 러너 TLS, capacity-media 타임아웃, etnews fetch 실패, venturebeat-ai 429, berkeley-lab-news 403), `items_fetched` 200(캡: 교차 중복 8 뒤 123 컷), 추출 56/0/144 |
| normalize | 풀 200 → 후보 198, 탈락 2(`title_key`, 3b와 같은 FR 정형 고시 쌍), 64 ms |
| score (v2026-10-20.1) | 후보 198 → **통과 17**(full 1 · brief 16) → 선택 2 · 미선택 15 · 미달 181 · insight-eligible 9 · shortfall 0 · 155 ms. funnel `passed_gate 17/198 = 8.6%`(Phase 0 레거시 3.7%) |

선택: ① datacenterdynamics "Google expands partnership with Entergy Arkansas…" total 0.765 **full**(R 0.78 · T 1.0 · I 0.66 · V 0.55 · P 0.76; `capacity_mw(440mw), hyperscaler(google)`) ② doe-newsroom "Energy Department announces Virginia and West Virginia transmission…" 0.686 brief(R 0.73 · T 0.06 · I 1.0 · V 0.80 · P 0.98). 3~17위는 `NOT_SELECTED: rank=n,max=2`(datacenterfrontier Colossus $575M, storagereview Meta Prometheus, datacenterpost, DCD 배터리, EC press, meta-engineering, …). 통과 17건의 소스는 11곳(DCD 3, DOE 3, datacenterpost 2, EC 2, 그 외 1씩) — 소스당 1 규칙이 유효했다. 상위 100건 샘플의 cap 적용: `no_infra` 24, `procedural_notice` 4; 총점 분포 0.7대 1 · 0.6대 8 · 0.5대 18 · 0.4대 26 · 0.3대 40 · 0.2대 7; timeliness 버킷 ≤3h 18 · ≤8h 10 · ≤18h 17 · ≤30h 20 · beyond 35(풀 창 10일).

**런 1에서 드러난 문제 두 가지(→ v2026-10-20.2로 수정, 런 2에서 재측정)**
1. **관련성 하한 부재**: EC 연설(관련성 **0.17**, `€90 billion` 등 impact 0.75 + 전문 4,529자 reader_value 0.72)이 총점 0.564로 통과, DOE 가스 파이프라인 고시(관련성 0.34)가 0.567로 통과. 레거시 게이트는 관련성 단독이었으므로 `thresholds.relevance_min: 0.55`를 추가 — 하한 미달은 총점과 무관하게 `BELOW_THRESHOLD: relevance=…,relevance_min=…`. 런 1 기준으로 통과 17건 중 4건(EC press 0.53, FERC 고시 0.49, DOE 파이프라인 0.34, EC 연설 0.17)이 걸러져 13건(6.6%)이 된다.
2. **금액 패턴 오탐**: "1 million GPUs"(Meta Prometheus)가 `money_million`으로 집계. 금액 신호는 통화 기호(`$ € £ ₩`)나 통화 단어(dollars/euros/won/usd/krw)를 요구하도록 좁혔다.

**런 2 — [Actions run 39401326128](https://github.com/Masternode77/ai-news-portal/actions/runs/39401326128)** (`rebuild/v2` `8d1602bb`, scoring v2026-10-20.2, 2026-10-20T09:32Z, 64 s, status `partial` = 소스 실패 5; etnews는 이번엔 성공).

| 단계 | 결과 |
|---|---|
| ingest | 80 소스 75 ok / 5 실패(nrc-news 403, insidehpc 러너 TLS, capacity-media 522, venturebeat-ai 429, berkeley-lab-news 403), 풀 200(캡 129 컷) |
| normalize | 200 → 198(탈락 2 `title_key`) |
| score | 후보 198 → **통과 12**(full 1 · brief 11) → 선택 2(런 1과 같은 두 건) · 미선택 10 · 미달 186(그중 **관련성 하한 167**) · insight-eligible 9 · shortfall 0 · 206 ms. funnel `passed_gate 12/198 = 6.1%` |

런 1 통과 17건의 행방: 12건은 그대로 통과(순위만 이동), 4건은 `BELOW_THRESHOLD: relevance=…,relevance_min=0.55`(EC press 0.53 · FERC 고시 0.49 · DOE 파이프라인 0.34 · EC 연설 0.17 — 의도한 효과), 1건(meta-engineering Prometheus)은 런 2 풀에 없었다(라이브 피드라 런마다 풀 구성이 조금 다르다; 금액 오탐 제거로 impact도 0.51 → 0.31이 됐을 항목). 통과 12건은 8개 소스(DCD 3 · DOE 2 · datacenterpost 2 · datacenterfrontier · storagereview · bloomberg-technology · datacenterknowledge · semianalysis), 관련성 최저 0.71. "1 million GPUs"는 더 이상 금액으로 잡히지 않는다(storagereview impact 0.56 → 0.31).

**관찰·한계(Phase 4 튜닝 대상)**: ① 48시간 이상 지난 DOE 기사(T 0.06)가 impact 1.0 + 전문 reader_value 0.8로 2~3위에 올라온다 — timeliness 가중치 0.2·`beyond 0.06`이 의도한 균형인지 Josh 판단 필요(§5-4). ② 통과 12건 중 `signals=none`이 5건 — impact 축이 0이어도 관련성·독자 가치로 brief 등급에 든다. ③ 발행본 비교는 메모리 DB라 0(Supabase 적용 후 재확인). ④ 선택 2건은 두 런에서 동일했다(결정적).

## 5. 열린 질문 (Josh)

1. **선택 캡의 단위**: `caps.briefs_per_cycle { min 1, max 2 }`를 그대로 썼다(R2). 사이클 3회/일 × 2 = 일 6건 상한이 의도와 맞는지.
2. **insight 트리거 0.7의 역할**: 3c는 `rubric.insight_eligible`만 표시한다(fixture 13건 중 6건). 3e가 "당일 상한 1" 안에서 **선택된** 후보 중에서만 고를지, 통과했지만 미선택인 후보도 에세이 소재로 쓸지.
3. **같은 사건의 한·영 두 기사**: 둘 다 통과하면 소스가 다를 때 둘 다 선택될 수 있다. 3d 이전에 (a) 3b에 교차 언어 묶기(임베딩, Phase 4), (b) 선택 단계에서 `korea_major`·수치 신호 동일 시 묶기 규칙, (c) 그대로 두고 3d LLM이 중복을 보고하게 하기 — 권고는 (a)를 Phase 4 shadow 데이터로 결정.
4. **impact·reader_value·insight 축의 초기 계수**는 레거시 근거 없이 새로 정했다(§3). Phase 4 shadow run에서 Josh가 "발행했을 글" 표시로 재조정하는 대상이다. 지금 바꾸고 싶은 값이 있으면 `config/scoring.yaml`만 고치면 된다.
5. **`candidates.rubric` 컬럼(0002)**: 0001 미적용 상태라 두 파일을 함께 적용하면 된다. 0001에 합쳐 한 파일로 둘지(적용 전이니 가능), 분리 유지할지.
