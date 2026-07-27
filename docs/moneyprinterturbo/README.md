# MoneyPrinterTurbo 학습 노트 (유튜브/숏츠 채널 자동화 준비)

> 원본 저장소: <https://github.com/harry0703/MoneyPrinterTurbo> (MIT 라이선스)
> 학습 기준 시점: 2026-07-27, `main` 브랜치 (약 16,000줄 Python 코드 전체 정독)
> 목적: 앞으로 만들 **유튜브 채널·숏츠 채널**의 영상 자동 생성 파이프라인 설계에 재사용하기 위한 심층 분석.

## 프로젝트 한 줄 요약

**주제(키워드) 하나만 입력하면** → LLM이 대본 작성 → 대본 기반 영어 검색어 추출 → 무료 스톡 영상(Pexels/Pixabay/Coverr) 다운로드 → TTS 음성 합성 → 자막 생성/교정 → MoviePy+FFmpeg로 합성 → (선택) TikTok/Instagram/YouTube Shorts 자동 발행까지 해주는 **올인원 AI 숏폼 영상 생성기**.

## 문서 맵

| 문서 | 내용 |
|------|------|
| [01-architecture.md](01-architecture.md) | 저장소 구조, 4가지 실행 진입점, 레이어 설계, 태스크 큐/상태 관리, 배포 방식 |
| [02-pipeline.md](02-pipeline.md) | 영상 생성 7단계 파이프라인 전체 흐름, 진행률/실패 처리, 산출물 파일 구조 |
| [03-llm-prompts.md](03-llm-prompts.md) | 대본·검색어·소셜 메타데이터 생성 프롬프트 전문과 20여 개 LLM 프로바이더 추상화 |
| [04-tts-subtitles.md](04-tts-subtitles.md) | TTS 8종 라우팅 구조, 자막 타임라인 생성, Whisper 전사·교정 알고리즘 |
| [05-materials-video-engine.md](05-materials-video-engine.md) | 스톡 영상 검색/캐시/다운로드 전략, MoviePy+FFmpeg 합성 엔진, 자막 렌더링, BGM |
| [06-api-publishing.md](06-api-publishing.md) | REST API 전체 사양, 크로스 플랫폼 자동 발행(upload-post.com), 플랫폼별 메타데이터 규격 |
| [07-shorts-adaptation-plan.md](07-shorts-adaptation-plan.md) | **ai-news-portal → 유튜브/숏츠 채널 자동화에 적용하는 설계안** (핵심 산출물) |

## 30초 요약 (TL;DR)

1. **파이프라인은 7단계 직렬 구조**: 대본 → 검색어 → TTS 오디오 → 자막 → 소재 다운로드 → 합성(combine + generate) → 발행. 각 단계는 독립 함수라 어느 단계에서든 멈추거나(`stop_at`) 결과만 따로 뽑을 수 있다.
2. **오디오가 시간축의 기준**이다. TTS 음성 길이(`audio_duration`)가 먼저 확정되고, 소재 다운로드 총량·클립 개수·최종 영상 길이가 전부 여기에 맞춰진다. 숏츠 길이 제어 = 대본 길이 제어.
3. **LLM은 3가지 일만 한다**: ① 대본 생성 ② 스톡 검색용 영어 키워드(JSON 배열) 생성 ③ 발행용 제목/설명/해시태그 생성. 나머지는 전부 결정적(deterministic) 코드다.
4. **자막 품질의 비결은 "TTS 타임라인 + 대본 원문 재대입"**: TTS가 주는 단어별 타임스탬프에 문장을 맞추되, 표시 텍스트는 원본 대본을 쓴다. Whisper 모드도 전사 결과를 대본과 Levenshtein 유사도로 비교해 대본 문장으로 교체한다. → 오탈자 없는 자막.
5. **합성은 "MoviePy로 클립 가공 → FFmpeg concat demuxer로 1회 인코딩"** 구조라 화질 열화와 메모리 사용을 최소화한다. 하드웨어 인코더(NVENC 등)는 실패 시 libx264로 자동 폴백.
6. **발행은 upload-post.com 단일 API**로 TikTok/Instagram/YouTube를 한 번에 처리하고, 영상 생성 완료와 발행을 분리(별도 스레드풀 + 상태머신)해서 업로드 실패가 영상 생성 성공을 오염시키지 않는다.
7. 우리 채널에 가장 값진 부분: **프롬프트 설계, 자막 교정 알고리즘, 오디오 기준 시간축 설계, 발행 상태머신, 플랫폼별 메타데이터 상한**. 반대로 Streamlit WebUI나 중국계 LLM 어댑터 다수는 그대로 가져올 필요 없음.

## 기술 스택 (버전은 requirements.txt 기준)

- **Python 3.11+**, FastAPI 0.136 + uvicorn (API), Streamlit 1.59 (WebUI)
- **moviepy 2.2.1** (영상 합성) + FFmpeg 직접 호출 (concat/인코딩)
- **edge_tts 7.2.7** (기본 무료 TTS), azure-cognitiveservices-speech, ElevenLabs/Gemini/SiliconFlow/MiMo/Chatterbox TTS
- **faster-whisper 1.1.0** (자막 전사 옵션), openai SDK + litellm + google-genai + dashscope (LLM 멀티 프로바이더)
- loguru (로깅), redis (선택적 상태 저장), pydantic v2 (스키마), pydub (오디오)
- 의존성 관리: `pyproject.toml` + `uv.lock` (uv 권장), `requirements.txt`는 레거시 pip용

## 라이선스 주의사항

- 코드: MIT — 상업적 채널 운영에 자유롭게 재사용 가능.
- 소재: Pexels/Pixabay/Coverr 각각의 라이선스 조건(무료, 대부분 상업적 이용 가능, 일부 출처 표기 권장)을 따라야 함.
- TTS: Edge TTS는 무료지만 Microsoft 서비스 약관상 상업적 대량 사용 시 Azure Speech 유료 전환이 안전.
- 자동 발행 시 YouTube 메타데이터에 `containsSyntheticMedia: True`를 명시하는 부분(합성 미디어 고지)은 우리도 반드시 유지해야 함.
