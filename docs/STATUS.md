# STATUS — computecurrent.com 리빌드 (단일 진실)

| 필드 | 값 |
|---|---|
| `phase` | **Phase 3c — Scoring & Selection** (`REBUILD_BRIEF.md` §6 Phase 3, 모듈 c; 착수 승인 2026-10-20 "PR #60 머지 + 3c 착수") |
| `phase_status` | `done` — 코드·테스트·fixture dry-run 증거 완료(`docs/migration/notes/3c-scoring-selection.md` §4). 3c PR(`rebuild/v2` → `main`) 검토·머지와 3d(news_brief 생성) 착수는 Josh 승인 대기. 라이브 dry-run(ingest+normalize+score)은 PR 생성 후 `rebuild-ci.yml` dispatch로 받아 notes §4.2에 적는다. 3b: PR #60 Codex P2 1건(발행본 URL 색인 페이지 순회) 반영 `70928a16`, CI green 후 merge commit으로 머지 |
| `last_pass` | Phase 3b `done` → PR #60(Codex P2 1건 반영). 3c 착수 승인 2026-10-20(Josh: "PR #60 머지 + 3c 착수"). 3c 검증 2026-10-20: `v2:typecheck` 0 errors, `v2:test` 158/158, `v2:build` OK, 루트 `astro check` 0 errors, 레거시 경로 diff 0(merge-base `88821d50` 기준). fixture dry-run(`scoring`, 5소스 13건): 통과 6(full 4·brief 2) → 선택 2(소스당 1), 미달 7은 전부 `BELOW_THRESHOLD`에 cap 사유(정형 고시·증시 잡담·화석·소비자 AI·엔터프라이즈만) 기록; `dedupe` 6 → 통과 4 → 선택 2; `sample` 6 → 통과 0, `shortfall 1` |
| `baseline_commit` | `origin/main` = `88821d50`(PR #59 3a 머지) + 레거시 데이터 갱신 커밋(`chore: refresh public infrastructure data`, `src/data/grid/demand.json`만) — Vercel READY 배포 커밋은 커넥터·세션 네트워크 403으로 미확인 |
| `branch` | `rebuild/v2` `70928a16`(main `88821d50` 병합 + 3b + Codex 반영) → PR #60(ready). 3c는 로컬 `rebuild/3c-scoring-selection`에서 작업 후 PR #60 머지 뒤 `rebuild/v2`에 병합 → 3c PR |
| `decisions` | 2026-10-20 Josh: PR #60 머지 + 3c 착수(3b 열린 질문은 기본값으로: 한·영 묶기는 3c LLM 숏리스트/Phase 4 임베딩으로 이월, 제목 창 7일 유지, 동일 제목 정형 고시 접기 유지). 실행 중 판단(3c): 루브릭은 결정적·LLM 없음(Anthropic 키 미수령, R7); relevance 축은 레거시 8차원 어휘·lift·cap을 **설정 데이터**로 이관(엔진 모양은 코드, 숫자·용어·패턴은 `config/scoring.yaml`), 나머지 4축 계수는 신규(Phase 4 튜닝 대상); 선택은 소스당 1·사이클당 `caps.briefs_per_cycle.max`, 임계 미달은 채우지 않고 `shortfall` 보고(레거시 플로어 폐기); 축별 reason은 `candidates.rubric` jsonb 신규 컬럼(0002, 미적용); funnel `passed_gate`는 임계 통과 수(Phase 0 정의); abstract 범위 소스는 `brief` 상한; 캡에 밀린 후보는 이월 없이 다음 런에서 재채점. 3b 후속: 발행본 URL 색인을 전량 페이지 순회로 변경(`DbPort.offset`, `published_page_size 1000`). 2026-10-20 Josh: PR #59 머지, 3b 착수. 실행 중 판단(3b): 3b는 contracts §7을 그대로 적용해 `flags.stages.normalize: false`(3a는 `--live`가 스위치); 탈락은 `candidates` 행으로만 기록하고 생존 후보는 메모리로 3c에 넘김(미채점 행을 남기지 않음); `raw_items.id`를 canonical URL에서 결정적으로 파생(upsert 충돌 시 PK 불변); 임베딩 유사도는 보류(의존성·비용 0인 토큰 규칙으로 시작, Phase 4 shadow 데이터로 미탐 측정); 발행본 제목 비교는 ADR-004대로 7일 창, URL 정체성 일치는 무기한; `PublicationSource.title`을 추가해 3h가 원제를 남기면 한국어 편집 제목 대신 비교. 이전 결정(3a·Phase 2)은 `docs/migration/plan.md` §5 |
| `pending_approval` | 1) 3c PR 검토·머지 → 3d(news_brief 생성) 착수(Anthropic API 키 필요) 2) 3c 열린 질문(notes §5: 선택 캡 단위, insight 트리거 역할, 한·영 같은 사건 처리, 신규 축 계수, 0002 병합 여부) 3) Supabase 프로젝트 선택 + `0001_init.sql` 적용 경로(대시보드 SQL 편집기 권장) 3) 재서술 금지 매체 목록(→ `link_only`) 4) 소스 후속: capacity-media 새 피드 URL, blocks-and-files·nextplatform(피드 대신 HTML 응답), berkeley-lab-news 403, venturebeat 429, insidehpc 러너 TLS(nrc-news는 2026-10-20 런에서 성공) 5) 3b 열린 질문: 한·영 매체 동일 사건 묶기(3c LLM 숏리스트 vs Phase 4 임베딩), 발행본 제목 창 7일 유지 |
| `blockers` | 없음. 미수령 입력: Anthropic API 키(3d), Supabase 키·프로젝트(3h/4), Telegram(3i), 보이스 샘플(3e), 금지 매체 목록(3a), Vercel 재인가(5) — `docs/migration/plan.md` §4 |
| `production_health` | 생성 파이프라인 **정지 중**(heartbeat 2026-10-11T04:31Z, 이슈 #29). 사이트 서빙 정상(정적). `main`에 Phase 2 워크스페이스가 머지됐으나 레거시 빌드 입력은 무변경(Vercel 프리뷰·validate-application green) |
| `next_step` | 세션: PR #60 CI green → 머지 → `rebuild/v2`에 main·3c 병합 → 3c PR → 라이브 dry-run dispatch(notes §4.2) → §7 보고. Josh: 3c PR 검토 → 머지 → 3d 킥오프 문구 + Anthropic API 키. 병행: 보이스 샘플(3e)·Supabase 적용(3h) |
| `updated_at` | 2026-10-20 (3c) |

## 세션 로그

| 날짜 | Phase | 상태 | 요약 |
|---|---|---|---|
| 2026-10-17 | 0 | done | 브리프 저장, 인벤토리·파이프라인 지도·funnel(120런, git 118커밋 측정)·에러 분류·판정·보존 목록·CLAUDE.md 초안, `scripts/diagnose/{funnel,urls}.mjs` 신설. PR #57 |
| 2026-10-18 | 0→1 | approved | Josh가 04-verdict·05-preserve-list 승인, 런타임·저장소·재서술 결정 |
| 2026-10-18 | 1 | done | ADR-001~008, target.md, contracts.md, migration/plan.md(추적표 포함). 코드 변경 0. PR #57 누적 |
| 2026-10-18 | 1→2 | approved | Josh: 계획 모드 해제, `rebuild/v2` 신설, 패키지 설치 승인 |
| 2026-10-18 | 2 | done | npm workspaces, zod 스키마·계약·설정 로더·플래그·로거, no-op 러너 + 선기록 원장 + fixture 어댑터 + CLI, `config/{pipeline,sources}.yaml`, `fixtures/`, `supabase/migrations/0001_init.sql`(미적용), `rebuild-ci.yml`, `CLAUDE.md`, README. 리뷰 15건 + Codex 4건 반영. PR #58 머지 |
| 2026-10-18 | 2→3a | approved | Josh: #57·#58 검토·머지 진행, 3a 착수 승인, Supabase 적용 승인 |
| 2026-10-18 | 3a | done | 안전 fetch(SSRF·리다이렉트·content-type·캡·charset), 의존성 없는 RSS/Atom/RDF 파서, URL·날짜·HTML 규칙, 라이브 RSS·Epoch 색인 어댑터, 추출기 5종, ingest 재작성(health·auto-disable·캡·중복 제거·items_new·추출), `--live` CLI, 레지스트리 82행 이관, `rebuild-ci.yml` 라이브 dry-run 잡, contracts §2/§4 개정. 테스트 119. 라이브 dry-run run 2: 76/80 ok, items_fetched 312. PR #59 |
| 2026-10-20 | 3a→3b | approved | Josh: PR #59 머지, 3b(Normalize & Dedupe) 착수 |
| 2026-10-20 | 3a | done | PR #59 머지 `88821d50`(merge commit). Codex 17라운드 28건 반영: 본문 스트림 실패 재시도, health 7일 시각 기준·윈도 전량 보관·미실행 소스 노화, 전체 행 upsert, 모든 페이지 요청 재시도·호스트별 pacing(공유 pacer, 직전 지연 유지), DNS 타임아웃, Content-Type 필수, Epoch 전 기사 실패→소스 실패·빈 본문·선택자 실패 보존·킬스위치·권리 게이트, 풀 상한, 미래·불가능 날짜 거부, 이미지 선택 규칙, link_only 텍스트 미저장, abstract 범위 강제(스키마+어댑터), 긴 `<article>` 컨테이너, 색인 통계 |
| 2026-10-20 | 3b | done | `stages/normalize` 재작성(발행본 URL 정체성·제목 유사도, 풀 내 URL·해시·제목 키·제목 Dice·본문 shingle, `candidates` 탈락 행 + reject_reason), `lib/url.ts` `urlIdentityKey`, `lib/similarity.ts`, `raw_items.id` 결정적 파생, `PublicationSource.title`, `DbPort.orderBy`, `--stage` 콤마 목록, `fixtures/db` 시드, `normalize` 설정 블록, 플래그 기본 OFF, `rebuild-ci.yml` smoke + 라이브 잡 확장, step summary 절, contracts §1/§4/§5/§7 개정. 테스트 130. fixture dry-run: 12 → 6, 탈락 6 |
| 2026-10-20 | 3b | done | `rebuild/v2`에 main(`88821d50`)·3b 병합 → `0803e095`(148/148, 빌드·루트 check OK, 레거시 diff 0). PR #60(draft) 생성·구독. 라이브 dry-run run 39389217169: 80 소스 74 ok/6 실패, 풀 200(캡, 116 컷) → 후보 198, 탈락 2(`title_key`), 발행본 비교 0, 65 s — notes §4.2 |
| 2026-10-20 | 3b→3c | approved | Josh: PR #60 머지 + 3c(Scoring & Selection) 착수 |
| 2026-10-20 | 3b | done | PR #60 ready-for-review. Codex P2 1건(발행본 URL 색인이 `published_limit` 2000에 잘림) → `DbPort.offset`(PostgREST `range`) + 전량 페이지 순회 + `published_page_size`(≤1000)로 수정 `70928a16`, 테스트 149 |
| 2026-10-20 | 3c | done | `stages/score` 재작성(5축 루브릭·가중 총점·tier·선택·탈락 사유·`rubric` 행), `config/scoring.yaml`(`ScoringConfig` zod strict, 레거시 8차원 어휘·lift·cap을 데이터로), CLI `--scoring`, `ctx.scoring`, `candidates.rubric`(0002, 미적용), `ScoreStats`·step summary 절, `rebuild-ci.yml` smoke + 라이브 잡 `ingest,normalize,score`, 플래그 기본 OFF, contracts §1/§4/§5/§7 개정. 테스트 158. fixture dry-run: 13 → 통과 6 → 선택 2 — notes §4 |

## Phase 3c 완료 기준 대조

| 기준 | 결과 | 근거 |
|---|---|---|
| 모든 후보에 항목별 점수 + reason | 통과 | `candidates` 행마다 `scores`(5축)·`total`·`rubric.reasons`(축별 한 줄); fixture 13건 전부, 재런은 같은 행 upsert — `score-stage.test.ts`, `cli.test.ts`, CI smoke |
| 임계값 변경이 설정만으로 가능 | 통과 | `thresholds`·`weights`·`caps.briefs_per_cycle`·`selection.per_source_max`만 바꿔 tier·선택·탈락 사유가 바뀌는 테스트(코드 변경 0) |
| 선택 결과 설명 가능 | 통과 | `rubric.rank` / `reject_reason`(`BELOW_THRESHOLD`·`NOT_SELECTED` + 상세) + `stage_events.counts` + `scoreStats.decisions` + step summary |
| 플래그 기본값 OFF | 통과 | `flags.stages.score: false`; 기본 런 `score: skipped (flag_off)` |
| 라이브 후보에서의 동작(관찰) | 대기 | 3c PR 생성 후 `ingest-live-dry-run` dispatch — notes §4.2 |

## Phase 3b 완료 기준 대조

| 기준 | 결과 | 근거 |
|---|---|---|
| 동일 기사 3개 소스 fixture → 1개 수렴 | 통과 | `fixtures/rss/dedupe-wire-{a,b,c}.xml`: 같은 기사 3본 → 후보 1(tier 1 `full` 사본), 나머지는 `DUPLICATE_IN_POOL: url=…`/`title=…`. `normalize-stage.test.ts`, `cli.test.ts`, `rebuild-ci.yml` smoke |
| 발행본과 중복 시 reject reason 기록 | 통과 | `fixtures/db/dedupe.json` 발행본 재수집 → `candidates` 행 `reject_reason = "DUPLICATE_OF_PUBLISHED: url=news/eia-data-center-load-timing"`; 제목 유사도 경로·7일 창·`unpublished` 제외는 테스트 |
| 플래그 기본값 OFF | 통과 | `flags.stages.normalize: false`; 기본 런은 `normalize: skipped (flag_off)`, 증거 런은 `CC_FLAG_STAGES_NORMALIZE=true` |
| 탈락 사유 설명 가능(R6) | 통과 | `stage_events.counts`(`rejected`, `duplicate_of_published`, `duplicate_in_pool`, `method_*`) + `--json` `normalizeStats.decisions` + step summary |
| 라이브 풀에서의 동작(관찰) | 통과 | Actions run 39389217169(`0803e095`): 80 소스, 풀 200(캡) → 후보 198, 탈락 2 `title_key`(동일 제목 FR 정형 고시), 오탐 0, 67 ms; 발행본 비교는 라이브 메모리 DB에 발행본이 없어 0 — notes §4.2 |

## Phase 3a 완료 기준 대조

| 기준 | 결과 | 근거 |
|---|---|---|
| 신규 소스 추가 ≤ YAML 10줄 | 통과 | `config/sources.yaml` 82행 중 `extract` 없는 53행 전부 ≤10줄(테스트 강제) |
| 단일 소스 실패가 런을 중단시키지 않음 | 통과 | 라이브: 9개 소스 실패 → dead letter, 71개 수집, 런 완주(`partial`). 테스트: 재시도·404·비피드·잘못된 항목·어댑터 없음 |
| 사이클당 `items_fetched` 보고 | 통과 | 라이브 286 vs Phase 0 평균 28.1(캡 30); funnel + `stage_events.counts` + 소스별 stats(`--json`, step summary) — `notes/3a-sources-ingest.md` §4.1 |
| tier·health 추적 | 통과 | `sources` 행 health·auto-disable·`reviewed_at` 재활성(테스트) |
| 후보 소스 확장 목록 | 통과 | `docs/migration/notes/3a-source-candidates.md` |
| 플래그 기본값 OFF | 통과 | `--live` opt-in, 모든 런 `--dry-run` 필수; CI·테스트 fixture만(R7) |

## Phase 2 완료 기준 대조

| 기준 | 결과 | 근거 |
|---|---|---|
| CI green (lint / typecheck / test / build) | 통과 | PR #58 `rebuild-ci`·`validate-application`·`visual-qa`·Vercel preview green, 머지 `6666fd64` |
| `pipeline run --dry-run --fixture sample` 전 Stage no-op 통과 + 런 원장 기록 | 통과 | 7 Stage `done`, `pipeline_runs` 1행(`started`→`done`), `stage_events` 7행, funnel 13컬럼 |
| published 0개에서 사이트 빌드 성공(테스트) | 통과 | `apps/site/test/build-empty.test.ts`, `healthz.test.ts` |
| 기능 플래그로 임의 Stage on/off | 통과 | `CC_FLAG_STAGES_IMAGE=false` → image `skipped`(러너·CLI 테스트), 전 Stage off도 정상 종료 |
| 프로덕션 무영향(`main` 무변경) | 통과 | 레거시 경로 diff 0, 루트 변경은 `package.json`(workspaces·`v2:*`)·lockfile·README뿐 |
