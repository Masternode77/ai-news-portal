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
| 템플릿 문구·메모 스캐폴딩 금지 | "For investors / For operators" 반복, "strategic significance" 류 | 프롬프트 금지 조항(한국어 대응 표현 포함); 기계 검사는 3g `BANNED_PATTERN` | `bannedPhrases.yml` |
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
| 영문 금칙어 목록의 프롬프트 통째 삽입 | 44구를 프롬프트에 넣는 대신 패턴 유형을 지시하고, 기계 검사는 3g로 | `bannedPhrases.yml` |

## 3. 바꿀 것

| 항목 | 새 설계 | 비고 |
|---|---|---|
| 입력·출력 | `GenerateInput { selected, rawItems, sources }` → `GenerateOutput { drafts: DraftInsert[], stats }`. 선택 후보마다 raw item(제목·본문·발행일)과 소스(이름·권리·범위)를 찾아 **소스 패킷** JSON을 user 메시지로 보낸다 | contracts §1 개정 |
| 프롬프트 파일 | `prompts/news_brief.md` — front matter `{ task, version, model_hint, output_schema, max_output_tokens }` + 본문(system prompt, 한국어). `drafts.prompt_version = version`. 로더 `adapters/prompts`(`StageAdapters.prompts`), CLI `--prompts-dir` | contracts §6 |
| LLM 출력 스키마 | `NewsBriefDraft { title_ko, summary_ko, why_it_matters_ko, expert_lens_ko, tags }`만 모델이 쓴다. `source_url`·`source_name`·`published_at_source`·`slug`는 스테이지가 결정적으로 채운다(모델이 출처를 지어낼 수 없음) | Appendix A |
| slug | `news/` + sha1(`canonical_url|title`)[0:16] (`newsBriefSlug()`, 레거시 규칙 유지) | contracts §5 |
| 행 id | `candidates.id = candidateId(raw_item_id, rubric_version)`, `drafts.id = draftId(candidate_id, content_type, prompt_version)` — 3b의 `raw_items.id`처럼 결정적 파생, upsert 전에 찍음 | contracts §5 개정 |
| Anthropic 어댑터 | `adapters/llm/anthropic.ts`: `ctx.fetch`로 Messages API 직접 호출(`--replay`에서는 자동 차단), tool_use 구조화 출력, `llm.pricing[model]`로 비용 계산, 429/5xx 재시도(`llm.max_retries`), `llm.timeout_ms`. 키는 `ANTHROPIC_API_KEY`(이름만; CLI가 `llm.provider: anthropic`일 때 요구). SDK(`@anthropic-ai/sdk`)는 패키지 추가 승인 후 교체 가능 | ADR-002, CLAUDE.md §3 |
| 비용 가드 | 호출 전 `budget.canSpend(추정)`(입력 글자/4 + max_output_tokens × 단가), 어댑터가 실제 비용 `record`. 첫 후보부터 불가면 `BUDGET_EXCEEDED`(런 `budget_stop`), 도중 불가면 남은 후보를 `budget_stopped`로 보고하고 중단 | ADR-007 |
| 검사(3d 범위) | ① 스키마: 응답 JSON → `NewsBriefDraft` zod. 실패 → dead letter `SCHEMA_INVALID`, 초안 미기록 ② grounding: 초안 숫자 토큰 ⊆ 원문 숫자 토큰(제목·본문·발행일·소스명). 결과 `checks.grounding { numbers, ungrounded, pass }` ③ `checks.quote_max_words`: 초안과 원문의 최장 연속 공통 단어 수. 3d는 **보고**만 하고 차단은 3g | 브리프 3d 완료 기준 |
| draft 행 | `{ candidate_id, run_id, content_type: news_brief, prompt_version, model, body: { brief: NewsBrief, checks, source: { raw_item_id, canonical_url, text_rights, chars } }, input_tokens, output_tokens, cost_usd, review_status: none }`, upsert(`candidate_id, content_type, prompt_version`) | ADR-003 |
| fixture 어댑터 | `LlmRequest.cacheKey`(선택, `news_brief:<raw_item_id>`)로 `fixtures/llm/<task>/<key>.json`을 먼저 찾고 없으면 `<task>.sample.json` | R7 |
| 플래그 | `flags.stages.generate: false`(기본 OFF). 테스트·CI smoke는 `CC_FLAG_STAGES_GENERATE=true` + `llm.provider: fixture` | 공통 절차 5 |
| 관측 | `stage_events.counts { selected, drafted, failed, budget_stopped, grounding_passed, cost_usd_milli }`, `--json` `generateStats`(비용·토큰·grounding 통과율·`quote_max_words`·건별 decisions), step summary 절 | ADR-007 |

## 4. 완료 기준 대조

(실행 후 채운다)

## 5. 열린 질문

(실행 후 채운다)
