# 수익화 활성화 가이드 (Monetization Setup)

이 저장소는 **광고·분석 코드가 환경변수 기반으로 완전히 준비된 상태**입니다.
아래 값들을 Vercel에 넣고 재배포하는 순간 광고와 분석이 켜집니다. 값이 없으면
외부 요청이 전혀 발생하지 않고, 광고 자리에는 자체 홍보(하우스) 블록이 나옵니다.

## 1. 한눈에 보기

| 환경변수 | 예시 값 | 효과 |
| --- | --- | --- |
| `PUBLIC_ADSENSE_CLIENT` | `ca-pub-1234567890123456` | AdSense 로더 + `ads.txt` 자동 발행 + 광고 슬롯 활성화 |
| `PUBLIC_ADSENSE_SLOT_LEADERBOARD` | `1234567890` | 홈 히어로 아래 반응형 배너 |
| `PUBLIC_ADSENSE_SLOT_INFEED` | `2345678901` | 홈/아카이브 피드 중간 광고 (6번째·18번째 카드 뒤) |
| `PUBLIC_ADSENSE_SLOT_ARTICLE` | `3456789012` | 기사 본문 하단 in-article 광고 |
| `PUBLIC_ADSENSE_SLOT_BOX` | `4567890123` | 기사 페이지 최하단 박스 광고 |
| `PUBLIC_GA4_ID` | `G-XXXXXXXXXX` | Google Analytics 4 (Consent Mode v2 내장) |

설정 위치: **Vercel → Project → Settings → Environment Variables → Production**
저장 후 **Redeploy** 해야 빌드에 반영됩니다.

## 2. AdSense 신청 절차 (계정이 없는 경우)

1. [adsense.google.com](https://adsense.google.com)에서 계정 생성 → 사이트에 `https://www.computecurrent.com` 등록.
2. 심사 중 "사이트에 코드 붙여넣기" 단계가 나오면, 발급받은 `ca-pub-…` 값을
   `PUBLIC_ADSENSE_CLIENT`에 넣고 재배포하면 됩니다. (사이트 `<head>`에
   AdSense 스니펫과 `google-adsense-account` 메타태그가 자동 삽입됩니다.)
3. 심사에 유리한 조건은 이미 갖춰져 있습니다:
   - 독립 콘텐츠(8시간마다 자동 발행되는 분석 기사), 사이트 내 개인정보처리방침(`/privacy/`),
     이용약관(`/terms/`), 연락처(`/contact/`), 정책·방법론 페이지, sitemap/robots.
4. 승인 완료 후 AdSense → 광고 → **광고 단위별**에서 디스플레이 광고 단위 4개를 만들고
   각 슬롯 번호(숫자만)를 위의 `PUBLIC_ADSENSE_SLOT_*` 변수에 넣으세요.
5. `https://www.computecurrent.com/ads.txt` 접속 → `google.com, pub-…` 라인이 보이면 완료.
   (이 파일은 `PUBLIC_ADSENSE_CLIENT`에서 자동 생성됩니다.)

> 슬롯 변수를 비워두고 `PUBLIC_ADSENSE_CLIENT`만 설정한 경우: 수동 슬롯은 비어 있고,
> AdSense 콘솔에서 **자동 광고(Auto ads)** 를 켜면 Google이 알아서 배치합니다.
> 레이아웃 통제력은 수동 슬롯 방식이 더 좋습니다.

## 3. EU/영국 쿠키 동의 (필수 사항)

- 사이트에는 자체 동의 배너 + **Google Consent Mode v2**가 내장되어 있습니다.
  (EEA/UK/스위스는 기본 거부, 그 외 지역은 기본 허용, 사용자가 선택 가능)
- AdSense로 EEA/UK 트래픽에 광고를 내보내려면 Google 인증 CMP가 필요합니다.
  가장 쉬운 방법: **AdSense 콘솔 → 개인 정보 보호 및 메시지 → GDPR 메시지 만들기**를
  활성화하면 Google이 인증 CMP 역할을 대신합니다. (코드 수정 불필요)

## 4. GA4 연동

1. [analytics.google.com](https://analytics.google.com) → 계정/속성 생성 → 웹 스트림에
   `www.computecurrent.com` 등록.
2. 측정 ID(`G-XXXXXXXXXX`)를 `PUBLIC_GA4_ID`에 넣고 재배포.
3. Search Console 연결(속성 설정 → Search Console 링크)까지 하면 유입 키워드 분석 가능.

## 5. 트래픽 유입 체크리스트 (수익의 전제조건)

- [ ] **Google Search Console**에 사이트 등록 + `https://www.computecurrent.com/sitemap-index.xml` 제출
- [ ] **Bing Webmaster Tools** 등록 (Search Console 가져오기 지원)
- [ ] 기사 자동 발행이 계속 돌도록 GitHub Actions 시크릿(`OPENROUTER_API_KEY` 등) 유지
- [ ] RSS(`/rss.xml`)를 Feedly 등 애그리게이터에 등록
- [ ] 홈페이지 JSON-LD(Organization/WebSite)와 기사 구조화 데이터는 자동 출력됨

## 6. 예상 타임라인

| 단계 | 소요 |
| --- | --- |
| AdSense 신청 → 심사 | 보통 1~4주 (콘텐츠·정책 페이지가 갖춰져 있으면 단축) |
| Search Console 색인 반영 | 며칠~2주 |
| 의미 있는 광고 수익 | 일 방문 수백 명 이상부터 (이 사이트 니치는 CPC가 높은 편) |

## 7. 광고 외 수익 슬롯

- 기사 하단 박스 광고 자리는 AdSense 미설정 시 **스폰서십 문의(하우스 광고)** 로 렌더링됩니다
  (`briefings@computecurrent.com` 연결). 니치 특성상 직접 스폰서가 CPM보다 수익성이 높을 수 있습니다.
