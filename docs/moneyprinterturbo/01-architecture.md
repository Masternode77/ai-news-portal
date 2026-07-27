# 01. 아키텍처 — 저장소 구조와 실행 모델

## 1. 디렉터리 구조

```text
MoneyPrinterTurbo/
├── main.py                  # API 서버 진입점 (uvicorn 실행)
├── cli.py                   # CLI 진입점 (argparse, 약 800줄 — WebUI 없이 배치 생성)
├── webui/Main.py            # Streamlit WebUI 진입점 (약 4,000줄, 단일 파일)
├── config.example.toml      # 설정 템플릿 → 첫 실행 시 config.toml로 복사됨
├── app/
│   ├── asgi.py              # FastAPI 앱 팩토리 + lifespan(시작 시 발행 상태 복구)
│   ├── router.py            # v1 라우터 등록
│   ├── config/config.py     # TOML 로드/저장, 전역 config 객체
│   ├── controllers/
│   │   ├── v1/video.py      # 영상 태스크 API (생성/조회/삭제/스트림/다운로드/BGM/소재 업로드)
│   │   ├── v1/llm.py        # 대본/검색어/소셜 메타데이터 단독 생성 API
│   │   └── manager/         # 태스크 큐 (base/memory/redis)
│   ├── models/
│   │   ├── schema.py        # Pydantic 모델 (VideoParams가 핵심)
│   │   ├── const.py         # 태스크 상태 상수, 문장부호, 파일 확장자
│   │   └── llm_provider.py  # LLM 프로바이더 레지스트리 (20여 종)
│   ├── services/            # 비즈니스 로직 전부 (아래 표)
│   └── utils/               # 경로 헬퍼, 파일 보안, 로깅
├── resource/
│   ├── fonts/               # 자막 폰트 (STHeitiMedium.ttc 등)
│   ├── songs/               # 내장 BGM mp3
│   └── public/              # 정적 리소스
├── storage/                 # (런타임 생성) tasks/{task_id}/, cache_videos/, local_videos/
├── test/                    # pytest 테스트 (서비스 단위)
└── Dockerfile, docker-compose*.yml, webui.sh/bat
```

### services/ 모듈 책임 분담

| 모듈 | 줄수 | 역할 |
|------|-----:|------|
| `task.py` | 1,311 | **파이프라인 오케스트레이터.** 7단계 순서 제어, 진행률, 실패 기록, 발행 스케줄링 |
| `video.py` | 1,372 | 클립 분할/리사이즈/전환효과/합성/자막 렌더링/최종 인코딩 |
| `voice.py` | 1,817 | TTS 8종 라우팅 + 자막 타임라인(SubMaker) 생성 |
| `llm.py` | 962 | 대본/검색어/소셜 메타데이터 프롬프트와 프로바이더 호출 |
| `material.py` | 644 | Pexels/Pixabay/Coverr 검색·다운로드 |
| `material_cache.py` | 346 | 소재 검색 결과 24시간 파일 캐시 + 동시성 락 |
| `subtitle.py` | 313 | faster-whisper 전사 + 대본 대조 교정 |
| `bgm.py` | 328 | BGM 목록/업로드 검증/경로 보안 |
| `sonilo.py` / `elevenlabs_music.py` | 357/403 | 영상 내용 기반 AI 배경음악 생성 (유료 API) |
| `twelvelabs.py` | 166 | 검색어 의미 기반 재정렬(Marengo 임베딩) — 선택 기능 |
| `upload_post.py` | 136 | upload-post.com 크로스 플랫폼 발행 |
| `state.py` | 244 | 태스크 상태 저장 (메모리/Redis 이중 구현) |
| `webui_task.py` | 163 | WebUI 전용 태스크 헬퍼 |
| `utils/video_effects.py` | 145 | FadeIn/Out, SlideIn/Out(자체 구현), ZoomIn/Out 전환 |

## 2. 실행 진입점 4가지

같은 `app/services/*`를 공유하는 4개의 껍데기가 있다:

1. **WebUI** (`streamlit run webui/Main.py`, 포트 8501) — 일반 사용자용. 설정 저장, 음성 미리듣기, 태스크 이력 관리/복원까지 포함.
2. **API 서버** (`python main.py`, 포트 8080) — FastAPI. `/docs` Swagger 제공. 우리처럼 **외부 스케줄러에서 자동화할 때 쓰는 진입점**.
3. **CLI** (`python cli.py --subject "..." ...`) — 서버 없이 1회 실행 배치 생성. cron 자동화에 적합.
4. **MCP/AI Agent** — README에서 언급되는 에이전트 워크플로(대화형으로 파라미터 구성).

## 3. 태스크 실행 모델

### 큐잉 (controllers/manager/)

```
POST /v1/videos
  → task_id = uuid 발급, state 저장소에 등록
  → TaskManager.add_task(task.start, ...)
      ├─ 실행 중 태스크 < max_concurrent_tasks(기본 5) → 즉시 스레드 생성 실행
      └─ 아니면 큐에 적재 (max_queued_tasks(기본 100) 초과 시 429 TaskQueueFullError)
  → 태스크 종료 시 task_done() → check_queue()로 다음 태스크 디큐
```

- 배운 점: **동시 실행 카운터를 스레드 시작 "전에" 선점**한다(경쟁 조건 방지). 큐에 상한을 두는 이유는 "무제한 큐 = 메모리 고갈 + 서드파티 API 비용 폭주 방지"라고 주석에 명시.
- 큐 구현이 `InMemoryTaskManager`와 `RedisTaskManager`로 분리 — Redis를 쓰면 여러 프로세스가 큐를 공유할 수 있다.

### 상태 저장 (services/state.py)

- `MemoryState`(기본) / `RedisState`(config `enable_redis=true`) — 같은 `BaseState` 인터페이스(`update_task/patch_task/get_task/get_all_tasks/delete_task`).
- 태스크 상태 상수: `TASK_STATE_PROCESSING=4`, `TASK_STATE_COMPLETE=1`, `TASK_STATE_FAILED=-1` + `progress`(0~100).
- 실패 시 `failed_stage`(script/terms/audio/materials/video/preflight/pipeline)와 `error` 원문을 남겨 API 호출자가 서버 로그 없이 원인 파악 가능하게 함 — **우리 파이프라인에도 도입할 가치가 큰 패턴.**

## 4. 설정 시스템 (config.toml)

- 첫 실행 시 `config.example.toml` → `config.toml` 자동 복사. WebUI에서 편집하면 파일에 다시 저장.
- 주요 키:
  - `[app]` — `video_source`(pexels/pixabay/coverr/local), `pexels_api_keys`/`pixabay_api_keys`/`coverr_api_keys`(**배열로 넣으면 라운드로빈 키 로테이션**), `llm_provider` + 프로바이더별 `*_api_key/_base_url/_model_name`, `subtitle_provider`(edge/whisper), `max_concurrent_tasks`, `endpoint`(다운로드 URL 프리픽스), `material_directory`, Redis 설정, upload_post 설정
  - `[whisper]` — model_size(large-v3)/device/compute_type
  - `[azure]`, `[siliconflow]`, `[elevenlabs]`, `[chatterbox]` — TTS 자격증명
  - `[proxy]` — 소재 다운로드용 HTTP 프록시
  - `[ui]` — WebUI 기본값 (폰트, 자막 위치, 언어 등)
- API 키 로테이션 구현: 전역 카운터 + 락으로 `keys[counter % len]` — 무료 티어 쿼터 분산 목적. **Pexels 무료 키는 시간당 200 요청 제한이라 키 여러 개를 돌리는 실전 노하우.**

## 5. 배포

- `docker-compose.yml`: `webui`(8501) + `api`(8080) 두 컨테이너, 프로젝트 루트를 통째로 볼륨 마운트.
- 권장은 `docker-compose.release.yml` — GHCR 프리빌드 이미지 `ghcr.io/harry0703/moneyprinterturbo:latest`.
- GPU 자막 전사용 `Dockerfile.gpu` + `docker-compose.gpu.yml` 별도 제공 (faster-whisper CUDA).
- 수동 설치는 `uv sync --frozen` 권장. ffmpeg는 자동 감지, 실패 시 `ffmpeg_path` 수동 지정.
- 주의: 컨테이너 밖 접근을 막으려 포트가 `127.0.0.1`에 바인딩되어 있음 — 서버 배포 시 리버스 프록시 필요.

## 6. 눈여겨본 방어적 코딩 패턴 (우리 코드에 이식할 것)

- **에러 메시지 위생**: 예외 문자열에서 `user:pass@host`·`?api_key=` 패턴을 정규식으로 마스킹한 뒤에만 API 응답/로그에 노출 (`llm.py::_sanitize_error_message`, `material.py::_redact_secret`).
- **경로 탈출 방지**: 사용자 입력 파일 경로는 전부 `file_security.resolve_path_within_directory()`로 지정 디렉터리 내부인지 검증 (BGM, 로컬 소재, 커스텀 오디오, 스트림/다운로드 API 모두).
- **Cloudflare 챌린지 감지**: Pixabay 응답이 JSON이 아니라 "Just a moment" HTML이면 명확한 에러로 구분 처리.
- **리소스 수명 관리**: MoviePy clip은 `close_clip()`(reader/audio/mask/자식 클립 재귀 해제 + gc), 최종 합성은 `ExitStack`으로 모든 경로에서 FFmpeg 서브프로세스 해제 보장. Windows 파일 잠금(WinError 32) 회피용 temp 디렉터리 분리까지.
- **선제 검증(preflight)**: 유료 BGM 프로바이더가 켜져 있으면 대본 생성 "전에" API 키/프롬프트 길이/계정 권한을 먼저 검사 — LLM·TTS·소재 쿼터를 낭비한 뒤 실패하는 것을 방지. **비용이 드는 다단계 파이프라인의 공통 원칙.**
