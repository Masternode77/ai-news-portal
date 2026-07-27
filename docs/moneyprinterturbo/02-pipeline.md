# 02. 영상 생성 파이프라인 — task.py 완전 해부

`app/services/task.py::start()` → `_run_pipeline()`이 전체 흐름의 심장이다. 아래는 실제 코드 순서 그대로의 7단계.

## 전체 흐름도

```text
start(task_id, params, stop_at="video")
│
├─ [preflight] Sonilo/ElevenLabs 영상 배경음악 사용 시: API 키·프롬프트 길이·계정 권한 선검증
│
├─ ① 대본 생성          progress 5→10   llm.generate_script()      (커스텀 대본 있으면 스킵)
│     └ stop_at=="script" 이면 여기서 종료
├─ ② 검색어 생성        progress 10→20  llm.generate_terms()       (video_source=local이면 스킵)
│     ├ match_materials_to_script=true → 8개, 대본 서사 순서 유지
│     ├ 기본 → 5개
│     └ (선택) twelvelabs.rerank_terms_by_subject() 의미 유사도 재정렬
│     └ script.json 저장 (대본+검색어+파라미터 스냅샷)
├─ ③ 오디오 생성        progress 20→30  generate_audio()
│     ├ custom_audio_file 있으면 → 그대로 사용 (sub_maker 없음)
│     ├ WebUI 전체 미리듣기 캐시가 유효하면 재사용 (파라미터 완전 일치+태스크 디렉터리 내부 검증)
│     └ 기본: voice.tts() → audio.mp3 + SubMaker(단어별 타임스탬프)
│     └ audio_duration 확정 ← ★ 이후 모든 시간 계산의 기준
├─ ④ 자막 생성          progress 30→40  generate_subtitle() → subtitle.srt
│     ├ subtitle_provider="edge"  → TTS 타임라인 기반 (voice.create_subtitle)
│     ├ subtitle_provider="whisper" → 오디오 전사 후 대본과 대조 교정
│     └ 실패 시 자막 없이 진행 (Whisper 자동 폴백 금지 — 수 GB 모델 다운로드 방지)
├─ ⑤ 소재 확보          progress 40→50  get_video_materials()
│     ├ local → preprocess_video() (이미지→줌 영상 변환 포함)
│     └ pexels/pixabay/coverr → material.download_videos()
│         └ 필요 시간 = audio_duration × video_count 만큼 채워질 때까지 다운로드
├─ ⑥ 합성 (video_count 회 반복)  progress 50→100
│     ├ video.combine_videos()  → combined-N.mp4 (소재 이어붙이기, 무음)
│     ├ (선택) Sonilo/ElevenLabs로 combined 영상 분석 기반 BGM 생성 (실패해도 계속, 경고만 축적)
│     └ video.generate_video()  → final-N.mp4 (자막+내레이션+BGM 합성)
└─ ⑦ 완료 처리 & (선택) 크로스 플랫폼 발행
      ├ 상태 COMPLETE(progress 100) + 모든 산출물 경로 기록  ← 발행보다 먼저!
      └ upload_post 설정 시 별도 스레드풀에서 비동기 발행 (pending→processing→complete/failed)
```

## 산출물 파일 구조 (storage/tasks/{task_id}/)

```text
script.json       # {"script": 대본, "search_terms": [...], "params": 요청 스냅샷}
audio.mp3         # TTS 내레이션
subtitle.srt      # 최종 자막
combined-1.mp4    # 소재만 이어붙인 무음 중간 산출물 (video_count만큼)
final-1.mp4       # 완성본 (video_count만큼)
sonilo-bgm-1.m4a / elevenlabs-bgm-1.mp3   # AI 배경음악 사용 시
```

## 단계별 상세

### ① 대본 (generate_script)

- `params.video_script`가 비어 있을 때만 LLM 호출. **직접 쓴 대본을 넣으면 LLM 비용 0.**
- 응답에 `"Error: "` 프리픽스가 있으면 그 원문을 `failed_stage="script"`로 기록.

### ② 검색어 (generate_terms)

- `params.video_terms`를 직접 주면 문자열(콤마 구분)/배열 모두 허용, LLM 스킵.
- **순서 매칭 모드**(`match_materials_to_script=true`)의 통찰: 키워드 자체를 대본 서사 순서로 뽑아야, 뒤 내용의 화면이 앞에 나오는 문제를 해결할 수 있다. 이 모드에선 TwelveLabs 재정렬도 건너뜀(순서가 곧 정보이므로).

### ③ 오디오 (generate_audio) — 시간축의 원천

- 반환: `(audio_file, audio_duration(올림), sub_maker)`.
- 커스텀 오디오 경로는 태스크 디렉터리 내부 또는 프로젝트 내부 실제 파일만 허용(경로 탈출 차단).
- WebUI 미리듣기 재사용 검증이 인상적: 대본·voice_name·rate·volume이 **완전히 일치**하고 파일이 태스크 디렉터리 안에 있으며 duration이 유한 양수일 때만 재사용. 아니면 조용히 새로 TTS. "오래된 캐시가 성과물을 오염시키지 않게 한다"는 원칙.

### ④ 자막 (generate_subtitle)

- `subtitle_provider` 빈 값 → 자막 생략. `edge`인데 sub_maker가 없으면(커스텀 오디오) 생략. **Whisper로 몰래 폴백하지 않는 이유를 주석에 명시**: 사용자 모르게 수 GB 모델을 받게 하지 않겠다는 것.
- 생성 후 `subtitle.file_to_subtitles()`로 파싱 검증까지 하고, 항목이 없으면 빈 자막으로 처리.

### ⑤ 소재 (get_video_materials)

- 다운로드 목표치: `audio_duration × params.video_count` — 여러 벌 뽑을 때 소재가 겹치지 않도록 배수로 확보.
- 순서 매칭 모드면 concat 모드를 강제로 `sequential`로 바꿔서 다운로드 순서=타임라인 순서 보장.

### ⑥ 합성 (generate_final_videos)

- `video_count > 1`이면 concat 모드를 강제 `random`으로 → 각 벌이 서로 다르게 나옴. 단, 순서 매칭 모드가 켜져 있으면 항상 `sequential`(일관성이 무작위 다양성보다 우선).
- 진행률 계산: 50%에서 시작해 영상 1벌당 `50/video_count`를 combine/generate 반반씩 나눠 증가.
- **AI 배경음악 실패 시 강등 전략**: 대본·음성·자막이 이미 완성된 상태에서 서드파티 BGM이 실패하면 태스크를 버리지 않고 BGM 없이 완성 + `warnings` 배열에 `{code, video_index}` 축적 → WebUI가 사용자에게 알림. **부분 실패를 전체 실패로 만들지 않는다.**

### ⑦ 발행 (비동기, 다음 문서 참고)

- 반드시 **태스크 COMPLETE 기록이 먼저**, 발행은 그 뒤 별도 스레드풀(worker 2, 대기열 10)에서. 업로드가 몇 분 걸려도 영상 생성 API 응답성에 영향 없음.

## 실패 처리 설계 (그대로 배울 것)

`_mark_task_failed(task_id, stage, error)`:

- 이미 구체적 에러가 기록된 FAILED 태스크는 **일반 문구로 덮어쓰지 않는다** (서비스 함수가 남긴 정확한 원인 보존).
- 실패 직전까지의 progress를 유지한 채 `state=-1, failed_stage, error` 기록.
- 최상위 `start()`는 모든 미예기 예외를 잡아 `pipeline` 스테이지 실패로 변환 — **태스크가 영원히 PROCESSING에 머무는 일이 없다.**

## VideoParams 주요 기본값 (schema.py)

| 파라미터 | 기본값 | 의미 |
|---|---|---|
| `video_aspect` | `9:16` (1080×1920) | `16:9`(1920×1080), `1:1`(1080×1080)도 지원 |
| `video_clip_duration` | 5초 | 한 소재 클립의 최대 재생 길이 (2~10 권장) |
| `video_clip_speed` | 1.0 | 클립 재생 속도 |
| `video_concat_mode` | random | random / sequential |
| `video_transition_mode` | None | Shuffle/FadeIn/FadeOut/SlideIn/SlideOut/ZoomIn/ZoomOut |
| `video_count` | 1 | 한 번에 생성할 영상 벌 수 |
| `voice_volume` / `voice_rate` | 1.0 / 1.0 | |
| `bgm_type` / `bgm_volume` | random / 0.2 | 내장 BGM 무작위, 내레이션 대비 20% 볼륨 |
| `subtitle_enabled` | true | |
| `font_name` | STHeitiMedium.ttc | resource/fonts/ 내 파일명 |
| `font_size` / `stroke_width` | 60 / 1.5 | 검정 외곽선 + 흰 글자 기본 |
| `subtitle_position` | bottom | top/center/bottom/custom(%) |
| `paragraph_number` | 1 | 대본 문단 수 (1~10) |
| `n_threads` | 2 | FFmpeg 인코딩 스레드 |
