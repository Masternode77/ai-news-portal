# 03. LLM 활용 — 프롬프트 설계와 멀티 프로바이더 추상화

LLM이 관여하는 지점은 정확히 3곳이며(`app/services/llm.py`), 전부 **단발성 단일 user 메시지 호출**이다. 시스템/유저 메시지 분리도, function calling도, 스트리밍(모델스코프 제외)도 쓰지 않는다. 단순함이 20개 프로바이더 호환의 비결.

## 1. 대본 생성 프롬프트 (원문 전문)

```text
# Role: Video Script Generator

## Goals:
Generate a script for a video, depending on the subject of the video.

## Constrains:
1. the script is to be returned as a string with the specified number of paragraphs.
2. do not under any circumstance reference this prompt in your response.
3. get straight to the point, don't start with unnecessary things like, "welcome to this video".
4. you must not include any type of markdown or formatting in the script, never use a title.
5. only return the raw content of the script.
6. do not include "voiceover", "narrator" or similar indicators of what should be spoken at the beginning of each paragraph or line.
7. you must not mention the prompt, or anything about the script itself. also, never talk about the amount of paragraphs or lines. just write the script.
8. respond in the same language as the video subject.

# Initialization:
- video subject: {video_subject}
- number of paragraphs: {paragraph_number}
- language: {language}          ← 지정 시에만 추가

# Additional User Requirements:
{video_script_prompt}           ← 사용자가 추가 요구 넣을 때만 추가
```

**설계 포인트 (숏츠 대본에 그대로 적용할 것):**

- "welcome to this video" 류 인사말 금지 → 숏츠는 첫 1초 훅이 생명.
- 마크다운/제목/내레이터 표기 전면 금지 → 출력이 곧 TTS 입력이므로 **읽히지 않을 문자가 하나도 없어야** 한다.
- 언어는 "주제와 같은 언어로" — 한국어 주제를 넣으면 한국어 대본이 나온다.
- `custom_system_prompt`(최대 8,000자)로 룰 전체를 갈아끼울 수 있지만, 주제·문단수·언어 등 런타임 컨텍스트는 항상 뒤에 붙는 구조(고급 사용자가 오버라이드해도 필수 파라미터 누락 방지).
- 후처리: `*`·`#` 제거, `[...]`·`(...)` 제거(마크다운 링크 잔재), `<think>...</think>` 블록 제거(DeepSeek R1 류 추론 모델 대응), 개행 정리. **LLM 출력을 신뢰하지 않고 반드시 세척하는 습관.**
- 재시도 5회, 중국 프로바이더의 "당일 쿼터 소진" 문구까지 오류로 감지.

## 2. 검색어 생성 프롬프트 (원문 요약)

```text
# Role: Video Search Terms Generator

## Goals:
Generate {amount} search terms for stock videos, depending on the subject of a video.
  (순서 매칭 모드: "... chronological stock-video search terms that follow
   the order of topics in the video script.")

## Constrains:
1. the search terms are to be returned as a json-array of strings.
2. each search term should consist of 1-3 words, always add the main subject of the video.
3. you must only return the json-array of strings. ...
4. the search terms must be related to the subject of the video.
5. reply with english search terms only.
(순서 모드 6.: keep the terms in the same order as the script narration; ...)

## Output Example:
["search term 1", ..., "search term 5"]

## Context:
### Video Subject / ### Video Script (전문 포함)

Please note that you must use English for generating video search terms; Chinese is not accepted.
```

**설계 포인트:**

- **스톡 사이트 검색은 영어가 절대적으로 유리** → 대본 언어와 무관하게 검색어는 영어 강제. 한국어 채널을 만들어도 이 원칙은 유지해야 함.
- 1~3단어 + 항상 메인 주제 포함 → 너무 구체적이면 검색 결과 0건, 너무 일반적이면 관련성 저하를 동시에 방지.
- 기본 5개, 순서 매칭 모드 8개(긴 대본 커버리지). 순서 모드에선 예시 배열 길이도 amount에 맞춰 동적 생성 — **예시 개수가 출력 개수를 앵커링하는 현상까지 고려**.
- 파싱 방어: 코드펜스 제거 → `json.loads` → 실패 시 정규식 `\[.*\]` 추출 재시도 → 문자열 리스트 타입 검증. `Error:` 응답은 빈 리스트 반환(문자열을 그대로 흘리면 하위 로직이 글자 단위로 순회하는 사고 방지 — 주석에 명시된 실제 교훈).

## 3. 소셜 메타데이터 프롬프트 (발행용 제목/설명/해시태그)

```text
# Role: Short-Video Social Media Copywriter

## Goal
Write engaging publishing metadata for a short video that will be posted on {platform}.

## Constraints
1. Respond ONLY with a single valid minified JSON object. ...
2. The JSON must contain exactly these keys: "title", "caption", "hashtags".
3. "title": a catchy hook, at most {title_max} characters.
4. "caption": an engaging description that ends with a call to action, at most {caption_max} characters.
   Do not put hashtags inside the caption.
5. "hashtags": a JSON array of exactly {hashtag_count} strings. Each must start with "#", ...
6. {언어 지시: auto면 "대본 언어를 따르라", 지정 시 해당 언어}
```

**플랫폼별 상한 테이블 (그대로 재사용 가치 높음):**

| 플랫폼 | title | caption | hashtags |
|---|---:|---:|---:|
| tiktok | 100 | 2,200 | 5 |
| **youtube_shorts** | **100** | **5,000** | **3** |
| instagram_reels | 125 | 2,200 | 8 |
| facebook_reels | 125 | 2,200 | 5 |

- 후처리: 길이 clamp, 해시태그 정규화(`#` 부착, 특수문자 제거, 중복 제거, `du lich`→`#dulich`처럼 배열 항목은 공백 압축), 개수 제한.
- **LLM 실패 시 휴리스틱 폴백**: 제목=주제(없으면 대본 첫 문장), 캡션=대본, 해시태그=`#shorts #viral #trending...` 범용 세트 — 발행 API가 절대 빈 구조를 받지 않게 보장.

## 4. 프로바이더 추상화 (models/llm_provider.py + llm.py)

- **레지스트리 패턴**: 프로바이더마다 `id, adapter, default_model, default_base_url, deprecated_*, requires_api_key/model/base_url, extra_fields`를 선언. 설정 키는 `{provider}_{suffix}` 규칙으로 자동 매핑.
- 지원 (2026-07 기준): moonshot(Kimi, 기본값, kimi-k3), openai(gpt-5.5), gemini(gemini-3.1-pro-preview), deepseek(deepseek-v4-pro), qwen, azure, volcengine(Dola Seed), grok(grok-4.3), minimax(MiniMax-M3), mimo, cloudflare_ai_gateway, modelscope(GLM-5.2), aihubmix, aimlapi, evolink, ollama(로컬), oneapi, **litellm**(사실상 만능 어댑터), groq(llama-3.3-70b), pollinations.
- adapter는 6종뿐: `openai_compatible`(대부분) / `azure` / `gemini` / `qwen(dashscope)` / `cloudflare_ai_gateway` / `litellm` / `modelscope(스트리밍)`. **"OpenAI 호환 + 예외 어댑터 소수" 구조가 유지보수 핵심.**
- deprecated 모델/URL을 레지스트리에 등록해 두고, 사용자가 옛 값을 쓰면 경고 로그 + 신값 자동 폴백.
- `test_connection()`: `"Reply with exactly: OK"` 최소 프롬프트로 키·URL·모델 전체 경로 검증 (사용자 대본을 보내지 않음, 소요시간 측정 포함) — WebUI의 "연결 테스트" 버튼용.

## 우리 채널 적용 메모

- Claude API를 쓸 경우: `litellm` 어댑터(`anthropic/claude-sonnet-5` 형식) 또는 OpenAI 호환 게이트웨이를 통하면 코드 수정 없이 붙는다. 직접 이식한다면 `_generate_response()` 하나만 교체하면 됨.
- ai-news-portal은 이미 OpenRouter(`openai/gpt-5.3-codex`)를 쓰므로, MPT의 openai 어댑터에 base_url만 OpenRouter로 주면 그대로 호환된다.
- 대본 프롬프트에 뉴스 기사 본문을 `video_script_prompt`(추가 요구, 2,000자 제한)로 넣는 방식보다는, **기사 요약을 주제(video_subject)로, 기사 본문 요지를 custom 대본으로 직접 생성해 넣는 편**(LLM 1회 호출로 우리가 통제)이 뉴스 정확성 면에서 안전하다 — 07 문서에서 상세 설계.
