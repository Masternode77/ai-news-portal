# STATUS — computecurrent.com 리빌드 (단일 진실)

| 필드 | 값 |
|---|---|
| `phase` | **Phase 3d — Generation: news_brief** (`REBUILD_BRIEF.md` §6 Phase 3, 모듈 d; 착수 승인 2026-10-23 "PR #61 머지 + 3d 착수, 순서는 브리프 먼저 전환(3e 뒤로)으로 재계획") |
| `phase_status` | `done` — 코드·테스트·fixture dry-run 증거 완료(`docs/migration/notes/3d-news-brief.md` §4). 라이브 생성은 Anthropic API 키 미수령으로 미실행(§4.2에 절차와 비용 상한 ≈$0.13/런 추정). 3c: PR #61 Codex P1 2건(추출 실패 full 금지 `9416c43c`, 긍정 추출 표식 요구 `ddc48ebe` + 상한 fail-closed `984bb6b1`, 숫자 콤마 보존 `8ce0ad58`, v2026-10-23.3) 반영 → CI green → merge commit `ea04b540`로 머지. 3d PR #65(draft, `rebuild/v2` → `main`) 열림·구독. 3d PR 검토·머지와 3f(Image) 착수는 Josh 승인 대기 |
| `last_pass` | Phase 3c `done` → PR #61(Codex P1 2건 반영, merge commit `ea04b540`). 3d 착수 승인 2026-10-23. 3d 검증 2026-10-23: `v2:typecheck` 0 errors, `v2:test` 172/172, `v2:build` OK, 루트 `astro check` 0 errors, 레거시 경로 diff 0(`origin/main` `85e39061` 기준). fixture dry-run(`scoring`): 선택 2 → 초안 2(`NewsBrief` 스키마 통과, 재런은 같은 행 upsert), grounding 1/2(KEPCO 초안의 "2027"은 fixture가 일부러 넣은 미근거 수치), `quote_max_words` 2, 비용 0(fixture); `sample` 선택 0 → 초안 0 |
| `baseline_commit` | `origin/main` = `ea04b540`(PR #61 3c 머지, merge commit) ← `85e39061`(release v0.0.57) ← `cab3bfbf`(PR #63 레거시 컬럼 13건 격리) ← `36fa530d`(PR #60). 레거시 빌드 입력 무변경(validate-application·visual-qa·Vercel 프리뷰 green) — Vercel READY 배포 커밋은 세션에서 미확인 |
| `branch` | `rebuild/v2` `eea31ec8`(main `ea04b540` + 3d 병합: `1b6c0fa1` 코드, `4b003eb8` 문서·테스트) → PR #65(draft) |
| `decisions` | 2026-10-24 Josh(이 스레드): ① B안 세부 승인 — R3 미충족 상태의 Phase 5 전환 허용, Phase 3 완료 기준은 3e 제외로 해석, 3e는 전환 직후 착수, 보이스 샘플 5~10편은 Phase 4 shadow 기간 중 제출(`plan.md` §1 B안 메모·18행·§3 R3, `REBUILD_BRIEF.md` §6) ② audit 차단 해소 A안 — 루트 `package.json` `overrides`로 `@vercel/cli-config`의 zod만 `^4.6.7`(lockfile 중첩 zod 4.1.11 항목 제거, `npm audit --omit=dev` 0건, `npm ci` 일치; CLAUDE.md §7). 2026-10-23 23:40Z Josh "내가 승인한다": PR #65 머지 + 3f(Image) 착수. 3d 후속(Codex PR #65 1~4라운드 6건): 단위어 수치는 정규화 값으로만 grounding, 도중 예산 소진 → 런 `budget_stop`(초안 보존), 본문 읽기 재시도, 복합 한국어 단위(`2천억`), 소수 안전 비교 키, 금지 표현 인벤토리를 프롬프트에서 `config/banned-phrases.yaml`로 이관(프롬프트 `{{banned_phrases}}` 렌더링 + 초안 가드 `checks.banned` 보고). 2026-10-23 Josh: PR #61 머지 + 3d 착수, Phase 3 순서를 **3a→3b→3c→3d→3f→3g→3h→3i→3e**로 재계획(브리프 라인을 먼저 끝까지, 3e는 보이스 샘플 수령 후 마지막; `REBUILD_BRIEF.md` §6·`plan.md` 14~18행). B안 세부(타 세션 전달, **Josh 확인 대기**): Phase 4 shadow·Phase 5 전환까지 news_brief만으로 진행, 3e는 전환 이후 — 의존 점검 결과 막히는 항목 없음, R3·Phase 3 완료 기준은 요구사항 변경이라 확인 필요(`plan.md` §1 B안 메모). 실행 중 판단(3d): 모델 출력은 `NewsBriefDraft`(제목·요약·의미·렌즈·태그)로 제한하고 출처·날짜·slug는 스테이지가 채움(출처 조작 경로 없음); 프롬프트는 `prompts/news_brief.md` 파일(front matter `version` → `drafts.prompt_version`), 레거시 인라인 프롬프트는 규칙만 추출·재작성(P9); Anthropic은 SDK 없이 `ctx.fetch`로 Messages API 직접 호출(패키지 추가 0, `--replay` 차단 유지), tool 강제 구조화 출력; 비용은 `llm.pricing` 표(행 없는 모델 거부) + 호출 전 추정으로 `budget.canSpend`; 검사(숫자 grounding·`quote_max_words`)는 3d에서 보고만, 차단은 3g; `candidates.id`·`drafts.id`를 결정적으로 파생; `flags.stages.generate: false`. 3c 후속(Codex PR #61): full 권리 아이템은 `payload.extraction.ok = true`가 있어야 full 등급(실패·미시도는 rewrite_only 값 + 코드상 brief 상한, 설정 불가). 2026-10-20 Josh: PR #60 머지 + 3c 착수(3b 열린 질문은 기본값으로: 한·영 묶기는 3c LLM 숏리스트/Phase 4 임베딩으로 이월, 제목 창 7일 유지, 동일 제목 정형 고시 접기 유지). 실행 중 판단(3c): 루브릭은 결정적·LLM 없음(Anthropic 키 미수령, R7); relevance 축은 레거시 8차원 어휘·lift·cap을 **설정 데이터**로 이관(엔진 모양은 코드, 숫자·용어·패턴은 `config/scoring.yaml`), 나머지 4축 계수는 신규(Phase 4 튜닝 대상); 선택은 소스당 1·사이클당 `caps.briefs_per_cycle.max`, 임계 미달은 채우지 않고 `shortfall` 보고(레거시 플로어 폐기); 축별 reason은 `candidates.rubric` jsonb 신규 컬럼(0002, 미적용); funnel `passed_gate`는 임계 통과 수(Phase 0 정의); abstract 범위 소스는 `brief` 상한; 캡에 밀린 후보는 이월 없이 다음 런에서 재채점. 3b 후속: 발행본 URL 색인을 전량 페이지 순회로 변경(`DbPort.offset`, `published_page_size 1000`). 2026-10-20 Josh: PR #59 머지, 3b 착수. 실행 중 판단(3b): 3b는 contracts §7을 그대로 적용해 `flags.stages.normalize: false`(3a는 `--live`가 스위치); 탈락은 `candidates` 행으로만 기록하고 생존 후보는 메모리로 3c에 넘김(미채점 행을 남기지 않음); `raw_items.id`를 canonical URL에서 결정적으로 파생(upsert 충돌 시 PK 불변); 임베딩 유사도는 보류(의존성·비용 0인 토큰 규칙으로 시작, Phase 4 shadow 데이터로 미탐 측정); 발행본 제목 비교는 ADR-004대로 7일 창, URL 정체성 일치는 무기한; `PublicationSource.title`을 추가해 3h가 원제를 남기면 한국어 편집 제목 대신 비교. 이전 결정(3a·Phase 2)은 `docs/migration/plan.md` §5 |
| `pending_approval` | 1) ~~3d PR #65 머지 → 3f 착수~~(승인 2026-10-23; 머지는 CI green 확인 후 세션이 실행) 2) Anthropic API 키(3d 라이브 dry-run용; 이름만 환경에 두고 값은 세션에 주지 않음) 3) 3d 열린 질문(notes §5: SDK 도입 여부, `SCHEMA_INVALID` 재시도, link_only 브리프 허용, `model_hint` 처리) 4) 3c 열린 질문(notes §5: 선택 캡 단위, insight 트리거 역할, 한·영 같은 사건, 신규 축 계수, 0002 병합) 5) Supabase 프로젝트 선택 + `0001_init.sql`·`0002_candidates_rubric.sql` 적용 경로(대시보드 SQL 편집기 권장) 6) 재서술 금지 매체 목록(→ `link_only`) 7) 소스 후속: capacity-media 새 피드 URL, blocks-and-files·nextplatform(HTML 응답), berkeley-lab-news 403, venturebeat 429, insidehpc 러너 TLS 8) 3b 열린 질문: 한·영 동일 사건 묶기, 발행본 제목 창 7일 |
| `blockers` | 없음. 미수령 입력: Anthropic API 키(3d 라이브 증거), Supabase 키·프로젝트(3h/4), Telegram(3i), 보이스 샘플(3e, 마지막으로 이동), 금지 매체 목록(3a), Vercel 재인가(5) — `docs/migration/plan.md` §4 |
| `production_health` | 생성 파이프라인 **정지 중**(heartbeat 2026-10-11T04:31Z, 이슈 #29). 사이트 서빙 정상(정적). `main`에 Phase 2 워크스페이스가 머지됐으나 레거시 빌드 입력은 무변경(Vercel 프리뷰·validate-application green). 2026-10-23 타 세션 보고(세션에서 직접 검증하지 않음): Mac clone은 10/18 복구, 10/18 이후 Codex 런 18회 모두 실패(공통 결말 "Queue 14 pending and blocked, 0 ready. No publication."; 피드 오류 NRC 403·ACER parse·VentureBeat 429·HPCwire 403은 비치명적), Josh가 10/23 Codex automation 일시정지(v2 전환까지 유지 권고), 잡 작업공간 26개 정리·증거는 Mac `~/Backups/compute-current-job-evidence` |
| `next_step` | 세션: PR #65 CI green(A안 적용 후) → merge commit으로 머지 → `rebuild/v2` ← `main` → 3f 병합·PR 생성 → STATUS phase 3f → §7 보고 → 3g 착수 승인 요청. Josh: Anthropic 키(3d 라이브 dry-run, notes §4.2), OpenAI 키·단가 확인(3f 라이브), 호스팅 이미지 스토어 결정(3h). 병행: Supabase 적용(3h), 보이스 샘플 5~10편(shadow 기간) |
| `updated_at` | 2026-10-24 (3d PR #65 Codex 반영·A안·B안 승인 기록) |

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
| 2026-10-20 | 3b | done | PR #60 CI green(validate-application 포함) → merge commit `36fa530d`로 `main`에 머지. `rebuild/v2`에 main·3c 병합 `864d93c7` → PR #61(draft) 생성·구독 |
| 2026-10-20 | 3c | done | 라이브 dry-run run 39400530432: 198 → 통과 17 → 선택 2. 관련성 0.17 EC 연설·0.34 DOE 파이프라인 고시가 impact·reader_value만으로 통과, "1 million GPUs" 금액 집계 → `thresholds.relevance_min 0.55` + 통화 기호 필수(`8d1602bb`, v2026-10-20.2) → run 39401326128: 198 → 통과 12(관련성 하한 탈락 167) → 선택 2 동일 — notes §4.2 |
| 2026-10-23 | 3c→3d | approved | Josh: PR #61 머지 + 3d 착수, Phase 3 순서 재계획(3d→3f→3g→3h→3i→3e) |
| 2026-10-23 | 3c | done | PR #61 ready-for-review. Codex P1 2건: 추출 실패(`extraction.ok=false`) full 금지 `9416c43c` → 긍정 표식(`ok=true`) 요구·v2026-10-23.3 `ddc48ebe`(fixture 재측정: 통과 6 전부 brief, 순위·선택 동일) → 상한을 설정 불가 fail-closed로 `984bb6b1` → P2 숫자 콤마 보존 `8ce0ad58`(v2026-10-23.3). CI green → merge commit `ea04b540` |
| 2026-10-24 | 3d | done | PR #65 ready-for-review. Codex 1~4라운드 6건 반영(`efd15801` 단위어 grounding·budget_stop 전파, `fe521100` 본문 읽기 재시도, `54378109` 복합 한국어 단위·소수 안전 키, `bafe3c74` 금지 표현 인벤토리 → `config/banned-phrases.yaml` + 프롬프트 렌더링 + `checks.banned` 가드). CI는 새 어드바이저리 GHSA-mrhx-c7xc-m3w5(`@vercel/cli-config`의 zod 4.1.11 고정)로 audit 단계만 red → Josh A안(루트 overrides) 승인·적용. 테스트 183/183 |
| 2026-10-24 | 3d→4/5 | approved | Josh(이 스레드): B안 세부 ①R3 미충족 전환 ②Phase 3 완료 기준 3e 제외 — 둘 다 승인. 3e는 전환 직후 착수, 보이스 샘플 5~10편은 shadow 기간 중 제출. audit는 A안 |
| 2026-10-23 | 3d | done | `stages/generate`(news_brief) 재작성, `prompts/news_brief.md` + `PromptRegistry`, `adapters/llm/anthropic`(ctx.fetch 전용·tool 강제 구조화 출력·재시도·`llm.pricing`), `candidateId`/`draftId`/`newsBriefSlug`, 한국어 인식 숫자 grounding·`quote_max_words`(보고만), 예산 가드, dead letter, `GenerateStats`·step summary·CI smoke, 플래그 OFF, contracts §1/§2/§4~§7 개정. 테스트 172/172. fixture dry-run: 선택 2 → 초안 2, grounding 1/2 — notes §4. `rebuild/v2`에 main·3d 병합 → PR #65(draft) 생성·구독 |

## Phase 3d 완료 기준 대조

| 기준 | 결과 | 근거 |
|---|---|---|
| fixture 입력 → 스키마 통과 초안 | 통과 | `scoring` fixture 선택 2 → `drafts` 2(`NewsBrief` zod; 출처·날짜·slug는 스테이지가 채움), 재런은 같은 행 upsert — `generate-stage.test.ts`, `cli.test.ts`, CI `generate-dry-run` smoke |
| 수치 grounding 검사 통과율 보고 | 통과 | `stage_events.counts.grounding_checked/grounding_passed`, `--json` `generateStats.grounding` + `grounding_pass_rate`, 건별 `grounding_ungrounded`, step summary; fixture 1/2(의도된 미근거 "2027") |
| 출처 링크 필수 · 연속 인용 제한 · 한국어 Expert Lens | 통과 · 보고 · 통과 | 출처 필드는 모델 스키마 밖(스테이지가 채움); `checks.quote_max_words` 기록(차단은 3g); `expert_lens_ko` 150자 이상(zod) |
| 플래그 기본값 OFF | 통과 | `flags.stages.generate: false`; 기본 런 `generate: skipped (flag_off)` |
| 비용 상한(ADR-007) | 통과 | 호출 전 추정 `budget.canSpend`; 첫 후보부터 불가 → `BUDGET_EXCEEDED`, 도중 → `budget_stopped`(테스트) |
| 라이브 모델 출력(관찰) | 미실행 | Anthropic 키 미수령 — notes §4.2 절차·비용 상한. fixture 응답은 합성 |

## Phase 3c 완료 기준 대조

| 기준 | 결과 | 근거 |
|---|---|---|
| 모든 후보에 항목별 점수 + reason | 통과 | `candidates` 행마다 `scores`(5축)·`total`·`rubric.reasons`(축별 한 줄); fixture 13건 전부, 재런은 같은 행 upsert — `score-stage.test.ts`, `cli.test.ts`, CI smoke |
| 임계값 변경이 설정만으로 가능 | 통과 | `thresholds`·`weights`·`caps.briefs_per_cycle`·`selection.per_source_max`만 바꿔 tier·선택·탈락 사유가 바뀌는 테스트(코드 변경 0) |
| 선택 결과 설명 가능 | 통과 | `rubric.rank` / `reject_reason`(`BELOW_THRESHOLD`·`NOT_SELECTED` + 상세) + `stage_events.counts` + `scoreStats.decisions` + step summary |
| 플래그 기본값 OFF | 통과 | `flags.stages.score: false`; 기본 런 `score: skipped (flag_off)` |
| 라이브 후보에서의 동작(관찰) | 통과 | run 39400530432(v.1): 198 → 통과 17(8.6%) → 선택 2; 오탐 2종(관련성 0.17 EC 연설 통과, "1 million GPUs" 금액 집계) 발견 → `relevance_min`·통화 기호 수정 → run 39401326128(v.2): 198 → 통과 12(6.1%, 관련성 하한 탈락 167) → 선택 2 동일, 통과 12건 관련성 ≥ 0.71 — notes §4.2 |

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
