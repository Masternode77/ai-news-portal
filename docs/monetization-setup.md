# 수익화 활성화 가이드 (Monetization Setup)

이 저장소는 광고·분석 설정과 실제 활성화를 분리합니다. 유효한 ID를 넣는 것은
&ldquo;configured&rdquo; 상태일 뿐이며, Google 태그와 수동 광고 슬롯은 인증된 Google CMP
메시지가 배포·테스트된 뒤에만 활성화할 수 있습니다.

## 1. 한눈에 보기

| 환경변수 | 예시 값 | 효과 |
| --- | --- | --- |
| `PUBLIC_ADSENSE_CLIENT` | `ca-pub-1234567890123456` | 계정에서 받은 publisher ID. 유효하면 `ads.txt`의 `pub-…` 판매자 레코드 생성 |
| `PUBLIC_GOOGLE_CMP_READY` | `true` | 인증된 Google CMP 메시지를 배포·테스트했다는 운영자 확인. 유효한 광고/GA4 ID와 함께 있을 때만 Google 태그 활성화 |
| `PUBLIC_ADSENSE_CONTENT_READY` | `true` | 의미 있는 수동 검토 원본 기사 인벤토리 준비 확인. 실제 AdSense 활성화에는 `publication_integrity.ok=true`인 canonical detail article이 1개 이상 있어야 함 |
| `PUBLIC_ADSENSE_SLOT_LEADERBOARD` | `1234567890` | 홈 히어로 아래 반응형 배너 |
| `PUBLIC_ADSENSE_SLOT_INFEED` | `2345678901` | 홈/아카이브 피드 중간 광고 (6번째·18번째 카드 뒤) |
| `PUBLIC_ADSENSE_SLOT_ARTICLE` | `3456789012` | 기사 본문 하단 in-article 광고 |
| `PUBLIC_ADSENSE_SLOT_BOX` | `4567890123` | 기사 페이지 최하단 박스 광고 |
| `PUBLIC_GA4_ID` | `G-XXXXXXXXXX` | Google Analytics 4 측정 ID. CMP 준비 확인 전에는 로드하지 않음 |

설정 위치: **Vercel → Project → Settings → Environment Variables → Production**
저장 후 **Redeploy** 해야 빌드에 반영됩니다. `PUBLIC_GOOGLE_CMP_READY=true`는 AdSense 계정과
사이트 승인, 실제 계정 발급 `ads.txt` ID 확인, 인증된 Google CMP 메시지 게시, EEA/UK/CH의
수락·거부·철회 테스트, 그리고 법률 검토가 모두 증빙되기 전에는 설정하지 마세요.
`PUBLIC_ADSENSE_CONTENT_READY=true`도 같은 활성화 기록의 일부입니다. 이 환경변수는 zero 또는 invalid
inventory를 무시할 수 없습니다. 코드 수준에서 nonzero `publication_integrity.ok=true` canonical detail
article 바닥값을 별도로 확인하기 때문입니다.

## 2. AdSense 신청 절차 (계정이 없는 경우)

1. [adsense.google.com](https://adsense.google.com)에서 계정 생성 → 사이트에 `https://www.computecurrent.com` 등록.
2. 계정에서 받은 `ca-pub-…` 값을 `PUBLIC_ADSENSE_CLIENT`에 넣고 재배포합니다. 이 단계는
   `ads.txt` 판매자 레코드와 소유 확인에 사용할 수 있지만, CMP 준비 확인 전에는 Google 로더를
   활성화하지 않습니다.
3. 사이트, 콘텐츠, 계정, 결제, 세금 및 정책 요건은 Google 및 운영자의 별도 검토 대상입니다.
   이 저장소의 정책 페이지나 환경변수는 심사 결과를 보장하지 않습니다.
4. 계정과 사이트가 준비된 뒤 AdSense → 광고 → **광고 단위별**에서 디스플레이 광고 단위 4개를 만들고
   각 슬롯 번호(숫자만)를 위의 `PUBLIC_ADSENSE_SLOT_*` 변수에 넣으세요.
5. `https://www.computecurrent.com/ads.txt`에서 계정이 제공한 정확한
   `google.com, pub-…, DIRECT, f08c47fec0942fa0` 레코드를 확인합니다. 이 파일은
   `PUBLIC_ADSENSE_CLIENT`에서 자동 생성되며 CMP 활성화와 독립적으로 유지됩니다.

> 초기 활성화는 설정된 **수동 광고 단위(manual units)** 만 사용합니다. **Auto ads는 비활성화**로
> 유지하세요. Auto ads는 로컬에서 확인한 레이블·컨테이너·배치 보호를 우회할 수 있으므로, 계정/사이트
> 승인 후 실제 production DOM, 배치, 접근성 QA가 이를 명시적으로 확인한 별도 기록이 있기 전에는
> 켜지 않습니다.

## 3. EU/영국/스위스 동의 준비

- AdSense가 적용되는 EEA, UK, 스위스 트래픽에는 Google 인증 CMP와 해당 구성의 검토가 필요합니다.
- **AdSense → 개인정보 보호 및 메시지**에서 Google 메시지를 사용하거나, Google의 인증 목록에 있는
  외부 CMP를 선택합니다. CMP 인증 자체는 법률 준수 판단을 대체하지 않습니다.
- 운영 도메인에서 메시지, 거부/철회 흐름, 벤더 공개, 지리별 동작을 검증한 뒤에만
  `PUBLIC_GOOGLE_CMP_READY=true`를 설정합니다. 이 확인값은 대소문자와 공백을 무시하고 `true`일 때만
  활성화됩니다.
- 설정 후 EU/EEA, UK, 스위스의 공개 콘텐츠 페이지에서 푸터의 **Privacy choices**가 나타나고 철회
  메시지를 다시 여는지 확인합니다. 개인정보처리방침(`/privacy/`) 자체에는 Google 런타임을 로드하지 않습니다.
- 이 확인은 수락, 거부, 철회 각각을 EEA/UK/CH 조건에서 기록해야 합니다. 계정/사이트 승인, 실제
  `ads.txt` ID, 법률 검토, CMP 증빙이 함께 갖춰지기 전에는 `PUBLIC_GOOGLE_CMP_READY=false`를 유지합니다.

## 4. GA4 연동

1. [analytics.google.com](https://analytics.google.com) → 계정/속성 생성 → 웹 스트림에
   `www.computecurrent.com` 등록.
2. 측정 ID(`G-XXXXXXXXXX`)를 `PUBLIC_GA4_ID`에 넣고 재배포.
3. Search Console 연결(속성 설정 → Search Console 링크)까지 하면 유입 키워드 분석 가능.

## 5. 운영 전 확인

- [ ] **Google Search Console**에 사이트 등록 + `https://www.computecurrent.com/sitemap-index.xml` 제출
- [ ] **Bing Webmaster Tools** 등록 (Search Console 가져오기 지원)
- [ ] 기사 자동 발행이 계속 돌도록 GitHub Actions 시크릿(`OPENROUTER_API_KEY` 등) 유지
- [ ] RSS(`/rss.xml`)를 Feedly 등 애그리게이터에 등록
- [ ] 홈페이지 JSON-LD(Organization/WebSite)와 기사 구조화 데이터는 자동 출력됨
- [ ] 운영 법인, 지급·세무 정보, AdSense 계정 소유자 정보를 외부 계정에서 확인
- [ ] 의미 있는 manually reviewed original article inventory를 확인하고, 공개된 canonical detail article 중
  최소 하나가 `publication_integrity.ok=true`인지 기록. `PUBLIC_ADSENSE_CONTENT_READY=true`만으로 zero 또는
  invalid inventory를 재정의할 수 없음
- [ ] 개인정보처리방침, CMP 벤더/보존 기간, 지역별 고지와 철회 절차를 법률 검토 대상으로 기록
- [ ] `docs/adsense-operations-runbook.md`의 invalid-traffic 절차와 광고 클릭 금지 규칙을 운영자에게 공유

## 6. 광고 외 수익 슬롯

- 기사 하단 박스 광고 자리는 AdSense 미설정 시 **스폰서십 문의(하우스 광고)** 로 렌더링됩니다
  (`briefings@computecurrent.com` 연결). 광고 수익이나 심사 결과는 이 문서에서 예측하지 않습니다.
