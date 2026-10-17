# 04 — 판정: H1 / H2 / H3

## 결론 (요약)

**세 가설 모두 참이며, 기여도 순위는 H1 > H2 > H3다. 다만 "지금 사이트에 새 글이 없는" 현재 outage는 100% H3+환경 문제다.**

| 순위 | 가설 | 판정 | confidence | 기여도 (zero-publish 결과에 대한 추정) |
|---|---|---|---|---|
| 1 | **H1 소스 풀 부족** — 수가 아니라 **구성**: 텍스트 권리 게이트가 생성 가능 풀을 공공·CC 피드 10~15개로 좁히고, 풀 상한 30이 그 안에서만 채워진다 | 지지 | **high** | ~45% |
| 2 | **H2 게이트 과도** — 관련성·추출·인사이트·반복·컬럼 플로어·최종 integrity의 7단 fail-closed 스택이 위 풀에 맞춰 튜닝되지 않았고, 단일 지점(relevance)에서 96%가 탈락 | 지지 | **high** | ~35% |
| 3 | **H3 코드 결함** — abort-before-write(원장 생존 편향), EIA 복원 게이트 불일치로 러너 정지, 10-04 하루 7개 fix PR이 기록한 스루풋 결함, 금칙어 `.length` 버그, slug 중복 | 부분 지지 | **medium-high** | ~20% (그러나 10-11 이후 outage의 직접 원인) |

기여도는 측정값(funnel)과 fix 이력에서 추론한 판단이며, 아래 "판정을 바꿀 증거"가 들어오면 갱신한다.

## H1 — 소스 풀 (high)

지지 증거 (측정):
- 풀은 **가득 차 있다**: 118런 `items_fetched` 평균 28.1 / 상한 30 (`02-funnel.md` §1). 즉 "RSS가 안 들어온다"는 가설은 기각.
- 그러나 풀의 distinct 소스는 평균 10.1개(최대 15)이고, 설정된 텍스트 피드 22~28개의 36~46% (하한 추정). 현재 풀 30건은 12개 소스, 전부 `archive_only`.
- 소스 구성: 82행 중 텍스트 권리 29(28 활성), 52행은 링크 전용. 권리가 있는 소스는 Federal Register·GAO·DOE·arXiv(abstract만)·Google Cloud 릴리스 노트·Epoch AI·Kubernetes 블로그 등 **공공·문서 피드**다. 상업 산업 매체(Data Center Frontier, TechCrunch, Bloomberg 등 42개)는 헤드라인 레이더로만 쓰인다 (`config/sourceRegistry.yml`, `scripts/lib/source-registry.mjs:159-180`).
- curated 75건의 소스 분포: arXiv 42 (abstract 캡 → 최대 signal card), DOE 7, GAO 4, Google Cloud 8, UK DESNZ 3, EC 3 … full_memo 0.
- 컬럼 후보 거절 누계의 1·2위가 `abstract_only` 562, `extraction_ineligible` 405 — 후보의 성격이 애초에 롱폼·컬럼 소재가 아니다.
- `sources_configured` 타임라인: 08-30 **1** → 09-03 8~9 → 09-10 22 → 10-05 28. 9월 "collapse"(`docs/daily-output-recovery-2026-10-04.md`)는 소스 수가 1→9일 때 시작됐다.

브리프 기준 적용: `items_new < 20` — 일평균 신규 curated 2건(est) → 충족. `sources_ok/configured < 70%` — 미측정이나 하한 추정 36~46%.

반대 증거: 소스 "수"는 늘었고(28) 풀 상한도 늘 채워진다. 따라서 H1의 정확한 서술은 "소스가 적다"가 아니라 **"권리 정책 + 상한 30이 만드는 풀이 제품 정의(AI 인프라 의사결정 정보)와 맞지 않는다"**이다.

## H2 — 게이트 (high)

지지 증거 (측정):
- funnel: scored 108 → relevance 통과 4 (**3.7%**, 기준 5% 미만) → quality/insight 통과 2 → repetition 통과 2 → **리더 상세 페이지 0** (118 커밋 전체). 탈락 사유 상위 2개 점유율 100%.
- 재분류 drift 0: 현재 분류기로 다시 돌려도 결과가 같다 → "일시적 버그"가 아니라 설계된 임계값(0.75/0.55, `scripts/lib/relevance-classifier.mjs:1-2`)과 입력의 불일치.
- 게이트가 통과시킨 2건도 최종 integrity·tier 정책을 거치며 리더 페이지가 되지 못했다(`public_content_tier`, `isPublicLongformArticle` 조건 10개, `scripts/lib/public-surface-eligibility.mjs:10-28`).
- 컬럼 레인: 120런 중 발행 4. 플로어(insight density 0.78→0.75, 사람다움 0.84, 섹션 4, 수치 claim ledger 100% 일치)가 10-04에만 3회 조정됐고, 조정 때마다 "직전 런이 그 플로어 때문에 0건"이었다(PR #40, #42).
- 10-11 하루 reader-copy 게이트 fix 26건: 게이트 규칙이 코드 전반에 분산돼 오탐 수정이 곧 코드 수정이 됐다(브리프 R5·R6 위반).

브리프 기준 적용: `items_scored ≥ 20 && passed_gate/items_scored < 5%` → **충족**. `qa_passed/drafts < 50%` → 100%로 미충족(표본 2건, 의미 없음).

반대 증거: 게이트 자체는 제품 정의(원문 전재 금지, 수치 근거, 저작권 안전)를 지키기 위한 것이고, 5월 긴급 정리(302/359 격리, `docs/emergency-cleanup-report.md`)가 보여주듯 게이트가 없을 때의 품질 문제는 실재했다. 따라서 처방은 "게이트 완화"가 아니라 **게이트를 측정 가능·설정 가능하게 재배치하고 입력 풀을 바꾸는 것**이다.

## H3 — 코드 결함 (medium-high)

지지 증거:
- **현재 outage**: 10-11 `93341dd`가 EIA 레코드에 수치를 넣으면서 빈 `claim_ledger`와 충돌 → 러너 4단계가 매 런 실패(10-12/13 5회) → 이어 Mac 로컬 git 손상(10-14~) → heartbeat 6일 stale, 이슈 #29. CI는 이 단계를 돌리지 않아 녹색이었다(PR #55).
- **abort-before-write** (`scripts/pipeline.mjs:445`): 완주 런만 원장에 남아 실패율을 잴 수 없다. 브리프 기준(예외 종료 런 > 20%)은 **측정 불가**이며, 이 불가 자체가 P7 위반.
- 10-04 하루 PR #37~#43: 슬롯 락, 일일 캡 오산, 아카이브 후보 누락, 드래프트 JSON 파싱, 어형 미집계, 헤드라인 혼입 — 각각 "직전 라이브 런 0건"의 코드 원인.
- 확정 결함 D2(금칙어 `.length`), D4(격리 목록 무시), D7(slug 중복 47/103), D8(데드코드), D9(발행이 `npm test`+`astro build`에 결합).

반대 증거: 완주 120런의 단계 카운트 정합성 불일치 0, 중복 발행 0, 게이트 단위 테스트 135/135 통과. 즉 "코드가 매번 터진다"는 아니고, **실패가 보이지 않게 설계된 것**이 문제다.

## 판정을 바꿀 증거

| 들어오면 | 영향 |
|---|---|
| Mac 잡 레코드에서 실패 런 비율 > 20% (10-06 이후) | H3 기여도 상향, 1위로 올라갈 수 있음 |
| Vercel 배포 실패 이력이 다수 | H3·P1 위반 가중 |
| 상업 매체 텍스트 권리 확보 후에도 relevance 통과율 < 10% | H2 상향, H1 하향 |
| `MAX_ITEMS_FETCHED` 상향·소스 균형 변경만으로 full_memo 후보가 런당 ≥ 1 | H1 확정, H2 하향 |

## 리빌드 설계에 넘기는 사실 (Phase 1 입력)

1. 풀 설계: 권리 tier와 생성 tier를 분리하고, 링크 전용 소스도 "요약·맥락화(원문 재서술)" 모드로 쓸 수 있는지 법적 판단을 Josh가 내려야 한다(브리프 Appendix A `news_brief`는 재서술 전제).
2. 게이트: hard/soft 분리(Appendix B), 1규칙 1파일, 모든 판정에 reason code, 임계값은 설정 파일 — 현재 코드는 셋 다 아니다.
3. 원장: 런 시작 시 레코드를 먼저 쓰고 단계마다 갱신(abort돼도 남게), 수집 카운터 포함.
4. 발행: 재빌드·테스트 성공과 분리(P1).
5. 보존: `05-preserve-list.md`.
