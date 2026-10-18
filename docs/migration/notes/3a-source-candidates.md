# 3a 후보 소스 확장 목록 (제안)

브리프 3a: Phase 0에서 H1(소스 풀 구성: 권리 게이트 + 캡 30)이 유의미했으므로 후보 소스를 tier와 함께 제안한다. 레거시 레지스트리 82행(텍스트 권리 29·링크 전용 53)에 **없는** 소스만 적었다. 피드 URL은 클라우드 세션에서 검증할 수 없어 전부 "확인 필요"이며, 3a의 `workflow_dispatch` dry-run(GitHub 러너)에서 실제 응답·권리 문구를 확인한 뒤 `config/sources.yaml`에 넣는다. `text_rights`는 예상값이다. 법적 판단이 아니며 매체별 약관 확인 후 확정한다.

tier 정의(3a): 1 = 매 런 반드시 수집(실패 시 알림), 2 = 보조, 3 = 실험(실패 무알림).

## A. 공공·규제·계통 운영자 (text_rights `full` 기대 — 공공저작물·CC BY)

| 후보 | 유형 | 예상 권리 | tier | 피드(확인 필요) | 왜 |
|---|---|---|---|---|---|
| PJM Interconnection — news/press | 계통 운영자(미 동부) | `full`? (약관 확인) | 1 | pjm.com 뉴스 RSS | 데이터센터 대형 부하·용량 경매가 핵심 이슈 |
| ERCOT — news | 계통 운영자(텍사스) | `full`? | 1 | ercot.com 뉴스 | 대형 부하 접속 절차(SB 6) |
| MISO, CAISO, NYISO, ISO-NE | 계통 운영자 | `full`? | 2 | 각 사 뉴스룸 | 지역 부하 전망 |
| NERC — news & reliability assessments | 신뢰도 기관 | `full`? | 1 | nerc.com 뉴스 | LTRA·데이터센터 부하 리스크 |
| IEA — news & reports | 국제기구 | `full` (CC BY 4.0 공지) | 1 | iea.org/news RSS | Electricity 보고서·데이터센터 전력 수요 |
| ENTSO-E — news | 유럽 계통 | `rewrite_only`? | 2 | entsoe.eu | 유럽 접속 대기열 |
| EU Commission DG ENER / DG CNECT | 규제 | `full` (EC 재사용 정책, 이미 ec-press-corner 있음) | 2 | 주제별 RSS | AI Act·에너지 효율 지침 |
| 산업통상자원부·과기정통부 보도자료 (korea.kr) | 한국 정부 | `full` (공공누리 1유형 출처표시) | 1 | korea.kr 부처별 RSS | 국내 데이터센터 전력 정책·AI 반도체 |
| 한국전력(KEPCO)·전력거래소(KPX) 보도자료 | 한국 공기업 | `full`? (공공누리 확인) | 1 | 각 사 보도자료 | 접속 용량·계통 계획 |
| 일본 METI 보도자료 | 일본 정부 | `full`? (정부표준이용규약) | 2 | meti.go.jp RSS | 와트·비트 정책, GX |
| Singapore EMA / IMDA | 싱가포르 정부 | `full`? | 2 | 보도자료 RSS | 동남아 데이터센터 허가·전력 |
| Australia DCCEEW / AEMO | 호주 정부·계통 | `full` (CC BY) | 3 | aemo.com.au | APAC 비교 |
| US DOE Grid Deployment Office, LBNL(이미), NREL | 연구기관 | `full` (공공저작물) | 2 | nrel.gov 뉴스 | 데이터센터 에너지 보고서 |
| EPRI | 연구기관 | `rewrite_only` | 3 | epri.com 뉴스 | 대형 부하 연구 |

## B. 하이퍼스케일러·벤더 공식 채널 (text_rights `rewrite_only` 기대 — 재서술 허용 결정 2026-10-18)

| 후보 | 유형 | 예상 권리 | tier | 피드(확인 필요) | 왜 |
|---|---|---|---|---|---|
| Microsoft — Official Microsoft Blog / Microsoft Source (datacenter) | 하이퍼스케일러 | `rewrite_only` | 1 | blogs.microsoft.com RSS | 데이터센터 투자 공지 |
| Google — The Keyword (infrastructure), Google Cloud newsroom | 하이퍼스케일러 | `rewrite_only` | 1 | blog.google RSS | 지역 데이터센터·TPU |
| Amazon — About Amazon (AWS 투자) | 하이퍼스케일러 | `rewrite_only` | 1 | aboutamazon.com RSS | 지역 투자·전력 계약 |
| Oracle Cloud blog / newsroom | 클라우드 | `rewrite_only` | 2 | blogs.oracle.com | OCI 슈퍼클러스터 |
| Meta Newsroom (infrastructure) | 하이퍼스케일러 | `rewrite_only` | 2 | about.fb.com/news RSS | 데이터센터 공지 |
| NVIDIA Newsroom(보도자료) | 반도체 | `rewrite_only` | 1 | nvidianews.nvidia.com RSS | 블로그와 별도 채널 |
| AMD Newsroom, Intel Newsroom, Arm Newsroom, Broadcom, Micron | 반도체 | `rewrite_only` | 2 | 각 사 RSS | 가속기·메모리 공급 |
| TSMC Press, Samsung Newsroom, SK hynix Newsroom | 반도체(APAC) | `rewrite_only` | 1 | 각 사 뉴스룸 | HBM·첨단 패키징 공급 |
| Supermicro, Dell Technologies, HPE 뉴스룸 | 서버 | `rewrite_only` | 3 | 각 사 RSS | 랙·액체냉각 |
| OpenAI News, Anthropic News, Google DeepMind blog, Microsoft AI blog | AI 연구소 | `rewrite_only` | 2 | 각 사 RSS | 컴퓨트 조달 공지(스타게이트 등) |
| CoreWeave, Nebius, Lambda, Crusoe 뉴스룸 | 네오클라우드 | `rewrite_only` | 2 | 각 사 | GPU 용량·전력 계약 |

## C. 데이터센터 운영사·개발사·전력/냉각 벤더 (`rewrite_only`)

| 후보 | 유형 | tier | 피드(확인 필요) | 왜 |
|---|---|---|---|---|
| Equinix, Digital Realty, NTT DATA (GDC), Vantage, STACK, CyrusOne, QTS, Aligned, Compass | 운영사(글로벌) | 2 | 각 사 뉴스룸 | 캠퍼스·전력 확보 공지 |
| AirTrunk, Princeton Digital Group, ST Telemedia GDC, GDS/DayOne, Equinix APAC | 운영사(APAC) | 1 | 각 사 | APAC 수요·전력 |
| 네이버클라우드, LG CNS, KT 클라우드, 카카오, SK브로드밴드 데이터센터 보도자료 | 한국 운영사 | 1 | 각 사 뉴스룸 | 국내 캠퍼스·전력 |
| Vertiv, Schneider Electric, Eaton, Siemens Energy, GE Vernova, Hitachi Energy, Bloom Energy | 전력·냉각 벤더 | 2 | 각 사 RSS | 변압기·가스터빈·액체냉각 공급 제약 |
| Open Compute Project, 7x24 Exchange, ASHRAE TC 9.9 | 업계 단체 | 3 | ocp 블로그 | 표준·설계 동향 |

## D. 산업 매체·분석 (레지스트리에 없는 것만, `rewrite_only` 또는 `link_only`)

| 후보 | tier | 비고 |
|---|---|---|
| Data Center Watch / Dgtl Infra / Baxtel | 3 | 투자 분석 블로그, 권리 확인 |
| S&P Global 451 Research(무료 블로그), Synergy Research 보도자료, Dell'Oro 블로그 | 2 | 시장 데이터 인용원 |
| 디지털데일리, 조선비즈 테크, 한국경제 산업, 매일경제 | 2 | 국내 매체(재서술), 전기신문은 blocked 유지 |
| Reuters Technology(링크 전용), FT(링크 전용), WSJ(링크 전용) | 2 | `link_only` — 재서술 금지 목록 후보(Josh 확인) |

## 우선 검증 순서 (dry-run 1회차)

1. A의 tier 1: PJM, ERCOT, NERC, IEA, korea.kr 2부처, KEPCO/KPX — `full` 소스가 늘어야 H1이 풀린다.
2. B의 tier 1: Microsoft·Google·Amazon 공식 블로그, NVIDIA Newsroom, TSMC·Samsung·SK hynix.
3. C의 APAC·한국 운영사.
4. 나머지는 2회차.

각 후보는 dry-run 후 `{feed_ok, items_7d, has_full_text, license_text}` 4항목으로 판정해 `sources.yaml`에 넣는다. 목표: 텍스트 권리 `full` 소스 29 → 45+, `rewrite_only` 포함 활성 소스 28 → 90+.
