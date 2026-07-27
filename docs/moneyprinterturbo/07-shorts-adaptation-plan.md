# 07. 적용 설계안 — ai-news-portal 기반 유튜브/숏츠 채널 자동화

> 이 문서가 학습의 최종 산출물이다. MoneyPrinterTurbo(이하 MPT)에서 배운 것을
> **"AI 인프라 뉴스 → 매일 자동 숏츠"** 채널에 어떻게 적용할지 정리한다.

## 1. 우리가 이미 가진 것 vs MPT가 주는 것

| 구성요소 | ai-news-portal (보유) | MPT (학습한 것) |
|---|---|---|
| 소재 기사 | 8시간마다 RSS 30건 수집 → LLM 큐레이션 6건 → 2건 발행 | 없음 (주제 입력에 의존) |
| 대본 | Expert Lens(한국어 전문가 해설) 생성 파이프라인 보유 | 대본 생성 프롬프트 패턴 |
| 검색어 | 없음 | **영어 1~3단어 JSON 배열 프롬프트 + 순서 매칭** |
| 영상 소재 | 기사 이미지 생성(정지 이미지) | **Pexels/Pixabay/Coverr 검색·다운로드·캐시 전체** |
| TTS | 없음 | **8종 라우팅, 한국어는 edge-tts 무료로 시작 가능** |
| 자막 | 없음 | **타임라인+대본 재대입, Whisper 교정 알고리즘** |
| 합성 | 없음 | **MoviePy+FFmpeg concat 엔진 전체** |
| 발행 | 사이트 게시 + Telegram 알림 | **upload-post.com 크로스 포스트 + 상태머신** |
| 스케줄링 | GitHub Actions (state 기반 8시간 주기) | 없음 (수동/API 트리거) |

결론: **MPT를 통째로 서비스로 띄워 API로 부리는 것**이 최단 경로다. 우리 파이프라인은 "무엇을 만들지(기사·대본)"를 결정하고, MPT는 "영상 제조"를 담당한다. 직접 재구현은 합성 엔진의 엣지 케이스(코덱 폴백, 자막 조판, 리소스 누수)를 다시 밟는 일이라 비추천.

## 2. 목표 아키텍처 (v1)

```text
[기존] scripts/pipeline.mjs (8시간 주기, GitHub Actions)
   └ 발행된 기사 2건 중 "숏츠 적합" 1건 선정 (신규 selector)
        ↓ shorts-queue.json (state 파일, 기존 pipeline-state.json 패턴 재사용)
[신규] shorts-producer (일 1~2회 실행)
   ① 기사 → 숏츠 대본 변환 (기존 OpenRouter 경로 재사용, 아래 프롬프트)
   ② MPT API 호출  POST /v1/videos
        - video_script: ①에서 만든 대본 (LLM 재생성 안 함 — 뉴스 정확성은 우리가 통제)
        - video_terms:  ①에서 함께 뽑은 영어 검색어 5~8개 (콤마 문자열로 전달 가능)
        - video_aspect: "9:16", voice_name: "ko-KR-SunHiNeural-Female"
        - match_materials_to_script: true  (뉴스는 서사 순서가 중요)
   ③ GET /v1/tasks/{id} 폴링 (state=1까지, 실패 시 failed_stage 로깅)
   ④ final-1.mp4 다운로드 → 아카이브 저장 + 메타데이터 기록
   ⑤ 발행:
      - 초기(수동 검수기): Telegram으로 영상+제목 전송 → 사람이 승인 후 업로드
      - 자동화기: MPT의 upload_post 설정 활성화 or YouTube Data API 직접 업로드
```

### 왜 대본을 MPT LLM에 맡기지 않는가

MPT의 대본 프롬프트는 "주제"에서 자유 창작한다. 뉴스 채널은 **사실 왜곡이 치명적**이므로:

- 대본은 우리 파이프라인이 기사 본문을 근거로 생성(환각 억제, 출처 문장 유지)
- MPT에는 `video_script`를 채워 전달 → MPT는 LLM을 대본에 대해 호출하지 않음 (02 문서 ① 참고)
- 검색어도 함께 생성해서 전달하면 MPT LLM 의존을 0으로 만들 수 있음 (`video_terms` 지정 시 스킵)

### 숏츠 대본 프롬프트 초안 (MPT 패턴 + 뉴스 요구 결합)

```text
역할: AI 인프라 뉴스 숏츠 대본 작가
입력: 기사 제목/요약/Expert Lens
규칙 (MPT에서 차용):
- 인사말·채널 소개 금지, 첫 문장은 시청자를 붙잡는 훅 (숫자/역설/질문)
- 마크다운·이모지·괄호 금지 (TTS가 그대로 읽는다)
- 모든 문장은 마침표로 종결 (자막 분할 품질 — 04 문서)
- 45~55초 분량 (한국어 약 4.2자/초 → 190~230자) ← MPT 무음 추정 공식 역이용
- 마지막 문장은 CTA ("팔로우하고 다음 소식 받아보세요" 류)
추가 규칙 (뉴스 특화):
- 기사에 없는 사실 창작 금지, 수치는 기사 원문 그대로
- 마지막 직전 문장에 "전문가 관점" 1문장 (Expert Lens 요약)
동시 출력: 영어 스톡 검색어 8개 (대본 서사 순서, 1~3단어, JSON)
```

## 3. 운영 파라미터 권장값 (MPT 학습 기반)

| 항목 | 권장 | 근거 |
|---|---|---|
| 해상도 | 9:16, 1080×1920 | 숏츠 표준. MPT 기본값 |
| 대본 길이 | 190~230자 (≈50초) | 60초 초과 시 Shorts 분류 리스크, 45초+가 수익화에 유리 |
| clip_duration | 3~4초 | 뉴스 템포. 기본 5초는 다소 느슨 |
| 전환 | None 또는 FadeIn | 과한 전환은 뉴스 신뢰감 저해. Shuffle 비추천 |
| concat | match_materials_to_script=true | 문단 순서=화면 순서 (05 문서 라운드로빈) |
| 자막 | custom 위치 70%, 크기 64+, 외곽선 1.5 | 하단 UI(구독 버튼)와 겹침 회피. 폰트는 Noto Sans KR/Pretendard 추가 |
| 음성 | ko-KR-SunHiNeural (F) / InJoonNeural (M) | 무료 시작. 수익화 후 ElevenLabs 승격 |
| BGM | bgm_volume 0.10~0.15 | 기본 0.2는 한국어 발음 대비 다소 큼. 초기엔 저작권 확실한 내장 BGM |
| video_count | 1 (검수기), 2 (A/B기) | 소재만 다른 2벌 생성해 썸네일/도입부 테스트 가능 |
| 소재 소스 | pexels 기본 + pixabay 폴백 | 키 배열로 로테이션 (시간당 200req 제한 대응) |

## 4. 준비물 체크리스트

- [ ] MPT 배포: `docker compose -f docker-compose.release.yml up` (8080 API만 외부 노출, 8501은 관리용)
- [ ] `config.toml`: pexels/pixabay 키 (각 2개 이상 권장), `subtitle_provider="edge"`, `endpoint` 설정
- [ ] 한글 폰트 파일을 `resource/fonts/`에 추가
- [ ] LLM: 우리 쪽에서 대본 생성하므로 MPT의 llm_provider는 소셜 메타데이터용으로만 (OpenRouter 키 재사용 가능 — openai 어댑터 + base_url)
- [ ] YouTube 채널 개설 + (자동화 시) upload-post.com 계정 연결 또는 YouTube Data API OAuth
- [ ] `containsSyntheticMedia` 고지 유지 (06 문서 — AI 생성 콘텐츠 정책 준수)
- [ ] 저장 공간: 태스크당 대략 소재 50~150MB + 산출물 20~40MB → 주기적 태스크 삭제(DELETE API) 크론

## 5. 단계별 로드맵

1. **P0 — 수동 검증 (반나절)**: MPT를 로컬 Docker로 띄우고 WebUI에서 실제 기사 1건으로 한국어 숏츠 1개 수동 생성. 자막 폰트·음성·소재 품질 확인.
2. **P1 — 반자동 (스크립트 1개)**: `scripts/shorts-producer.mjs` 신설 — 최신 기사 1건 → 대본/검색어 생성 → MPT API 호출 → 폴링 → mp4 다운로드 → Telegram 전송(기존 send-telegram-photo.mjs 패턴 재사용). 사람이 보고 수동 업로드.
3. **P2 — 자동 발행**: 검수 통과율이 안정되면 upload_post 자동 발행 켜기. MPT의 발행 상태머신(pending/processing/complete/failed + owner 추적)을 그대로 활용.
4. **P3 — 고도화**: 기사 이미지/차트를 로컬 소재로 주입(MPT 이미지→켄번스 줌 변환 활용, 05 문서), A/B 2벌 생성, 조회수 피드백을 큐레이션 점수에 반영.

## 6. 리스크와 대응 (MPT 코드에서 배운 교훈 적용)

| 리스크 | 대응 (MPT 패턴) |
|---|---|
| 스톡 검색 0건 (한국 특화 주제) | 검색어에 항상 일반어 포함(프롬프트 규칙 2), 소스 폴백, 최후엔 기사 이미지 켄번스 |
| TTS 순단 | 실패 시 failed_stage="audio"로 명확 기록, 다음 주기 재시도 (부분 실패를 전체 실패로 만들지 않기) |
| 같은 소재 반복 노출 | URL 해시 영구 캐시가 오히려 채널 내 재사용을 유발 → 사용한 소재 해시를 우리 state에 기록하고 video_terms를 기사마다 다양화 |
| 업로드 실패가 생성 성공을 가림 | 생성 완료 기록과 발행 상태 분리 (06 문서 상태머신) |
| Edge TTS 상업 사용 리스크 | 수익화 시점에 Azure Speech 유료 키로 전환 (음성 동일, 코드 무변경) |
| 뉴스 오보/환각 | 대본은 우리 LLM이 기사 근거로만 생성, 수치 검증 게이트(기존 quality-gate 스크립트 패턴) 통과 후 MPT 전달 |

## 7. MPT에서 "가져오지 않을 것"

- Streamlit WebUI (우리는 API만 사용), 중국계 LLM/TTS 어댑터 다수, Sonilo/ElevenLabs 영상 BGM(초기엔 비용 대비 과함), TwelveLabs 재정렬(선택 기능, 추후 검토), Redis(단일 프로세스면 메모리 상태로 충분).
