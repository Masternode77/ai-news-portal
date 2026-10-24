# COMPUTE CURRENT 리빌드 브리프 — Claude Code 실행 지시서

> **사용법**
> 1. 이 파일을 레포 루트에 `REBUILD_BRIEF.md`로 저장한다.
> 2. 세션을 열 때마다 아래 한 줄로 시작한다.
>    `REBUILD_BRIEF.md와 docs/STATUS.md를 읽어라. 이번 실행 범위는 승인된 Phase N only. 다른 Phase로 진행 금지. 끝나면 §7 보고 포맷으로 보고하라.`
> 3. Phase는 반드시 하나씩, Josh의 명시적 승인 후에만 다음으로 넘어간다.

---

## 0. 역할 정의 (Role / Domain lens / Output mode)

- **Role**: computecurrent.com 리빌드의 Principal Engineer 겸 Release Manager. 코드를 쓰는 사람이면서 동시에 "서비스가 끊기지 않게 하는" 책임자다.
- **Domain lens**: 콘텐츠 파이프라인(ingest → curate → generate → QA → publish)의 신뢰성, 유지보수성(maintainability), 재현성(reproducibility). 멋진 기능보다 "실패해도 서비스가 살아 있는 구조"를 우선한다.
- **Output mode**: 파일 산출물(`docs/`, 코드, 테스트) + 각 단계 종료 시 §7 보고 포맷. 자유 서술형 결론으로 끝내지 않는다. 재현 가능한 것은 반드시 파일이나 구조화된 필드로 남긴다.

---

## 1. Executive Summary

computecurrent.com은 장기간 누적된 코드가 서로 얽혀 반복 장애를 일으키고 있으며, 장애의 근본 원인이 **(H1) 소스 풀 부족**인지 **(H2) 검증 게이트 과도**인지 **(H3) 코드 결함**인지 아직 분리되지 않았다. 이 브리프의 목표는 **진단 → 설계 → 뼈대 → 모듈 이식 → 병렬 운행 → 컷오버**의 6단계로, **사이트 서빙과 콘텐츠 생산을 분리한** 단순하고 검증 가능하며 유지보수 가능한 구조로 다시 세우는 것이다.

한 번에 전부 갈아엎지 않는다. 운영 중인 사이트는 끊기지 않아야 하고, 모든 단계는 되돌릴 수 있어야 하며, 모든 주장은 측정값이나 `file:line`으로 뒷받침되어야 한다.

---

## 2. 알려진 현황 (Phase 0에서 전부 실측으로 확인·갱신할 것)

아래는 Josh가 알고 있는 수준의 정보다. **사실로 가정하지 말고 Phase 0에서 검증**한 뒤 `docs/diagnosis/00-inventory.md`에 확정값을 기록한다.

| 항목 | 알려진 내용 | 확인 상태 |
|---|---|---|
| 프레임워크 / 호스팅 | Astro / Vercel | 확인 필요 |
| 데이터 저장소 | Supabase (아카이브·검색) | 확인 필요 |
| 수집 주기 | RSS 소스 8시간 주기 | 확인 필요 |
| 생성 콘텐츠 | 기사 큐레이션 + 한국어 "Expert Lens" 분석 | 확인 필요 |
| 이미지 | OpenAI 우선 생성, 폴백 존재 | 확인 필요 |
| 정식 URL | https://www.computecurrent.com | 확인 필요 |
| 수익화 | AdSense, 프리미엄 콘텐츠 구상 | 확인 필요 |
| 코드 상태 | 90+ 커밋, 정식 출시 전, 중복 장애 다수 | 확인 필요 |

---

## 3. 북극성 요구사항 (불변 — 모든 설계 결정은 이 8개에 복무한다)

| ID | 요구사항 | 측정 방법 |
|---|---|---|
| **R1** | 중요 기사를 주기적으로(기본 8h, 설정 가능) 소싱한다 | 사이클당 신규 수집 아이템 수 |
| **R2** | 사이클당 1~2개의 `news_brief`를 출처 명시하여 발행한다 | 사이클당 발행 수, 7일 이동평균 |
| **R3** | 인사이트 가치가 충분한 주제는 Josh의 시각으로 재가공한 `insight_essay`(이미지 포함)로 발행한다 | 일 0~1건, Josh 승인 샘플 품질 |
| **R4** | 파이프라인 장애가 사이트 서빙을 멈추지 않는다 | 파이프라인 실패 중 사이트 가용성 100% |
| **R5** | 소스·생성기·QA 규칙·퍼블리셔·콘텐츠 타입은 플러그앤플레이로 추가/교체된다 | 신규 소스 추가 ≤ 10줄, 신규 QA 규칙 ≤ 1파일 |
| **R6** | QA/QC 게이트는 측정 가능하고 설명 가능하다 (왜 통과/탈락했는지 저장) | 모든 판정에 reason 코드 존재 |
| **R7** | 재현 가능하다 — fixture 기반 결정적 replay, 네트워크 없이 테스트 | CI에서 외부 호출 0회 |
| **R8** | 기존 발행 URL·데이터·SEO 자산을 보존한다 | 기존 slug 100% 접근 가능(또는 301) |

**v1 Non-goals**: UI 리디자인, 신규 기능 추가, 프리미엄/AdSense 확장. 내부 구조를 다시 세우는 것이 목적이며, UI는 깨진 곳만 고친다. UI 단순화가 필요하다고 판단되면 Phase 1에서 **별도 ADR로 제안만** 한다.

---

## 4. 아키텍처 원칙 (설계 제약)

- **P1. 서빙과 생산의 분리** — 사이트는 "발행 완료(published) 저장소"만 읽는다. 파이프라인은 그 저장소에 쓰기만 한다. 파이프라인이 죽어도 사이트 빌드/서빙은 성공해야 한다. **발행이 사이트 전체 재빌드 성공에 의존하는 구조는 금지**(SSR/ISR 또는 on-demand revalidation 사용).
- **P2. 단일 Stage 인터페이스** — 모든 처리 단계는 동일한 인터페이스(`run(input, ctx) → output`)를 구현한다. 입력·출력은 zod 스키마로 검증하고, 각 단계는 idempotent하며 idempotency key를 가진다.
- **P3. 외부 의존성은 전부 Adapter** — RSS/API 소스, LLM 공급자, 이미지 공급자, 퍼블리셔(사이트, 향후 외부 블로그/SNS)는 어댑터 인터페이스 뒤에 둔다. 코어 로직은 공급자 이름을 모른다.
- **P4. 설정 > 코드** — 소스 목록, 임계값, 기능 플래그, 사이클당 발행 수 상한, 비용 상한은 설정 파일(`config/`)에 둔다. 모듈마다 `enabled` 플래그가 있다.
- **P5. Fail-safe by default** — 단계 실패는 해당 아이템/런만 격리(dead-letter)하고 다음 아이템으로 진행한다. 이미지 생성 실패는 발행을 막지 않는다(브랜드 플레이스홀더로 발행, 추후 재시도). 처리되지 않은 예외로 런 전체가 죽는 경로를 0으로 만든다.
- **P6. 재현 가능** — 실제 RSS 페이로드·LLM 응답을 fixture로 녹화해 replay한다. 테스트와 CI는 네트워크 없이 돈다.
- **P7. 관측 가능** — 모든 런은 `pipeline_runs`, 모든 단계는 `stage_events`에 기록된다. 런 종료 시 funnel 요약(§6 Phase 0의 funnel 컬럼과 동일)과 발행 링크, 실패 요약을 Telegram으로 보낸다. 토큰·비용도 런 단위로 기록한다.
- **P8. 단순성 우선** — 기존 스택(Astro, Vercel, Supabase, TypeScript)을 유지한다. 바꿔야 한다면 ADR에 측정 근거를 적는다. 새 라이브러리·서비스 추가는 "없으면 R1~R8 중 무엇이 불가능한가"를 답할 수 있을 때만.
- **P9. 레거시는 읽고 이해하고 다시 쓴다** — 레거시 코드를 새 구조로 복사·붙여넣기 하지 않는다. 검증된 로직(규칙, 프롬프트, 스키마)만 추출해 새 인터페이스에 맞춰 재작성한다. 레거시는 Phase 5 전까지 삭제하지 않는다.

---

## 5. 공통 운영 규칙 (모든 세션에 적용)

### 5.1 Truth anchor
- `docs/STATUS.md`가 단일 진실이다. 매 세션 시작 시 읽고, 종료 시 갱신한다. 포함 항목: 현재 Phase, 마지막 PASS 상태, 다음 승인 대기 항목, blocker.
- 직전 Phase가 PASS면 그 이하로 되돌아가지 않는다. 되돌아가야 할 사유가 생기면 `blocked`로 보고하고 멈춘다.

### 5.2 상태 어휘
`started | partial | done | blocked (reason)` 네 가지만 쓴다. "거의 완료", "대부분 작동" 같은 표현 금지.

### 5.3 승인 게이트
- Phase 간 이동, Phase 3의 각 모듈(3a~3i) 이동은 Josh의 명시적 승인이 필요하다.
- 승인 요청 시 반드시 §7 보고 포맷을 먼저 제출한다.

### 5.4 STOP-THE-LINE (즉시 중단 후 보고)
- 데이터 손실 가능성(테이블 drop/truncate, 파일 대량 삭제)
- 프로덕션 가용성에 영향을 주는 변경
- 시크릿 노출 또는 노출 가능성
- 예상 밖의 파괴적 명령 필요
- 런당 LLM/이미지 비용이 설정 상한을 초과

### 5.5 금지 사항
- 환경 변수 **값** 출력·로그·커밋. 변수 **이름**만 다룬다.
- `.env*`, 키 파일, Supabase service role 키 등 시크릿 파일 열람(명시 요청 제외).
- 승인 없는 삭제(테이블, 파일, 브랜치), force-push, git history 재작성.
- 승인 없는 Vercel 프로젝트 설정·DNS·cron·환경 변수 변경.
- 승인된 Phase 밖에서 `--dry-run`이 아닌 실제 publish 실행.
- 한 번에 20개 파일 이상 자동 편집(사전 계획 제시 필수).

### 5.6 사전 승인 필요
- 패키지 설치, DB 스키마 마이그레이션, 스케줄 변경, 프로덕션 배포, 외부 서비스 신규 연결.

### 5.7 작업 위치
- 리빌드 작업은 `rebuild/v2` 브랜치의 git worktree에서 수행한다(`git worktree add ../computecurrent-rebuild rebuild/v2`). `main`은 레거시가 계속 서빙한다.

---

## 6. 실행 단계

### Phase 0 — 진단 (Read-only. 코드 수정 절대 금지)

**목적**: H1/H2/H3를 데이터로 분리하고, 보존해야 할 자산을 확정한다.

**범위**: 읽기, 로그 조회, dry-run 실행(쓰기·발행 없음), `docs/diagnosis/` 아래 문서 작성만. `git status`에 `docs/` 외 변경이 있으면 실패다.

**작업**
1. **레포 인벤토리** — 디렉토리 트리, `package.json` 스크립트, Astro 설정(SSG/SSR/하이브리드 여부), `vercel.json`(cron, 함수 타임아웃), GitHub Actions, Supabase 마이그레이션·테이블 목록, 환경 변수 **이름** 목록. → `00-inventory.md`
2. **파이프라인 지도** — 소스 목록 → fetch → parse → dedupe → score → gate → generate → QA → publish → render 흐름을 추적해 Mermaid 다이어그램 + 각 단계의 `file:line`을 기록한다. "발행이 재빌드에 의존하는가"를 명시한다. → `01-pipeline-map.md`
3. **Funnel 실측** — 최근 14일(또는 로그가 허용하는 범위)의 런별 아래 표를 만든다. 로그/DB에 없으면 `scripts/diagnose/funnel.ts`를 작성해 **dry-run**으로 현재 파이프라인을 돌려 측정한다. 측정값과 추정값을 반드시 구분 표기한다. → `02-funnel.md` + `02-funnel.csv`

   | run_id | started_at | sources_configured | sources_ok | sources_failed | items_fetched | items_new | items_scored | passed_gate | drafts | qa_passed | published | top_error |
   |---|---|---|---|---|---|---|---|---|---|---|---|---|

4. **에러 분류** — Vercel 런타임 로그, Supabase 런 테이블, Actions 로그에서 에러를 수집해 유형별로 묶고, 상위 10개를 빈도·책임 `file:line`과 함께 기록한다. → `03-error-taxonomy.md`
5. **판정** — 아래 판단 기준을 참고하되 데이터가 말하는 대로 쓴다. 복수 가설이 참이면 기여도 순으로 순위를 매긴다. 각 판정에 confidence(high/med/low)와 근거를 붙인다. → `04-verdict.md`
   - H1(소스 풀 부족) 지지 신호: `sources_ok/sources_configured < 70%`, 또는 사이클당 `items_new < 20`
   - H2(게이트 과도) 지지 신호: `items_scored ≥ 20`인데 `passed_gate/items_scored < 5%`, 또는 `qa_passed/drafts < 50%`이고 탈락 사유가 1~2개 규칙에 집중
   - H3(코드 결함) 지지 신호: 처리되지 않은 예외로 끝난 런 `> 20%`, 단계 간 카운트 불일치, 중복 발행, 단계 순서 오류
6. **보존 목록** — 기존 발행 글의 slug/URL 전체, Supabase 데이터 중 유지할 테이블, 도메인·사이트맵·AdSense·검색 콘솔 설정, 재사용 가치가 있는 프롬프트·규칙. → `05-preserve-list.md`
7. **CLAUDE.md 초안 제안** — §5의 운영 규칙을 레포 `CLAUDE.md`로 고정할 초안을 작성한다(Phase 2에서 실제 생성). → `06-claude-md-draft.md`

**완료 기준**
- [ ] `docs/diagnosis/00`~`06` 7개 파일 존재
- [ ] 모든 주장에 `file:line` 또는 `run_id` 근거
- [ ] funnel 표에 최소 10개 런, 부족하면 "데이터 부족 + dry-run N회 실행" 명시
- [ ] `git status`에서 `docs/`, `scripts/diagnose/` 외 변경 0
- [ ] 판정 문서에 H1/H2/H3 각각의 confidence와 기여도 순위

**게이트**: Josh가 `04-verdict.md`와 `05-preserve-list.md`를 검토·승인하면 Phase 1.

---

### Phase 1 — 목표 아키텍처 설계 + 마이그레이션 계획 (설계만. 구현 금지)

**목적**: Phase 0 판정에 근거해 목표 구조를 결정하고, 대안과 기각 사유를 문서화한다. Plan mode 사용 권장.

**작업 — ADR 작성** (`docs/adr/`, 각 ADR은 Context / Options / Decision / Consequences / Rejected alternatives & why 구조)
- **ADR-001 레포 구조** — 예: `apps/site`(Astro) + `packages/pipeline` + `packages/shared`(스키마) 모노레포 vs 단일 패키지. 기존 패키지 매니저를 유지한다.
- **ADR-002 파이프라인 런타임** — Vercel Cron+serverless(타임아웃 제약), GitHub Actions 스케줄로 Node CLI 실행, Supabase pg_cron/Edge Function, 소형 워커 중 선택. Phase 0에서 측정한 **사이클당 실제 생성 시간·비용**을 근거로 결정한다. 1~2개 기사 + 이미지 생성이 함수 타임아웃 안에 들어가는지 명시한다.
- **ADR-003 데이터 모델 & 계약** — Appendix C 초안을 기준으로 테이블·zod 스키마·idempotency key·상태 전이(`raw → candidate → draft → qa → published | rejected | dead_letter`)를 확정한다.
- **ADR-004 QA 게이트 설계** — Appendix B를 기준으로 hard/soft 분리, 임계값의 초기값과 **튜닝 절차**(Phase 4 shadow run 데이터로 조정), human-review 큐 여부를 확정한다.
- **ADR-005 발행 경로** — P1을 만족하는 방식(SSR/ISR 읽기 또는 on-demand revalidation). 기존 slug 보존·301 맵.
- **ADR-006 마이그레이션 전략** — Strangler 패턴, shadow run 기간, 컷오버 플래그, 롤백 절차, 레거시 보관 방식(`legacy-final` 태그 + DB 백업).
- **ADR-007 관측·알림·비용 가드** — 런 원장, Telegram 요약 포맷, 런당 비용 상한과 초과 시 동작.
- **(선택) ADR-008 UI 단순화 제안** — 제안만. 구현은 v1 범위 밖.

**추가 산출물**
- `docs/architecture/target.md` — 목표 구조 Mermaid 다이어그램 + 모듈 책임표
- `docs/architecture/contracts.md` — Stage 인터페이스, Adapter 인터페이스(Source / LLM / Image / Publisher), 설정 스키마
- `docs/migration/plan.md` — 순서가 있는 단계 목록, 각 단계의 롤백 방법, Phase 3 모듈 이식 순서(3a~3i)와 각 모듈이 레거시의 어느 파일을 대체하는지 매핑

**완료 기준**
- [ ] ADR-001~007 작성, 각각 최소 2개 대안과 기각 사유 포함
- [ ] `target.md`, `contracts.md`, `plan.md` 존재
- [ ] 코드 변경 0 (`git status`에 `docs/` 외 변경 없음)
- [ ] R1~R8 각각이 어떤 설계 요소로 충족되는지 추적표(traceability matrix) 포함

**게이트**: Josh가 ADR을 승인(수정 요청 가능)하면 Phase 2.

---

### Phase 2 — 뼈대 구축 (Skeleton + Contracts + Test Harness)

**목적**: 승인된 설계대로 "아무 일도 안 하지만 끝까지 도는" 뼈대를 세운다. 비즈니스 로직은 넣지 않는다.

**작업**
1. 승인된 레포 구조 생성(worktree `rebuild/v2`).
2. `packages/shared`: zod 스키마(Appendix C), Stage/Adapter 인터페이스, 설정 로더(`config/pipeline.yaml`, `config/sources.yaml`), 기능 플래그.
3. `packages/pipeline`: CLI 러너 — `pipeline run [--stage <name>] [--dry-run] [--fixture <name>] [--replay]`. 모든 Stage는 no-op 구현으로 시작. 런 원장(`pipeline_runs`, `stage_events`) 기록.
4. Fixture 체계: `fixtures/rss/*.xml`(Phase 0에서 녹화한 실제 페이로드), `fixtures/llm/*.json`(녹화된 응답), replay 모드에서 네트워크 호출 0.
5. 테스트 하네스(Vitest 또는 레포 기존 도구), lint, typecheck, build를 묶은 CI(GitHub Actions).
6. `apps/site`: published 저장소만 읽도록 데이터 접근층 작성. **published 아이템이 0개여도 빌드·렌더 성공**하는 테스트 추가.
7. `CLAUDE.md` 생성(Phase 0 초안 기반), `docs/STATUS.md` 생성, `README.md`에 로컬 실행법.

**완료 기준**
- [ ] CI green (lint / typecheck / test / build)
- [ ] `pipeline run --dry-run --fixture sample` 이 모든 Stage를 no-op으로 통과하고 런 원장에 기록
- [ ] 사이트가 published 0개 상태에서 빌드 성공(테스트로 증명)
- [ ] 기능 플래그로 임의 Stage를 끄고 켤 수 있음
- [ ] 프로덕션에 어떤 영향도 없음(main 브랜치 무변경)

**게이트**: Josh 승인 후 Phase 3.

---

### Phase 3 — 모듈 이식 (한 모듈씩. 각 모듈이 승인 게이트)

**공통 절차(모든 모듈 동일)**
1. 레거시의 해당 로직을 읽고 `docs/migration/notes/<module>.md`에 "유지할 것 / 버릴 것 / 바꿀 것"을 적는다.
2. 새 인터페이스에 맞춰 **재작성**한다(복붙 금지).
3. fixture 기반 단위 테스트 + 계약(스키마) 테스트를 쓴다.
4. 실제 데이터로 `--dry-run`(발행·쓰기 없음)을 돌리고 결과 샘플을 보고에 첨부한다.
5. 기능 플래그를 두고 기본값은 `enabled: false`(Phase 4에서 켠다).

**모듈 순서와 모듈별 완료 기준**

- **3a Sources & Ingest** — `SourceAdapter` 인터페이스, RSS 어댑터 우선. `config/sources.yaml`에 tier(1: 반드시 수집, 2: 보조, 3: 실험)와 health 상태. 소스별 성공률·마지막 성공 시각 추적, 연속 실패 시 자동 비활성 + 알림. Phase 0에서 H1이 유의미했다면 **후보 소스 확장 목록**(공식 블로그, 규제기관, 유틸리티, 반도체·클라우드 벤더, 산업 매체)을 tier와 함께 제안한다.
  - 완료: 신규 소스 추가가 YAML 10줄 이내 / 단일 소스 실패가 런을 중단시키지 않음(테스트) / 사이클당 `items_fetched`가 Phase 0 대비 보고됨
- **3b Normalize & Dedupe** — canonical URL 정규화, 본문 해시, 제목 유사도(또는 임베딩) 기반 near-dup, 이미 발행된 글과의 중복 차단.
  - 완료: 동일 기사 3개 소스 fixture가 1개로 수렴 / 발행본과 중복 시 reject reason 기록
- **3c Scoring & Selection** — 투명한 루브릭(관련성, 시의성, 영향도, 독자 가치, 인사이트 잠재력). 항목별 점수와 근거를 저장. 임계값은 설정. 사이클당 선택 수 상한/하한(기본 1~2)은 설정. 탈락 사유 기록.
  - 완료: 모든 후보에 항목별 점수 + reason / 임계값 변경이 설정만으로 가능 / 선택 결과 설명 가능
- **3d Generation — news_brief** — Appendix A 정의. 출처 링크 필수, 원문 연속 인용 제한, 한국어 Expert Lens 포함. LLM 어댑터 뒤에서 호출. 프롬프트는 `prompts/news_brief.md`로 파일화(버전 관리).
  - 완료: fixture 입력 → 스키마 통과 초안 / 수치 grounding 검사 통과율 보고
- **3e Generation — insight_essay** — Appendix A 정의. 트리거 조건(인사이트 잠재력 점수 ≥ 설정값), 일 1건 상한, Josh 보이스 파일(`content/voice/josh_voice.md`, Josh 제공) 참조. 구조 템플릿은 `content/templates/insight_essay.md`로 Josh 승인 후 확정.
  - 완료: 샘플 3편을 Josh가 검토해 "내 시각으로 읽힌다" 승인
- **3f Image** — `ImageAdapter`(OpenAI 우선, 폴백 체인). 프롬프트·공급자·모델·생성시각을 provenance로 저장, alt text 생성. 전부 실패 시 브랜드 플레이스홀더로 진행(soft).
  - 완료: 공급자 전부 실패 fixture에서도 발행 흐름이 멈추지 않음(테스트)
- **3g QA Gates** — Appendix B. 각 규칙은 1파일 1규칙(`qa/rules/*.ts`), `{pass, severity, reason_code, evidence}` 반환. hard 실패 → reject, soft 실패 → flag + human-review 큐(설정으로 자동 통과 가능).
  - 완료: 규칙 추가가 1파일 추가로 끝남 / 모든 판정에 reason_code / 규칙별 통과율 리포트
- **3h Publisher** — `PublisherAdapter`. v1은 사이트 퍼블리셔(published 저장소 write + revalidation)만. 외부 블로그·SNS는 인터페이스만 두고 구현하지 않는다.
  - 완료: publish가 사이트 재빌드 성공에 의존하지 않음(ADR-005 검증) / 기존 slug 충돌 방지
- **3i Scheduler, Alerting, Cost guard** — ADR-002/007 구현. 런 종료 시 Telegram 요약(funnel 표 + 발행 링크 + 실패 상위 3개 + 비용). 런당 비용 상한 초과 시 생성 중단(사이트 무영향).
  - 완료: 실패 런·성공 런 각각 알림 fixture 테스트 / 비용 상한 트리거 테스트

> **재계획 2026-10-23 (Josh)**: 모듈 실행 순서를 **3a → 3b → 3c → 3d → 3f → 3g → 3h → 3i → 3e**로 바꾼다. news_brief 라인을 먼저 끝까지(생성 → 이미지 → QA → 발행 → 스케줄) 이어 붙이고, insight_essay(3e)는 보이스 샘플 수령 후 마지막에 한다. 모듈별 완료 기준·게이트는 그대로.
>
> **B안 세부 2026-10-24 (Josh 승인)**: Phase 4 shadow(≥3일)·Phase 5 전환까지 news_brief만으로 진행한다 — R3(insight_essay 일 0~1)는 전환 시점 미충족을 허용하고, "Phase 3 전체 완료"는 3e를 제외한 3a~3d·3f~3i로 읽는다. 3e는 전환 직후 착수하고, 보이스 샘플 5~10편은 shadow 기간 중 Josh가 제출한다(`docs/migration/plan.md` §1 B안 메모).

**Phase 3 전체 완료 기준**
- [ ] 3a~3i 모두 테스트·CI 통과, 플래그 존재
- [ ] `pipeline run --dry-run` 이 실제 소스에서 끝까지 돌고 "발행했을 글"을 staging에 기록
- [ ] `docs/migration/notes/` 에 모듈별 노트 9개

**게이트**: 모듈마다 Josh 승인. Josh가 원하면 3a~3c처럼 묶어 승인할 수 있으나, 보고는 모듈별로 한다.

---

### Phase 4 — 병렬 운행 (Shadow Run) & 튜닝

**목적**: 레거시가 프로덕션을 서빙하는 동안 새 파이프라인을 실제 스케줄로 돌려 staging(별도 테이블/프리뷰 사이트)에만 기록하고, 데이터로 게이트를 조정한다.

**작업**
1. 새 파이프라인을 실제 주기로 가동, 출력은 staging에만. 프로덕션 publish 플래그 OFF.
2. 매 런 funnel 표를 수집하고, 레거시의 같은 기간 결과와 나란히 비교한다(`docs/shadow/compare.md`).
3. Josh가 "발행했을 글" 샘플을 검토해 hard-QA 오탐(막아야 할 것을 통과)·미탐(통과시켜야 할 것을 막음)을 표시한다.
4. 임계값·루브릭 가중치를 **설정 변경만으로** 조정하고 변경 이력을 `docs/shadow/tuning-log.md`에 남긴다.
5. 롤백 드릴: 플래그 OFF → 레거시 복귀가 5분 내 되는지 실측.

**완료 기준**
- [ ] 최소 3일(8h 주기 기준 9런 이상) 연속 처리되지 않은 예외 0
- [ ] 런의 80% 이상에서 발행 가능한 `news_brief` ≥ 1 (목표치는 Josh가 조정 가능)
- [ ] Josh 샘플 검토에서 hard-QA 오탐 0, 미탐은 튜닝 로그로 해소
- [ ] 롤백 드릴 완료 및 소요 시간 기록
- [ ] 런당 비용이 상한 이내

**게이트**: Josh 승인 후 Phase 5.

---

### Phase 5 — 컷오버 & 레거시 정리

**작업**
1. `legacy-final` git 태그 + Supabase 백업(승인 후 실행).
2. 컷오버 플래그 ON. 기존 slug 전수 접근 확인, 301 맵 적용, 사이트맵·robots 갱신.
3. 48시간 모니터링(알림·funnel·가용성). 이상 시 플래그 OFF로 즉시 복귀.
4. 레거시 제거는 **별도 PR**, Josh의 명시 승인 후에만.
5. `docs/runbook.md` 작성 — "소스 추가 / QA 규칙 추가 / 퍼블리셔 추가 / 콘텐츠 타입 추가 / 임계값 변경 / 장애 시 롤백" 각각 10줄 이내 절차.
6. `docs/postmortem.md` — Phase 0의 상위 에러 10개가 새 구조의 어떤 장치로 재발 방지되는지 1:1 매핑.

**완료 기준**
- [ ] 프로덕션이 새 시스템으로 서빙 중, 48h 무중단
- [ ] 기존 URL 100% 접근(또는 301)
- [ ] runbook, postmortem 존재
- [ ] 레거시는 태그·백업 보존 후 제거(승인 기록 포함)

---

## 7. 보고 포맷 (Phase·모듈 종료 시 필수)

```
## 실행 보고 — Phase N (또는 3x 모듈명)
- execution status: started | partial | done | blocked (reason)
- boundary: 이번 실행에서 건드린 범위 / 의도적으로 건드리지 않은 범위
- exact files modified: (전체 목록, 신규/수정/삭제 구분)
- patch summary: 무엇을 왜 바꿨는가 (3~7줄)
- verification: 실행한 명령과 실제 출력 요약 (lint / typecheck / test / build / dry-run)
- evidence: run_id, 로그 발췌, funnel 수치, 스크린샷 경로
- backup / rollback path: 되돌리는 방법
- risks & open questions: 
- next step (requires approval): 
```

보고 없이 다음 단계로 넘어가지 않는다. "완료했습니다" 한 줄 보고는 보고가 아니다.

---

## 8. Josh가 제공할 입력 (브리프 외 필요한 것)

| 입력 | 용도 | 시점 |
|---|---|---|
| 레포 경로 / 접근 권한, Vercel·Supabase 로그 조회 권한 | Phase 0 진단 | Phase 0 전 |
| 사용 가능한 환경 변수 **이름** 목록(값 아님) | 인벤토리 | Phase 0 |
| 보이스 샘플(Josh가 직접 쓴 글 5~10편) | `content/voice/josh_voice.md` 작성 | Phase 3e 전 |
| 추가하고 싶은 소스 후보 | `config/sources.yaml` | Phase 3a |
| 사이클당 발행 목표(기본 1~2), insight_essay 일 상한(기본 1) | 설정 초기값 | Phase 1 |
| 런당 LLM/이미지 비용 상한(USD) | 비용 가드 | Phase 1 |
| Shadow run 기간(기본 3일) | Phase 4 | Phase 4 전 |

---

## Appendix A. 콘텐츠 타입 정의

### `news_brief`
- 목적: 중요 기사 1건을 출처 명시하여 요약·맥락화. 사이클당 1~2건.
- 필수 필드: `title_ko`, `summary_ko`(원문 재서술, 연속 인용 최대 1회·20단어 이내), `why_it_matters_ko`, `expert_lens_ko`(Josh 도메인 관점의 해석 3~5문장), `source_url`, `source_name`, `published_at_source`, `tags`, `image`(선택), `slug`.
- 금지: 원문 전재, 원문에 없는 수치·고유명사, 출처 미표기.

### `insight_essay`
- 목적: 독자에게 인사이트를 주는 주제를 Josh의 시각으로 재가공한 글. 일 0~1건.
- 트리거: 3c 루브릭의 "인사이트 잠재력" ≥ 설정값, 그리고 당일 상한 미달.
- 필수 필드: `title_ko`, `body_ko`(템플릿 구조 준수), `thesis_ko`(한 문장), `counterpoint_ko`(반대 관점 1개 이상), `implications_ko`, `sources[]`(2개 이상), `image`(필수, 실패 시 플레이스홀더), `slug`.
- 보이스: `content/voice/josh_voice.md` 준수. 1인칭 관점, 단정과 근거의 분리, 과장 금지.

---

## Appendix B. QA 게이트 초안 (Phase 1에서 확정, Phase 4에서 튜닝)

**Hard (실패 시 reject)**
- `SCHEMA_INVALID` — zod 스키마 불일치
- `SOURCE_UNREACHABLE` — 출처 URL 응답 불가
- `QUOTE_TOO_LONG` — 원문 연속 인용 20단어 초과 또는 2회 이상
- `UNGROUNDED_NUMBER` — 초안의 수치가 출처 본문에 존재하지 않음
- `DUPLICATE_OF_PUBLISHED` — 발행본과 중복
- `DATE_INVALID` — 출처 발행일 미래/파싱 불가
- `LANG_MISMATCH` — 한국어 비율 설정값 미달
- `BANNED_PATTERN` — 금칙어·광고성 패턴

**Soft (flag + human-review 큐, 설정으로 자동 통과 가능)**
- `RUBRIC_BELOW_TARGET` — 편집 루브릭 점수 미달
- `READABILITY_LOW` — 문장 길이·반복 지표 초과
- `SEO_FIELDS_MISSING` — meta description, OG 이미지 누락
- `IMAGE_MISSING` — 이미지 생성 실패(플레이스홀더로 발행)
- `THIN_EXPERT_LENS` — Expert Lens 분량·구체성 부족

모든 판정은 `{rule, severity, pass, reason_code, evidence, checked_at}` 형태로 `qa_results`에 저장한다.

---

## Appendix C. 데이터 모델 초안 (Phase 1 ADR-003에서 확정)

| 테이블 | 역할 | 핵심 컬럼 |
|---|---|---|
| `sources` | 소스 레지스트리·health | id, name, type, url, tier, enabled, last_ok_at, fail_streak |
| `raw_items` | 수집 원본 | id, source_id, canonical_url, content_hash, fetched_at, payload |
| `candidates` | 정규화·점수 | id, raw_item_id, scores(jsonb), total, selected, reject_reason |
| `drafts` | 생성 초안 | id, candidate_id, content_type, body(jsonb), prompt_version, model, tokens, cost |
| `qa_results` | 게이트 판정 | id, draft_id, rule, severity, pass, reason_code, evidence |
| `publications` | 발행 완료(사이트가 읽는 유일한 테이블) | id, draft_id, slug, published_at, publisher, status |
| `pipeline_runs` | 런 원장 | id, started_at, ended_at, status, funnel(jsonb), cost_total |
| `stage_events` | 단계 이벤트 | id, run_id, stage, status, started_at, ended_at, error |
| `dead_letters` | 격리 아이템 | id, run_id, stage, payload, error, retry_count |

상태 전이: `raw → candidate → draft → qa → published | rejected | dead_letter`

---

## Appendix D. 세션별 킥오프 문구 (복사해서 사용)

**Phase 0**
```
REBUILD_BRIEF.md를 읽어라. 이번 실행 범위는 Phase 0 only. 코드 수정 금지, 읽기와 dry-run과 docs/diagnosis/ 작성만 허용. H1/H2/H3를 데이터로 분리하는 것이 목표다. 끝나면 §7 보고 포맷으로 보고하고 승인을 기다려라.
```

**Phase 1** (Plan mode 권장)
```
REBUILD_BRIEF.md와 docs/STATUS.md, docs/diagnosis/04-verdict.md를 읽어라. 이번 실행 범위는 Phase 1 only — ADR-001~007과 target.md, contracts.md, plan.md 작성. 구현 금지. 각 ADR에 최소 2개 대안과 기각 사유를 포함하라.
```

**Phase 2**
```
REBUILD_BRIEF.md, docs/STATUS.md, docs/adr/ 전체를 읽어라. 이번 실행 범위는 Phase 2 only — 승인된 ADR대로 뼈대·계약·테스트 하네스·CI를 세운다. 비즈니스 로직 금지. worktree rebuild/v2에서 작업하고 main은 건드리지 마라.
```

**Phase 3 (모듈별)**
```
REBUILD_BRIEF.md, docs/STATUS.md, docs/migration/plan.md를 읽어라. 이번 실행 범위는 Phase 3a(Sources & Ingest) only. 공통 절차 1~5를 따르고, 레거시 복붙 금지, 플래그 기본값 false. dry-run 샘플을 보고에 첨부하라.
```

**Phase 4**
```
REBUILD_BRIEF.md, docs/STATUS.md를 읽어라. 이번 실행 범위는 Phase 4 — shadow run 가동(프로덕션 publish 플래그 OFF 유지). 매 런 funnel을 docs/shadow/에 기록하고, 임계값 변경은 설정 파일로만, tuning-log.md에 이력을 남겨라.
```

**Phase 5**
```
REBUILD_BRIEF.md, docs/STATUS.md를 읽어라. 이번 실행 범위는 Phase 5 — 태그·백업 생성은 내 승인 후, 컷오버 플래그 ON, 48h 모니터링. 레거시 삭제는 별도 PR로 제안만 하고 실행하지 마라.
```
