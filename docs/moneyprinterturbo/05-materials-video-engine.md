# 05. 소재 수급과 영상 합성 엔진 — material.py / video.py

## 1. 스톡 영상 소스 3사 (material.py)

| 소스 | API | 특징 |
|---|---|---|
| **Pexels** (기본) | `api.pexels.com/videos/search` | orientation 파라미터로 세로/가로 필터. **정확히 목표 해상도(1080×1920)와 일치하는 파일만 채택** |
| **Pixabay** | `pixabay.com/api/videos/` | 폭 ≥ 목표폭이면 채택(느슨). 키가 쿼리스트링이라 로그 마스킹 처리. Cloudflare 챌린지/429 감지 로직 별도 |
| **Coverr** | `api.coverr.co/videos?urls=true` | 16:9 위주(세로 ~1%)라 aspect 필터 없이 받고 합성 단계 letterbox로 처리. mp4_download URL GET 자체가 다운로드 통계로 집계됨 |

공통 규칙:

- `minimum_duration = video_clip_duration`(기본 5초) 미만 소재는 제외 — 클립 길이보다 짧은 소재는 쓸모없음.
- 검색 결과는 URL 기준 중복 제거.
- 프록시(`[proxy]`)와 TLS 검증 설정을 모든 요청에 일관 적용.

### 24시간 검색 캐시 (material_cache.py)

- 캐시 키 = provider+검색어+최소길이+aspect. 파일 기반, TTL 24시간.
- **빈 결과는 캐시하지 않는다** — 현재 API가 "결과 없음"과 "요청 실패"를 둘 다 빈 리스트로 반환하기 때문에, 일시 장애를 하루 종일 캐시하는 사고를 막기 위함. (반환 타입을 분리하기 전까지의 보수적 선택이라고 주석에 명시 — 기술부채를 인지하고 문서화하는 태도.)
- 캐시 미스 시 같은 키에 대한 **동시 요청은 락으로 직렬화** → 서드파티 API 폭주로 인한 rate limit/봇 차단 방지.
- 캐시 읽기/쓰기 실패는 전부 "미스로 취급하고 원격 검색 계속" — 캐시는 어떤 경우에도 파이프라인을 막지 않는 순수 최적화.

### 다운로드 전략 (download_videos)

- 기본 모드: 모든 검색어의 후보를 합쳐서 (random 모드면 셔플 후) **누적 재생시간이 `audio_duration`을 넘을 때까지만** 순차 다운로드. 클립당 기여 시간은 `min(max_clip_duration, 소재 길이)`로 계산.
- **순서 매칭 모드**: 검색어별로 후보 그룹을 만들고 **라운드로빈**(1라운드: 각 키워드의 1번째 후보, 2라운드: 2번째 후보...)으로 다운로드 → 앞 키워드가 소재를 독식해 뒤 주제가 타임라인에서 밀려나는 문제 해결.
- 파일명은 URL 해시(`vid-{md5}.mp4`) → 같은 소재 재다운로드 방지(영구 캐시). 다운로드 후 MoviePy로 열어 duration/fps 검증, 손상 파일은 삭제.
- 저장 위치는 config `material_directory`로 공유 캐시/태스크 디렉터리/커스텀 경로 선택.

## 2. 합성 1단계: combine_videos() — 소재 이어붙이기

```text
입력: 다운로드된 소재 목록 + 오디오 파일
출력: combined-N.mp4 (목표 해상도, 무음)

① 오디오 길이 읽기 → required = audio_duration + 0.1초 안전 마진
   (FFmpeg 프레임 반올림으로 영상이 오디오보다 짧아져 끝부분 검은 화면이 생기는 것 방지)
② 각 소재를 source_clip_duration = max_clip_duration × clip_speed 단위로 시분할
   (배속 적용 시 소스 타임라인이 연속되도록 역산 — 0.5배속이면 2.5초씩 잘라 5초로 늘림)
   sequential 모드면 소재당 첫 조각만 사용
③ 동일 소스 중복 억제: random 모드에서 소스 파일별로 "가장 긴 조각 1개"를 우선군으로,
   나머지는 예비군으로 분리 후 각각 셔플 → 같은 원본이 반복 등장하는 체감 문제 완화,
   소재 부족 시엔 예비군으로 채움 (성공률은 희생하지 않음)
④ 조각별 처리 루프 (required 채우면 중단):
   - subclip 추출 → 배속 적용
   - 리사이즈: 비율 같으면 스케일, 다르면 스케일+검은 배경 letterbox 중앙 배치
   - 전환효과 적용 (FadeIn/Out, SlideIn/Out 4방향, ZoomIn/Out, Shuffle=무작위)
     · SlideIn/Out은 MoviePy 내장이 불안정해서 검은 배경 + 위치 애니메이션으로 자체 구현
   - max_clip_duration 초과분 재절단 (전환효과가 길이를 늘릴 수 있어서)
   - temp-clip-N.mp4로 개별 인코딩 (실패한 조각은 스킵하고 계속)
⑤ 총 길이 < required면 기존 조각들을 itertools.cycle로 반복 삽입
⑥ FFmpeg concat demuxer로 최종 이어붙이기 + `-t audio_duration` 절단
   → MoviePy로 N개 클립을 다시 합성-재인코딩하지 않으므로 화질 열화 1회로 제한, 메모리 안정
```

- 조각마다 열고 닫는 `close_clip()` 철저 — 장시간 배치에서 파일 핸들/메모리 누수 방지.
- 인코딩은 `_write_videofile_with_codec_fallback`: 설정된 하드웨어 코덱(h264_nvenc/amf/qsv/mf/videotoolbox 화이트리스트) 시도 → 실패하면 libx264로 재시도하고, **libx264가 성공했을 때만** 해당 하드웨어 코덱을 프로세스 수명 동안 비활성화(실패 원인이 코덱인지 IO인지 구분하기 위해).

## 3. 합성 2단계: generate_video() — 자막·오디오 입히기

```text
입력: combined 영상 + 내레이션 오디오 + subtitle.srt + params
출력: final-N.mp4

- 내레이션: voice_volume 배율 적용
- BGM: bgm_volume 배율 + 3초 페이드아웃 + (내장/커스텀 BGM은) AudioLoop로 영상 길이만큼 반복
  · AI 생성 BGM(Sonilo/ElevenLabs)은 이미 길이가 맞으므로 루프 생략
  · BGM 볼륨 ≤ 0이면 파일 해석조차 하지 않음 (유료 API 호출 원천 차단)
  · BGM 실패는 성공 플래그만 false로 — 내레이션만으로 영상은 완성
- 자막: SRT 각 항목마다 TextClip 생성 후 CompositeVideoClip으로 오버레이
- 오디오 44.1kHz(입력 따름) AAC 192kbps, 영상 30fps
```

### 자막 렌더링 디테일 (숏츠 품질을 좌우하는 부분)

- **줄바꿈을 MoviePy에 맡기지 않고 PIL로 직접 계산**: 실제 폰트로 픽셀 폭을 측정해 화면 폭 90% 이내로 단어 단위 분할, 한 단어(중문 장문·초장어)가 초과하면 글자 단위 분할로 강등.
- 한국어/중국어 조판 규칙: 줄 첫머리에 오면 안 되는 닫는 문장부호(`，。！?」』` 등)가 다음 줄 첫 글자가 되면, 앞 줄 마지막 글자를 끌어내려 함께 배치.
- 배경 옵션 3종: 없음(외곽선만) / 사각 배경 / **둥근 모서리 반투명 배경**(RGBA PIL 이미지 → ImageClip, 텍스트 실측 폭에 맞춤).
- 폰트 baseline 문제 해결: TextClip의 투명 캔버스 중심이 아니라 **알파 마스크에서 실제 보이는 픽셀의 bbox를 계산해 시각적 중앙 정렬**.
- 위치: bottom(높이 95%에서 자막 높이 빼기)/top(5%)/center/custom(% 지정, 화면 밖 방지 클램프).
- 글자색=배경색 동일 시 경고 함수(`subtitle_colors_are_indistinguishable`)로 WebUI에서 사전 경고.

## 4. 로컬 소재 모드 (preprocess_video)

- `video_source="local"`이면 검색어 생성을 아예 건너뛰고 사용자가 올린 파일 사용.
- **이미지도 소재로 허용**: `ImageClip` + 시간에 따라 3%/초 확대되는 켄 번스(Ken Burns) 줌 효과를 입혀 mp4로 변환.
- 최소 해상도 480×480 검증(-10px 허용 오차 — WhatsApp이 478×850으로 내려찍는 실제 사례 대응), 경로 보안 검증, 손상 EXIF 이미지 재저장(sanitize) 처리.

## 5. AI 배경음악 (sonilo.py / elevenlabs_music.py)

- 두 프로바이더 모두 동일 인터페이스(`is_enabled()` + `generate_bgm(video_path, output_path, video_duration, prompt)`)로 구현하고, task.py는 `_VIDEO_MUSIC_PROVIDERS` 딕셔너리(서비스, 예외 타입, 확장자, 경고 코드)로 차이를 흡수 — **프로바이더 추가 시 오케스트레이션 무수정.**
- 영상을 그대로 올리지 않고 **저해상도 프록시를 만들어 업로드**(트래픽 절약) 후 스트리밍으로 오디오 수신.
- ElevenLabs 음악은 유료 플랜 필요 → 생성 전에 무과금 권한 체크(`validate_generation_access`)로 전체 파이프라인 낭비 방지.

## 6. TwelveLabs 통합 (선택 기능)

- Marengo 임베딩으로 "주제 ↔ 각 검색어" 코사인 유사도를 계산해 **검색어를 관련성 순으로 재정렬** (다운로드는 앞 검색어부터 소진되므로 정렬=품질).
- Pegasus 모델로 완성 영상 분석(QA) 기능도 있음. 모두 미설정 시 no-op.
