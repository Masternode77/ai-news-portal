# 06. REST API 사양과 크로스 플랫폼 자동 발행

## 1. API 엔드포인트 전체 (포트 8080, `/docs` Swagger)

### 태스크 (controllers/v1/video.py)

| 메서드/경로 | 기능 |
|---|---|
| `POST /v1/videos` | 완성 영상 생성 (body = VideoParams 전체) → `{task_id}` 즉시 반환 |
| `POST /v1/subtitle` | 자막까지만 생성 (`stop_at="subtitle"`) |
| `POST /v1/audio` | 오디오까지만 생성 (`stop_at="audio"`) |
| `GET /v1/tasks?page=&page_size=` | 태스크 목록(페이지네이션) |
| `GET /v1/tasks/{task_id}` | 상태/진행률 조회. 완료 시 `videos[]`, `combined_videos[]`를 다운로드 URL로 변환해 반환 |
| `DELETE /v1/tasks/{task_id}` | 태스크+산출물 삭제 (생성 중이거나 발행 진행 중이면 거부) |
| `GET /v1/musics` / `POST /v1/musics` | BGM 목록 조회 / mp3 업로드(FFmpeg로 실제 오디오인지 검증) |
| `GET /v1/videos/materials` / `POST .../materials` | 로컬 소재 목록/업로드 |
| `GET /v1/stream/{file_path}` | Range 헤더 지원 스트리밍 재생 |
| `GET /v1/download/{file_path}` | 파일 다운로드 |

### LLM 단독 (controllers/v1/llm.py)

| 메서드/경로 | 기능 |
|---|---|
| `POST /v1/scripts` | 대본만 생성 |
| `POST /v1/terms` | 검색어만 생성 |
| `POST /v1/social-metadata` | 제목/캡션/해시태그만 생성 (platform: tiktok/youtube_shorts/instagram_reels/facebook_reels) |

### 폴링 계약

```jsonc
GET /v1/tasks/{id} 응답 data:
{
  "task_id": "...",
  "state": 4,          // 4=처리중, 1=완료, -1=실패
  "progress": 50,      // 0~100
  "videos": ["http://.../final-1.mp4"],        // 완료 시
  "failed_stage": "audio",                      // 실패 시
  "error": "TTS request timed out",             // 실패 시
  "cross_post_state": "pending|processing|complete|failed",  // 발행 켠 경우
  "cross_post_results": [{"success": true, ...}],
  "cross_post_error": null
}
```

`TaskStatusData`는 `extra="allow"`로 정의 — 필드 추가에 열려 있고 문서화된 필드는 안정 계약. **자동화 클라이언트는 state/progress/videos/failed_stage만 보면 된다.**

## 2. 크로스 플랫폼 발행 (upload_post.py + task.py 후반부)

### 사용 서비스: upload-post.com

- 단일 REST API(`api.upload-post.com/api/upload`)로 TikTok/Instagram/YouTube 동시 업로드. API 키 + 프로필 username 기반. 플랫폼별 OAuth 연결은 upload-post 대시보드에서 1회 수행.
- config: `upload_post_enabled`, `api_key`, `username`, `platforms`(["tiktok","instagram","youtube"]), `auto_upload`, `youtube_privacy_status`(public/unlisted/private), `max_pending_tasks`(기본 10).

### 발행 플로우

```text
영상 생성 COMPLETE 기록 (progress 100, videos[] 포함)   ← 항상 먼저!
  └ auto_upload && platforms 설정 시:
      cross_post_state = "pending" 기록
      세마포어(대기열 상한 10) 획득 실패 → 즉시 failed("queue is full") 기록
      전용 ThreadPoolExecutor(worker 2)에 제출
        ├ "processing" 기록 + cross_post_owner = "host:pid:uuid" 기록
        ├ YouTube 포함 시: llm.generate_social_metadata(platform="youtube_shorts")로
        │   제목/설명/태그 생성 → youtube_extra에 privacyStatus,
        │   containsSyntheticMedia: True (합성 미디어 고지!) 포함
        ├ 각 final 영상에 대해 upload_post.cross_post_video() 호출
        └ 전부 성공 → "complete" / 하나라도 실패 → "failed" + 에러 문자열 병합 기록
```

### 견고성 설계 (자동 발행 시스템 만들 때 그대로 참고)

1. **생성과 발행의 분리**: 업로드는 몇 분 걸릴 수 있으므로 영상 생성 스레드 풀의 동시성 슬롯을 점유하지 않는다. 발행 실패가 완성된 영상 태스크 상태를 되돌리지도 않는다.
2. **소유자 추적과 재시작 복구**: `cross_post_owner`(hostname:pid:uuid)를 상태에 기록. 프로세스 재시작 시 lifespan 훅에서 전체 태스크를 스캔해, 살아있지 않은 프로세스가 남긴 pending/processing을 **"interrupted" 실패로 수렴**시킨다(스레드풀은 재시작 후 이어지지 않으므로). 같은 호스트가 아니면 보수적으로 "살아있음"으로 간주(다중 노드 공유 Redis 배려). Windows에서는 `os.kill(pid,0)`이 프로세스를 죽일 수 있어 읽기 전용 Win32 API로 생존 확인.
3. **상태 쓰기 재시도**: Redis 순단 대비 3회 재시도. 최종 실패해도 로그로 진단 정보 보존.
4. **Future 종결 보증**: done 콜백에서 취소/예외/비정상 종료 모두 잡아 활동 상태로 방치된 태스크를 실패로 확정 — **"영원히 processing" 상태가 존재할 수 없게** 다층 방어.
5. **큐 가득참도 즉시 가시화**: 조용히 버리지 않고 `cross_post_error`에 이유를 남기고, 동기 반환 스냅샷도 일치시킴.

### YouTube 메타데이터에서 배울 것

- `containsSyntheticMedia: True` — AI 생성 콘텐츠 고지 플래그를 API 레벨에서 강제. **우리 채널도 필수** (YouTube 정책상 합성/변조 콘텐츠 고지 의무).
- 제목은 LLM 생성(최대 100자), 설명은 caption(CTA로 끝나게 프롬프트됨), 태그는 hashtags에서 변환, 기본 제목 폴백은 `"Check out this video! #shorts #viral"`.

## 3. 자동화 관점 API 사용 예 (CLI 없이 API만으로)

```bash
# 1) 영상 생성 요청 (한국어 예시)
curl -X POST http://127.0.0.1:8080/v1/videos -H 'Content-Type: application/json' -d '{
  "video_subject": "AI 데이터센터 전력 수요 급증",
  "video_script": "",              # 비우면 LLM 생성
  "video_aspect": "9:16",
  "video_clip_duration": 4,
  "voice_name": "ko-KR-SunHiNeural-Female",
  "font_name": "NotoSansKR-Bold.ttf",
  "font_size": 64,
  "subtitle_position": "custom",
  "custom_position": 70,
  "bgm_type": "random",
  "bgm_volume": 0.15,
  "video_count": 1
}'
# → {"data": {"task_id": "..."}}

# 2) 완료까지 폴링
curl http://127.0.0.1:8080/v1/tasks/{task_id}
# state=1이면 data.videos[0] 다운로드 URL 사용
```

CLI도 동일 파라미터를 지원하므로(`python cli.py --subject ... --voice-name ... --close-on-complete`) GitHub Actions 등에서 서버 없이 배치 실행하는 경로도 열려 있다.
