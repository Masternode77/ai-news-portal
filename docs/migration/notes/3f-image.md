# 3f Image — 레거시 읽기와 재작성 결정

Phase 3 모듈 f(`REBUILD_BRIEF.md` §6: `ImageAdapter`(OpenAI 우선, 폴백 체인), 프롬프트·공급자·모델·생성시각 provenance, alt text, 전부 실패 시 브랜드 플레이스홀더로 진행(soft)). 완료 기준: **공급자 전부 실패 fixture에서도 발행 흐름이 멈추지 않음(테스트)**. 착수 승인 2026-10-23(Josh "내가 승인한다" — PR #65 머지 + 3f 착수, B안: 플레이스홀더 우선). 레거시는 읽고 규칙만 추출해 다시 쓴다(P9). 이 문서는 §0~§3을 착수 시 쓰고 §4~§5를 실행 후 채운다.

## 0. 실측 요약 (2026-10-23 읽기)

| 사실 | 근거 |
|---|---|
| 프로덕션 레거시는 **API 이미지 생성을 하지 않는다.** `IMAGE_PROVIDER` 기본값 `codex`(`scripts/lib/constants.mjs:34`) → `createImageProvider()`는 `codex`/`image2`만 공급자를 만들고 그 외는 `null`(`image-providers/index.mjs:4-8`). OpenAI(`openai-image-api.mjs`, `gpt-image-2` 1536×1024 medium, `constants.mjs:37-40`)·Gemini·ChatGPT OAuth 모듈은 호출자가 없는 데드코드(`docs/diagnosis/00-inventory.md:111-115`, " 2.mjs" 중복 커밋 포함) | 코드·인벤토리 |
| 실제 경로는 3단: ① **Codex 매니페스트**(`config/codex-image-manifest.json`, 1,002건) — Josh의 Mac Codex 세션이 네이티브로 그린 이미지를 `import-codex-image.mjs`로 등록(sha256 + 프롬프트 지문, 잠금 파일), CI·Vercel은 등록 파일만 소비(`codex-image-provider.mjs:33-89`, `docs/codex-image-workflow.md`) ② 등록이 없거나 지문 불일치·무결성 실패면 **출처 이미지 포스터**(`image-generator.mjs:81-139`: 소스 레지스트리의 `image` 사용 허가 → 공개 주소·content-type·10 MB 제한 fetch(`source-image-fetcher.mjs`) → sharp 리사이즈·어둡게·텍스트 오버레이 1344×768 JPEG) ③ **로컬 편집 SVG 세트**(`image-store.mjs:121-181`: 결정적 팔레트(sha256 of id·title·source·category·tags), 주제 모티프 7종(cooling·nuclear·solar·regional·grid·compute·supply) 분류 정규식, hero 1536×864 / thumbnail 1200×900 / og 1200×630 webp + legacy) | 코드 |
| 자산은 전부 **레포에 커밋**: `public/generated/articles/<id>-<slug>/{hero,thumbnail,og}.webp`, `public/generated/<id>.webp`, `public/generated/codex-inputs/<sha256>.webp`, 카테고리 폴백 `public/generated/fallbacks/*.svg` 9종(power-grid·data-centers·cloud-capacity·semiconductors·cooling·capital-markets·regulation·supply-chain·ai-infrastructure). 1,105 디렉토리(`plan.md` §6). 빌드 시 `prepare-static-images.mjs`가 JSON의 이미지 필드를 다시 쓴다 — ADR-005가 폐기 대상으로 명시 | `plan.md` §6, ADR-005:70 |
| 레코드 필드 15개가 이미지 상태를 흩어 담는다: `generatedImage/heroImage/thumbnailImage/ogImage/legacyImage/imagePrompt/imageAlt/generatedImageProvider/generatedImageModel/imageProvider/imageModel/imageStatus/imageError/imageGeneratedAt`(`image2-provider.mjs:5-20`) + 표시 선택 로직 410줄(`article-image-surface.mjs`). 새 모델은 `publications.image jsonb {path, alt, provenance}` 하나다(ADR-003) | 코드·ADR-003 |
| 프롬프트 규칙은 쓸 만하다: 제목·카테고리·인프라 레이어·개체(로고 없이)·아키타입·지역·톤·문맥(≤1,000자) + 구도(와이드 히어로, 카드·OG 크롭 여백) + 시각 어휘(홀·변전소·변압기·계통·냉각 루프·반도체 패키지…) + 금지(로고·브랜드·읽을 수 있는 텍스트·워터마크·스톡 인물·보케·보라 그라디언트)(`article-image-prompt.mjs:19-56`). alt는 `Editorial image for {title}`(`:14-17`) | 코드 |
| 비용: 레거시 실측 0(API 호출 없음). ADR-007 추정 이미지 1~2장/런, USD 0.04~0.20/장. 공급자·단가는 "확인 필요"(ADR-007 §열린 질문 1) | ADR-007:64,88 |
| 새 구조(Phase 2): `ImageAdapter { provider, generate({prompt, alt, slug}) → ImageResult { path, alt, provenance{provider, model?, prompt, generatedAt}, placeholder, costUsd } }`(contracts §2), `ImageConfig { provider: placeholder\|openai\|fixture, fallback_chain }`, 플레이스홀더 어댑터는 정적 `/images/placeholder-brief.svg`(1200×630) 하나, 러너 순서 generate → **qa → image** → publish(`target.md` §1 그래프; `stages/noop.ts` image는 `passed`를 입력으로 받음), 사이트는 `publication.image.path/alt`만 렌더(`apps/site/src/components/Article.astro:19`) | 코드·target.md |
| 저장소 결정 없음: ADR-003/005는 `publications.image`에 **경로**를 저장한다고만 하고, 생성된 바이트를 어디에 둘지(Supabase Storage·Vercel Blob·레포 커밋)는 미결(ADR-003 §C에 Vercel Blob 언급만) | ADR 검색 |

## 1. 유지 (의도·규칙을 가져온다)

| 항목 | 레거시 | 새 구조에서 |
|---|---|---|
| 실패해도 발행은 간다 | 3단 폴백의 마지막은 항상 로컬 SVG(`image-generator.mjs:190-197`) | `fallback_chain`의 마지막은 항상 `placeholder`(스키마가 강제) — 공급자 전부 실패 fixture → `placeholder: true` 결과 + 발행 흐름 계속(브리프 완료 기준) |
| provenance | 매니페스트 `{fingerprint, sha256, sourcePath, generatedAt, provider, model}`, 레코드 `imageProvider/imageModel/imagePrompt/imageGeneratedAt/imageStatus/imageError` | `ImageResult.provenance { provider, model?, prompt, generatedAt }` + `placeholder` 플래그(ADR-003 jsonb 하나). 실패 사유는 `dead_letters`·`stage_events.counts`·`IMAGE_MISSING` verdict evidence에 |
| 프롬프트 구조 | `buildArticleImagePrompt`의 필드·구도·어휘·금지 목록 | `prompts/image.md`(front matter + 본문 템플릿)로 파일화해 버전을 provenance에 남긴다. 입력은 `NewsBrief`(제목·요약·태그·출처명) — 레거시의 15개 느슨한 필드 대신 스키마 필드만 |
| alt text | `Editorial image for {title}` | 한국어 브리프 제목 기반(`{title_ko} — 편집 일러스트`)을 스테이지가 결정적으로 채움; 모델 출력에 의존하지 않음 |
| 결정적 브랜드 플레이스홀더 | 기사별 팔레트(sha256)·주제 모티프·제목 2줄 SVG → webp | 기사별 **SVG**(의존성 0; sharp 없음)를 ImageStore에 쓰고 경로를 돌려준다. 주제 분류는 태그·제목 → 카테고리 9종(레거시 fallback slug 목록) 데이터로, 색은 slug sha256으로 |
| 공급자 어댑터 경계 | OpenAI 모듈은 `fetch` + `OPENAI_API_KEY`, 45 s 타임아웃, b64 또는 URL 응답 | `adapters/image/openai.ts`: `ctx.fetch`만 사용(`--replay`에서 차단), `OPENAI_API_KEY` 이름만, b64 우선·URL fetch 폴백, 타임아웃·재시도는 LLM 어댑터와 같은 규칙, 단가표 `image.pricing[model]` 없으면 거부 |
| 비용 가드 | 없음(API 미사용) | 호출 전 `budget.canSpend(usd_per_image)`; 불가면 그 초안은 플레이스홀더로 가고 `budget_stopped` 카운트(이미지는 생성과 달리 런을 `budget_stop`으로 끝내지 않는다 — soft) |

## 2. 버릴 것

| 항목 | 이유 |
|---|---|
| Codex 매니페스트·`import-codex-image`·잠금 파일 워크플로 | Mac 데스크톱 세션 의존(ADR-002: GitHub Actions 런타임). 등록된 1,002장은 Phase 5 자산 이관(M5)에서 `publications.image.path`로만 참조 |
| 출처 이미지 포스터(sharp 합성) | 출처 이미지 재사용은 소스별 이미지 권리(`image_hosts`)가 전제인데 `config/sources.yaml`에 그 필드가 없고(3a는 텍스트 권리만), sharp 의존성 추가는 승인 항목. 3f 범위 밖 — §5 열린 질문 |
| `prepare-static-images.mjs`의 빌드 시 JSON 재작성, 레코드 15필드, `article-image-surface.mjs` 선택 로직, 카테고리 폴백 9 SVG 파일 | ADR-005(발행 시 경로 확정)·ADR-003(jsonb 하나)로 대체. 사이트는 `image.path`만 읽는다 |
| Gemini·ChatGPT OAuth 공급자, " 2.mjs" 중복 | 데드코드 |
| 레포에 이미지 커밋 | ADR-005 발행 경로(JSON 커밋 → 재빌드)와 함께 폐기. 생성 바이트는 ImageStore 포트 뒤로 |

## 3. 바꿀 것

| 항목 | 새 설계 | 비고 |
|---|---|---|
| 입력·출력 | `ImageInput { passed }`(QA 통과 초안) → `ImageOutput { withImages: DraftWithImage[], verdicts: QaVerdict[], stats }`. 러너 순서는 `target.md` 그대로 generate → qa → image → publish: 거절될 초안에 유료 이미지를 만들지 않는다(비용). Josh 재계획 문구의 "생성 → 이미지 → QA → 발행"은 **모듈 착수 순서**(3d→3f→3g)로 읽는다 | contracts §1 개정 |
| QA가 아직 fail-closed인 동안의 증거 | 3g 전에는 `passed`가 비어 dry-run에 image 입력이 0이다. 3f 증거는 ① 스테이지·어댑터 단위 테스트 ② 러너 통합 테스트(QA를 통과 스텁으로 바꿔 generate → image → publish(target none) 흐름, 공급자 전부 실패 → 플레이스홀더) ③ CLI smoke는 `image: done, with_images 0` 확인. 3g 머지 후 end-to-end 수치를 §4에 추가 | 브리프 완료 기준은 "테스트" |
| `IMAGE_MISSING`(ADR-004 soft) | 이미지 스테이지가 공급자 전부 실패·예산 불가로 플레이스홀더를 쓸 때 `QaVerdict { rule: IMAGE_MISSING, severity: soft, pass: false, reason_code, evidence { providers_tried, errors } }`를 만들어 `qa_results`에 upsert하고 `state.verdicts`에 덧붙인다. 규칙 파일은 3g의 `qa/rules/` 규약에 맞춰 `image-missing.ts` 1파일 | ADR-004 |
| 공급자 체인 | `image.provider`(주 공급자)·`image.fallback_chain`(순서, 마지막은 `placeholder` 필수 — 스키마 refine). 각 공급자는 `ImageAdapter`; 체인 실행기(`adapters/image/chain.ts`)가 순서대로 시도하고 실패 사유를 모은다. 기본값 **플레이스홀더 우선**(B안·plan §4): `provider: placeholder`, `fallback_chain: [placeholder]`. OpenAI는 `provider: openai`, `fallback_chain: [openai, placeholder]`로 켠다 | 설정 > 코드 |
| ImageStore 포트 | `ImageStore { put({ bytes, mime, slug, variant }) → { path } }`. 구현: `memory`(dry-run·테스트, 바이트 보관 + `/images/generated/<slug>/hero.<ext>` 경로), `local`(`--images-dir`, 기본 `.cache/images`; 레포 안 `apps/site/public`에는 쓰지 않음). 호스팅 저장소(Supabase Storage vs Vercel Blob)는 외부 서비스 신규 연결이라 승인 항목 — 3h 퍼블리셔와 함께 결정(§5) | ADR-003/005 공백 |
| OpenAI 어댑터 | Images API(`/v1/images/generations`)를 `ctx.fetch`로 호출, 모델·크기·품질은 `image.openai { model, size, quality, output_format }` 설정, `image.pricing[model].usd_per_image`로 비용 기록 — 2xx 응답을 받은 시점에 `budget.record`(응답 파싱·바이트 다운로드·ImageStore 쓰기 전; 그 뒤가 실패해 플레이스홀더로 폴백해도 유료 호출은 예산에 남는다, Codex PR #66 P2), 응답 b64 → ImageStore. 429/5xx/타임아웃 재시도는 `image.max_retries`, 4xx 즉시 실패. 키는 `OPENAI_API_KEY`(이름만; CLI가 공급자 `openai` 사용 시 요구) | ADR-002, CLAUDE.md §5 |
| fixture 어댑터 | `fixtures/images/<slug>.json`(또는 `.svg`) 녹화 응답; 없으면 실패를 **시뮬레이션**해 체인 폴백을 검증(`image.provider: fixture` + `fallback_chain: [fixture, placeholder]`) | R7 |
| 프롬프트 파일 | `prompts/image.md`: front matter `{ task: image, version, model_hint, output_schema: none, max_output_tokens: 0 }`… 대신 이미지 전용 머리말 `{ task: image, version, model_hint }`을 `PromptFrontMatter`의 `task`를 `LlmTask \| "image"`로 넓혀 수용. 본문은 템플릿(`{{title}}`, `{{summary}}`, `{{tags}}`, `{{source}}` 치환) + 구도·어휘·금지 규칙 | contracts §6 |
| 관측 | `stage_events.counts { passed, with_images, generated, placeholders, failed_providers, budget_stopped, cost_usd_milli }`, `--json` `imageStats`(건별 provider·placeholder·error·cost), step summary 절 | ADR-007 |
| 플래그 | `flags.stages.image`는 Phase 2부터 `true`(no-op)였다. 3f는 공통 절차 5에 맞춰 **기본 `false`**로 내리고 `CC_FLAG_STAGES_IMAGE=true`로 켠다(기본 런에서 placeholder 어댑터조차 돌지 않음). Phase 4에서 `true` | contracts §7 |

## 4. 완료 기준 대조

| 기준 | 결과 | 근거 |
|---|---|---|
| 공급자 전부 실패 fixture에서도 발행 흐름이 멈추지 않음(테스트) | 통과 | `image-stage.test.ts`: fixture(파일 없음)·openai(503) 전부 실패 → 두 초안 모두 플레이스홀더로 완주, 시도 기록 4건, `IMAGE_MISSING` soft 2건이 `qa_results`에 적재, dead letter 0; end-to-end(QA 통과 스텁)에서 generate → image → publish(none)까지 런 `done` |
| `ImageAdapter` 폴백 체인(OpenAI 우선 가능) | 통과 | `image.provider` → `image.fallback_chain`(스키마가 마지막 `placeholder`를 강제) → `createImageChain`. 기본은 플레이스홀더 우선(B안), OpenAI는 `provider: openai` + `OPENAI_API_KEY`(이름만)로 opt-in |
| provenance(프롬프트·공급자·모델·생성시각) | 통과 | `ImageResult.provenance { provider, model, prompt, generatedAt }` + `placeholder` 플래그; 플레이스홀더도 `model: svg-editorial/2026-10-24.1`을 남긴다 |
| alt text | 통과 | 스테이지가 `{title_ko} — Compute Current 편집 일러스트`로 결정적으로 채움(모델 출력 아님) |
| 전부 실패 시 브랜드 플레이스홀더(soft) | 통과 | 초안별 결정적 SVG(주제 모티프·slug 팔레트) → ImageStore; 저장소 자체가 실패하면 정적 `/images/placeholder-brief.svg`. soft verdict `IMAGE_MISSING`(reason `IMAGE_PROVIDERS_FAILED` / `IMAGE_BUDGET_SKIPPED`) |
| 비용 상한 | 통과 | 유료 공급자(`openai`)는 호출 전 `budget.canSpend(usd_per_image)`; 불가면 호출 없이 플레이스홀더(`budget_stopped` 카운트, 런은 계속) — 테스트 |
| 플래그 기본값 OFF | 통과 | `flags.stages.image: false`(Phase 2의 no-op 때 `true`였던 것을 공통 절차 5에 맞춰 내림); 기본 런 `image: skipped (flag_off)`, `CC_FLAG_STAGES_IMAGE=true`로 켬 |
| 네트워크 0(R7) | 통과 | OpenAI 어댑터는 `ctx.fetch`만 사용(`--replay`에서 throw); CI·테스트는 fixture·placeholder만 |

### 4.1 fixture dry-run (`scoring`, 2026-10-24T00:17Z)

`CC_FLAG_STAGES_NORMALIZE=true CC_FLAG_STAGES_SCORE=true CC_FLAG_STAGES_GENERATE=true CC_FLAG_STAGES_IMAGE=true npm run v2:pipeline -- run --dry-run --replay --fixture scoring --sources fixtures/sources/scoring.yaml --stage ingest,normalize,score,generate,qa,image --json` → `done`; ingest 13 → normalize 13 → score 통과 6·선택 2 → generate 초안 2 → **qa 통과 0(3g 전 fail-closed)** → image `done`, `passed 0 · with_images 0`(4 ms) → publish skipped. 즉 3g가 들어오기 전까지 dry-run에는 image 입력이 없고, 이 모듈의 증거는 테스트다:

| 테스트 | 결과 |
|---|---|
| 플레이스홀더 우선: 초안 1 → `/images/generated/news/<hash>/hero.svg`(SVG 1.6 KB, 주제 `power-grid` 모티프), provenance placeholder, verdict 0, 같은 입력 → 같은 바이트 | 통과 |
| 공급자 전부 실패(fixture 없음 → openai 503 → placeholder): 초안 2 → 플레이스홀더 2, 시도 기록 `fixture:FIXTURE_MISSING → openai:IMAGE_UNAVAILABLE → placeholder:ok`, `IMAGE_MISSING` 2(`qa_results` 2행), dead letter 0 | 통과 |
| 예산: `usd_per_image 0.5` vs `run_usd 0.4` → openai 호출 0, `budget_stopped 1`, reason `IMAGE_BUDGET_SKIPPED` | 통과 |
| 녹화 fixture 응답(SVG b64, cost 0.01) → 실제 이미지, provenance fixture, 예산 0.01 기록 | 통과 |
| 프롬프트 템플릿 치환(`{{title}}`…)·alt·잘못된 초안 body → dead letter `IMAGE_INPUT_INVALID`, image null | 통과 |
| end-to-end: scoring fixture → 초안 2 → QA 통과 스텁 → image(fixture 실패 → 플레이스홀더 2, IMAGE_MISSING 2) → publish none, 런 `done`, 비용 0 | 통과 |
| OpenAI 어댑터(가짜 fetch): 요청 모양(model/size/quality/output_format/n), b64·url 응답, 429 재시도, 4xx 즉시 거부, 단가 없는 모델 거부(호출 0), 타임아웃 2회 후 `IMAGE_TIMEOUT` | 통과 |

로컬 저장소 확인: `createLocalImageStore({ dir })`로 `<dir>/news/732e5467dd67c011/hero.svg` 1,663 바이트가 쓰였다(CLI `--images-dir`). 테스트 합계 184(3d 175 + 3f 9), `v2:typecheck` 0 errors.

### 4.2 라이브
해당 없음(이미지 생성은 피드가 아니라 초안에서 시작). OpenAI 실호출 증거는 `OPENAI_API_KEY` 수령·`image.provider: openai` 설정 후 3g 이후의 dry-run에서 남긴다. 단가 `gpt-image-2 0.07 USD/장`은 ADR-007 범위의 가정값이라 Josh 확인이 필요하다.

## 5. 열린 질문

1. **호스팅 저장소** — 생성 바이트의 최종 위치(Supabase Storage vs Vercel Blob vs 사이트 정적 자산). 외부 서비스 신규 연결이라 승인 항목. 3h 퍼블리셔가 `ImageStore` 구현을 하나 더 붙이면 되게 포트를 두었다. 사이트는 `publication.image.path`만 렌더하므로 3h 전까지 `/images/generated/…` 경로는 사이트에서 404다(dry-run 전용).
2. **공급자 결정** — B안대로 플레이스홀더 우선으로 시작. OpenAI(`gpt-image-2`, 1536×1024 medium, webp)로 바꾸는 시점과 단가 확정은 Josh. 월 상한은 OpenAI 콘솔에서.
3. **출처 이미지 재사용** — 레거시의 "출처 이미지 포스터" 경로는 소스별 이미지 권리 필드가 없어 버렸다. 필요하면 `config/sources.yaml`에 `image_rights`를 추가하는 3a 후속으로.
4. **변형(variant)** — 레거시는 hero/thumbnail/og 3종 webp를 만들었다. 새 구조는 hero(1200×630 SVG 또는 공급자 원본) 1종이고 사이트가 CSS로 자른다. OG 전용 래스터가 필요하면 3h에서 결정(sharp 의존성 추가는 승인 항목).
5. **스테이지 순서** — 런타임은 generate → qa → image → publish(거절될 초안에 유료 이미지를 만들지 않음). 3g가 `IMAGE_MISSING` soft 규칙을 `qa/rules/`로 옮길지, 이미지 스테이지가 계속 verdict를 만들지는 3g 설계에서 확정.
6. **플레이스홀더 어휘** — `image.placeholder.topics` 9종 어휘는 초기값. 라이브 초안에서 분류 적중률을 보고 조정(설정만). 매칭 대상은 초안의 제목·태그·요약만이다(`ImageRequest.summary`, `placeholderTopicText`) — 렌더링된 프롬프트는 템플릿의 고정 어휘("grid interconnects" 등)를 포함해 모든 초안이 첫 토픽에 걸리므로 제외했다(Codex PR #66 P2). 스테이지의 `cost_usd`는 결과 객체가 아니라 초안별 `budget.spentUsd` 증분을 합산한다.
