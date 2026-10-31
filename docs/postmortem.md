# Postmortem — 레거시 파이프라인 정지(2026-10-11)와 재발 방지 장치

브리프 Phase 5 항목 6. Phase 0 진단(`docs/diagnosis/03-error-taxonomy.md` §1)의 상위 에러 10개를 리빌드의 어떤 장치가 막는지 1:1로 대조한다. 증거 열은 그 장치가 실제로 작동한 기록이다(`docs/shadow/compare.md` 행은 Phase 4 staging 런).

## 1. 요약

- **무엇이 멈췄나**: 레거시 생성은 2026-10-11 이후 발행 0건이었다. 사후 게이트 하나가 실패하면 그 런 전체가 멈췄고(#3), 런을 띄우는 Mac 로컬 git이 손상되면서(#4) 런 자체가 시작되지 않았다. 실패한 런은 원장에 남지 않아(#5) 원인 추적이 늦어졌다.
- **구조적 원인**: 발행이 JSON 커밋과 전체 재빌드에 묶여 있었다. 게이트 규칙은 코드 곳곳에 흩어져 있었고, 임계값은 코드 상수였다. 실행 환경도 개인 Mac 하나뿐이었다.
- **리빌드의 답**: GitHub Actions 스케줄, 원장 선기록, 초안 단위 QA(1규칙 1파일 + 설정 1행), DB 발행 + ISR(빌드와 분리), 설정 데이터 + `version`, 이름만 쓰는 시크릿, 런 요약 + 이슈 알람.

## 2. 상위 10 에러 → 재발 방지 장치

| # | Phase 0 에러(요약) | 레거시 원인 | 리빌드 장치 | 위치 | 증거 |
|---|---|---|---|---|---|
| 1 | 관련성 임계 미달로 대부분 archive_only 탈락 | 풀 구성(공공·arXiv 위주)과 코드 속 관련성 분류기 | 5축 루브릭과 임계값을 데이터로 분리했다(`relevance_min`, full/brief 임계). 후보마다 `rubric { tier, rank, reasons }`가 남고 런마다 funnel이 기록된다. 소스 권리·티어는 소스별 설정이다 | `config/scoring.yaml`, `config/sources.yaml`, `packages/pipeline/src/stages/score.ts` | staging 9런 `gate` 12~16건/런, 선택 2건/런(`compare.md` §1) |
| 2 | 컬럼 `no_qualifying_story`(120런 중 102) | 단일 컬럼 경로가 후보 전부를 거절하면 발행 0 | 브리프 라인(news_brief)을 먼저 가동했다(B안). 거절·보류된 후보는 다음 런에서 건너뛰어(`selection.skip_review_status`) 같은 후보를 반복 선택하지 않는다. 발행이 0이면 요약에 `no publication: <첫 차단 단계>`가 찍힌다 | `config/scoring.yaml` `selection`, `notify/summary.ts` | 현재 코드 6/6런 발행 ≥ 1(`compare.md` §5 기준 2) |
| 3 | 사후 게이트(`restore-eia-public-inventory`) 실패 → 발행 전면 중단 | 런 끝의 전역 게이트가 실패하면 모든 결과를 버림 | QA는 초안마다 모든 규칙을 돌리고(첫 실패에서 멈추지 않음) 초안별로 통과·거절·보류를 정한다. 한 초안의 거절은 다른 초안의 발행을 막지 않는다 | `packages/pipeline/src/stages/qa.ts`, `config/qa.yaml` | run 7 `done`: 발행 1 · 거절 1(`compare.md` §3 7행) |
| 4 | Mac 로컬 git 손상 → 런 시작 불가, heartbeat stale | 개인 Mac의 로컬 checkout에 의존 | 매 런을 GitHub Actions에서 깨끗한 checkout으로 실행한다(`pipeline.yml` schedule 3회/일). `ops-check`는 완료 런이 `slot_hours × 1.5`보다 오래되면 실패하고, 상태가 바뀔 때만 GitHub 이슈를 연다·닫는다 | `.github/workflows/pipeline.yml`, `packages/pipeline/tools/ops-issue-sync.ts` | 첫 cron 런 `fea3193d`, ops `ok`(`compare.md` 4행) |
| 5 | 구독 모드 실패가 원장 기록 전에 abort(생존 편향) | 상태 쓰기가 런 끝에 있음 | 러너가 원장(`pipeline_runs` started)을 **먼저** 쓰고 스테이지마다 `stage_events`를 남긴다. 처리하지 못한 예외는 `failed`로 닫히고, 개별 실패는 `dead_letters`에 쌓인다 | `packages/pipeline/src/runner.ts`, `src/ledger/*` | staging 9런 모두 원장 완료(예외 0, `compare.md` §5 기준 1) |
| 6 | 추출 fail-closed 탈락·정규식 추출 정밀도 | 추출 실패가 곧 탈락이고 사유가 흩어짐 | 소스 권리별로 피드 발췌를 허용하고(`text_rights`), 본문 길이·추출 성공은 `SOURCE_UNREACHABLE` hard 규칙의 `params`로 판정한다. 탈락 사유는 reason_code로 남는다 | `config/sources.yaml`, `config/qa.yaml`, `adapters/source/extract.ts` | 800자 발췌 초안 관찰 → `min_source_chars` 상향은 튜닝 후보(`STATUS.md` pending) |
| 7 | 컬럼 품질 플로어 반복 조정(0.78 → 0.75 등) | 임계값이 코드 상수라 PR로만 조정 가능 | 모든 임계값이 `config/qa.yaml` `params`와 `config/scoring.yaml`에 있다. 바꾸면 `version`을 올리고(verdict `qa_version`, `rubric_version`에 기록) `docs/shadow/tuning-log.md`에 근거를 남긴다 | `config/*.yaml`, `docs/shadow/tuning-log.md` | tuning-log #1~#3(설정만 변경) |
| 8 | 스루풋 로직 결함(슬롯 락, 일일 캡이 processed를 셈 등) | 카운터·캡·락이 코드에 얽혀 있음 | 캡은 `caps.briefs_per_cycle`과 소스당 선택 규칙으로 설정에 둔다. funnel 13컬럼이 단계별 수를 원장에 남기고, 비용 가드(`budget.run_usd`, `budget_stop`)는 생성만 멈추며 QA 통과분은 발행까지 흐른다 | `config/pipeline.yaml`, `config/scoring.yaml`, `src/budget.ts` | 최대 $0.12/런, 합계 $0.80(`compare.md` §5 기준 5) |
| 9 | 리더 카피·금칙어 게이트 오탐·누락(하루 fix 26건) | 규칙이 코드 여러 곳에 분산 | 1규칙 1파일(`qa/rules/<CODE>.ts`) + 설정 1행 + 단위 테스트. 금지 표현은 `config/banned-phrases.yaml` 한 곳에 두고, 같은 목록으로 프롬프트를 렌더링하고 초안을 검사한다. verdict 전부가 `qa_results`에 남는다 | `packages/pipeline/src/qa/rules/`, `config/banned-phrases.yaml` | 미탐 4·정탐 2 해소, 오탐 1(동일 사건) → `DUPLICATE_EVENT` 추가(`compare.md` §3, PR #84) |
| 10 | 인사이트 필드 불완전(`named_companies` 누락)으로 강등 | 자유 형식 출력을 사후 파싱 | 모델 출력은 구조화 출력(`output_config.format` json_schema)으로 받고 zod `NewsBriefDraft`로 검증한다. 출처·날짜·slug는 스테이지가 채운다. 스키마 실패는 `SCHEMA_INVALID` hard, 얇은 렌즈는 `THIN_EXPERT_LENS` soft로 보고한다 | `packages/shared/src/schema/content.ts`, `adapters/llm/anthropic.ts`, `config/qa.yaml` | 라이브 초안 전부 스키마 통과(`compare.md` §1 drafts 열) |

## 3. 확정 결함(D1~D10)의 처분

| ID | 결함 | 처분 |
|---|---|---|
| D1 | 컬럼 실패가 원장 기록 전에 abort | 원장 선기록(위 #5) |
| D2 | 금칙어 검사 반환형 버그 | 단일 인벤토리 + `BANNED_PATTERN` 규칙과 테스트(위 #9) |
| D3 | 수집 카운터 폐기 | ingest가 소스별 `items_fetched`·오류를 `stage_events.counts`와 소스 health에 남긴다 |
| D4 | integrity 격리 무시 | QA verdict가 전부 기록되고 거절은 `drafts.review_status`로 남는다 |
| D5 | 비구독 모드 TypeError | 레거시 경로 폐기(제거 PR, M8) |
| D6 | 라이브러리 내부 `process.exit` | `packages/*/src`에는 `process.exit`가 없다. 라이브러리는 오류(`ConfigError` 등)를 던지고, CLI(`bin/pipeline.ts`)만 종료 코드를 정한다 |
| D7 | slug 중복·조용한 교체 | `publications.slug` unique, `publicationId(slug)` 결정적 id, `publish.slug_conflict` update/skip/fail |
| D8 | 미사용 프롬프트·데드코드 | 레거시 제거 PR(M8, 별도 승인) |
| D9 | 발행이 빌드·테스트 성공에 결합 | DB 발행 + ISR(ADR-005). 사이트 빌드는 발행과 무관하다 |
| D10 | 문서 드리프트 | `docs/STATUS.md` 단일 진실, 설정 `version`, `docs/runbook.md` |

## 4. 남은 위험

- **소스 품질**: 피드 발췌만 있는 소스(800자)는 grounding 근거가 얕다. `min_source_chars` 상향 여부는 튜닝 결정으로 남아 있다.
- **사건 중복**: `DUPLICATE_EVENT`는 숫자·라틴 고유명사가 3개 미만인 한국어 제목을 비교하지 못한다(문서화된 한계).
- **DB 장애 시 서빙**: 503 no-store까지는 구현했다. last-known-good 스냅샷은 미구현이다(ADR-005 확인 필요 항목).
- **ISR revalidate**: `bypassToken`이 없어 on-demand 무효화를 쓸 수 없다. 새 글은 ISR 만료(300초) 안에 노출된다.
