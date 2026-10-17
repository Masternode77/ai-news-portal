# 01 — 파이프라인 지도 (실측, HEAD `e1ee3f2`)

**발행이 사이트 재빌드에 의존하는가: 예.** 파이프라인은 `src/data/*.json`을 쓰고, Mac 태스크가 그것을 `main`에 커밋·푸시하면 Vercel이 전체 정적 빌드를 다시 한다. 요청 시점에 읽히는 저장소는 없다(`astro.config.mjs:50`, `src/pages/news/[id].astro:36-53`, `src/pages/column/[slug].astro:20-25`). 빌드가 실패하면 새 글은 나오지 않고, 파이프라인 결과가 빌드 입력을 깨뜨리면 사이트 갱신 자체가 멈춘다 → 브리프 P1 위반.

## 1. 흐름도

```mermaid
flowchart TD
  A[Mac Codex 스케줄 태스크<br/>00:45/08:45/16:45 KST] --> B[subscription-job.mjs start<br/>프로덕션 SHA 검증 · 잠금 · 격리 worktree]
  B --> C[run-subscription-news.mjs:83<br/>11단계 순차 실행, 90분 데드라인]
  C --> D[pipeline.mjs main():576]
  D --> E[assertLlmReady: Codex/Claude CLI 로그인 확인]
  E --> F[sourceRegistry.yml → activeRegistryFeeds<br/>82행 중 텍스트 권리 28 피드]
  F --> G[fetchNewsPoolResult<br/>rss-parser · Epoch HTML · 피드별 try/catch<br/>풀 상한 30 · 10일 창]
  G -->|쓰기| P1[(src/data/news-pool.json)]
  G --> H[rollingCandidates<br/>publishedIds 제외]
  H --> I[curateWithLlm → 결정적 랭커 폴백<br/>→ 플로어 3건 @ relevance ≥ 0.55]
  I --> J[pickItemsForRun: 런당 최대 3]
  J -->|picked = 0| N0[normalization_only 분기<br/>기존 레코드 재정규화]
  J --> K[enrichContent<br/>정규식 추출 · fail-closed QA · 모델 JSON]
  K --> L{splitByInfrastructureRelevance<br/>≥0.75 full memo / ≥0.55 signal card / else archive}
  L -->|archive_only| X[archiveOnly]
  L -->|signal_card| S[signal card]
  L -->|full_memo| M{quality ≥ 0.8<br/>+ expert insight 완전}
  M -->|fail| S
  M -->|publishable = 0| N1[existing_only 분기<br/>publishedCount = 0 고정]
  M -->|pass| N[Expert Lens 메모 생성]
  N --> O[anti-template rewrite → repetition 게이트]
  O -->|blocked| X
  O --> Q[applyTiersForPublication]
  Q --> R[저자 컬럼 단계<br/>후보 선택 → 초안·보이스·수리 → 정책 게이트 → Astra 리뷰]
  R -->|구독 모드 실패| Z[[런 abort exit 1<br/>상태 기록 전]]
  R -->|컬럼| P2[(authored-columns.json)]
  K -.-> IMG[이미지: Codex 매니페스트 → 포스터 → 플레이스홀더<br/>실패해도 차단 없음]
  Q --> T[syncArchiveArtifacts<br/>finalPublicationIntegrity → 격리]
  N0 --> T
  N1 --> T
  T -->|쓰기| P3[(latest-news / archived-news / search-index)]
  T --> U[(pipeline-state.json runHistory)]
  U --> V[후속 단계: 헤드라인 · EIA 복원 · taxonomy · reader-copy 감사 · npm test · content:gate]
  V --> W[Mac: 네이티브 아트워크 → import-codex-image → heartbeat]
  W --> Y[git push main]
  Y --> VB[Vercel: prepare-static-images + astro build]
  VB --> RD[정적 페이지 /news/id · /column/slug · / · /ko/]
```

## 2. 단계표

| # | 단계 | 진입점 (`file:line`) | 입력 → 출력 | 영속 카운터 | 상한·임계값 |
|---|---|---|---|---|---|
| 0 | 트리거 | Mac 태스크 → `scripts/subscription-job.mjs start` → `scripts/run-subscription-news.mjs:83` (단계 목록 `:15-27`, CI/Vercel/production 거부 `:111-113`, 자격증명 제거 `:32-46`, 데드라인 90분 `:14`) | 잠금·worktree | 잡 레코드 `<git-common-dir>/subscription-jobs/<id>.json` (레포 밖) | 1 러너 리스 |
| 1 | 준비 | `scripts/pipeline.mjs:576-584` → `scripts/lib/subscription-provider.mjs:107` | CLI 로그인 확인 | 없음 | — |
| 2 | 소스 | `scripts/lib/source-registry.mjs:159` `activeRegistryFeeds` (권리·`reviewed_at` 365일 `:113-135`) | 82행 → 28 피드 | 없음 | — |
| 3 | 수집 | `scripts/pipeline.mjs:202-232` → `scripts/lib/fetch-feeds.mjs:422-457` (피드별 catch `:431-440`, 이전 풀 이월 `:407-420`, 소스 균형 선택 `:329-380`) | 피드 → 풀 30 | **풀 크기·소스 성공/실패 미기록** (`:457` 반환값을 `pipeline.mjs:217`이 콘솔에만 출력; 콘솔 `pool loaded:` `:597`) | `MAX_ITEMS_FETCHED` 30, `POOL_MAX_AGE_DAYS` 10, 소스당 1~6 |
| 4 | 정규화·중복 | `scripts/lib/normalize.mjs:77-80` (sha1(url+title)[0:16]), `fetch-feeds.mjs:343-348` (ID·제목), `scripts/lib/curate.mjs:193-207` (`publishedIds` 제외) | 풀 → 후보 | `state.publishedIds` (최근 1,000) | 퍼지·의미 중복 검사 없음 |
| 5 | 큐레이션·plan | `scripts/lib/curate.mjs:28-32,58-73` (모델 숏리스트 30) → `:103-129` (결정적 랭커 폴백) → `:147-167` (플로어) → `:219-249` (일별 plan) → `:267-278` (슬롯 pick) | 후보 → 일 9 / 런 3 | `dayPlans[day]` (`curatedItems`, `publishedIds`, `visibleIds`, `slotPublications`) | `DAILY_CURATION_TARGET` 9, `DAILY_PROCESSING_LIMIT` 18, `ITEMS_PER_RUN` 3, 플로어 3 @ 0.55 |
| 6 | 추출·보강 | `scripts/pipeline.mjs:285` → `scripts/lib/content.mjs:269-409` → `scripts/lib/source-fetch.mjs:381-446` (정규식 추출, 80단락/24k자) → `scripts/lib/source-extraction-fail-closed.mjs:33-115` (boilerplate 0.08, 문장완성 0.92, 500/1200자) | 아이템 → 보강 레코드 + 추출 artifact(sha256) | 레코드 필드 `extraction_qa` | `content.mjs:240-267` |
| 7 | 관련성 tier | `scripts/lib/relevance-classifier.mjs:681` / `:836-865` | full_memo ≥0.75 / signal_card ≥0.55 / archive_only | `runHistory.archiveOnlyItems[].reason`, `signalCardItems` | `:1-2`; arXiv abstract 캡 `:800-803` |
| 8 | 품질·인사이트 게이트 | `scripts/lib/quality-gate.mjs:251,291` (0.8), `scripts/lib/expert-insight-engine.mjs:585,591` | full_memo 후보 → publishable / blocked(→signal card) | `blockedItems[].reason` | `ARTICLE_PAGE_QUALITY_THRESHOLD` 0.8 |
| 9 | Expert Lens 생성 | `scripts/pipeline.mjs:253,713` → `scripts/lib/expert-lens.mjs:446-462,488` (payload 검사 `:140-164`) | publishable → 메모 | `llmUsage.calls` (구독 모드 토큰 0) | 예산 60 calls / 120k tokens (`scripts/lib/llm-budget.mjs:8-9`) |
| 10 | 반복·템플릿 | `scripts/lib/anti-template-rewrite.mjs:112`, `scripts/lib/repetition-detector.mjs:331-425` (`config/bannedPhrases.yml` 54항목, `scripts/lib/banned-phrases.mjs:26-36`) | 메모 → passed / blocked | `publishedCount`, `repetitionBlockedItems` | `repetition-detector.mjs:7-23` |
| 11 | 공개 tier | `scripts/pipeline.mjs:470-495` `applyTiersForPublication` | 레코드 → `public_content_tier` | 레코드 필드 | `config/editorial/content-tier-policy.json` |
| 12 | 저자 컬럼 | `scripts/pipeline.mjs:389-452` → `scripts/lib/authored-column-engine.mjs:1093` (선택 거절 코드 `:80`, 초안×2 `:1234`, 보이스×2 `:1267`, 리뷰 버전 3 `:1264`), 정책 `scripts/lib/authored-column-policy.mjs:122-290`, 리뷰 `:1405-1537` | 후보 → 컬럼 또는 사유 | `authoredColumn.{published, reason, selectionDiagnostics}`, `state.authored.lastSelection/lastFailure` | 일 3, 간격 4h, 런당 2 스토리 시도, 사람다움 0.84, 인사이트 밀도 0.75 |
| 13 | 이미지 | `scripts/lib/image-generator.mjs:167-198` → `scripts/lib/codex-image-provider.mjs:70-89` (매니페스트 1,007) | 레코드 → 이미지 경로·provenance | `config/codex-image-manifest.json` | 전부 catch (`pipeline.mjs:244,303,438`) |
| 14 | 최종 integrity·저장 | `scripts/lib/archive-store.mjs:156-184` → `scripts/lib/final-publication-integrity.mjs:66-111` (격리 `:130-155`), 원자적 쓰기 `scripts/lib/state-store.mjs:27-35` | 레코드 → latest/archive/search JSON (파일 간 트랜잭션 없음) | `public_status=quarantined` + `publication_integrity.reasons`; 격리 목록은 파이프라인이 무시(`archive-store.mjs:178-184` → `pipeline.mjs:547/621/743`) | 권리·상세품질·artifact·claim·fidelity·SEO·수치·반복·저작권 |
| 15 | 런 원장 | `scripts/pipeline.mjs:555-574` (existing_only), `:632-640` (normalization_only), `:753-774` (full) | → `scripts/state/pipeline-state.json` | `runHistory` 120 cap (`:571,:773`), `publishedIds` 1,000 cap | 키 집합이 분기마다 다름 |
| 16 | 후속 | `run-subscription-news.mjs:15-27`: 헤드라인 → `restore-eia-public-inventory.mjs` → taxonomy → `audit-reader-copy --strict` → 현재상태 감사 → `npm test` → `content:gate` → 감사 | — | heartbeat는 Mac이 수동 기록(`scripts/record-pipeline-heartbeat.mjs`) | 실패 시 exit 1 → 잡 `failed` |
| 17 | 발행·렌더 | Mac: 아트워크 → `import-codex-image.mjs` → commit → push `main` → Vercel `npm run build` (`prepare-static-images` + `astro build`) → `getStaticPaths` | JSON → 정적 HTML | 없음 (Vercel 측) | 전체 재빌드 |

## 3. runHistory writer 3종 (funnel 해석의 기준)

| 분기 | 조건 | 기록 키 | 코드 |
|---|---|---|---|
| `full` | full_memo 후보가 품질·인사이트 게이트를 통과(publishable ≥ 1) | `publishedCount, signalCardCount, archiveOnlyCount, repetitionBlockedCount, publishedIds, processedIds, blockedCount, blockedItems, repetitionBlockedItems, signalCardItems, archiveOnlyItems` | `scripts/pipeline.mjs:753-768` |
| `existing_only` | pick은 있었으나 publishable = 0 | `publishedCount: 0`(고정), `signalCardCount, archiveOnlyCount, processedIds, blockedCount, blockedItems, archiveOnlyItems` | `:555-566` (`publishExistingOnly`) |
| `normalization_only` | 슬롯에 pick 0 | `publishedCount: 0`만 | `:632-636` |

세 분기 모두 `authoredColumn`과 `llmUsage`를 덧붙인다. 산술: `signalCardCount = relevance signal + quality blocked + insight blocked`, `blockedCount = quality + insight blocked`, `processedIds = repetitionPassed + signalCards + archiveOnly + repetitionBlocked` (`:648-666`, `:753-768`).

## 4. 기록되지 않는 것 (관측 공백)

1. 수집 단계 전부: 풀 크기, 소스별 성공/실패, 피드 오류 — 콘솔 로그에만 존재.
2. 큐레이션 모델 응답 실패 → 결정적 폴백 전환 여부.
3. Expert Lens 생성 실패 사유(구독 모드에서는 즉시 abort).
4. **abort된 런**: `pipeline.mjs:445` → `rethrowSubscriptionFailure` → `process.exit(1)` (`:786-789`)은 원장 쓰기(`:753-774`) 전에 일어난다. 그 런의 wire 결과·컬럼 진단은 유실되고 `news-pool.json`·이미지는 이미 써진 상태로 남는다(`:387-388`의 주석 "quality rejections remain recorded non-publication outcomes"와 코드가 모순).
5. 최종 integrity가 격리한 레코드 목록(반환값 무시).
6. 토큰·비용: 구독 모드에서 `prompt_tokens/completion_tokens` 항상 0 (`scripts/lib/openrouter.mjs:117`).
7. Telegram/Slack/이메일 알림 없음. 유일한 알림은 heartbeat 12h 초과 시 GitHub 이슈(`scripts/lib/operations-monitor.mjs:85,243-317`).

## 5. 오류 전파 경로 요약

| 격리됨 (아이템/피드 단위) | 런 전체 중단 |
|---|---|
| 피드 1개 실패 (`fetch-feeds.mjs:431-440`) | `pipeline.mjs:786-789` 예외 → exit 1 → 러너 단계 실패 (`run-subscription-news.mjs:76`) → 잡 `failed` |
| 라이브 풀 실패 → 파일 폴백 (`pipeline.mjs:223`) | 구독 모드의 모든 모델 오류: `rethrowSubscriptionFailure` (`scripts/lib/openrouter.mjs:19-21`) — 보강 `pipeline.mjs:290-294`, Expert Lens `:273`, 큐레이션 `curate.mjs:76,88`, 컬럼 `pipeline.mjs:445,450` |
| 추출 실패 → 스니펫 폴백 (`source-fetch.mjs:443`) | 컬럼 **품질 실패**도 `result.failure` → `:445`에서 abort |
| 이미지 전부 (`pipeline.mjs:244,303,438`) | 라이브러리 내부 `process.exit` (`subscription-provider.mjs:58-60`, SIGTERM/SIGINT 핸들러) |
| tier 라우팅 (`:488`), Supabase (`archive-store.mjs:171`) | 러너 후속 단계 실패(예: 10-11 이후 `restore-eia-public-inventory.mjs`)는 파이프라인이 끝난 뒤라도 발행을 막음 |

## 6. 재현 가능성 현황

- `pipeline.mjs`에는 `--dry-run`이 없다. `PIPELINE_OFFLINE=1`은 본문 추출만 끄고(`source-fetch.mjs:391`) RSS는 계속 가져오며, `LLM_PROVIDER=disabled` + `PIPELINE_USE_EXISTING_POOL=1`(`pipeline.mjs:204`)도 `src/data` JSON과 폴백 이미지를 쓴다.
- fixture 기반 `run-content-cycle.mjs --dry-run-json`은 별도(비라이브) 경로이고 `.cache/content-cycle`을 만든다.
- 네트워크 없는 결정적 replay는 `scripts/diagnose/funnel.mjs --replay`로 Phase 0에서 처음 구현했다(관련성 분류 drift 0 확인).

## 7. 기존 문서와의 차이

`docs/content-pipeline-map.md`(346줄)는 흐름을 잘 서술하지만 signal-card 임계값을 0.45로 적고 있고(코드 0.55, `relevance-classifier.mjs:2`), 런 원장 분기·abort 경로·관측 공백은 다루지 않는다. 이 문서가 Phase 1 설계의 기준이다.
