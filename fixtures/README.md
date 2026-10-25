# fixtures/ — 녹화 입력 (R7 재현성)

`pipeline run --replay --fixture <name>`과 CI 테스트는 이 디렉토리만 읽고 네트워크를 쓰지 않는다. replay 모드에서는 `ctx.fetch`가 호출 즉시 `NETWORK_DISABLED`로 throw 한다.

| 경로 | 내용 | 출처·한계 |
|---|---|---|
| `rss/sample.xml` | RSS 2.0, 30개 item | **라이브 캡처가 아님.** 클라우드 세션에서 피드 호스트에 접근할 수 없어(Phase 2, 2026-10-18) 커밋된 `src/data/news-pool.json`(커밋 `32e6e8720b5388a50dddc30293402105710c2dfc`, 2026-10-11)의 실제 title/url/pubDate/snippet을 RSS로 재직렬화했다. Phase 3a에서 실제 피드 응답으로 교체한다. |
| `llm/news_brief.sample.json` | `LlmResponse` 1건, `json`은 `NewsBriefDraft`(제목·요약·의미·렌즈·태그) **합성** 샘플 | 모델 출력이 아니다. 녹화 키 파일이 없을 때의 폴백(스키마·배선 검증용) |
| `llm/news_brief/<raw_item_id>.json` | Phase 3d 녹화 키 파일: `scoring` fixture의 선택 2건 — 부산 1.2 GW(`e13b7a66-…`, 숫자 전부 원문에 있음)와 KEPCO 345 kV(`69638e20-…`, 원문에 없는 "2027"을 일부러 포함해 grounding 보고를 검증) | **합성**(손으로 쓴 `NewsBriefDraft` 모양, 모델 출력 아님). 파일명은 `LlmRequest.cacheKey`(= raw item id)를 파일명 안전화한 것. Anthropic 키 수령 후 실제 응답 녹화로 교체 |
| `images/<slug>.json` | Phase 3f 이미지 fixture: `{ mime, base64, model?, cost_usd? }` 녹화 응답 또는 `{ fail: "<reason>" }` 스크립트 실패. slug는 `news/<hash>` → `news_<hash>.json` | **현재 파일 없음** — 파일이 없으면 fixture 공급자가 `FIXTURE_MISSING`으로 실패해 체인 폴백(플레이스홀더)을 검증하는 데 그대로 쓰인다(`image-stage.test.ts`는 임시 디렉토리에 녹화·실패 파일을 만들어 양쪽을 검증). `image.provider: fixture` + `fallback_chain: [placeholder]`로 켠다 |
| `html/` | 본문 추출용 HTML 녹화 (Phase 3a에서 추가) | 비어 있음 |
| `rss/dedupe-wire-{a,b,c}.xml` + `sources/dedupe.yaml` | Phase 3b 중복 제거 fixture: 가상의 와이어 3곳(tier 1 full / 2 / 3)이 같은 이야기를 URL 변형(`www.`·trailing slash·utm)·제목 변형·동일 보도자료 본문·동일 제목+본문·구두점만 다른 제목으로 싣고, 고유 기사 2건과 이미 발행된 EIA 글 1건을 섞은 12 item | **합성.** 매체·기사·회사는 가상(EIA 항목만 실제 발행본 URL). `pipeline run --dry-run --replay --fixture dedupe --sources fixtures/sources/dedupe.yaml --stage ingest,normalize`(`CC_FLAG_STAGES_NORMALIZE=true`) → 후보 6, 탈락 6(url 2 · title 1 · body 1 · title_key 1 · hash 1) |
| `rss/scoring-wire-{a,b,c}.xml`, `rss/scoring-arxiv.xml`, `rss/federal-register-fixture.xml` + `sources/scoring.yaml` | Phase 3c 채점 fixture: tier 1 full 와이어(부산 1.2 GW 계약·인천 $1.4B PF·서울 액침 냉각·소비자 사진 앱), tier 2 한국어 와이어(KEPCO 345 kV 영문·한글 같은 사건, 공룡 화석, 증시 잡담), tier 3 link_only(HBM4·엔터프라이즈 AI), abstract 범위 arXiv 1건, Federal Register 정형 고시 2건(수력 EIS vs 500 MW large-load) — 13 item | **합성.** 매체·기사·회사·고시는 가상. `pipeline run --dry-run --replay --fixture scoring --sources fixtures/sources/scoring.yaml --stage ingest,normalize,score`(`CC_FLAG_STAGES_NORMALIZE=true CC_FLAG_STAGES_SCORE=true`) → 후보 13, 임계 통과 6(replay에는 추출 표식이 없어 full 권리 와이어도 `brief` 상한 → brief 6), 미달 7, 선택 2(소스당 1). 발행일이 고정이라 timeliness는 실행 시각에 따라 내려간다(테스트는 `now` 고정). Phase 3g: `scoring-wire-a.xml`의 부산 기사만 `content:encoded`(2단락, 944자)를 갖는다 — fixture 어댑터가 라이브처럼 `body_preview`(800자 상한)로 실어 full 권리 소스가 `SOURCE_UNREACHABLE`(< 500자)에 걸리지 않게 하고, 그 초안이 QA 12규칙을 통과하는 기준 샘플이 된다; KEPCO 초안은 녹화 응답의 "2027"로 `UNGROUNDED_NUMBER` 거절 샘플 |
| `db/dedupe.json` | 메모리 DbPort 시드: `publications` 1행(레거시 `news/eia-data-center-load-timing`의 slug·제목·출처 URL·날짜만, 편집 본문 없음) | `fixtures/db/<fixture>.json`은 fixture 런에서 자동 적재된다. 행은 `PublicationRow`로 엄격 검증 |

규칙:

- fixture에 시크릿·개인정보·전문(full text) 저작물을 넣지 않는다. 설명(description)은 600자 이내 발췌로 제한한다.
- 새 fixture는 이 표에 출처(커밋 또는 캡처 일시·URL)와 한계를 적는다.
- 어댑터는 `fixtures/<kind>/<name>.<ext>`를 읽고, 없으면 `sample`로 폴백하지 않는다(명시적 실패).
