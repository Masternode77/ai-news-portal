# 3b Normalize & Dedupe — 레거시 노트 (유지 / 버릴 / 바꿀)

브리프 Phase 3 공통 절차 1. 레거시의 정규화·중복 제거 경로를 읽고 새 `stages/normalize`에 무엇을 가져올지 정한다. 복붙 금지(P9): "유지"는 **규칙·임계값·엣지 케이스**를 가져온다는 뜻이고 코드는 새 계약(`contracts.md` §1, ADR-003 `candidates`, ADR-004 `DUPLICATE_OF_PUBLISHED`)에 맞춰 다시 쓴다.

대상 레거시: `scripts/lib/normalize.mjs`, `source-deduplication.mjs`, `fetch-feeds.mjs:317-420`(`selectPoolItems`·`liveCopyKey`·`carryOverPoolItems`), `curate.mjs:192-207`(`rollingCandidates`의 `publishedSet`), `industry-headlines.mjs:256-292`(`similar`·`selectHeadlines`), `signal-deduper.mjs`, `near-duplicate-phrase-detector.mjs`, `content-quarantine.mjs`, `pipeline.mjs:146-162`(`dedupeById`). (2026-10-20 읽기, 인용은 그 시점 라인.)

## 0. 실측 요약

| 항목 | 레거시 | 근거 |
|---|---|---|
| 아이템 식별자 | `id = sha1(normalizeUrl(url) \| canonicalTitle(title))[0:16]` — URL **과 제목**을 함께 해시하므로 피드가 제목을 고치면 같은 URL이 새 아이템이 된다(이월 로직이 `liveCopyKey`로 다시 묶음) | `normalize.mjs:77-80`, `fetch-feeds.mjs:393-404` |
| URL 정규화 | `http`/`https` 구분 유지, 자격증명 거부, `utm_*` 5종 + `ref`·`fbclid`·`gclid`·`mc_cid`·`mc_eid` 제거, fragment 제거(Google 릴리스노트 예외). `www.`·trailing slash·쿼리 순서·AMP 변형은 그대로 | `normalize.mjs:9-39` |
| 풀 내 중복 제거 | 3곳에서 서로 다른 규칙: ① `selectPoolItems`는 `id` + 제목에서 영숫자만 남긴 키(`[^a-z0-9가-힣]` 제거) ② `dedupeSourceItems`는 fragment 뺀 URL + 불용어 제거 제목 키 ③ `selectHeadlines`는 URL + 토큰 겹침 비율(공유/min ≥ 0.7, 같은 언어만) | `fetch-feeds.mjs:336-354`, `source-deduplication.mjs:4-36`, `industry-headlines.mjs:256-292` |
| 발행본과의 중복 | `state.publishedIds`·`dayPlan.publishedIds`에 있는 **id**만 제외 — URL이 같아도 제목이 바뀌면 통과, 다른 매체의 같은 기사는 전혀 못 잡음 | `curate.mjs:192-207` |
| 본문 유사도 | 수집·선별 단계에는 없음. `near-duplicate-phrase-detector`(생성문 vs 금칙 구절, 창 Jaccard 0.82)와 `repetition-detector`(생성물 간 리드 문장 템플릿 반복)는 **생성 이후** QA용 | `near-duplicate-phrase-detector.mjs:48-73`, `repetition-detector.mjs:331-395` |
| 격리(quarantine) | 발행 레코드에 `public_status`·`quarantine_reason`을 덧씌우는 발행 측 플래그. 비상 모드 환경변수가 꺼져 있으면 아무 일도 안 함 | `content-quarantine.mjs:22-57` |
| 탈락 사유 기록 | 없음. 중복으로 버려진 아이템은 콘솔에도 남지 않는다(Phase 0 D3와 같은 "보이지 않는 실패") | `fetch-feeds.mjs:343-348` |

## 1. 유지 (규칙으로 가져온다)

| 규칙 | 값·내용 | 새 위치 | 근거 |
|---|---|---|---|
| URL 추적 파라미터 제거 목록 | `utm_*`, `ref`, `fbclid`, `gclid`, `mc_cid`, `mc_eid` (+ 3a에서 `utm_id`) | `lib/url.ts` `TRACKING_PARAMS`(3a) + `urlIdentityKey`의 확장 목록 | `normalize.mjs:22-33` |
| Google 릴리스노트 fragment 보존 | `#Month_DD_YYYY`는 아이템 정체성의 일부 | `urlIdentityKey`가 `googleReleaseNoteTarget`일 때만 fragment 유지 | `normalize.mjs:21`, `source-deduplication.mjs:27` |
| `liveCopyKey` 발상 | 호스트에서 `www.` 제거 + trailing slash 제거 + 쿼리·fragment 포함 → "같은 글의 다른 표기" 묶기 | `urlIdentityKey(canonical_url)` — 소스 접두어는 뺀다(소스 간 중복이 목적) | `fetch-feeds.mjs:393-404` |
| 제목 정규화 키 | 소문자, `&`→and, 영숫자·한글만, 불용어 제거(the/a/an/to/for/and/with/from/by/on/of/in/at/as) | `lib/similarity.ts` `titleKey` | `normalize.mjs:68-75`, `source-deduplication.mjs:4-11` |
| 제목 토큰 유사도 | 토큰 길이 > 2, 같은 언어끼리만 비교 | `titleSimilarity` = Dice 계수(토큰 집합; 한글은 문자 bigram 추가). 임계값은 ADR-004의 **0.85**(레거시 0.7은 링크 전용 레인용) | `industry-headlines.mjs:256-266` |
| 발행본 7일 창 | ADR-004: `canonical_url` 일치 또는 제목 유사도 ≥ 0.85 + 7일 내 발행본 | `normalize.published_window_days: 7`(제목 비교만 창 적용, URL 일치는 무기한) | ADR-004 `DUPLICATE_OF_PUBLISHED` |
| 창 Jaccard | 토큰 n-gram 집합의 Jaccard로 재서술된 사본 탐지 | `bodySimilarity` = 단어 5-gram shingle Jaccard ≥ 0.6, 양쪽 모두 ≥ 40 토큰일 때만 | `near-duplicate-phrase-detector.mjs:27-46` |
| 소스 우선순위 | 같은 글이 여러 소스에 있으면 하나만 남긴다 | `text_rights`(full > rewrite_only > link_only) → tier → 본문 길이 → URL 순으로 **대표 사본** 선택. 3a의 "tier 순 첫 소스"보다 생성에 유리한 사본을 남긴다 | `fetch-feeds.mjs:318-321` |

## 2. 버릴 것

| 항목 | 이유 | 근거 |
|---|---|---|
| `stableArticleId`(URL+제목 해시) | 제목 수정이 새 아이템을 만든다. 새 구조는 `raw_items.id = uuid5(canonical_url)`(결정적, 제목 무관), 발행 slug는 ADR-005 규칙 | `normalize.mjs:77-80` |
| 3곳에 흩어진 중복 규칙 | 한 Stage(`normalize`)에 한 규칙 집합. ingest는 정확히 같은 `canonical_url`만 접는다(3a) | §0 |
| `publishedIds` id 집합 | id가 아니라 **URL 정체성·제목 유사도**로 발행본과 비교(`publications.sources[].url`·`title`) | `curate.mjs:192-207` |
| 이월(carry-over)·`liveCopyKey`의 소스 접두어 | `raw_items`가 영속이라 이월 불필요(3a) | `fetch-feeds.mjs:406-420` |
| `content-quarantine` | 발행 측 플래그. 3b는 발행 전 중복 차단만; 발행 후 격리는 `publications.status='quarantined'`(3h) | `content-quarantine.mjs` |
| `signal-deduper` 레이어·지역·회사 키 | 분류 결과(3c 이후)에 의존. 3b는 분류 없이 동작해야 한다 | `signal-deduper.mjs:3-15` |
| 임베딩 유사도 | 브리프는 "제목 유사도(또는 임베딩)". 의존성·비용 0인 토큰 규칙으로 시작하고, 재서술 사본의 미탐은 Phase 4 shadow 데이터로 측정 후 결정 | 브리프 3b |

## 3. 바꿀 것

| 항목 | 새 설계 | 비고 |
|---|---|---|
| 입력·출력 | `NormalizeInput { rawItems, sources }` → `NormalizeOutput { candidates: CandidateInsert[](미채점), stats }`. `candidates.raw_item_id`는 3a가 찍는 결정적 `raw_items.id = uuid5(canonical_url)` | contracts §1·§5 개정 |
| 판정 순서 | ① 발행본 URL 정체성 일치 → `DUPLICATE_OF_PUBLISHED` ② 7일 내 발행본 제목(`title`, `sources[].title`) 유사도 ≥ 0.85 → `DUPLICATE_OF_PUBLISHED` ③ 풀 내: URL 정체성 → `content_hash` → 제목 키 → 제목 유사도 → 본문 shingle → `DUPLICATE_IN_POOL`(대표 사본을 `duplicate_of`로 기록) | 가장 싼 규칙부터 |
| 탈락 기록 | 탈락 아이템은 `candidates` 행으로 **upsert**: `selected=false`, `reject_reason = "<CODE>: <method>=<duplicate_of>"`, 점수 0, `rubric_version = normalize/<version>`. 살아남은 후보는 메모리로 3c에 넘기고 3c가 채점 행을 쓴다(미채점 행을 남기지 않음) | ADR-003 `candidates.reject_reason`, R6 |
| 설정 | `config/pipeline.yaml` `normalize: { version, title_similarity 0.85, body_similarity 0.6, body_min_tokens 40, published_window_days 7, published_page_size 1000 }` — 전부 선택, 기본값은 스키마 | contracts §4 개정 |
| 플래그 | `flags.stages.normalize: false`(기본 OFF, contracts §7). 테스트·CI smoke·dry-run 샘플은 `CC_FLAG_STAGES_NORMALIZE=true`로 켠다 | 브리프 공통 절차 5 |
| 관측 | `stage_events.counts { pool, candidates, rejected, duplicate_of_published, duplicate_in_pool, method_* , published_compared }` + `--json`의 `normalizeStats.decisions`(≤100건: url, source, reason, method, duplicate_of, score) + step summary 절 | ADR-007 |
| 발행본 비교 입력 | `publications`에서 `status=published` 행 **전부**를 `published_at` 내림차순으로 `published_page_size`(1000)씩 페이지 순회(`DbPort.offset`, PostgREST `range`)해 `sources[].url` 정체성 키(무기한)를 만들고, 7일 창 안의 행에서만 제목 토큰을 준비. 한 번의 select로 잘라 읽으면 창 밖의 오래된 발행본 URL이 색인에서 빠진다(Codex PR #60 P2). 새 파이프라인의 `title`은 한국어라 영문 원제와 비교가 안 되므로 `PublicationSource.title`(선택)을 추가해 3h가 원제를 남기게 한다 | 레거시 이관 행은 영문 `title`로 비교됨 |
| `--stage` | 콤마 목록 허용(`--stage ingest,normalize`) → 라이브 dry-run 잡이 두 단계를 돌린다 | CLI 개정 |
| fixture DB 시드 | `fixtures/db/<fixture>.json`이 있으면 메모리 DbPort에 미리 넣는다(현재 `publications`만). 발행본 중복을 replay에서 재현하기 위함 | fixtures/README 갱신 |

## 4. 완료 기준 대조 (2026-10-20)

| 기준 | 결과 | 근거 |
|---|---|---|
| 동일 기사 3개 소스 fixture → 1개 수렴 | 통과 | `fixtures/rss/dedupe-wire-{a,b,c}.xml` + `fixtures/sources/dedupe.yaml`: 같은 기사를 와이어 A(utm 포함 URL)·B(`www.` 없음 + trailing slash)·C(다른 URL, 제목에 ", sources say" 추가)가 실어 → 후보 1(A, tier 1 `full`). B는 `DUPLICATE_IN_POOL: url=…`, C는 `DUPLICATE_IN_POOL: title=…`(Dice 0.9). `normalize-stage.test.ts`·`cli.test.ts`·CI smoke(`rebuild-ci.yml`)가 강제 |
| 발행본과 중복 시 reject reason 기록 | 통과 | `fixtures/db/dedupe.json`의 발행본(`news/eia-data-center-load-timing`, 출처 URL `eia.gov/todayinenergy/detail.php?id=67344`)을 와이어 C가 `&utm_source=wire-c`를 붙여 다시 실음 → `candidates` 행 `selected=false`, `reject_reason = "DUPLICATE_OF_PUBLISHED: url=news/eia-data-center-load-timing"`, `rubric_version = normalize/2026-10-20.1`. 제목 유사도 경로(7일 창 안의 발행본 `sources[].title`, 창 밖은 통과, `unpublished` 행은 비교 제외)는 `normalize-stage.test.ts` |
| canonical URL 정규화 | 통과 | `urlIdentityKey`: `www.`/`m.`/`amp.` 접두어, trailing slash, `index.html`, `/amp/`, `utm_*`+추적 파라미터 20종, 파라미터 순서, fragment(Google 릴리스노트 anchor 예외) — `normalize-lib.test.ts` |
| 본문 해시 | 통과 | 3a의 `content_hash`(sha256 제목+본문) 일치 → `hash` 방법 |
| 제목 유사도 near-dup | 통과 | 토큰 Dice ≥ 0.85(ADR-004), 한글은 문자 bigram, 혼합어(삼성SDS) 분리. 제품 접두어만 같은 릴리스노트 항목은 분리됨(테스트) |
| 플래그 기본값 OFF | 통과 | `flags.stages.normalize: false`; 기본 `pipeline run --dry-run --replay`는 `normalize: skipped (flag_off)`. 테스트·CI·증거 런은 `CC_FLAG_STAGES_NORMALIZE=true` |
| 탈락 사유 설명 가능(R6) | 통과 | `stage_events.counts`에 `rejected`·`duplicate_of_published`·`duplicate_in_pool`·`method_*`, `--json`의 `normalizeStats.decisions`(url·source·reason·method·duplicate_of·score ≤100건), step summary 절 |

### 4.1 fixture dry-run (2026-10-20, 세션, replay·네트워크 0)

`CC_FLAG_STAGES_NORMALIZE=true pipeline run --dry-run --replay --fixture dedupe --sources fixtures/sources/dedupe.yaml --stage ingest,normalize --json`

| 지표 | 값 |
|---|---|
| 소스 | 3/3 ok, `items_fetched` 12, `items_new` 12 (ingest 소스 간 정확 URL 중복 0) |
| normalize | pool 12 → candidates **6**, rejected 6 = 발행본 1 + 풀 내 5, 5 ms |
| 방법별 | url 2 (발행본 1 + 풀 1) · title 1 (0.9) · body 1 (Jaccard 1.0, 동일 보도자료) · title_key 1 (구두점·불용어만 다른 제목) · hash 1 (동일 제목+본문) |
| 대표 사본 | 모두 `text_rights: full`·tier 1인 와이어 A가 이김(S7은 A에 없어 tier 2 B) |

`--fixture sample`(커밋된 풀 스냅샷 30건, 소스당 캡 6)에 normalize를 켜면 pool 6 → candidates 6, 탈락 0 — Google 릴리스노트·arXiv 항목 사이에 오탐 없음. 기본 설정(플래그 OFF)은 `normalize: skipped (flag_off)`로 완주.

### 4.2 라이브 dry-run (2026-10-20, Actions run 39389217169, `rebuild/v2` `0803e095`)

`rebuild-ci.yml` › `ingest-live-dry-run`(`live_ingest=true` → `--dry-run --live --stage ingest,normalize`, 메모리 원장·DB, 시크릿 없음). 런 `dba2a570`, 07:51:00–07:52:05Z(65 s), 상태 `partial`(소스 실패 6, `top_error` `SOURCE_UNREACHABLE`), 종료 코드 1.

| 항목 | 값 |
|---|---|
| ingest | 소스 80 · ok 74 · 실패 6 · `items_fetched` 200(`caps.pool_max_items` 200 적용: 소스 간 중복 8 제거 후 316 → `pool_cap` 116 컷) · 건너뜀 2,950(`pool_cap` 포함) · 추출 ok 56 / 실패 0 / 생략 144 · 64 s |
| normalize | pool 200 → 후보 198 · 탈락 2 = `DUPLICATE_IN_POOL` 2(`title_key` 2) · `duplicate_of_published` 0 · `published_compared` 0 · 67 ms |
| 탈락 2건 | Federal Register 절차 고시 2쌍: "Standard Instrument Approach Procedures…"(2026-21095 ↔ 21096), "Combined Notice of Filings"(2026-21439 ↔ 21438). 서로 다른 문서지만 제목이 완전히 같은 정형 고시라 `title_key`가 하나로 접는다. 편집 관점에서는 허용(둘 다 기사 가치가 없고 하나만 남아도 손실 없음)이지만 "동일 제목 = 동일 기사" 가정의 알려진 한계로 기록한다 |
| 발행본 경로 | 라이브 모드의 메모리 DB에는 발행본이 없어 비교 0건. `DUPLICATE_OF_PUBLISHED`는 fixture `dedupe`(§4.1)와 `normalize-stage.test.ts`로만 검증됐고, Supabase 적용(3h/4) 뒤 실데이터로 다시 본다 |
| 소스 실패 6 | insidehpc(`SOURCE_UNREACHABLE` fetch failed, 3a와 같은 러너 TLS), capacity-media(522), venturebeat-ai(429), berkeley-lab-news(403, 신규), blocks-and-files(`FEED_PARSE`: 리다이렉트 끝 `api.blocksandfiles.com`이 text/html 2,101 bytes 반환, 신규), nextplatform(`FEED_PARSE`: text/html 2,101 bytes, 봇 차단 페이지로 추정, 신규). 3a 런 2에서 실패했던 nrc-news(403)는 이번에 성공 |

판정: 라이브 풀 200건에서 오탐 0(탈락 2건 모두 동일 제목 정형 고시). 재서술 복제본의 미탐은 라이브 1회로는 측정할 수 없고(§5 질문 1), Phase 4 shadow 데이터에서 잰다. 풀 상한 200이 실제로 작동해 3a 런 2의 312건이 200으로 잘렸다(3c는 200건 풀을 입력으로 받는다).

## 5. 열린 질문 (Josh)

1. 한국어 매체(etnews·datanet 등)와 영문 매체가 같은 사건을 다루는 경우는 토큰 규칙으로 못 잡는다. 3c의 LLM 숏리스트에 "같은 사건" 묶기를 둘지, Phase 4에서 임베딩을 켤지.
2. 발행본 제목 비교 창 7일(ADR-004) 유지 여부. 후속 보도가 7일 뒤에 다시 발행되는 것은 허용한다는 뜻.
