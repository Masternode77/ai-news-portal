# 3d Generation — news_brief — 레거시 노트 (유지 / 버릴 / 바꿀)

읽은 레거시: `scripts/lib/content.mjs`(enrichContent 인라인 프롬프트·폴백), `scripts/lib/expert-lens.mjs`(Expert Lens 인라인 프롬프트·blueprint), `scripts/lib/editorial-humanizer.mjs`(EDITORIAL_HUMANIZER_PROMPT), `scripts/lib/banned-phrases.mjs` + `config/{bannedPhrases,forbiddenPublicPhrases,copyrightSafeTransformationPolicy}.yml`, `scripts/lib/{numeric-claim-verifier,unsupported-claim-guard,source-fidelity-claim-check}.mjs`, `scripts/lib/autonomous-desk-utils.mjs`(extractNumericClaims), `scripts/lib/openrouter.mjs`(호출 모양만), `prompts/{senior-editor-rewrite,narrative-dna}.ko.txt`. 코드는 한 줄도 옮기지 않았다(P9). 프롬프트는 의도·금지 규칙만 추려 `prompts/news_brief.md`에 한국어로 새로 썼다.

## 0. 실측 요약

| 항목 | 레거시 | 근거 |
|---|---|---|
| 생성 단계 | 두 번의 LLM 호출: ① `enrichContent` — 영문 `summary`(≤180자)·`insight`(≤260자)·분류(카테고리·레이어·이해관계자·기사 유형·지역·urgency)·태그·이미지 프롬프트·(구독 모드) `source_expert_insight` 10필드를 JSON으로 ② `expert-lens` — blueprint 구조의 영문 장문(`finalArticleBody` ≥ 1,000자, 제목 5안, executive summary 3줄 등 17키) | `content.mjs:159-184`, `expert-lens.mjs:384-426` |
| 공급자 | OpenRouter 경유(`callOpenRouterJson`), `LLM_PROVIDER=subscription`일 때만 실제 호출, `disabled`면 휴리스틱 폴백 문장(`fallbackSummary`/`fallbackInsight` 템플릿) | `content.mjs:29-58`, `openrouter.mjs` |
| 출력 언어·포맷 | 영문 메모. 한국어 필드 없음. 리더 페이지는 `summary`·`insight`·`finalArticleBody`를 그대로 노출 | `content.mjs`, `expert-lens.mjs` |
| 근거 규칙 | "Do not invent facts or numbers not supported by the source text"; 구독 모드에서는 `source_expert_insight.source_evidence`에 원문 발췌를 필드별로 요구하고 `validateSourceExpertInsight`가 발췌 존재를 검사 | `content.mjs:170-184` |
| 수치 검증 | `extractNumericClaims`(달러·단위·비교어 파싱) → `numericClaimKey` → 원문·claim ledger에 같은 키가 있는지. `unsupportedClaimGuard`가 미지원 수치를 reason으로 모음. `source-fidelity-claim-check`는 문장 단위로 수치·대문자 행위자·어휘 겹침(≥34%)을 검사 | `autonomous-desk-utils.mjs:141-`, `unsupported-claim-guard.mjs`, `source-fidelity-claim-check.mjs` |
| 인용·재서술 정책 | `copyrightSafeTransformationPolicy.yml`: 단락 중복 ≤ 0.22, 문장 재사용 ≤ 0.15, "짧은 발췌만" | `config/copyrightSafeTransformationPolicy.yml` |
| 금칙어 | `bannedPhrases.yml` 44구 + `blockedHookStarts` 11구, `forbiddenPublicPhrases.yml`(보일러플레이트·저작권 문구), `forbiddenAIPhrases.yml` — 영문 템플릿 문구 중심. 검사기 `bannedPhraseMatches()`는 객체를 반환하는데 `.length`를 검사해 미작동(Phase 0 D2) | `banned-phrases.mjs`, `authored-column-policy.mjs:211` |
| 보이스 지시 | EDITORIAL_HUMANIZER_PROMPT: "무엇이 바뀌었나 → 왜 지금 중요한가 → 간과된 제약 1~2 → 독자별 실무 함의 → 다음에 볼 것" 순서, 컨설팅 메모 금지, 템플릿 문구 금지, 수치·인용·동기 창작 금지 | `editorial-humanizer.mjs:83-94` |
| 토큰·비용 | `maxTokens` 700/1600(enrich), 2600(lens). 비용 집계 없음(OpenRouter 시절 토큰 최대 37.9k/런) | ADR-007 §비용 |
| 실패 처리 | 구독 모드 실패는 `rethrowSubscriptionFailure`로 런 전체 abort(원장 기록 전) | `openrouter.mjs`, CLAUDE.md §7 |

## 1. 유지 (의도·규칙을 가져온다)

| 규칙 | 내용 | 새 위치 | 근거 |
|---|---|---|---|
| 원문이 사실의 권위 | 원문에 없는 수치·고유명사·동기 창작 금지, 불확실성 보존 | `prompts/news_brief.md` 금지 조항 + 3d 결정적 grounding 검사(§3) | `content.mjs:170`, humanizer |
| 서술 순서 | 무엇이 바뀌었나 → 왜 중요한가 → 제약·2차 효과 → 다음에 볼 것 | `summary_ko` → `why_it_matters_ko` → `expert_lens_ko` 필드 역할로 고정 | humanizer |
| 템플릿 문구·메모 스캐폴딩 금지 | "For investors / For operators" 반복, "strategic significance" 류 | 정본 인벤토리 `config/banned-phrases.yaml`(한국어 문구 5 + 패턴 6 + 레거시 영문 43/11구 데이터 이관) → 프롬프트 `{{banned_phrases}}` 렌더링 + 3d 가드가 초안마다 `checks.banned` 보고; 차단은 3g `BANNED_PATTERN`(Codex PR #65 P1: 목록을 프롬프트에 하드코딩하지 않는다, AGENTS.md) | `bannedPhrases.yml`, `banned-phrases.mjs` |
| 짧은 인용만 | 연속 인용 1회·20단어 이내(Josh 결정, ADR-004) | 프롬프트 + 3d가 `quote_max_words`를 측정해 보고(차단은 3g `QUOTE_TOO_LONG`) | `copyrightSafeTransformationPolicy.yml` |
| 수치 grounding | 초안의 모든 숫자가 원문(제목·본문·발행일)에 있어야 한다 | `stages/generate.ts` `groundingCheck()` — 숫자 토큰 집합 비교, 결과를 draft `body.checks`와 stats로 보고 | `unsupported-claim-guard.mjs` |
| JSON 구조 출력 | 키 고정 JSON만 반환 | Anthropic tool_use 구조화 출력(`input_schema` = zod → JSON Schema), 응답을 zod로 재검증 | `content.mjs:162` |
| 태그 ≤ 6 | 소문자 짧은 태그 | `NewsBrief.tags` 1~6 | `content.mjs:176` |

## 2. 버릴 것

| 항목 | 이유 | 근거 |
|---|---|---|
| 영문 메모 2단 생성(enrich + lens 17키) | 리더 산출물은 한국어 `news_brief` 1건(Appendix A). 분류·이미지 프롬프트·blueprint·제목 5안은 3d 범위 밖(이미지 프롬프트는 3f, 분류는 태그로 축소) | 브리프 Appendix A |
| OpenRouter 경유·`subscription` 모드 분기 | ADR-002: Anthropic 직접 호출, 어댑터 뒤에서. 공급자별 분기는 어댑터 선택으로 | ADR-002 |
| 휴리스틱 폴백 문장(`fallbackSummary`/`fallbackInsight`) | 템플릿 문장을 발행하던 경로. 새 구조는 LLM이 없으면 초안을 쓰지 않는다(`llm.provider: disabled` → 스테이지 실패를 dead letter로 기록, 발행 0) | `content.mjs:29-58`, R6 |
| `source_expert_insight` 10필드 + 발췌 배열 | 근거는 결정적 검사(수치·인용 길이)로 대체, 행위자 검사는 3g `UNGROUNDED_ENTITY` | `content.mjs:178-184` |
| 실패 시 런 abort | 후보 1건의 생성 실패는 그 후보만 dead letter; 런은 계속(ADR-007) | `openrouter.mjs` |
| 영문 금칙어 목록의 프롬프트 통째 삽입 | 영문 43구는 `config/banned-phrases.yaml` `phrases.en`(가드 전용)으로 이관하고, 프롬프트에는 출력 언어(한국어)의 문구와 패턴 설명(`note`)만 같은 파일에서 렌더링한다 | `bannedPhrases.yml` |

## 3. 바꿀 것

| 항목 | 새 설계 | 비고 |
|---|---|---|
| 입력·출력 | `GenerateInput { selected, rawItems, sources }` → `GenerateOutput { drafts: DraftInsert[], stats }`. 선택 후보마다 raw item(제목·본문·발행일)과 소스(이름·권리·범위)를 찾아 **소스 패킷** JSON을 user 메시지로 보낸다 | contracts §1 개정 |
| 프롬프트 파일 | `prompts/news_brief.md` — front matter `{ task, version, model_hint, output_schema, max_output_tokens }` + 본문(system prompt, 한국어). `drafts.prompt_version = version`. 로더 `adapters/prompts`(`StageAdapters.prompts`), CLI `--prompts-dir`. 본문의 `{{banned_phrases}}`는 `ctx.bannedPhrases`(`config/banned-phrases.yaml`, CLI `--banned-phrases`)에서 `renderTemplate`(strict)로 렌더링 — 프롬프트 파일에 금지 표현 목록이 없다(Codex PR #65) | contracts §4·§6 |
| LLM 출력 스키마 | `NewsBriefDraft { title_ko, summary_ko, why_it_matters_ko, expert_lens_ko, tags }`만 모델이 쓴다. `source_url`·`source_name`·`published_at_source`·`slug`는 스테이지가 결정적으로 채운다(모델이 출처를 지어낼 수 없음) | Appendix A |
| slug | `news/` + sha1(`canonical_url|title`)[0:16] (`newsBriefSlug()`, 레거시 규칙 유지) | contracts §5 |
| 행 id | `candidates.id = candidateId(raw_item_id, rubric_version)`, `drafts.id = draftId(candidate_id, content_type, prompt_version)` — 3b의 `raw_items.id`처럼 결정적 파생, upsert 전에 찍음 | contracts §5 개정 |
| Anthropic 어댑터 | `adapters/llm/anthropic.ts`: `ctx.fetch`로 Messages API 직접 호출(`--replay`에서는 자동 차단), tool_use 구조화 출력, `llm.pricing[model]`로 비용 계산, 429/5xx 재시도(`llm.max_retries`), `llm.timeout_ms`. 키는 `ANTHROPIC_API_KEY`(이름만; CLI가 `llm.provider: anthropic`일 때 요구). SDK(`@anthropic-ai/sdk`)는 패키지 추가 승인 후 교체 가능 | ADR-002, CLAUDE.md §3 |
| 비용 가드 | 호출 전 `budget.canSpend(추정)`(입력 글자/4 + max_output_tokens × 단가), 어댑터가 실제 비용 `record`. 첫 후보부터 불가면 `BUDGET_EXCEEDED`(런 `budget_stop`), 도중 불가면 남은 후보를 `budget_stopped`로 보고하고 `ctx.budget.stop(reason)`으로 러너에 알린다 → 런 상태 `budget_stop`(exit 1), 완료된 초안은 다음 스테이지로 흐름(Codex PR #65) | ADR-007 |
| 검사(3d 범위) | ① 스키마: 응답 JSON → `NewsBriefDraft` zod. 실패 → dead letter `SCHEMA_INVALID`, 초안 미기록 ② grounding: 초안 숫자 토큰 ⊆ 원문 숫자 토큰(제목·본문·발행일·소스명); 단위어가 붙은 수치(`2.1 million`·`21억`)는 정규화 값으로만 대조하고(`2.1 million`은 `$2.1 billion`에 근거하지 않음), 단위어 없는 수치만 원문 숫자 표기로도 인정(Codex PR #65). 결과 `checks.grounding { numbers, ungrounded, pass }` ③ `checks.quote_max_words`: 초안과 원문의 최장 연속 공통 단어 수 ④ banned: `config/banned-phrases.yaml`의 문구(ko·en)·hook start·패턴 정규식을 독자 노출 필드 4개(`title_ko`·`summary_ko`·`why_it_matters_ko`·`expert_lens_ko`)에 매치 → `checks.banned { version, matches: ["phrase:…" \| "hook_start:…" \| "pattern:<name>"], pass }`(`checks/banned-phrases.ts`, Codex PR #65). 3d는 **보고**만 하고 차단은 3g | 브리프 3d 완료 기준 |
| draft 행 | `{ candidate_id, run_id, content_type: news_brief, prompt_version, model, body: { brief: NewsBrief, checks, source: { raw_item_id, canonical_url, text_rights, chars } }, input_tokens, output_tokens, cost_usd, review_status: none }`, upsert(`candidate_id, content_type, prompt_version`) | ADR-003 |
| fixture 어댑터 | `LlmRequest.cacheKey`(선택, `news_brief:<raw_item_id>`)로 `fixtures/llm/<task>/<key>.json`을 먼저 찾고 없으면 `<task>.sample.json` | R7 |
| 플래그 | `flags.stages.generate: false`(기본 OFF). 테스트·CI smoke는 `CC_FLAG_STAGES_GENERATE=true` + `llm.provider: fixture` | 공통 절차 5 |
| 관측 | `stage_events.counts { selected, drafted, failed, budget_stopped, grounding_checked, grounding_passed, quote_max_words, banned_passed, cost_usd_milli }`, `--json` `generateStats`(비용·토큰·grounding 통과율·`quote_max_words`·`banned { checked, passed, matches }`·건별 decisions에 `banned_matches`), step summary 절(banned 열) | ADR-007 |

## 4. 완료 기준 대조

| 기준(브리프 3d) | 결과 | 근거 |
|---|---|---|
| fixture 입력 → 스키마 통과 초안 | 통과 | `scoring` fixture의 선택 2건 → `drafts` 2행(`NewsBrief` zod 통과; 출처·날짜·slug는 스테이지가 채움). 재런은 같은 `(candidate_id, content_type, prompt_version)` 행 upsert — `generate-stage.test.ts`, `cli.test.ts`, CI `generate-dry-run` smoke(선택 2·초안 2·실패 0·grounding 2건 검사 1건 통과) |
| 수치 grounding 검사 통과율 보고 | 통과 | `stage_events.counts { grounding_checked, grounding_passed }`, `--json` `generateStats.grounding { checked, passed, numbers, ungrounded }` + `grounding_pass_rate`, 건별 `decisions[].grounding_ungrounded`, step summary 절. fixture: 2건 중 1건 통과(KEPCO 초안의 "2027"은 원문에 없는 수치 — fixture가 일부러 넣은 것) |
| 출처 링크 필수 | 통과 | `source_url`·`source_name`·`published_at_source`는 모델 출력 스키마(`NewsBriefDraft`)에 없고 스테이지가 raw item·source 행에서 채운다. 모델이 출처를 지어낼 경로가 없다 |
| 원문 연속 인용 제한 | 보고 | 프롬프트 규칙(원문 표현 그대로는 ≤20단어 1회) + `checks.quote_max_words`(초안과 원문의 최장 연속 공통 단어 수) 기록. 차단은 3g QA 규칙 |
| 한국어 Expert Lens 포함 | 통과 | `expert_lens_ko`(Appendix A zod, 150자 이상)를 프롬프트가 역할·금지 표현과 함께 요구 |
| 금칙어 정본 하나(AGENTS.md) | 통과 | `config/banned-phrases.yaml` 한 파일이 프롬프트 줄(`{{banned_phrases}}`)과 초안 가드를 모두 먹인다. `banned-phrases.test.ts`: 프롬프트 파일에 한국어 금칙어가 한 구도 없고 placeholder만 있음, 렌더링 결과에 5구·패턴 설명 6개 포함, 영문 가드 전용 항목 미포함; 더러운 초안은 종류별로 1회씩 `phrase:`/`hook_start:`/`pattern:` 보고, 깨끗한 초안은 `pass`; 미해결 placeholder는 호출 0회로 실패 |
| LLM 어댑터 뒤에서 호출 | 통과 | 스테이지는 `ctx.adapters.llm.complete()`만 호출. `fixture`(녹화)·`anthropic`(`ctx.fetch`)·`disabled` 교체는 CLI `llm.provider` |
| 프롬프트 파일화(버전 관리) | 통과 | `prompts/news_brief.md` front matter `version: 2026-10-23.1` → `drafts.prompt_version`; `PromptRegistry`가 로드·strict 검증(`parsePromptFile` 테스트) |
| 플래그 기본값 OFF | 통과 | `flags.stages.generate: false`; 기본 런은 `generate: skipped (flag_off)`, 증거 런은 `CC_FLAG_STAGES_GENERATE=true` |
| 비용 상한(ADR-007) | 통과 | 호출 전 추정치(입력 글자/3 + `max_output_tokens`, `llm.pricing`)로 `budget.canSpend`; 첫 후보부터 불가 → `BUDGET_EXCEEDED`로 런 중단, 도중 불가 → 남은 후보 `budget_stopped` 보고 + `budget.stop()` → 런 `budget_stop`·exit 1·초안 보존(스테이지·러너·CLI 테스트) |
| 네트워크 0(R7) | 통과 | fixture 어댑터는 `fixtures/llm/news_brief/<raw_item_id>.json`만 읽는다. Anthropic 어댑터는 `ctx.fetch`만 써서 `--replay`에서는 throw(테스트) |

### 4.1 fixture dry-run (`scoring`, 2026-10-24T00:36Z, PR #65 Codex 4라운드 반영)

`CC_FLAG_STAGES_NORMALIZE=true CC_FLAG_STAGES_SCORE=true CC_FLAG_STAGES_GENERATE=true npm run v2:pipeline -- run --dry-run --replay --fixture scoring --sources fixtures/sources/scoring.yaml --stage ingest,normalize,score,generate --json` → `done`, funnel `items_scored 13 → passed_gate 6 → drafts 2`. `generateStats`: 선택 2 · 초안 2 · 실패 0 · budget_stopped 0 · grounding 1/2(숫자 10개 중 미근거 1) · `quote_max_words` 2 · banned 2/2 통과(매치 0; 인벤토리 `2026-10-24.1`) · USD 0(fixture; 3,600 in / 1,800 out) · 49 ms. counts `{ selected 2, drafted 2, failed 0, budget_stopped 0, grounding_checked 2, grounding_passed 1, quote_max_words 2, banned_passed 2, cost_usd_milli 0 }`.

| ok | 소스 | 제목(ko) | slug | 숫자 | 미근거 | 최장 공통 run | 금칙어 매치 |
|---|---|---|---|---|---|---|---|
| ✓ | wire-a (t1 full) | Microsoft, 부산 AI 데이터센터 캠퍼스에 1.2 GW 용량 계약 체결 | `news/920a329a451a5000` | 7 | – | 2 | – |
| ✓ | wire-b (t2) | 한전, 새만금 데이터센터 클러스터용 345 kV 변전소 가동 | `news/732e5467dd67c011` | 3 | 2027 | 2 | – |

녹화 응답은 **합성**이다(손으로 쓴 `NewsBriefDraft`, 모델 출력 아님; `fixtures/README.md`). `sample` fixture는 3c 통과 0 → 선택 0 → 초안 0. 검사 수준: grounding은 한국어 단위어(조·억·만·천)·영어 scale(billion·million…)을 값으로 비교하고 서수·단위 접미(1단계·2호기 등)는 제외한다; 1.2 GW와 1,200 MW처럼 단위 환산은 하지 않는다(미근거로 보고될 수 있음 — 3g에서 판단).

테스트: `generate-stage.test.ts` 7(금칙어 보고·미해결 placeholder 실패 포함), `banned-phrases.test.ts` 5, `anthropic-adapter.test.ts` 5(가짜 fetch: 강제 tool 호출·429/5xx 백오프·4xx 즉시 거부·타임아웃·본문 읽기 재시도·replay 차단·가격 없는 모델 거부), shared `parsePromptFile` 1 + `banned-phrases.yaml` strict 로드 1 → 전체 183, `v2:typecheck` 0 errors.

### 4.2 라이브 실행 (2026-10-30, Phase 4 첫 staging 런)

- **첫 호출은 400** — run 41026056302(`rebuild/v2` `9ef757d9`, `llm_provider=anthropic`, 선택 2건): 두 호출 모두 `LLM_REQUEST_REJECTED: http 400 … tool_choice: type "tool" and "any" are not supported for this model.` Claude Opus 5.5(및 Fable 5.1·Sonnet 5.5)는 강제 tool 호출을 거부한다(공식 가이드 "Breaking change: forced tool use is rejected"; 모델 제한이지 thinking 때문이 아님). 초안 0 → dead letter 2, 비용 0.00, 런 `partial`. fixture 테스트로는 잡을 수 없는 종류의 결함이었다.
- **수정** — `adapters/llm/anthropic.ts`: 구조화 출력을 `tools` + `tool_choice` 대신 **`output_config.format = { type: json_schema, schema }`**로 요청하고 응답 text 블록을 JSON으로 파싱해 `json`으로 돌려준다(추출 목적의 강제 호출은 structured outputs로 대체하라는 가이드 그대로). API가 받는 스키마는 `toStructuredOutputSchema()`가 만든다: `$schema`·`minLength`/`maxLength`·`pattern`·`minimum`/`maximum`·`multipleOf`·`minItems`/`maxItems` 등 거부되는 제약을 제거하고 모든 object에 `additionalProperties: false`(필수)를 둔다. 제약은 스테이지가 zod `NewsBriefDraft`로 그대로 검증한다(`SCHEMA_INVALID`). 속성 이름은 키워드로 취급하지 않는다(`pattern`이라는 필드가 살아남는 테스트). thinking은 모델 기본(adaptive)에 두고 `max_tokens`가 thinking + 본문의 상한이므로 `prompts/news_brief.md` `max_output_tokens`를 2500 → **8000**으로 올렸다(규칙·문체 불변이라 `version` 유지; 예산 추정은 호출당 ≈ 4,000토큰 × $4/M + 8,000 × $20/M ≈ $0.18, 런당 2건 ≈ $0.35 — `budget.run_usd 2.0` 안). 테스트 `anthropic-adapter.test.ts` 6건(요청 모양·스키마 정리·재시도·타임아웃·파싱).
- **재실행 결과**는 `docs/shadow/compare.md` 런 표에 적는다(통과율·비용·stop_reason).

## 5. 열린 질문

1. **SDK vs 직접 호출** — 현재 `ctx.fetch`로 Messages API를 직접 호출한다(패키지 추가 0, replay 차단 자동). `@anthropic-ai/sdk` 도입은 패키지 추가 승인 항목이고, 도입하더라도 `ctx.fetch`를 custom fetch로 주입해 R7을 유지해야 한다. 권고: 라이브 측정 전까지 현 상태 유지.
2. **`SCHEMA_INVALID` 재시도** — 지금은 1회 호출 후 dead letter(초안 미기록). 스키마 이탈 시 수정 지시를 붙여 1회 재요청할지는 비용 ×2 대 드랍률의 문제라 라이브 측정 후 결정(Phase 4).
3. **link_only 소스** — 선택되면 제목·스니펫만으로 브리프를 쓴다(패킷 note가 모델에 알림). 3c가 reader_value 0.1로 사실상 걸러내지만, 생성 자체를 막을지(3c tier 상한)는 Josh 결정.
4. **실제 모델 출력의 grounding 통과율** — fixture는 합성이라 미측정. Anthropic 키 수령 후 §4.2로 측정하고 `insight_trigger`·프롬프트 규칙을 조정한다.
5. **프롬프트 캐싱·배치** — system prompt `cache_control`과 Batches API는 비용 절감 후보지만 런당 2~4건이라 Phase 4 이후.
6. **한·영 동일 사건** — 3c 열린 질문 그대로: 같은 사건 2건이 모두 선택되면 브리프도 2건이다. 3c(묶기) 또는 3g(중복 QA)에서 처리.
7. **model_hint vs config** — 프롬프트의 `model_hint`는 문서용이고 실제 모델은 `llm.models.news_brief`다. 둘이 다르면 경고만 할지, config가 항상 이기게 둘지(현재) 확정 필요.
8. **금칙어 인벤토리 공존** — Phase 5까지 레거시 `config/bannedPhrases.yml`(레거시 가드 `scripts/lib/banned-phrases.mjs`가 읽음, 손대지 않음 — CLAUDE.md §6)과 리빌드 `config/banned-phrases.yaml`이 공존한다. 영문 43/11구는 데이터로 이관해 두 파일의 내용이 같고, 한국어 문구·패턴은 새 파일에만 있다. 컷오버 PR에서 레거시 파일·가드를 퇴역시키고 AGENTS.md의 정본 경로를 새 파일로 바꾼다.
9. **structured outputs 후속** — `stop_reason: max_tokens`(JSON 잘림)·`refusal`은 지금 `SCHEMA_INVALID` dead letter로만 남는다. 라이브 발생률을 보고 `max_output_tokens`·`output_config.effort`(기본 medium) 조정 여부를 정한다. `strict: true` 도구 방식은 쓰지 않는다(도구 호출이 필요 없는 추출).
10. **거절 초안 재생성 루프(2026-10-30 run 2·3)** — 선택은 매 런 전체 풀을 재채점하고(3c, 이월 없음) 3b 중복 제거는 발행본만 보므로, hard-QA로 거절된 후보가 피드에 남아 있는 동안 같은 2건이 매 런 다시 선택·생성된다(런당 ≈ $0.09, 3런/일 ≈ $0.26/일 — 예산 안이지만 낭비이고 신규 후보 슬롯을 막는다). 제안(Phase 4 소규모 PR, 승인 필요): 3c 선택 직전에 `drafts`에서 같은 `candidate_id`·`content_type`·현재 `prompt_version`의 초안이 `review_status = rejected`(hard)이면 선택에서 제외하고 `candidates.reject_reason = PREVIOUSLY_REJECTED`로 남긴다(프롬프트·QA `version`이 오르면 다시 자격). 보류(`pending`) 초안은 Josh 판정 전까지 제외. → **구현(2026-10-30, Josh 승인)**: `config/scoring.yaml` `selection.skip_review_status: [rejected, pending]`(rubric version 2026-10-30.1) + `score.ts` `reviewedRawItems`(`candidates`→`drafts` 조인, rubric 버전 무관, 프롬프트 `version`으로 재자격), `ScoreStats.skipped_reviewed`; 3c notes §5-6.
11. **grounding 숫자 축약 — 확정(2026-10-31, `shadow-review` run 41164162469)**: run 3 샘플 "450억"은 **미탐**이다. 원문 피드 발췌에 "a proposed $45B NAND flash fab"가 있고 초안은 "450억 달러(45B 달러)"로 썼는데, `NUMBER`(`generate.ts`)가 `billion/bn/million/mn/thousand`·조/억/만/천만 스케일로 읽고 `B/M/K` 축약은 모르기 때문에 원문 45(비스케일) vs 초안 4.5e10(스케일)로 비교돼 불일치했다. 후속 코드(승인 대기): `NUMBER`에 통화 축약 `B`(1e9)·`M`(1e6)·`K`/`k`(1e3)를 `(?![A-Za-z])` 경계로 추가(`10GB`·`5MW`·`HBM3E`는 매치하지 않아야 함) + `groundingCheck` 단위 테스트(`$45B` ↔ `450억`, `$5m`은 소문자라 제외, `1.2K`). 같은 샘플의 "1"은 **정탐(경계)**: 렌즈의 "단일 신규 원전 1기"가 원문에 없는 비교 수치라 규칙이 설계대로 막았다 → 프롬프트 후속(승인 대기): 비교·추정 수치는 말로 쓰거나 원문 수치만 인용한다는 규칙 1줄 + `version` 상승(`drafts.prompt_version` 새 행 → 거절 후보 재자격은 의도된 동작). 두 초안 모두 원문이 800자 발췌(`extraction_ok false`)였다는 관찰은 `compare.md` §3. **첫 cron 런(run 4 `fea3193d`, 2026-10-31) 샘플 2건이 같은 계열을 셋 더 드러냈다**(`compare.md` §3 5·6행): ② 월 숫자 — 초안 "7월"·"12월"은 원문 "July"·"December"라 숫자가 없다 → `N월`(1~12)을 영어 월 이름과 대응; ③ 복합 한국어 수사 — "3억 600만 유로"(€306 million)를 `NUMBER`가 "3억"(3e8)·"600만"(6e6)으로 쪼개 둘 다 미근거 → 스케일 내림차순으로 이어지는 `숫자+스케일` 묶음(`X억 Y만 Z천`)을 하나의 claim으로 합산(3.06e8), 비스케일 소수(3.06 ↔ 306 million)와 같은 canonical로; ④ 엔티티(3g `UNGROUNDED_ENTITY`) — "Nottinghamshire Newark"·"Portugal Azores"·"Czechia RRF"처럼 원문의 두 고유명사를 한국어 어순으로 붙인 대문자 바이그램은 통째로는 원문에 없다 → 바이그램 불일치 시 토큰별(≥3자) 개별 grounding 폴백(`params.token_fallback`, 기본 false → 켜면 `qa.yaml` version 상승). 4런 누적 초안 6건의 hard 거절 사유는 전부 이 계열이다(발행 0 = QA 보수성). **구현(2026-10-31, Josh 착수 승인, PR #80)**: ① `NUMBER`에 `[bmk]` 대안(`(?![a-z])` 경계, SCALE `b/m/k`) ② `MONTH_SUFFIX`·`monthsNamed()` — 비스케일 정수 1~12 + `월`(`개월`은 카운터로 제외)이면 `NumberClaim.month`, 원문의 영어 월 이름(전체·3자 약어·`Sept`)으로 근거 ③ `numberClaims`가 한국어 스케일 묶음을 공백만 사이에 두고 스케일이 내려갈 때 하나의 claim으로 합산(`raw`는 원문 그대로 `3억 600만`, `bare`는 canonical) — `1조2천억`도 이제 한 claim(1.2e12; 이전엔 `1조`·`2천억` 둘) ④ 3g `UNGROUNDED_ENTITY` `params.token_fallback`(`boolParam`, 기본 false; `config/qa.yaml` 2026-10-31.1에서 true) — evidence `token_fallback`·`token_grounded`. 테스트: `generate-stage.test.ts`(`$45B`↔`450억`, `M≠B`, `10GB HBM3E 5MW 345kV $45B €5M 1.2K` 토큰, `1.2K`↔`1,200`, `3억 600만`↔`€306 million`, 연쇄·비연쇄, 반쪽 불근거, `7월`↔`July`, 이름 없는 `12월` 불근거, `3개월`은 카운터, "1.1"↔"1" 불일치 유지), `qa-rules.test.ts`(기본 off → 바이그램 2건 미근거, on → `Nottinghamshire Newark`만 `token_grounded`, `Portugal Azores`는 그대로, 비불리언 param은 `QA_PARAM_INVALID`). typecheck 0 · 280/280 · fixture replay 불변(scoring-wire-b "2027" 거절 유지). Codex(PR #80) P2 4건 반영: `NUMBER`는 대소문자 구분 — 통화 글자는 `B/M/K`와 소문자 `k`만(`300 m`은 길이), 영어 스케일어는 대소문자 표기를 나열; 월 이름은 전체 이름만 단독 인정하고 `May`·3자 약어는 일·연도 숫자 옆에서만(`3 May 2026`, `Sept. 16`; "construction may begin"은 월 아님); 월 claim의 `raw`는 `7월`이라 같은 초안의 비월 `7`과 dedup이 섞이지 않음; 엔티티 토큰 폴백은 단어 경계 매치(`Arm`은 `farm` 안에서 찾지 않음). 프롬프트 후속(비교 수치 규칙 + version)은 **승인 대기**.

