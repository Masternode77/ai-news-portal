# 04. TTS와 자막 — voice.py / subtitle.py

## 1. TTS 라우팅 구조 (voice.py::tts)

**voice_name 문자열 프리픽스가 곧 라우터다.** 별도 설정 없이 음성 이름만으로 엔진이 결정된다:

| voice_name 형식 | 엔진 | 비고 |
|---|---|---|
| `zh-CN-XiaoxiaoNeural-Female` 등 (프리픽스 없음) | **edge-tts** (azure_tts_v1) | 기본값. 무료, 키 불필요. Microsoft Edge 음성 |
| `...Neural-V2` | Azure Speech SDK (azure_tts_v2) | 유료 키 필요, SSML 사용 |
| `siliconflow:{model}:{voice}-Gender` | SiliconFlow | 중국계 유료 |
| `gemini:{voice}-Gender` | Gemini TTS | |
| `mimo:{voice}-Gender` | Xiaomi MiMo TTS | 스타일 프롬프트 지원 |
| `elevenlabs:{voice_id}:{name}` | ElevenLabs | 다국어 품질 최상급 |
| `chatterbox:{voice}` | Chatterbox (자체 호스팅 OpenAI 호환 서버) | 로컬 TTS |
| `no-voice` 계열 sentinel | **무음 모드** | 아래 참고 |

- `-Female`/`-Male` 접미사는 UI 표시용이며 `parse_voice_name()`이 제거.
- 반환값은 항상 `SubMaker`(edge-tts의 자막 타임라인 객체) 또는 None(실패).

### 무음(no-voice) 모드의 영리한 설계

내레이션 없는 영상도 타임라인 기준이 필요하다. 그래서:

1. **글자 수 기반 길이 추정**: CJK 4.2자/초, 영단어 2.7단어/초, 기타 문자 4.0자/초, 문장마다 0.35초 휴지, 최소 3초.
2. FFmpeg `anullsrc`로 해당 길이의 **무음 mp3를 실제로 생성**해 오디오 파일 자리에 둔다.
3. SubMaker에 전체 텍스트를 균등 배분해 자막 타임라인도 만들어 준다.

→ 파이프라인의 다른 어떤 코드도 "무음 특수 케이스"를 몰라도 된다. **특수 케이스를 입구에서 일반 케이스로 변환하는 패턴.**

또한 빈 문자열은 무음으로 취급하지 않는다 — "빈 voice는 설정 파손일 가능성이 높으므로, 실제 오류를 정상 생성으로 위장하지 않는다"는 원칙이 주석에 명시돼 있다.

### edge-tts 사용 시 주의 (실전 노하우)

- 스트리밍 다운로드에 30초(설정 가능) 타임아웃. 조용히 멈추는 현상 대응.
- `voice_rate`는 `+20%` 형식 부호 있는 퍼센트로 변환.
- edge-tts 7.x부터 SubMaker 구조가 `cues`(TypedDict)로 바뀌어 legacy `subs/offset` 필드와 이중 호환 처리. **외부 라이브러리 마이너 업데이트가 자막 파이프라인을 통째로 깨는 사례** — 우리도 라이브러리 고정(pin) 필수.
- 무료 edge-tts는 상업 규모 사용 시 차단·품질 이슈 가능성 → 수익형 채널은 Azure Speech(동일 음성, 유료 키) 또는 ElevenLabs로.

## 2. TTS 타임라인 → 자막 파일 (voice.py::create_subtitle)

Edge/Azure TTS는 단어(또는 음절)별 타임스탬프를 준다. 이걸 그대로 자막으로 쓰면 단어가 뚝뚝 끊긴다. MPT의 해법:

```text
1) 대본을 문장부호 기준으로 분할 → script_lines (한·중·영·아랍 문장부호 전부 지원)
2) TTS cue를 앞에서부터 누적하며 문자열을 이어붙임
3) 누적 문자열이 script_lines[i]와 일치하는 순간 → 그 구간 [첫 cue 시작 ~ 마지막 cue 끝]을
   자막 1줄로 확정, 표시 텍스트는 "대본 원문"을 사용
4) 매칭 실패 대비 3단계 완화: 정확 일치 → 특수문자/밑줄 제거 후 일치 → 아랍어 자모 정규화 후 일치
5) 자막 줄 수 != 대본 문장 수면 파일을 쓰지 않고 경고 (불완전한 자막을 내보내지 않음)
```

핵심 통찰: **타이밍은 TTS에서, 텍스트는 대본에서.** TTS가 반환하는 텍스트는 정규화·발음 변형이 섞여 있어 그대로 자막에 쓰면 지저분하다. 시간 정보만 취하고 텍스트는 원문으로 갈아끼우는 것.

전처리(`_format_text`): `[](){}` 제거 — TTS는 이런 기호를 읽지 않아 cue에 안 나타나므로, 남겨두면 매칭이 영원히 실패하고 자막 파일이 아예 안 나오는 버그의 원인이었다고 주석에 기록.

## 3. Whisper 경로 (subtitle.py) — 커스텀 오디오용

`subtitle_provider="whisper"`일 때 (주로 직접 녹음한 오디오를 쓸 때):

- **faster-whisper** (기본 large-v3, CPU int8) 사용. `./models/whisper-{size}` 로컬 디렉터리가 있으면 오프라인 로드, 없으면 자동 다운로드.
- `word_timestamps=True` + VAD 필터(500ms 무음 기준)로 전사 → 문장부호 단위로 재분할해 SRT 생성.

### 전사 교정 알고리즘 (subtitle.py::correct) — 이 저장소의 백미

Whisper 전사는 대본과 미묘하게 다르다(동음이의어, 숫자 표기, 잡음). 교정 로직:

```text
대본 문장 리스트와 전사 자막 리스트를 투 포인터로 순회:
- 정확히 일치 → 그대로 통과
- 불일치 → 다음 자막들을 하나씩 병합해 가며 Levenshtein 유사도가 계속 오르는 동안 흡수
    - 병합 결과 유사도 > 0.8 → 자막 텍스트를 "대본 문장"으로 교체 (시간 구간은 병합 범위)
    - 그래도 낮으면 → 역시 대본 문장으로 교체하되 Mismatch 경고 로그
- 대본이 남으면 남은 자막 시간대에 이어 붙이고, 자막이 모자라면 00:00:00 placeholder
```

→ 결과: **화면 자막은 항상 대본과 100% 일치**하고, 타이밍만 전사에서 온다. TTS 경로와 같은 철학("타이밍은 오디오에서, 텍스트는 대본에서")을 다른 수단으로 구현한 것.

- Levenshtein은 외부 패키지 없이 직접 구현(50줄). 유사도 = `1 - distance/max_len`.
- SRT 파서에 "마지막 블록 뒤 빈 줄이 없으면 마지막 자막이 유실되는" 엣지 케이스 수정이 커밋되어 있음 — SRT를 직접 다룰 때 흔한 함정.

## 4. 음성 목록 관리

- Azure/Edge 음성 목록은 `resource/`의 JSON에서 로드하고 locale 필터 지원 (WebUI에서 언어별 필터링).
- ElevenLabs는 API로 즐겨찾기 음성 동적 조회, Chatterbox는 config의 `voices` 배열, SiliconFlow/Gemini/MiMo는 하드코딩 목록.
- WebUI에서 실시간 미리듣기 제공 + **전체 대본 미리듣기 결과를 본 생성에서 재사용**(같은 파라미터일 때) — TTS 비용 절약 패턴.

## 한국어 채널 적용 메모

- edge-tts 한국어 음성: `ko-KR-SunHiNeural-Female`, `ko-KR-InJoonNeural-Male` 등이 무료로 사용 가능. 초기 실험은 edge-tts, 수익화 후 Azure Speech 정식 키(같은 음성) 또는 ElevenLabs 다국어 v2 전환이 정석 루트.
- 한국어 문장부호 분할은 MPT의 PUNCTUATIONS에 이미 호환(`。！？` 등 전각 포함). 다만 한국어는 마침표 없이 어미로 끝나는 문장이 많아, **대본 생성 프롬프트에 "문장마다 마침표를 찍어라"를 추가하는 게 자막 분할 품질에 결정적**일 것.
- 자막 폰트: 기본 STHeitiMedium.ttc는 한글 글리프가 불완전할 수 있음. `resource/fonts/`에 Pretendard/Noto Sans KR을 넣고 `font_name`으로 지정하면 됨. MPT에는 **폰트가 해당 문자 글리프를 지원하는지 PIL로 검사하는 함수**(`subtitle_font_supports_text`)까지 있어 WebUI에서 경고를 띄운다.
