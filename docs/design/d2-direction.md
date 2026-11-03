# D2 — 디자인 방향 시안 (홈·기사·목록)

- 작성: 2026-11-03, 사이트 디자인 세션
- 상태: `done` (D2 시안). **방향 승인은 Josh 게이트**
- 전제(Josh 승인 2026-11-03 "권고안대로 진행한다", `restore-feasibility.md` §8):
  1. C 하이브리드
  2. 숫자 보드 넣지 않음
  3. 시스템 폰트
  4. 다크 모드 유지
  5. 광고 자리 예약하지 않음
- 산출물:
  - 정적 목업: `docs/design/d2/{home,article,article-column,list}.html` + `d2.css`
  - 생성기: `_partials.py`. 헤더·푸터를 네 화면에 똑같이 넣기 위한 스크립트다.
  - 스크린샷: `docs/design/screenshots/d2/` 12장. 라이트는 데스크톱·모바일, 다크는 모바일만 찍었다. 모두 전체 페이지다.
- 시안은 `apps/site`에 연결되지 않는다. 사이트 코드·라우트·빌드에는 영향이 없다.

## 1. 시안 보는 법

- 레포를 받은 상태라면 `docs/design/d2/home.html`을 브라우저로 연다(파일 그대로). 이미지는 `apps/site/public/generated/articles/**`를 상대 경로로 읽는다.
- "시안 예시" 배지가 붙은 한국어 브리프 제목·요약은 레이아웃 확인용 더미다. 실제 기사가 아니며 사실을 담고 있지 않다. 레거시 칼럼·분석 제목과 이미지는 실제 이관 콘텐츠다.

## 2. 디자인 시스템

### 2.1 토큰(레거시 계승 + 정리)

| 토큰 | 라이트 | 다크 | 출처 |
|---|---|---|---|
| `--bg` | `#f5f5f7` | `#0b0b0d` | 레거시 계승 / 다크 신규 |
| `--surface` | `#ffffff` | `#161618` | 계승 |
| `--text` | `#1d1d1f` | `#f5f5f7` | 계승 |
| `--muted` | `#6e6e73`(대비 5.07:1) | `#a1a1a6` | 계승 |
| `--line` / `--line-strong` | `rgba(0,0,0,.08/.14)` | `rgba(255,255,255,.10/.18)` | 계승 |
| `--accent` | `#0066cc` | `#2997ff` | 계승 |
| `--radius` / `--radius-sm` | 18px / 12px | — | 계승 |
| `--shadow` / hover | `0 4px 22px rgba(0,0,0,.05)` / `0 14px 36px rgba(0,0,0,.1)` | 그림자 대신 테두리 | 계승 |
| `--wrap` / `--read` | 1180px / 680px | — | 신규 |
| `--gutter` | 16px(모바일) / 32px(≥768px) | — | 신규 |

### 2.2 카테고리 색

카테고리 색 9개는 `taxonomy.ts` 슬러그와 1:1로 대응한다. 점·띠·칩에만 쓰고 글자색으로는 쓰지 않는다(대비 문제).

| 슬러그 | 색상 |
|---|---|
| power-grid | `#ff9f0a` |
| data-centers | `#32ade6` |
| cloud-capacity | `#007aff` |
| semiconductors | `#af52de` |
| cooling | `#64d2ff` |
| capital-markets | `#34c759` |
| regulation | `#ff375f` |
| supply-chain | `#a2845e` |
| ai-infrastructure | `#5e5ce6` |

### 2.3 타이포(한국어 우선, 시스템 폰트)

- 스택: `-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. 외부 폰트·CDN은 쓰지 않는다.
- `word-break: keep-all` + `overflow-wrap: anywhere`. 어절 단위로 줄바꿈하고, 긴 URL·영문은 넘치지 않게 한다.

| 요소 | 크기 | 행간 |
|---|---|---|
| 기사 제목 | `clamp(28px, 4.2vw, 42px)` | 1.25 |
| 히어로 제목 | `clamp(26px, 3.4vw, 40px)` | 1.22 |
| 덱 | 19px | 1.6 |
| 본문 | 17px | 1.8 |
| 섹션 제목 h2 | 21px | — |
| 카드·행 제목 | 18~19px | 1.4 |
| 메타 | 13px | — |

### 2.4 컴포넌트 패턴

- 헤더: sticky + 반투명 블러. 1단 내비 8개(최신·The Current·전력·계통·데이터센터·반도체·자본시장·한국·소개)는 **모두 현재 200 라우트**다. 모바일에서는 가로 스크롤하고 오른쪽 끝을 흐리게 처리해 스크롤 힌트를 준다.
- 메타 줄: 카테고리 점+라벨 · 콘텐츠 라벨(브리프·분석·The Current) · 시간.
- 카드 2종:
  - **이미지 카드**: `image.placeholder = false`일 때.
  - **텍스트 카드**: 플레이스홀더일 때. 이미지 대신 상단 4px 카테고리 색 띠 + 3줄 요약을 쓴다.
- 브리프 리스트: 흰 패널 안의 헤어라인 행. 첫 행만 제목 22px로 키운다.
- 칩: `/category/{slug}/` 링크다. JS 필터가 아니어서 내부 링크·SEO에 도움이 된다. 현재 위치는 반전 색으로 표시한다.
- 기사 블록:
  - 요약 박스: 카테고리 색 왼쪽 띠.
  - Expert Lens: 액센트 배경 블록으로 사실 요약과 해석을 분리한다.
  - 출처: 카드형 링크 목록.
  - AI 고지: 회색 블록. 모든 기사에 고정한다.
- 접근성:
  - 건너뛰기 링크, `:focus-visible` 2px 아웃라인, 랜드마크(`header/nav/main/aside/footer`), `aria-current`.
  - 색 외에 텍스트 라벨을 병기한다.
  - 장식 이미지는 `alt=""`로 둔다. 실제 사이트에서는 `image.alt`를 쓴다.

## 3. 화면별 구성과 데이터 매핑

모든 모듈은 `publications` 필드만으로 그린다. 새 데이터 소스나 파이프라인 변경은 없다.

### 3.1 홈 (`/`)

| 순서 | 모듈 | 데이터 |
|---|---|---|
| 1 | 히어로(에세이/칼럼) | 최신 `content_type = insight_essay` 또는 `slug` `column/*` 1건 → `image`(실제 이미지일 때만, 아니면 텍스트 히어로), `body.deck → thesis_ko → summary_ko`, 바이라인 `AUTHOR` |
| 2 | 최신 브리프 5~6행 | `content_type = news_brief` 최신순 → `category`/`tags`(taxonomy 매칭으로 카테고리 키), `published_at`(상대 시간), `body.summary_ko` 첫 문단 |
| 3 | 사이드: The Current 최근 3 | `column/*`·`insight_essay`에서 히어로 제외 |
| 4 | 사이드: 주제별 보기 칩 9 | `taxonomy.ts` 카테고리(정적) |
| 5 | The Current 카드 3 | 칼럼 이미지 카드 |
| 6 | 더 읽을거리 카드 3~6 | 나머지 최신 글. 이미지/텍스트 카드 자동 선택 |
| 7 | 아카이브·RSS CTA | 정적 |

데이터가 적을 때(빈 DB 포함)는 해당 섹션을 숨긴다. 전부 비면 지금과 같은 빈 상태 문구 하나만 남긴다(`build-empty` 테스트 유지).

### 3.2 기사 (`/news/{id}/`, `/column/{slug}/`)

순서는 다음과 같다.

1. 브레드크럼(홈 / 카테고리 또는 The Current)
2. 제목
3. 덱(칼럼)
4. 메타
5. 바이라인(브리프는 Compute Current + 출처 수, 칼럼·에세이는 Josh → `/author/josh-inn/`)
6. 히어로 이미지: **`placeholder = false`일 때만** 표시하고 캡션 "대표 이미지"를 단다. 플레이스홀더를 생성 이미지로 표현하지 않는다(AGENTS.md).
7. 요약 박스
8. `bodySections` 순서대로 본문(Expert Lens는 강조 블록)
9. 출처 카드
10. AI 고지
11. 관련 글 3: 같은 카테고리, 자기 자신 제외

### 3.3 목록 (`/archive/`, `/archive/{n}/`, `/column/`, `/category|region|company/{slug}/`, `/author/josh-inn/`)

순서는 다음과 같다.

1. 페이지 머리: 키커 + 제목 + 설명. 설명은 taxonomy 라벨에서 쓰고, 문구 추가는 D3에서 Josh 검토를 받는다.
2. 카테고리 칩(카테고리 페이지만)
3. 행 리스트: 실제 이미지가 있으면 오른쪽 200px 썸네일, 없으면 텍스트 행
4. 페이저: 번호형. `archivePath` 그대로 써서 URL은 변하지 않는다.
5. 빈 목록: 200 + noindex를 유지하고 빈 상태 문구를 카드 안에 넣는다.

## 4. 바뀌지 않는 것(불변 조건)

- 라우트·리다이렉트·`middleware.ts` 보안 헤더 4개·canonical·robots meta·RSS·sitemap·`ads.txt`·`/healthz`
- 136/136 기대값(`url-plan.ts`)
- `.astro`는 확장자 없는 상대 import만 쓰고, `@cc/shared`는 `src/lib/*.ts` 경유로만 쓴다(CLAUDE.md §7)
- 패키지 추가 없음, 외부 요청 없음(폰트·분석·광고), JS 번들 0(현재와 동일)
- AI 고지·정책 8쪽

## 5. D3 구현 계획

### 5.1 파일 목록

20개를 넘으므로 사전에 제시한다. 예상 22~24파일이다.

| 구분 | 파일 | 변경 |
|---|---|---|
| 스타일 | `apps/site/src/styles/site.css` | 신규(시안 `d2.css`를 정리해 이전) |
| 레이아웃 | `apps/site/src/layouts/Base.astro` | 수정(인라인 CSS 제거 → `site.css` import, 헤더·푸터 컴포넌트화, OG 메타 추가 옵션) |
| 컴포넌트 | `SiteHeader`, `SiteFooter`, `Hero`, `BriefList`, `Card`, `CardGrid`, `CategoryChips`, `RowList` | 신규 8 |
| 컴포넌트 | `Article`, `Pager`, `PublicationList` | 수정 3(`PublicationList`는 `RowList`로 위임) |
| 표시 헬퍼 | `apps/site/src/lib/view.ts` + `apps/site/test/view.test.ts` | 신규 2(요약 추출, 카테고리 키, 이미지 유무, 관련 글, 상대 시간 — 순수 함수) |
| 페이지 | `index`, `archive/index`, `archive/[page]`, `column/index`, `column/[slug]`, `news/[id]`, `category/[slug]`, `region/[slug]`, `company/[slug]`, `author/[slug]` | 수정 10(마크업만, 데이터 로딩·응답 코드 로직은 유지) |
| 정책·404 | `[page].astro`, `404.astro` | 수정 0~2(레이아웃 상속으로 자동 적용, 필요 시 클래스만) |

### 5.2 PR 분할

| | 1안(권고) — PR 1개 | 2안 — PR 2개 |
|---|---|---|
| 구성 | 커밋을 ① 토큰·레이아웃·컴포넌트 ② 페이지 적용 ③ 테스트·스크린샷으로 나눈 단일 draft PR | ① 기반(스타일·레이아웃·컴포넌트, 페이지는 그대로) ② 페이지 적용 |
| 장점 | 프리뷰에서 전 화면을 한 번에 검토. 136/136을 1회 검증 | 각 PR이 작음 |
| 단점 | diff가 큼 | ① 단독 머지 시 홈만 반쯤 바뀐 상태가 프로덕션에 노출될 수 있음 |

### 5.3 검증

1. `npm run v2:typecheck`·`v2:test`·`v2:build`
2. 로컬 `astro dev`(legacy_json)에서 `node apps/site/tools/verify-urls.ts` 136/136
3. Playwright before/after(데스크톱·모바일, 라이트·다크)
4. Lighthouse(모바일, Performance·Accessibility·Best Practices·SEO)
5. PR CI `rebuild-ci.yml` green
6. Vercel 프리뷰 2개(`ai-news-portal`, `computecurrent-v2-preview`) 링크를 PR 본문에 넣는다

## 6. Josh 결정 항목(D2 게이트)

1. **방향 승인**: 이 시안(홈·기사·목록)으로 D3를 착수할지. 수정 요청이 있으면 시안을 고쳐 다시 올린다.
2. **헤더 내비 구성**: 시안은 최신·The Current·전력·계통·데이터센터·반도체·자본시장·한국·소개 8개다. 현재 사이트는 아카이브·The Current·전력·계통·데이터센터·한국·소개 6개다. 바꿀 항목이 있는지.
3. **PR 분할**: 1안(단일 PR, 권고) / 2안
4. **20개 초과 편집 승인**: §5.1 목록(약 22~24파일)
5. **카테고리 설명 문구**: 목록 머리 설명을 D3에서 초안으로 넣고 PR 리뷰에서 검토받는 방식으로 괜찮은지

## 7. 리스크

| 항목 | 대응 |
|---|---|
| 프로덕션 브리프 13건의 실제 `category`/`tags` 분포를 세션에서 볼 수 없다(DB 비접속) | 카테고리 키는 `taxonomy.ts` 매칭 결과만 쓰고, 매칭 실패 시 카테고리 점 없이 콘텐츠 라벨(브리프)만 표시한다(추측으로 카테고리를 붙이지 않음). 프리뷰(`ai-news-portal`은 프로덕션 DB 읽음)로 확인 |
| 영어 레거시 칼럼 제목이 히어로에서 길게 줄바꿈 | `clamp` 상한 40px, 데스크톱 2단 비율 1 : 1.1. 시안에서 5줄 확인 → 허용 범위로 판단, 필요 시 상한 36px |
| 3e `insight_essay` 본문 키 미확정 | 덱 폴백 `deck → thesis_ko → summary_ko`, 확정 후 `view.ts` 한 곳만 수정 |
| CSS가 인라인 1.8 KB에서 약 16 KB(시안 `d2.css` 16,506 B, 압축 전)로 증가 | 외부 CSS 1파일(캐시됨). Lighthouse로 확인 |
