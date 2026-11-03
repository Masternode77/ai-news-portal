# D1 — 레거시 디자인 복구 타당성 조사

- 작성: 2026-11-03, 사이트 디자인 세션(코드 변경 없음)
- 상태: `done` (D1). D2(시안·방향 승인)는 Josh 게이트
- 범위: `apps/site`의 화면 디자인. 파이프라인·`@cc/shared` 계약·`publications` 스키마·`config/*.yaml`·워크플로는 건드리지 않는다.

## 0. 결론 요약

레거시 화면을 **그대로 되살리는 것(A)은 권하지 않는다.** CSS 6,598줄이 네 세대의 테마(다크 코퍼 → 다크 리디자인 → Apple 라이트 → 마지막 오버라이드 레이어)를 겹쳐 쌓은 구조이고, 홈 모듈 10개 중 4개는 지금 존재하지 않는 데이터(와이어 헤드라인·편집 사이클·하트비트)에 묶여 있다. 레거시 내비 링크 상당수도 이제 301 리다이렉트 경로다.

**권고안은 C(하이브리드)다.** 레거시에서 검증된 디자인 언어(Apple 계열 토큰, 시스템 폰트, 18px 라운드 카드, 헤어라인 구분선, 카테고리 색)를 추출한다. 그 언어로 `publications`에서 실제로 파생할 수 있는 모듈만 새로 쓴다. 범위는 한국어 우선 타이포, 에세이/컬럼 히어로, 카드 피드, 기사 템플릿이다. 예상 공수는 D3 기준 약 1.5~2.5 세션이고, URL·SEO 표면은 바꾸지 않는다.

## 1. 조사 방법

| 대상 | 방법 | 결과 |
|---|---|---|
| 레거시 | `git worktree add ../legacy-ref legacy-final`(`ebd7f6a1`) → `npm ci` → `astro build`(86페이지, 4m30s) → `dist/` 정적 서빙 | `astro dev`는 30초 안에 뜨지 않아 정적 빌드로 대체 |
| 현재 | `apps/site`에서 `SITE_DATA_SOURCE=legacy_json astro dev`(CI 136/136과 같은 데이터) | 정상 |
| 스크린샷 | Playwright Chromium, 데스크톱 1440×900·모바일 390×844, 첫 화면 JPEG → `docs/design/screenshots/d1/` 16장 | 전체 페이지 PNG는 22 MB라 커밋하지 않음(세션 스크래치패드) |
| 리디자인 브랜치 | `origin/claude/computecurrent-redesign-monetize-wvecig`와 `legacy-final` 비교 | §2.4 |

데이터는 두 화면 모두 레거시 이관분 12건(news 5 · column 7)이다. 프로덕션에 있는 cron `news_brief` 13건(한국어, 플레이스홀더 이미지)은 fixture에 없다. 그래서 현재 화면 스크린샷은 실서비스보다 이미지가 많아 보인다. 실서비스 홈은 대부분 플레이스홀더 브리프라는 점이 D2 시안의 핵심 제약이다(§4.3).

## 2. 레거시 디자인 인벤토리

### 2.1 CSS 구조 — 네 세대가 겹친 스택

`src/layouts/Layout.astro`가 import 순서대로 적용한다. 홈은 `products.css`를 추가로 import한다.

| 파일 | 줄 | 루트 토큰 | 성격 |
|---|---:|---:|---|
| `global.css` | 3,452 | 14 (+다크 블록) | 기반. 라이트 `--bg #f5f5f7`과 다크 코퍼 블록(`--bg #05070b`, `--accent #cda258`)이 공존 |
| `redesign.css` | 468 | 9 | 다크 "cc" 팔레트(`--cc-accent #d7aa5f`, `--cc-signal #7fd6c2`) |
| `public-intelligence.css` | 459 | 11 | 다크 "public" 팔레트(코퍼 `#e2a34d`, 틸 `#64e0c7`, 레드 `#ff624d`) |
| `terminal.css` | 2,219 | 20 | **마지막에 로드되는 Apple 라이트 레이어**. 위 세 레이어의 변수를 `--al-*`로 다시 덮어쓴다 |
| `products.css`·`discovery.css` | 20 | 0 | 소량 |
| **합계** | **6,598** | | `!important` 0, `@media` 15 |

실제로 화면에 보이는 것은 마지막 레이어(`terminal.css`, 주석 "Apple-inspired light design layer … refines the base layers without rewriting them")다. 나머지 4,400줄 상당은 덮어쓰기 대상이거나 사라진 컴포넌트용 규칙이다. 그대로 가져오면 죽은 규칙과 서로 다투는 변수 체계까지 함께 들어온다.

### 2.2 유효 디자인 토큰(최종 렌더 기준)

| 범주 | 값 | 비고 |
|---|---|---|
| 배경 | `#ffffff`(카드) / `#f5f5f7`(페이지·소프트) | |
| 텍스트 | `#1d1d1f` / muted `#6e6e73` | muted 대비 5.07:1(흰 배경)·4.66:1(`#f5f5f7`) — 둘 다 AA 통과 |
| 액센트 | `#0066cc`(링크) / `#0071e3`(버튼) / `#34c759`(라이브 점) | |
| 구분선 | `rgba(0,0,0,.08)` / 강 `.14` | |
| 그림자 | `0 4px 22px rgba(0,0,0,.05)` / hover `0 14px 36px rgba(0,0,0,.1)` | |
| 라운드 | 18px(카드), pill 999px(버튼·칩) | |
| 폰트 | `-apple-system, BlinkMacSystemFont, "SF Pro Display/Text", "Helvetica Neue", Arial` | **한글 폰트 지정 없음** → Windows·Android에서 한글이 맑은 고딕·기본 산세리프로 떨어진다 |
| 타입 스케일 | 히어로 `clamp(3.2rem, 6.4vw, 5.9rem)`, 리드 `clamp(1.12rem,1.8vw,1.35rem)`, 카드 제목 `clamp(1.15rem,1.8vw,1.4rem)`, 키커 0.72~0.78rem 대문자 자간 | 영문 기준. 한국어 제목에 그대로 쓰면 줄당 글자 수가 과도하다 |
| 그리드 | 히어로 `minmax(0,1.06fr) minmax(360px,.94fr)`, 카드 3열 | |
| 카테고리 색 | power `#ff9f0a`, datacenter `#32ade6`, cloud `#007aff`, silicon `#af52de`, cooling `#64d2ff` … (`[data-cat]`) | Apple 시스템 팔레트 |

### 2.3 컴포넌트·레이아웃

- 레이아웃 2개(`Layout`, `ProductLayout`), 컴포넌트 41개(`home/ColumnHero·PulseBoard·TickerTape`, `monetize/AdSlot` 포함).
- 홈 순서: 상단 상태 바(업데이트 주기·파이프라인 상태) → ProductNav(1차 10링크 + 2차 7링크) → ColumnHero → TickerTape(WIRE) → 비주얼 리드 + "On the desk" → PulseBoard("The desk in numbers" 4지표 + 커버리지 믹스 바) → FeaturedArticle → Infrastructure analysis 목록 → Latest Analysis(카테고리 필터 칩 + 3열 이미지 카드) → 팔로우 CTA → 섹션 그리드 → SiteFooter(4열).
- 기사: 브레드크럼 → 카테고리 칩·날짜·출처 → 초대형 제목(약 5.4rem) → 덱 → 바이라인 → 히어로 이미지 → 본문 → 출처·고지.

### 2.4 리디자인 브랜치 `claude/computecurrent-redesign-monetize-wvecig`

마지막 커밋은 2026-10-04이다. `legacy-final`과 디자인 파일을 비교하면 17파일, +35/−444줄이다. 이 브랜치는 `legacy-final`보다 **오래된 하위 집합**이다(`PublicationExplorer`·`AnalyticsConsent` 등이 없음). 별도의 새 디자인은 없으므로 참고 가치가 없다.

### 2.5 레거시 화면에서 확인한 문제(복구하면 같이 돌아오는 것)

1. **운영 언어 노출**: 홈 첫 줄이 "PIPELINE UPDATE OVERDUE SINCE OCT 11, 2026"이다. 2026-05-23 보고서가 제거 대상으로 지목한 바로 그 유형이다.
2. **회색 빈 카드**: Latest Analysis 카드 다수가 이미지 영역이 빈 회색 박스다(데스크톱 전체 화면 기준 3열 × 6행 중 대부분).
3. **모바일 과밀**: 홈 높이가 16,539px이다. 첫 화면에 상태 바·내비 2단이 들어가 콘텐츠가 첫 화면 아래로 밀린다(`legacy-home-mobile.jpg`).
4. **죽은 내비**: Radar·Search·Data desk·Regional hubs·Entities·Glossary·Weekly digest·Follow는 지금 전부 301 → 다른 페이지다(`phase5-cutover.md` §3).
5. 언어: 레거시 UI는 영어(`lang="en"`)다. 현재 사이트와 새 콘텐츠는 한국어(`lang="ko"`)다.

## 3. 현재 사이트 인벤토리

- `Base.astro` 143줄(인라인 CSS 약 90줄, 토큰 4개 + 다크 모드), 컴포넌트 3개(`Article` 48줄·`Pager` 22줄·`PublicationList` 32줄), 페이지 17개.
- 화면: 760px 단일 칼럼, 밑줄 링크 목록, 이미지·요약·카테고리 표시가 없다(`current-home-*.jpg`). 기사 페이지는 이미지와 본문 섹션은 있으나 타이포 위계가 약하다.
- 이미 있는 자산: `listing.ts`(`contentLabel`·`isColumn`·`paginate`), `taxonomy.ts`(카테고리 9·지역 7·회사 16, 한국어 라벨 `labelKo`), `render.ts`(`bodySections`: deck·thesis·summary·why_it_matters·expert_lens·counterpoint·implications), `author.ts`.
- 테스트는 HTML 구조(클래스명·마크업)를 검사하지 않는다(`apps/site/test/*.ts` grep 결과). 디자인 교체가 단위 테스트를 깨뜨릴 위험은 낮다. 136 URL 대조는 상태 코드·리다이렉트만 본다.

## 4. 모듈별 데이터 가용성

판정: **가능** = 정적이거나 지금 바로 구현 가능 / **파생** = `publications` 필드로 계산 가능 / **없음** = 현재 사이트가 읽을 수 없는 데이터(ADR-005: 사이트는 `publications`만 읽는다)

### 4.1 홈

| 레거시 모듈 | 원래 데이터 | 판정 | 대체 방안 |
|---|---|---|---|
| 상단 상태 바(업데이트 주기·파이프라인 상태) | `editorial-cycles.json`·`pipeline-heartbeat.json` | **없음** | 제거. `pipeline_runs`는 사이트 범위 밖이고 운영 언어 노출 문제도 있다. 필요하면 "최근 발행 {날짜}" 한 줄만 둔다(파생: `max(published_at)`) |
| ProductNav | 정적 + 사라진 라우트 | 가능(축소) | 살아 있는 라우트만: The Current·아카이브·카테고리 4~5개·한국·소개. 2단 내비는 쓰지 않는다 |
| ColumnHero | `authored-columns.json` | **파생** | `slug` `column/*` 또는 `content_type = insight_essay` 중 최신 1건. 이미지(컬럼 7건 모두 있음, 에세이는 필수), `body.deck`/`thesis_ko`, 바이라인 `AUTHOR` |
| TickerTape(WIRE) | `industry-headlines.json`(외부 와이어) | **없음** | 제거. 최신 브리프 제목으로 흉내 내면 피드와 중복되고 "와이어"라는 의미가 거짓이 된다 |
| 비주얼 리드 + On the desk | homepage feed builder | **파생** | 최신 `news_brief` 1건 리드 + 다음 3~4건. 단 `image.placeholder = true`면 이미지 대신 텍스트 리드(§4.3) |
| PulseBoard(이번 주 발행·누적·출처 수·지역 수·커버리지 믹스) | 카탈로그 집계 | **파생** | 전부 `published_at`·`sources[].name`·`region`·`category`/`tags`로 계산 가능. 단 지금은 25건이라 숫자가 작다 → D2에서 Josh 판단(선택 모듈) |
| FeaturedArticle | feed | **파생** | ColumnHero·리드와 겹치므로 통합 |
| Infrastructure analysis 목록 | catalog(`Analysis`) | **파생** | `content_type = legacy_analysis` 5건. 별도 섹션 대신 피드에 합침 |
| AdSlot(leaderboard) | AdSense 로더 | **승인 필요** | 외부 서비스 = 사전 승인 항목. 자리만 예약할지 D2에서 결정. 기본은 넣지 않음(빈 광고 박스 금지) |
| Latest Analysis + 카테고리 필터 칩 | feed + 클라이언트 JS | **파생** | 카드 피드(이미지·라벨·요약·날짜). 필터는 JS 없이 `/category/{slug}/` 링크 칩으로 대체(라우트가 이미 있음, SEO 유리) |
| IndustryRadar | `industry-headlines.json` | **없음** | 제거(`/radar/`는 이미 301 → `/`) |
| 팔로우 CTA / 섹션 그리드 | 정적 | 가능 | RSS·카테고리 진입 블록으로 축소 |
| SiteFooter | 정적 | 가능 | 정책 8쪽 + RSS(한/영) + AI 고지 유지 |

### 4.2 기사·목록

| 모듈 | 판정 | 근거 필드 |
|---|---|---|
| 브레드크럼·카테고리 칩·날짜·라벨 | 파생 | `category`·`tags`(taxonomy 매칭)·`published_at`·`contentLabel` |
| 덱 / 요약 박스(At a glance) | 파생 | `body.deck`·`summary_ko`·`thesis_ko` |
| 히어로 이미지 | 파생 | `image.path`·`alt`·`placeholder` |
| 본문 섹션(왜 중요한가·Expert Lens·반론·시사점) | 가능 | `bodySections` 그대로, 시각적 위계만 추가 |
| 바이라인 | 파생 | 컬럼·에세이 → `AUTHOR`, 브리프 → `publisher` |
| 출처 블록 | 파생 | `sources[]`(이름·URL·날짜) |
| 관련 글 | 파생 | 같은 `category`/`tags` 최신 3건(목록은 이미 페이지가 읽음) |
| Evidence box·Watch metrics·Claim verification·Correction note | **없음** | 레거시 전용 필드. 제거 |
| AI 고지 푸터 | 가능 | 정적. 유지 필수 |
| OG 이미지 메타 | 파생 | `image.path`(SEO 개선. meta 추가뿐이라 URL 영향 없음) |
| 목록 카드(아카이브·카테고리·지역·회사·컬럼) | 파생 | 홈 카드 컴포넌트 재사용 |
| 검색 | **없음** | `/search/`는 301 → `/archive/`. 범위 밖 |

### 4.3 이미지 현실(디자인 제약)

- 브리프는 전부 정적 플레이스홀더 `/images/placeholder-brief.svg`(provenance `static`)다. 플레이스홀더 이미지로 카드 그리드를 채우면 레거시의 회색 카드 문제가 그대로 재현된다.
- 따라서 카드는 **이미지가 있으면 이미지 카드, `placeholder = true`면 텍스트 카드**(카테고리 색 띠 + 라벨 + 제목 + 요약)로 갈라야 한다. 플레이스홀더를 "생성 이미지"로 표시하지 않는다는 AGENTS.md 규칙과도 맞는다.
- 실제 이미지는 레거시 12건(`/generated/articles/**`)과 향후 `insight_essay`(이미지 필수)뿐이다. 그래서 이미지가 들어가는 자리는 히어로(에세이/컬럼)에 집중시킨다.

## 5. 옵션 비교

| | A. 레거시 디자인 언어로 재작성 복구 | B. 완전 신규 디자인 | C. 하이브리드(권고) |
|---|---|---|---|
| 내용 | 레거시 홈·기사 구조를 모듈 단위로 재현, CSS는 새로 작성(P9) | 새 브랜드 언어·레이아웃 | 레거시 토큰·카드·히어로 패턴을 계승하고, 레이아웃은 데이터 현실(25건·플레이스홀더·한국어)에 맞춰 새로 설계 |
| 재현 가능 범위 | 홈 모듈 10개 중 6개(4개 데이터 없음) → 빈자리 발생 | 100%(애초에 가용 데이터 기준) | 100% |
| 공수(D3) | 3~4 세션: 41개 컴포넌트 판별 + 모듈 재작성 + 빈 모듈 처리 | 2~3 세션 + 브랜드 탐색 1회(D2 반복 위험) | 1.5~2.5 세션 |
| 리스크 | 높음: 회색 카드·과밀 모바일·영문 타이포를 그대로 재현. CSS를 대량 이식하고 싶어지는 압력(P9 위반 위험) | 중간: 브랜드 연속성 상실, 재방문 독자 혼란, 방향 합의에 시간 | 낮음: 익숙한 룩 유지, 데이터에 없는 모듈은 처음부터 설계에서 빠짐 |
| SEO 영향 | URL 변화 없음. 레거시에 있던 클라이언트 필터 JS를 넣으면 LCP 악화 | URL 변화 없음 | URL 변화 없음. 카테고리 칩 = 내부 링크 강화, OG 이미지·`article:published_time` 메타 추가 가능, CSS 약 10~20 KB(현재 인라인 1.8 KB) |
| 한국어 타이포 | 별도 작업 필요 | 설계에 포함 | 설계에 포함 |
| 성능 | 레거시 빌드 CSS 약 100 KB(`dist/_astro/*.css` 102,686 B) 수준 재현 위험 | 양호 | 양호(JS 0, 시스템 폰트) |

공통 불변: 라우트·리다이렉트·`middleware.ts` 보안 헤더 4개·canonical·robots·RSS·sitemap·136/136. 디자인은 `Base.astro`·컴포넌트·페이지 마크업만 바꾸고 `src/lib/*` 로직은 표시용 헬퍼를 추가하는 정도로 제한한다.

## 6. 권고안 — C(하이브리드)

### 6.1 디자인 원칙

1. **레거시에서 계승**: 라이트 캔버스 `#f5f5f7` + 흰 카드, 텍스트 `#1d1d1f`/`#6e6e73`, 액센트 `#0066cc`, 18px 라운드, 헤어라인, 카테고리 색(9개 카테고리로 재정의), pill 칩·버튼.
2. **새로 설계**:
   - 한국어 타이포: 폰트 스택에 `"Apple SD Gothic Neo", "Pretendard"(설치된 경우만), "Noto Sans KR", "Malgun Gothic"`을 추가한다. `word-break: keep-all`을 쓴다. 제목 최대 2.4rem(데스크톱)·1.6rem(모바일), 본문 17px/1.75, 본문 폭 68ch.
   - 데이터 현실에 맞는 레이아웃: 히어로 1(에세이/컬럼) + 최신 브리프 리스트 + 카드 그리드.
   - 텍스트 카드: 플레이스홀더면 이미지를 쓰지 않는다.
   - 다크 모드: 현재 사이트에도 있으므로 유지한다. 토큰 기반이라 추가 비용이 작다.
3. **하지 않는 것**: 티커·레이더·상태 바·광고 슬롯·분석 스크립트·외부 폰트 CDN·클라이언트 필터 JS.

### 6.2 화면 구성(D2 시안 대상)

- **홈**
  - 헤더(로고 + 1단 내비 6~7개, 모바일은 가로 스크롤 칩)
  - 히어로: 최신 에세이/컬럼(이미지 + 덱 + Josh 바이라인)
  - "오늘의 브리프": 최신 `news_brief` 5~6건 텍스트 리스트(라벨·카테고리 색·시각)
  - 카테고리 칩 → `/category/*`
  - "The Current" 컬럼 카드 3
  - 아카이브 CTA
  - 선택: 숫자 보드(이번 주 발행·출처 수)
  - 푸터
- **기사**: 카테고리 칩·라벨·날짜 → 제목 → 덱 → 바이라인 → 히어로(실제 이미지일 때만) → 요약 박스 → 본문 섹션 → 출처 카드 → AI 고지 → 관련 글 3.
- **목록(아카이브·카테고리·지역·회사·컬럼)**: 페이지 제목 + 설명 → 카드 리스트(이미지/텍스트 겸용) → 페이저.

### 6.3 예상 변경 범위(D3, 계획)

| 구분 | 파일 | 수 |
|---|---|---:|
| 레이아웃·토큰 | `src/layouts/Base.astro`(CSS를 `src/styles/site.css` 1개로 분리) | 2 |
| 컴포넌트(신규·수정) | `SiteHeader`·`SiteFooter`·`Hero`·`BriefList`·`Card`·`CardGrid`·`CategoryChips`·`Article`(수정)·`Pager`(수정)·`PublicationList`(수정)·`RelatedList` | ~11 |
| 페이지 | `index`, `archive/*` 2, `column/*` 2, `news/[id]`, `category`·`region`·`company`·`author` | ~10 |
| 헬퍼 | `src/lib/listing.ts` 또는 신규 `src/lib/view.ts`(요약 추출·카테고리 키·관련 글) + 테스트 | 2 |

합계는 약 25파일이다. CLAUDE.md §5에 따라 20개를 넘으므로 D3 착수 전에 파일 목록을 다시 제시하고, PR을 2개로 나누는 안(① 토큰·레이아웃·컴포넌트 ② 페이지 적용)도 함께 올린다.

## 7. 리스크·오픈 이슈

| # | 항목 | 영향 | 대응 |
|---|---|---|---|
| R1 | fixture에 한국어 `news_brief`가 없다(레거시 12건뿐) | 시안·스크린샷이 실서비스를 대표하지 못함 | D2 시안에 `fixtures/llm/news_brief` 형태의 한국어 샘플을 **"시안용 예시"로 표시**해 쓰거나, 프로덕션 프리뷰(Vercel)로 검토 |
| R2 | 플레이스홀더 비중이 높다(현재 25건 중 13건) | 이미지 중심 그리드가 비어 보임 | 텍스트 카드 설계(§4.3) |
| R3 | 3e `insight_essay` 본문 키가 아직 확정되지 않았다 | 히어로 덱 추출 필드 미정 | `deck → thesis_ko → summary_ko` 폴백. 3e 창 확정 후 맞춤 |
| R4 | 시스템 폰트만 쓰면 Windows 한글 품질이 떨어진다 | 타이포 품질 | Pretendard 셀프 호스팅(woff2 서브셋 약 300~700 KB, OFL)은 **레포 자산 추가 = Josh 결정 항목**. 기본은 시스템 폰트 |
| R5 | 광고 자리 | 수익화 | AdSense 로더는 외부 서비스 승인 항목. 디자인에서는 자리 예약 여부만 결정 |
| R6 | `main` 머지 = 프로덕션 배포 | 서비스 영향 | draft PR + Vercel 프리뷰 2개 + 136/136 + Playwright before/after |

## 8. D2에서 Josh가 결정할 것

1. 방향: **C 하이브리드**(권고) / A / B
2. 숫자 보드(PulseBoard 파생판)를 홈에 넣을지: 넣지 않음(권고, 25건 규모에서는 작은 숫자가 역효과) / 넣음
3. 폰트: 시스템 폰트(권고, 승인 불필요) / Pretendard 셀프 호스팅(레포 자산 추가)
4. 다크 모드 유지 여부: 유지(권고, 토큰으로 처리)
5. 광고 자리 예약: 예약하지 않음(권고)

## 부록 A. 스크린샷

`docs/design/screenshots/d1/{legacy|current}-{home|news|column|archive}-{desktop|mobile}.jpg`(첫 화면, 16장)

| 화면 | 레거시 전체 높이(px) 데스크톱/모바일 | 현재 전체 높이 데스크톱/모바일 |
|---|---|---|
| 홈 | 8,077 / 16,539 | 900 / 1,355 |
| 기사(news) | 6,077 / 9,828 | 3,873 / 6,043 |
| 컬럼 | 5,922 / 9,289 | 4,250 / 6,805 |
| 아카이브 | 4,161 / 10,406 | 900 / 1,355 |

참고: 현재 화면 하단 중앙의 검은 막대는 `astro dev` 툴바이고 프로덕션에는 없다.
