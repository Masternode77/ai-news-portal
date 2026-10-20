# 3a Sources & Ingest — 레거시 노트 (유지 / 버릴 / 바꿀)

브리프 Phase 3 공통 절차 1. 레거시 수집 경로를 읽고 새 `stages/ingest` + `SourceAdapter`에 무엇을 가져올지 정한다. 복붙 금지(P9): 아래 "유지"는 **규칙·임계값·엣지 케이스**를 가져온다는 뜻이고 코드는 새 계약에 맞춰 다시 쓴다.

대상 레거시: `scripts/lib/fetch-feeds.mjs`, `source-registry.mjs`, `source-fetch.mjs`, `source-text-fetcher.mjs`, `public-network-fetcher.mjs`, `epoch-ai.mjs`, `google-cloud-release-notes.mjs`, `source-health-monitor.mjs`, `scripts/update-industry-headlines.mjs`, `config/sourceRegistry.yml`, `config/sourcePriority.yml`, `src/data/source-health.json`. (2026-10-18 읽기, 인용은 그 시점 라인.)

## 0. 실측 요약

| 항목 | 레거시 | 근거 |
|---|---|---|
| 레지스트리 | 82행, 커스텀 라인 파서(엄격 YAML 아님), `priority` P0 11 / P1 37 / P2 34, `allow_text_use` true 29 / false 53, `status` active_feed 80 / blocked 2 | `source-registry.mjs:30-50`, `sourceRegistry.yml` |
| 실제 수집 소스 | 28개(권리 4필드 + https terms + 365일 내 리뷰 통과) | `source-registry.mjs:113-135, 159-180` |
| `priority` 사용처 | 수집 선택·정렬에 **미사용**. `sourcePriority.yml`은 읽는 코드 없음 | `fetch-feeds.mjs` 전체, `source-priority-policy.mjs:3-12` |
| 동시성 | 전 피드 `Promise.all` 무제한, 피드별 재시도 없음, 전체 1회 재시도(15초) | `fetch-feeds.mjs:431`, `pipeline.mjs:49-60, 212-216` |
| 캡 | 전역 30, 소스당 6(표시 **이름** 기준이라 Federal Register 5피드가 하나로 묶임), 소스당 1슬롯 예약 | `constants.mjs:5-8`, `fetch-feeds.mjs:317-380` |
| health | `source-health.json` 27행 전부 `stale`(필드명 불일치 버그: `publishedAt` vs `source_published_at`), 자동 비활성·알림 없음, 메인 파이프라인은 쓰지 않음 | `source-health-monitor.mjs:5`, `global-source-scan.mjs:50-51` |
| 날짜 | 파싱 실패 시 **현재 시각**으로 대체(가짜 신선도) | `fetch-feeds.mjs:107` |
| 링크 전용 레인 | `update-industry-headlines.mjs`가 별도 실행, 8 워커, 소스당 6, 7일 창, 제목·링크만 | `industry-headlines.mjs:17-23, 273-292, 377` |

## 1. 유지 (규칙으로 가져온다)

| 규칙 | 값·내용 | 새 위치 | 근거 |
|---|---|---|---|
| 네트워크 안전 가드 | https만, 443만, URL 자격증명 금지, DNS가 공용 IP일 때만(SSRF), 리다이렉트 ≤3, 같은 호스트만, 본문 ≤2 MiB, Content-Length 불일치 오류, content-type 허용 목록(xml·rss·atom·text/html) | `adapters/source/http.ts`(공용 fetch 래퍼, `ctx.fetch` 위) | `public-network-fetcher.mjs:37-61, 137-139, 160, 203`; `fetch-feeds.mjs:21-27, 220` |
| 타임아웃·UA | 피드 20 s, 페이지 12 s, `ComputeCurrentBot/1.0` | `config/pipeline.yaml` `ingest.timeouts` | `fetch-feeds.mjs:201, 218, 223` |
| 소스 실패 격리 | 실패 피드는 기록 후 건너뜀, 런 중단 없음 | 이미 `stages/ingest`(Phase 2) + dead letter | `fetch-feeds.mjs:436-439` |
| 아이템 필드 | title; link→guid; body = contentEncoded→content→summary→contentSnippet; snippet; 날짜 후보 isoDate→pubDate→published→updated→date; 이미지 enclosure→media:content→첫 `<img>` | `adapters/source/rss.ts` | `fetch-feeds.mjs:59-66, 95, 126-131` |
| 마크업 평탄화 | xml2js 객체·앵커로 감싼 제목 처리(ACER), Drupal escaped `<a>` 복구 | `rss.ts` `textValue`/`repairFeedLink` 재작성 | `fetch-feeds.mjs:39-57, 68-87` |
| URL 정리 | http→https 승격, utm_*/ref/fbclid/gclid/mc_* 제거, fragment 제거(Google 릴리스노트 예외), 자격증명 거부 | 3b `normalize`가 소유, 3a는 호출만 | `fetch-feeds.mjs:113-123`, `normalize.mjs:9-39` |
| Drupal 날짜 | `m/d/Y - H:i` 수동 파싱 | `rss.ts` 날짜 파서 | `fetch-feeds.mjs:89-105` |
| 나이 창 | 기본 10일, 소스별 `pool_max_age_days`(Epoch 21) | `sources.yaml` 필드(이미 스키마에 있음) | `fetch-feeds.mjs:241-245` |
| 절단 | snippet 220자, 본문 요약 800자 | `config/pipeline.yaml` `ingest.snippet_chars/body_preview_chars` | `fetch-feeds.mjs:145-146` |
| 소스당 상한 | 6 → **레지스트리 id 기준**(이름 아님) | `config/pipeline.yaml` `caps.items_per_source` | `fetch-feeds.mjs:344`(결함), `industry-headlines.mjs:273-292`(id 기준이 맞음) |
| 런 내 중복 제거 | `stableArticleId` = sha1(normalizedUrl\|canonicalTitle)[0:16]; 정규화 제목 키로 교차 소스 중복 제거 | 3b(`DUPLICATE_OF_PUBLISHED`), 3a는 소스 내 guid/link 중복만 | `normalize.mjs:77-80`, `fetch-feeds.mjs:334-354` |
| Google Cloud 릴리스노트 | 전체 GCP 피드에서 `<h2>Gemini Enterprise Agent Platform</h2>` 섹션만, `/release-notes`→제품 경로, `#Month_DD_YYYY` fragment를 식별자에 포함, CC BY 4.0 링크 있을 때만 | `adapters/source/extract/google-release-notes.ts` | `google-cloud-release-notes.mjs:10-50`, `fetch-feeds.mjs:132-137, 228` |
| Epoch HTML 인덱스 | `feed_format: epoch_html_index` → 인덱스에서 ≤5 링크, 21일 창, 각 글에 CC BY 4.0 href 필수, og:title/h1/title·content-header 날짜·og:description, `article-content`~`content-sidebar-right` 본문 | `adapters/source/epoch-index.ts`(`type: html`) | `epoch-ai.mjs:15, 74-138, 157-159` |
| 라이선스 마커·범위 | Kubernetes `license_marker`를 가시 텍스트에서 확인, arXiv `text_scope: abstract`(요약만) | `sources.yaml` `extract.license_marker`, `text_scope` | `source-fetch.mjs:328-359`, `fetch-feeds.mjs:152` |
| 본문 추출 한계 | 80단락·24,000자(문장 끝에서 절단), script/style/nav/aside/footer/form 제거, `<p>` ≥ 60자, 쿠키·구독·광고 줄 제외, 관련기사 오염은 하드 차단 | 3a-extract(`extract/generic.ts`) + 3g `EXTRACTION_CONTAMINATED` | `source-fetch.mjs:10-12, 266-326, 437-440` |
| EC 보도자료 JSON API, arXiv 요약 | 특수 어댑터 2종 | `extract/ec-press.ts`, `extract/arxiv-abstract.ts` | `source-fetch.mjs:128-140, 197-241` |
| 링크 전용 레인 규칙 | 제목 12~220자, 7일 창, 호스트 확인, 소스당 6, 본문 미수집 | `text_rights: link_only` 소스는 ingest가 **같은 경로**로 수집하되 `payload.text_rights='link_only'`, 본문 추출 금지, `payload`에 `snippet`·`body_preview` 없음(제목·링크만) | `industry-headlines.mjs:17-23, 224-260` |

## 2. 버릴 것

| 항목 | 이유 | 근거 |
|---|---|---|
| 커스텀 레지스트리 파서 | 엄격 YAML(`config/sources.yaml`, zod)로 대체. 254행 같은 비정형 값은 이관 때 수정 | `source-registry.mjs:30-50` |
| 권리 4필드(`text_use_basis`·`image_use_basis`·`link_only_basis`·`allow_image_reuse`) | `text_rights` 1필드 + `terms_url` + `reviewed_at`로 축약(ADR-004). 이미지 재사용은 전 소스 false라 필드 자체 불필요 | `source-registry.mjs:113-135` |
| 전역 캡 30, 이름 기준 소스 캡, 1슬롯 예약 2패스 | `pool_max_items 200` + id 기준 소스 캡 + tier 우선 정렬로 대체. Phase 0 H1 원인 | `fetch-feeds.mjs:317-380` |
| 이월(carry-over) 로직 | `raw_items`가 영속되므로 불필요. 주말 공백(arXiv)은 나이 창으로 해결 | `fetch-feeds.mjs:382-420` |
| 날짜 실패 → 현재 시각 | `published_at_source = null` + 3b/3g `DATE_INVALID` 처리 | `fetch-feeds.mjs:107` |
| 무제한 `Promise.all` | 동시성 6(설정) | `fetch-feeds.mjs:431` |
| `FEEDS` 상수 27개, `sourcePriority.yml`, `source-priority-policy.mjs` 티어 | 읽는 코드 없음·레거시 매체 목록 | `constants.mjs:137-327` |
| `source-health.json` 포맷·모니터 | 버그로 항상 stale, 메인 경로 미사용. DB `sources.health`로 대체 | `source-health-monitor.mjs:5` |
| `fetchArticleExtraction`의 전부-삼키는 fallback | 실패를 숨기고 외부 재시도를 무력화. 새 어댑터는 throw → dead letter | `source-fetch.mjs:443-445` |
| 수집 시점 분류기 호출(relevance·AI topic·taxonomy) | 3c 점수 단계로 이동. ingest는 수집만 | `fetch-feeds.mjs:155-185` |
| 권리 없는 호스트용 추출 어댑터 8개(bloomberg 등) | 라이브에서 도달 불가. 재서술 허용 매체도 본문은 **피드 요약까지만** 사용(인용 20단어 규칙) | `source-fetch.mjs:15-207` |

## 3. 바꿀 것

| 항목 | 새 설계 | 비고 |
|---|---|---|
| tier | `priority` P0→1, P1→2, P2→3. tier 1은 매 런 반드시 수집(실패 시 알림), 2 보조, 3 실험(실패 무알림). 선택 정렬에 실제 사용 | 브리프 3a |
| health | `sources` 테이블: `last_ok_at`, `fail_streak`, `health {success_rate_7d, last_error, last_error_at, items_last_run, auto_disabled_at}`. dry-run은 메모리 DbPort에만 기록 | ADR-003 |
| 자동 비활성 | `fail_streak ≥ ingest.auto_disable_after`(기본 5) → `enabled=false`로 **DB에서** 전환(YAML은 그대로) + dead letter `SOURCE_AUTO_DISABLED` + 3i 알림. 수동 재활성은 YAML `enabled: true` + DB 리셋 | 브리프 3a |
| 피드 재시도 | 소스당 1회 재시도(2 s 백오프), 5xx·타임아웃만. 전역 재시도 제거 | |
| 레지스트리 이관 | 82행 → `config/sources.yaml`(zod strict). 매핑: `allow_text_use true`→`full`, `false`→`rewrite_only`(Josh 결정 2026-10-18; 금지 매체 목록 수령 시 `link_only`), `status blocked`→`enabled: false`, `feed_format: epoch_html_index`→`type: html`, `text_scope`·`license_marker`·`article_hosts`·`article_path(_prefix)`→`extract:` 블록 | 비정형 254행 수정 |
| 스키마 확장 | `SourceConfig`에 선택 필드 `language`, `text_scope: full\|abstract`, `extract: { kind: generic\|google_release_notes\|epoch_index\|arxiv_abstract\|ec_press, path?, path_prefix?, hosts?, license_marker? }`. 단순 소스는 여전히 ≤10줄(R5) | contracts.md §4 개정 |
| 수집 기록 | `stage_events.counts`에 소스별 `{fetched, accepted, invalid, ms}`와 `sources_ok/failed` — Phase 0 D3 해소 | ADR-007 |
| 링크 전용 레인 통합 | `industry-headlines` 별도 스크립트 폐지. `link_only` 소스도 같은 ingest로 `raw_items`에 들어가되 `payload.text_rights`로 표시, 추출 없음. 레이더 노출은 3h | |
| 본문 추출 | `SourceAdapter.extract`: generic(article/main + `<p>` 필터 + 한계) + 특수 4종. `text_rights: full`만 전문 추출, `rewrite_only`는 피드 본문 필드(contentEncoded 등)까지만 저장 | 재서술 규칙과 정합 |
| 라이브 dry-run | 세션은 피드 호스트에 닿지 않음 → `workflow_dispatch`(`rebuild-ci.yml`(`ingest-live-dry-run` 잡))로 GitHub 러너에서 `pipeline run --dry-run --stage ingest --json` 실행, 산출 JSON을 아티팩트로 | 브리프 공통 절차 4 |

## 4. 완료 기준 대조 (2026-10-18)

| 기준 | 결과 | 근거 |
|---|---|---|
| 신규 소스 추가 ≤ YAML 10줄 | 통과 | `config/sources.yaml` 82행 중 `extract` 없는 53행 전부 ≤10줄(`migrate-registry.test.ts`가 강제) |
| 단일 소스 실패가 런을 중단시키지 않음 | 통과(로컬+라이브) | 라이브 dry-run에서 9개 소스 실패 → dead letter 9건, 런 `partial`로 완주(71 소스 수집). 테스트: 타임아웃·5xx 재시도 1회, 404 미재시도, 비피드 `FEED_PARSE`, 잘못된 항목 개별 dead letter |
| 사이클당 `items_fetched`가 Phase 0 대비 보고 | 통과 | 아래 §4.1 표. funnel + `stage_events.counts` + 소스별 `sourceStats`(`--json`, step summary) |
| tier·health 추적 | 통과 | `sources` 행 `last_ok_at`·`fail_streak`·`health{success_rate_7d,last_error,last_error_at,items_last_run,auto_disabled_at,recent}`; 연속 실패 N회 → DB `enabled=false` + `SOURCE_AUTO_DISABLED`; `reviewed_at`으로 재활성(`ingest-stage.test.ts`, `review-3a.test.ts`) |
| 후보 소스 확장 목록 | 통과 | `docs/migration/notes/3a-source-candidates.md` |
| 플래그 기본값 OFF | 통과 | 라이브 어댑터는 `--live`에서만, 모든 런 `--dry-run` 필수. CI·테스트는 fixture만(R7), dead-proxy 하에서 18/18 |

### 4.1 라이브 dry-run — GitHub Actions `rebuild-ci.yml` › `ingest-live-dry-run` (run 39103566574, `4ebf408d`, 2026-10-18T06:18:47Z, 일요일)

| 지표 | Phase 0 레거시(`02-funnel.md`) | 3a 라이브 dry-run (run 1) |
|---|---|---|
| 수집 시도 소스 | 권리 통과 28행, 실제 풀 기여 10~15 피드 | 80 enabled 전부(링크 전용 레인 통합) → ok 71 / failed 9 |
| `items_fetched` / 사이클 | 평균 28.1 (캡 30) | **286** 고유 URL (소스당 캡 6, 10일 창) |
| `items_new` | 측정 불가(원장 없음) | 286 (메모리 DB 첫 런; 소스 간 중복 8) |
| 피드 나열 항목 | — | 2,803 listed → skipped 2,509 (`too_old` 1,846 · `capped` 643 · `section_missing` 13 · `title_length` 6 · `date_future` 1) |
| 날짜 규칙 | 파싱 실패 → 현재 시각 | 누락·오류·미래 날짜는 보고(skip 사유), 대체 없음 |
| 본문 추출(`full` 29행) | 추출 실패 시 fail-closed, 수치 없음 | 68건 성공 / 0 실패 / 218 skip(= `rewrite_only` 항목, 의도) |
| 소요 | 런 전체 수 분 | ingest 16.4 s (80 피드 동시 6 + 추출 동시 3) |
| tier별 | — | tier 1: 9/10 ok, kept 44 · tier 2: 30/36, 122 · tier 3: 32/34, 128 |

실패 9건(dead letter)과 조치:

| source | tier | code | 원인 | 조치 |
|---|---|---|---|---|
| nrc-news | 1 | `HTTP_403` | 봇 UA 차단 추정(`www.nrc.gov`) | 미해결. tier 1 알림 대상(3i). 소스별 UA override 또는 대체 피드 검토(후속) |
| bloomberg-technology | 2 | `HOST_NOT_ALLOWED` | `feeds.bloomberg.com` → `www.bloomberg.com` 리다이렉트가 허용 호스트 밖 | **수정**: 피드 호스트의 등록 도메인(`*.bloomberg.com`)을 항상 허용(`allowedHostsFor`) |
| blocks-and-files | 2 | `HOST_NOT_ALLOWED` | `blocksandfiles.com` → `www.` | 동일 수정 |
| capacity-media | 2 | `UNSAFE_URL https_required` | `http://`로 다운그레이드 리다이렉트 | **수정**: 다운그레이드 리다이렉트는 `https`로 재시도(평문 fetch는 여전히 없음) |
| toms-hardware | 3 | `UNSAFE_URL https_required` | 동일 | 동일 수정 |
| semianalysis | 2 | `BODY_TOO_LARGE` | Substack 전문 피드 > 2 MiB | **수정**: `ingest.max_body_bytes` 6 MiB |
| nextplatform | 2 | `FEED_PARSE` | `/feed/` → `?lab_viewport=rss`(HTML 2 KB, 봇 챌린지) | 미해결. 후보 목록의 대체 피드 확인(후속) |
| insidehpc | 2 | `SOURCE_UNREACHABLE fetch failed` | 러너에서 TLS/DNS 실패(1회 재시도 후) | 재실행에서 관찰 |
| venturebeat-ai | 3 | `SOURCE_UNREACHABLE http 429` | 레이트리밋(1회 재시도 후) | 재실행에서 관찰; 소스 health가 연속 실패를 추적 |

**Run 2** (run 39104453316, `cecca564`, 2026-10-18T06:33:44Z, 위 수정 반영): **76 ok / 4 failed**, `items_fetched` **312**, `items_new` 312, duplicates 8, listed 3,045 → skipped 2,725(`too_old` 2,001 · `capped` 704 · `section_missing` 13 · `title_length` 6 · `date_future` 1), 추출 68 / 0 / 244 skip, ingest 30.2 s. 수정 확인: bloomberg-technology ok(`feeds.`→`www.` 1 hop, 9 listed), blocks-and-files ok(2 hops, 75 listed), toms-hardware ok(http→https 재시도, 1.2 MB, 50 listed), semianalysis ok(3.5 MB, 20 listed), nextplatform ok(이번엔 `?lab_viewport=rss`가 RSS로 응답, 88 listed — 봇 챌린지는 간헐적). 남은 실패 4: nrc-news `HTTP_403`(재현), insidehpc `fetch failed`(2회 재현 → 러너에서 TLS 협상 실패 추정), venturebeat-ai `429`(2회 재현 → 러너 IP 레이트리밋), capacity-media `HOST_NOT_ALLOWED: capacityglobal.com`(피드가 다른 발행사 도메인으로 이전 — `config/sources.yaml`의 `url`을 새 피드 주소로 확인 후 갱신, 후속). 리다이렉트된 피드 5개(doe-newsroom → `energy.gov/rss/energygov/2193718` 포함)는 step summary의 "Feeds that redirected" 목록으로 드러나므로 `url` 갱신 대상이다.

kept 0이지만 정상 동작: `google-cloud-tpu-releases`(30건 전부 10일 밖), `theregister-data-centre`(25), `eia-press`(12), `uk-dsit`(20), `fabricated-knowledge`(20), `arxiv-cs-*` 3개(일요일 빈 피드), `ofgem`(빈 피드), `epoch-ai-gradient-updates`(색인 146 KB에서 21일 창 내 링크 0 — 최근 글 부재 또는 색인 구조 변경, 다음 런에서 확인). `google-cloud-ai-releases`의 `section_missing` 13은 Gemini 섹션이 없는 날짜(의도). 긴 제목 절단·`date_future` 보고·Drupal 날짜·Atom(gov.uk)·RDF 경로 모두 라이브에서 확인됐다.

## 5. 열린 질문 (Josh)

1. 재서술 금지 매체 목록(→ `text_rights: link_only`). 수령 전까지 53개 상업 매체는 `rewrite_only`.
2. `reviewed_at` 365일 만료 규칙 유지 여부(가장 오래된 `eia-today-in-energy` 2026-08-12). 유지 권장, 만료 시 `enabled`가 아니라 **경고**로 완화 제안.
3. `industry-headlines.json` 레이더 레인을 3h에서 `publications`가 아닌 별도 `radar` 뷰로 유지할지(ADR-008 §4와 연결).
