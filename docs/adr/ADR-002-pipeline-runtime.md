# ADR-002 — 파이프라인 런타임

- 상태: Proposed (Josh 사전 결정 2026-10-18: GitHub Actions + API 키)
- 날짜: 2026-10-18
- 관련: ADR-005(발행 경로), ADR-007(관측·비용), 브리프 P1·P5·P7·R1·R4·R7

## Context

Phase 0 실측(`docs/diagnosis/01-pipeline-map.md`, `02-funnel.md`):

- 생성은 Josh Mac의 Codex 스케줄 태스크에서만 돈다. 러너는 CI·Vercel·production 환경에서 실행을 거부하고(`scripts/run-subscription-news.mjs:111-113`), 구독 CLI는 토큰을 보고하지 않으며(`scripts/lib/openrouter.mjs:117`), 런 데드라인 90분(`:14`), 컬럼 단계 타임아웃은 구독 모드 2시간(`scripts/pipeline.mjs:380`)이다.
- Mac은 단일 장애점이다. 2026-10-11 이후 성공 런이 없고(GitHub 이슈 #29), 원인 중 하나는 Mac 로컬 git 손상이다(PR #55).
- 2026-10-06 이전에는 GitHub Actions 스케줄이 생성을 담당했고 68커밋이 남아 있다. 당시 런은 20~34분(`docs/diagnosis/logs/github-evidence.md`), 비용은 OpenRouter 경유였다.
- 실패 런은 원장에 남지 않는다(`scripts/pipeline.mjs:445` abort-before-write). 어떤 런타임을 고르든 ADR-007의 선기록 원장이 함께 가야 한다.

요구사항: R1(8h 주기 소싱), R4(파이프라인 장애가 서빙을 멈추지 않음), R7(네트워크 없는 재현), P5(fail-safe), 런당 비용 상한 USD 2(Josh 가정값).

## Options

### A. GitHub Actions 스케줄 + Node CLI + API 키 (결정)

- `schedule: cron` 8시간 주기 + `workflow_dispatch`(`--dry-run`, `--stage` 입력). 시크릿은 Actions secrets(`ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, 선택 `OPENAI_API_KEY`, `VERCEL_REVALIDATE_TOKEN`).
- 장점: 기존 10개 워크플로와 같은 운영 표면, 잡 타임아웃이 넉넉(기본 6h, `timeout-minutes`로 45분 고정), 로그가 GitHub에 남음, Mac 의존 제거, CI와 동일 컨테이너로 재현성.
- 단점: cron 지연(부하 시 수 분~수십 분), **60일간 레포 활동이 없으면 스케줄이 자동 비활성**(공개 문서: `docs.github.com/.../events-that-trigger-workflows#schedule` — 세션에서 직접 열람 불가, 확인 필요), 기본 브랜치에서만 스케줄 실행, API 과금 발생.
- 비용(ADR-007 표 참조): 사이클당 USD 0.4~0.6(브리프 1~2건), 에세이 포함 일 USD 1.0~1.4. 상한 USD 2 이내.

### B. Vercel Cron + Vercel Functions

- `vercel.json` `crons` + 함수 엔드포인트, `CRON_SECRET` 인증(Vercel 문서 `cron-jobs/manage-cron-jobs`).
- 장점: 운영 표면 최소, 사이트와 같은 배포 단위.
- 단점: 함수 실행 시간 한도가 플랜별로 다르고(`vercel.json` `functions.maxDuration` 설정, 문서 예시 최대 1800s — 플랜별 상한은 확인 필요) 1~2기사 + 에세이 + 이미지 생성이 한 함수 안에 들어가지 않을 수 있어 단계 분할·큐가 필요. 사이트 배포가 파이프라인 배포와 결합되어 P1 정신에 어긋남. 로그 보존이 짧음(Phase 0에서 Vercel 로그 접근 자체가 403이었음).

### C. Supabase pg_cron + Edge Functions

- 장점: 데이터와 같은 곳에서 실행, 스케줄 신뢰성.
- 단점: Edge Function 실행 시간·메모리 한도로 LLM 다단계 생성에 부적합, Deno 런타임으로 기존 Node 로직 재작성 비용 상승, 관측 분산.

### D. Mac 구독 CLI 유지 + 클라우드 폴백

- 장점: 변동비 0.
- 단점: 단일 장애점 유지, 토큰·비용 미보고(P7 위반), 러너가 CI 실행을 거부하도록 설계돼 폴백 경로가 사실상 두 번째 파이프라인이 됨. Phase 0의 현재 outage가 이 모델의 실패 사례.

### E. 소형 상시 워커(VPS/Fly/Railway)

- 장점: 타임아웃 제약 없음, 장기 작업 가능.
- 단점: 새 서비스·운영 비용·보안 표면 추가(P8 위반), 브리프 §5.6 사전 승인 항목.

## Decision

**A. GitHub Actions 스케줄 + Node CLI + API 키.** Josh가 2026-10-18에 선택했고 Phase 0 실측과도 맞는다.

설계 요점:

| 항목 | 값 |
|---|---|
| 워크플로 | `.github/workflows/pipeline.yml` (신규, Phase 2) — `on.schedule` + `on.workflow_dispatch`(inputs: `dry_run`, `stage`, `fixture`) |
| 주기 | `45 15,23,7 * * *` UTC = 00:45 / 08:45 / 16:45 KST (현행 Mac 슬롯 유지, `config/pipeline.yaml`의 `schedule.cron`과 동일 값을 문서화) |
| 동시성 | `concurrency: { group: cc-pipeline, cancel-in-progress: false }` — 겹치면 대기 |
| 타임아웃 | `timeout-minutes: 45` (Phase 0 Actions 시절 20~34분 실측 + 여유) |
| 러너 | `ubuntu-latest`, Node 22.22.0(`.nvmrc`), `npm ci` |
| 실행 | `node packages/pipeline/bin/pipeline.mjs run --config config/pipeline.yaml` |
| 시크릿 | 위 목록. 값은 Actions secrets에만, 코드·로그에 이름만 |
| 출력 | Supabase 쓰기(ADR-003), Telegram 요약(ADR-007), 아티팩트로 런 로그 JSON 업로드(90일) |
| 비용 가드 | ADR-007 — 런 시작 시 예산 레코드, 호출마다 누적, 상한 초과 시 생성 단계 중단 |
| 60일 비활성 방지 | `infrastructure-data.yml`이 6시간마다 `main`에 커밋하고 있어 현재는 해당 없음. 그 레인이 사라지면 월 1회 `workflow_dispatch`로 갱신하거나 keep-alive 커밋을 둔다(런북 항목) |
| CI 분리 | 테스트·빌드는 기존 `update-news.yml`(검증)에 남기고, 파이프라인 워크플로는 테스트·빌드를 돌리지 않는다(P1: 발행이 빌드 성공에 의존하지 않음) |

LLM 공급자 가정: Anthropic API 직접 호출(`@anthropic-ai/sdk` 0.135), 생성은 `claude-opus-5-5`, 큐레이션·분류 보조는 `claude-haiku-5-5`. OpenRouter 경유는 Josh가 선호하면 LlmAdapter 교체로 대응(ADR-007 비용표는 Anthropic 단가 기준). 이미지 공급자는 ADR-007·3f에서 결정하되 기본은 플레이스홀더 우선.

## Consequences

- (+) Mac 의존 제거, 실패 런도 GitHub 로그·원장에 남음, dry-run을 누구나 실행 가능, CI 컨테이너와 동일해 R7 충족.
- (+) 비용이 측정 가능해져 ADR-007의 상한 가드가 실효성을 가짐.
- (−) API 과금 시작. 월 추정: 3런/일 × USD 0.5 + 에세이 1/일 × USD 0.6 ≈ USD 60~70/월(이미지 제외). Josh가 상한을 조정할 수 있다.
- (−) cron 지연은 분 단위로 발생할 수 있다. 런 시작 시각을 원장에 기록하고 슬롯 키는 "예정 시각"으로 계산한다(현행 `kstSlot`의 실시간 계산을 재사용하지 않음).
- (−) 스케줄 자동 비활성 리스크는 런북으로 관리한다.
- 보안: 시크릿은 Actions에만 존재. 포크 PR에서는 시크릿이 주입되지 않으므로 `pull_request` 트리거를 파이프라인 워크플로에 두지 않는다.

## Rejected alternatives & why

- **B Vercel Cron**: 함수 시간 한도와 배포 결합. 발행이 사이트 배포 단위에 묶이면 P1 위반.
- **C Supabase Edge**: 런타임 재작성 비용과 실행 한도.
- **D Mac 유지**: 현재 outage의 원인이자 P7 위반.
- **E 상시 워커**: 신규 서비스 추가는 R1~R8 중 무엇도 불가능하게 만들지 않으므로 P8에 따라 기각.

## 확인 필요 (Phase 2 착수 전)

1. GitHub Actions 스케줄 비활성 규칙(60일)과 cron 최소 간격의 현재 문구 — 공개 문서 링크로 확인.
2. Anthropic API 키 발급·조직 설정(Josh).
3. 이미지 공급자 선택(ADR-007 §비용).
