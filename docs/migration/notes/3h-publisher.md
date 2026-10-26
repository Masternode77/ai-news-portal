# 3h Publisher — 레거시 읽기와 재작성 결정

Phase 3 모듈 h(`REBUILD_BRIEF.md` §6: `PublisherAdapter`, v1은 사이트 퍼블리셔(published 저장소 write + revalidation)만, 외부 블로그·SNS는 인터페이스만; `docs/migration/plan.md` 16행: `publishers/site`(upsert + revalidate), `config/redirects.yaml`, 레거시 25건 이관 스크립트(dry-run)). 완료 기준: **publish가 사이트 재빌드 성공에 의존하지 않음(ADR-005 검증) / 기존 slug 충돌 방지**. 착수 승인 2026-10-26(Josh "3g다음에 다음단계 리빌드 계획을 진행해"). 레거시는 읽고 규칙만 추출해 다시 쓴다(P9). §0~§3은 착수 시, §4~§5는 실행 후.

## 0. 실측 요약 (2026-10-26 읽기, `rebuild/v2` `96a5acfc`)

| 사실 | 근거 |
|---|---|
| 레거시 "발행"은 **JSON 파일 쓰기**다: `writeJsonFile`이 임시 파일 → rename으로 파일별 원자 쓰기, 파일 간 트랜잭션 없음. `syncArchiveArtifacts`가 archived-news·search-index를, 파이프라인이 latest-news(`LATEST_NEWS_LIMIT` 30, 초과분은 아카이브로)를, 컬럼은 `appendAuthoredColumn`이 authored-columns.json을 쓴다. 상태 원장 `scripts/state/pipeline-state.json`에 `publishedIds`(최근 1,000)·`runHistory` | `state-store.mjs:27-35`, `pipeline.mjs:441,547-548,743-745` |
| 숨은 부작용: latest-news·archived-news·search-index를 쓸 때마다 `enforceFinalPublicationIntegrity`가 돌아 실패 레코드를 **강제 격리**한다(쓰기 = 게이트). 격리 목록은 발행 경로가 읽지 않는다 | `state-store.mjs:5,30-32`, `final-publication-integrity.mjs:130-155`, `archive-store.mjs:178-183` |
| 커밋 경로(`api/admin/_github.js`): `main`에 blob → tree → commit → ref fast-forward(`force:false`), `expectedSourceSha` 낙관적 동시성, 409/422면 `AdminWriteConflictError`, 재시도 없음, 메시지 `Persist admin article action <action> for <id> [skip release]`. Mac 러너는 커밋하지 않는다(수동) | `_github.js:124-185`, `run-subscription-news.mjs:76,101` |
| 공개 자격(`isPublicLongformArticle`): 라우트 게이트(id·`articlePagePublished`·`signalCardOnly`·`public_content_tier`·`public_status`·`archiveOnly`·제품 적합성·`shouldNoindexArticle`·**출처 텍스트 권리 승인**(레지스트리 `active_feed`, `reviewed_at` 365일 이내, 도메인·URL 일치)) AND 상세 품질(추출 ≥ 500/1,200자·보일러플레이트 ≤ 0.08·완성도 ≥ 0.92, 길이 정책 core 4,500자/900단어/12단락/6섹션). 컬럼은 `authoredColumnPublicEligible` + `renderSafe` | `public-surface-eligibility.mjs:10-28`, `seo-safeguards.js:63-120`, `article-detail-quality-gate.mjs:31-73`, `authored-column-policy.mjs:109-120` |
| 격리는 목록이 아니라 레코드 플래그(`public_status: quarantined`, `quarantined: true`, `quarantine_reason[]`). `quarantineArticle`은 `noindex`·`seo_noindex`·`archiveOnly`도 함께 세운다. 관리자 "unpublish"는 save-draft와 같다(`public_status: draft`, noindex는 세우지 않음) | `content-quarantine.mjs:10-59`, `admin-article-store.mjs:126-151` |
| ID·slug: 뉴스 id = sha1(`normalizeUrl(url)|canonicalTitle(title)`)[0:16](`stableArticleId`) — 단 공개 5건(EIA 복원)은 손으로 쓴 `eia-*` id. 뉴스 `slug` 필드는 검색용(`slug || slugify(title)`, 유일성 없음, 1,050값 중 994 distinct). 컬럼 slug = `slugify(headline)[0:64]` + `-YYYY-MM-DD`(UTC), id = `col_` + `stableArticleId(slug, headline)`. **충돌 처리**: 뉴스는 같은 id면 병합(첫 레코드 유지, 빈 필드만 보충), 컬럼은 같은 id·slug·`story_key`면 **조용히 교체**(접미사 없음, 400건 상한) | `normalize.mjs:77-80,116`, `archive-store.mjs:15-37`, `authored-column-engine.mjs:1035,1041`, `authored-column-store.mjs:8,20-39` |
| 재검증(ISR·캐시 퍼지)은 **없다**. 사이트는 정적이고 `main` push로 전체 재빌드된다. `purge:*` 스크립트는 수동이고 러너가 부르지 않는다 | `scripts/purge-*.mjs`, `astro.config.mjs:51`(output 없음) |
| 리다이렉트: `vercel.json` 4건(`permanent: true` = **308**), `astro.config.mjs` 1건(301, vercel 2번째 행과 중복). 헤더: `/ads.txt` text/plain, `/admin*`·`/api/admin/*` `no-store, private`, 전 경로 nosniff·Referrer-Policy·X-Frame-Options·Permissions-Policy. X-Robots-Tag 없음(noindex는 meta만) | `vercel.json:5-110`, `astro.config.mjs:66-71`, `Layout.astro:63` |
| sitemap 2종: `@astrojs/sitemap` 필터(admin·정적 noindex 4·noindex 뉴스·비활성 taxonomy 제외)와 커스텀 `/sitemap.xml`(정적 + 활성 taxonomy + 공개 뉴스(`lastmod = updatedAt \|\| analysisPublishedAt \|\| publishedAt`) + 컬럼). robots.txt는 `/sitemap-index.xml`만 가리킨다. changefreq·priority 없음 | `astro.config.mjs:53-64`, `sitemap-builder.mjs:12-53`, `column-surface.mjs:60-70`, `robots.txt.ts:9` |
| taxonomy 페이지는 **발행 시점** 단계(러너 5단계, restore-eia 안에서도 호출)로 `src/data/taxonomy-pages.json`(카테고리 9·회사 16·지역 7·아카이브 22)을 쓰지만, 빌드 시 카테고리·지역 내용은 다른 분류기(`publicationCategorySlug`)로 다시 계산된다(분류 2중) | `rebuild-taxonomy-pages.mjs:63-90`, `public-publication-catalog.mjs:15-30` |
| `restore-eia-public-inventory`: 매 사이클 러너 4단계로 EIA 15건(롱폼 5·시그널 카드 10)을 재생성(라이브 fetch 2회, 500자 미만이면 저장 본문, `NOW` 2026-08-12T03:00Z 고정, 홈 15·RSS 15·상세 5 단언) 후 세 파일을 다시 쓰고 taxonomy 재생성. 2026-10-11 `93341dd` 이후 `source_fidelity:unsupported_claims`로 실패 → 커밋 전 abort → **발행 정지의 직접 원인**. 새 사이트가 계속 서빙해야 하는 것은 `/news/eia-*/` 5건(corrections·updatedAt·`/generated/**` 이미지) | `restore-eia-public-inventory.mjs:19-26,151-176,215-259`, `03-error-taxonomy.md:11`, ADR-005:10 |
| 레거시 레코드 필드: 뉴스 56키·컬럼 45키. `publications` 대응은 slug(`news/<id>`·`column/<slug>`)·legacy_id(id)·title·body(`expertLensFull.finalArticleBody` + deck/why_it_matters/summary)·image(heroImage/ogImage/thumbnailImage + imageAlt + provenance 필드)·sources·published_at·updated_at·tags·category(primary_category/category)·region(뉴스만)·noindex(noindex/seo_noindex). 날짜는 전부 ISO-8601 UTC `Z`(뉴스 1,065/1,065, 컬럼 22/22). `updatedAt`은 뉴스 999/1,065가 null | 레코드 표본, `apps/site/src/lib/legacy-json.ts`(Phase 2 매퍼) |
| **수치**(2026-10-26 레거시 함수 실행): 뉴스 45(latest) + 1,020(archive) = 1,065, 공개 **5**(전부 EIA 롱폼); `public_status` published 5·quarantined 32·archive_only_noindex 378·signal 80·source_card 39·unset 531. 컬럼 22 중 공개 **7**, 격리 15. 보존 목록(10-17 작성)의 컬럼 20건 중 13건이 10-23 `0d244478`로 격리됨(`cdc2501b` Hormuz 격리 → `c0c082cc` 복구). 즉 보존 목록은 **낡았다** | `docs/diagnosis/05-preserve-list.csv`, `git log` |
| 새 구조(Phase 2): `PublisherAdapter { target, publish(PublicationInsert) → { slug, url }, unpublish?, revalidate? }`, `publications`(slug unique + 정규식 `^(news\|column)/…`, `status published\|unpublished\|quarantined`, anon RLS는 published만), `redirects(from_path PK, to_path, status 301\|410)`, `RedirectsConfig` zod(중복 거부)는 있으나 `config/redirects.yaml` 파일은 없음, no-op 퍼블리셔 + `stages/noop.ts` publish(`publish_target: none`이면 아무것도 안 함). 사이트는 `publications`만 읽고(`apps/site/src/lib/publications.ts`, supabase/legacy_json/empty) `body`를 `render.ts`의 알려진 필드(`summary_ko`·`why_it_matters_ko`·`expert_lens_ko`·`article_body`·…)로 렌더한다. ADR-006 M4: `PUBLISH_TARGET=staging`이면 staging 스키마에 쓰고 `rebuild/v2` 프리뷰가 그것을 읽는다 | contracts §1~§4, `0001_init.sql:156-219`, ADR-005/006 |

## 1. 유지 (의도·규칙을 가져온다)

| 항목 | 레거시 | 새 구조에서 |
|---|---|---|
| URL 보존(R8) | `news/{id}`·`column/{slug}` 경로, 리다이렉트 4건 | `publications.slug`에 레거시 경로 그대로(ADR-005). 리다이렉트는 `config/redirects.yaml`(데이터) → `redirects` 테이블 upsert(`publish.redirects_sync`). vercel/astro 규칙은 Phase 5 컷오버에서 퇴역 |
| 같은 글은 같은 행 | 뉴스: 같은 id면 병합(첫 레코드 유지) | 같은 slug = 같은 행: 재발행은 **제자리 갱신**(id·첫 `published_at` 유지, `updated_at` 갱신), 새 slug를 만들지 않는다(계약 "멱등") |
| 발행일의 의미 | 뉴스 `publishedAt` = 출처 날짜(없으면 now), 컬럼 = 생성 시각 | `publications.published_at` = **사이트 발행 시각**(`ctx.now`, 첫 발행 고정). 출처 날짜는 `sources[].published_at`·`body.published_at_source`로 분리 — 레거시의 "출처 날짜 = 사이트 날짜" 혼용(함정 6)을 끝낸다 |
| 격리/비공개는 삭제가 아님 | `public_status`·noindex 플래그 | `status: unpublished \| quarantined`(RLS로 숨김), `unpublish(slug)`는 행을 지우지 않고 상태만 바꾼다 |
| 공개 자격은 QA가 정한다 | `isPublicLongformArticle` 10여 조건이 쓰기 시점에 다시 돈다 | 자격 판정은 3g QA(hard/soft)와 3c 선택이 **앞에서** 끝낸다. 퍼블리셔는 QA 통과 초안만 받고 다시 판정하지 않는다(쓰기 = 게이트 폐기) |
| 레거시 25건 이관 | 보존 목록(뉴스 5·컬럼 20) | `tools/migrate-legacy-publications.ts --dry-run`: Phase 2 매퍼(`mapLegacyCollections`, `@cc/shared`로 이동)로 공개 레코드를 `publications` 행으로 만들고 보존 목록과 대조해 `ready / not_public / missing`을 보고. 실제 쓰기는 Phase 5 M5(승인 항목) |

## 2. 버릴 것

| 항목 | 이유 |
|---|---|
| JSON 커밋 발행(`_github.js`, Mac 러너 수동 커밋, `[skip release]`) | ADR-005 A안: 발행 = DB 행 + ISR. git 이력이 데이터로 오염되는 원인 |
| 쓰기 시점 무결성 강제·자동 격리(`state-store` 훅), 격리 목록 | 판정은 3g가 `qa_results`로 남기고 `drafts.review_status`로 막는다. 발행 경로에 숨은 게이트를 두지 않는다 |
| `restore-eia-public-inventory` 재생성(매 사이클 라이브 fetch·단언) | 발행 정지의 원인. EIA 5건은 **한 번** 이관(M5)하고 그 뒤로는 보통 행이다 |
| taxonomy 페이지 JSON 재생성, sitemap 2종, 빌드 시 분류 재계산 | 사이트 측 on-demand 렌더(ADR-005 표: `/category|region|company/{slug}/`·sitemap은 `publications` 질의)로 대체. 3h 범위 밖(§5) |
| 컬럼 slug 충돌 시 조용한 교체(`story_key` 포함) | `publish.slug_conflict`(update/skip/fail)로 **명시**하고 로그·stats(`skipped`)로 드러낸다. 같은 초안의 재발행만 무조건 갱신 |
| `LATEST_NEWS_LIMIT` 30·아카이브 분리·`publishedIds` 원장 | 행 하나에 상태가 있다. 목록 길이는 사이트 질의의 `limit` |

## 3. 바꿀 것

| 항목 | 새 설계 | 비고 |
|---|---|---|
| 설정 | `config/pipeline.yaml` `publish { base_url, slug_conflict: update\|skip\|fail, redirects_sync, revalidate { enabled(기본 false), token_env(기본 `CC_REVALIDATE_TOKEN`, 이름만), timeout_ms, extra_paths } }`(`PublishConfig`, strict, 전부 기본값 있음). **무엇을 쓸지**는 `flags.publish_target`(none/staging/production, `CC_FLAG_PUBLISH_TARGET`)이, **어떻게**는 이 블록이 정한다 | contracts §4 |
| 사이트 퍼블리셔 | `adapters/publisher/site.ts` `createSitePublisher({ publish, redirects, revalidateToken? })`: `publish(PublicationInsert)` → slug로 기존 행 조회 → 같은 초안(`draft_id` 동일)이면 갱신, 다른 초안이면 `slug_conflict` 정책 → `PublicationRow`로 검증해 `upsert(publications, [row], ["slug"])`(id = `publicationId(slug)` 결정적, 기존 행이면 그 id·`published_at`·`legacy_id` 유지) → `{ slug, url, action: inserted\|updated\|skipped, id }`. `syncRedirects` = `redirects` upsert(`from_path`). `revalidate(paths)` = `ctx.fetch` GET `base_url + path` + 헤더 `x-prerender-revalidate: <token>`, 타임아웃, 실패는 **세고 로그**(throw 없음; `--replay`에서는 전부 실패로 기록). `unpublish(slug)` = `status: unpublished` | ADR-005 |
| 스테이지 | `stages/publish.ts`(noop.ts는 re-export 껍데기): `PublishInput { withImages, rawItems }` → `PublishOutput { published, stats }`. `target none` → 아무것도 쓰지 않고 후보 전부를 `decisions[].action = dry`로 보고("발행했을 글"). `staging/production` → `syncRedirects` → 초안마다 `publicationFromDraft`(brief 검증, `news_brief`만; `insight_essay`는 3e) → `publisher.publish` → 실패는 `dead_letters(stage publish, ref drafts)` + `failed`(런 계속, P5) → 발행된 slug + `extra_paths` revalidate. `PublishStats { target, candidates, published, inserted, updated, skipped, failed, redirects_synced, revalidate{requested,ok,failed,skipped}, decisions, ms }`, funnel `published` = 실제 쓴 행 수 | contracts §1 |
| 행 매핑 | `title = brief.title_ko`, `body = { summary_ko, why_it_matters_ko, expert_lens_ko, tags, source_url, source_name, published_at_source, checks(3d), generation { prompt_version, model, run_id } }`(사이트 `render.ts`가 아는 필드 그대로), `image = 3f 결과(플레이스홀더 포함)`, `sources = [{ url, name, published_at, title: raw item 원제(3b 중복 비교용) }]`, `tags = brief.tags`, `publisher = pipeline`, `status = published`, `draft_id = 초안 id`, `category/region = null`(§5), `noindex = false` | contracts §3 |
| dry-run과 staging | `--dry-run` + `publish_target: staging`이면 메모리 DB에 행이 생긴다(원장·`--json`에 "발행했을 글"이 남는다, 브리프 Phase 3 완료 기준). Phase 4는 같은 코드가 Supabase staging 스키마에 쓴다. `production`은 Phase 5 컷오버에서만(CLAUDE.md §4) | ADR-006 M4/M6 |
| 리다이렉트 데이터 | `config/redirects.yaml` 4행(301; vercel의 `permanent: true`는 308이지만 DDL은 301/410만 — 301로 통일, 함정 5). astro 행은 중복이라 생략. 격리 컬럼 2건은 404 유지(ADR-005) | R8 |
| 이관 도구 | `tools/migrate-legacy-publications.ts --dry-run [--json out]`: 레거시 JSON(데이터 파일만 읽음, 코드 import 없음) → `mapLegacyCollections` → 보존 목록 대조. `--apply`는 없다(종료 코드 2, Phase 5 M5·승인). 매퍼는 `apps/site/src/lib/legacy-json.ts`에서 `packages/shared/src/legacy/publications.ts`로 옮기고 사이트는 re-export(사이트 테스트 무변경) | plan 16행 |
| 관측 | `stage_events.counts { candidates, published, inserted, updated, skipped, failed, redirects_synced, revalidate_ok, revalidate_failed }`, `--json` `publishStats`, step summary "Publish (3h)" 절(slug·action·url·error) | ADR-007 |
| CLI | `--redirects <path>`(기본 `config/redirects.yaml`). `publish.revalidate.enabled`인데 토큰 환경 변수가 없으면 시작 시 `ConfigError`(이름만). no-op 퍼블리셔는 테스트용으로만 남는다 | CLAUDE.md §5 |
| 플래그 | 스테이지 플래그 `flags.stages.publish`는 Phase 2부터 `true`(no-op)였고 그대로 둔다 — 실제 스위치는 `publish_target`(기본 `none`)이다. 3a `--live`와 같은 "opt-in 스위치가 플래그 역할" 적용(contracts §7) | contracts §7 |

## 4. 완료 기준 대조

| 기준 | 결과 | 근거 |
|---|---|---|
| publish가 사이트 재빌드 성공에 의존하지 않음(ADR-005 검증) | 통과 | 퍼블리셔의 의존은 `ctx.adapters.db`(행 upsert)와 `ctx.fetch`(선택적 revalidate)뿐. end-to-end 테스트는 `--replay`(fetch throw)·revalidate off·메모리 DB로 generate → qa → image → publish까지 런 `done`, `publications` 1행, 빌드 호출 0. revalidate를 켜고 404/throw를 주어도 행은 남고 `revalidate.failed`로만 집계(`publish-stage.test.ts`, `site-publisher.test.ts`) |
| 기존 slug 충돌 방지 | 통과 | 같은 초안 재발행 = 제자리 갱신(id·첫 `published_at` 유지, 행 1개); 다른 초안의 같은 slug는 `slug_conflict` update(기본, id·`legacy_id` 보존)/skip(행 불변, `skipped`)/fail(`SLUG_CONFLICT`)로 명시 — 새 slug를 만드는 경로가 없다(`site-publisher.test.ts`) |
| `publishers/site` upsert + revalidate | 통과 | §3; revalidate는 헤더 `x-prerender-revalidate`, 경로별 GET, 실패 집계(테스트: 3경로 중 1 실패 → ok 2/failed 1, 토큰 없음 → `REVALIDATE_TOKEN_MISSING`) |
| `config/redirects.yaml` | 통과 | 4행, strict 로드(공유 `config.test.ts`), 퍼블리셔가 `redirects` 테이블로 upsert(멱등, 테스트) |
| 레거시 25건 이관 스크립트(dry-run) | 통과 | `migrate-legacy-publications.ts --dry-run`: 보존 25 → **ready 12(뉴스 5 + 컬럼 7) · not_public 13(전부 `quarantined`) · missing 0**, 예상 404 2, 레거시 이미지 경로 12(`/generated/**`, M5 자산 이관 전 404). `--apply`는 거부(종료 2) — `migrate-legacy-publications.test.ts` |
| 외부 블로그·SNS는 인터페이스만 | 통과 | `PublisherTarget = site \| blog \| social`, `StageAdapters.publishers: Record<string, PublisherAdapter>`; 구현은 site뿐 |
| 플래그/타깃 기본값 OFF | 통과 | `publish_target: none` 기본 → 쓰기 0, `decisions[].action = dry`(`cli.test.ts`) |
| 라이브(관찰) | 미실행 | Supabase staging 스키마·프리뷰 배포는 Phase 4 M4(키·프로젝트 미수령). revalidate 토큰도 그때 |

### 4.1 fixture dry-run (`scoring`, 2026-10-26T08:27Z)

`CC_FLAG_STAGES_NORMALIZE=true CC_FLAG_STAGES_SCORE=true CC_FLAG_STAGES_GENERATE=true CC_FLAG_STAGES_QA=true CC_FLAG_STAGES_IMAGE=true CC_FLAG_PUBLISH_TARGET=staging npm run v2:pipeline -- run --dry-run --replay --fixture scoring --sources fixtures/sources/scoring.yaml --stage ingest,normalize,score,generate,qa,image,publish --json`

fetched 13 (5/5 ok) → new 13 → scored 13 → gate 6 → selected 2 → drafts 2 → qa 통과 1 → image placeholder 1 → **publish: target staging · candidates 1 · published 1 (inserted 1) · skipped 0 · failed 0 · redirects synced 4 · revalidate off** → `news/920a329a451a5000` → `https://www.computecurrent.com/news/920a329a451a5000/`. 런 `done`, funnel `published 1`, 비용 0, 223 ms. 같은 런을 `publish_target: none`으로 돌리면 `published 0`, `decisions[0].action = dry`. 같은 수치를 `cli.test.ts`·`publish-stage.test.ts`(end to end)·`rebuild-ci.yml` smoke가 고정한다.

### 4.2 이관 dry-run (레거시 JSON, 2026-10-26)

`node packages/pipeline/tools/migrate-legacy-publications.ts --dry-run` → `news_public 5 · column_public 7 · preserved 25 · ready 12 · not_public 13 · missing 0 · expected_404 2 · legacy_image_paths 12`. not_public 13건은 전부 `public_status: quarantined`(10-23 이후 격리된 컬럼) — §5.1.

## 5. 열린 질문

1. **격리된 보존 URL 13건의 처분** — 보존 목록(10-17)은 컬럼 20건이 공개였지만 지금은 7건만 공개다. 13건은 404 유지(ADR-005 "격리 컬럼은 404"), `410`(redirects.yaml 행 추가, 검색엔진에 명시 제거), 복구 중 하나다. 추천: 복구 계획이 없으면 **410 행 추가**(데이터 1행씩, 승인 불필요)로 R8 검증(136 URL → 200/301/410)을 명확히 한다. Josh 결정 필요.
2. **`category`·`region`** — 3h는 null로 쓴다. 레거시는 분류기 2중(함정 12)이라 가져오지 않았다. taxonomy 페이지를 사이트가 on-demand로 만들 때(Phase 5 사이트 페이지 48개 이식) `tags` 기반 분류를 설정 데이터로 두는 것이 ADR-004/P4와 맞는다.
3. **sitemap·robots·taxonomy·RSS** — 사이트 측(`publications` 질의 라우트). 3h 범위 밖이지만 Phase 5 컷오버 체크리스트(M6 "사이트맵·robots 갱신")의 선행 작업이라 Phase 4 중 사이트 PR로 분리 제안. `publish.revalidate.extra_paths`에 `/sitemap.xml`·`/rss.xml`은 그 라우트가 생긴 뒤 추가.
4. **revalidate 토큰·경로** — Vercel ISR bypass 토큰 이름 `CC_REVALIDATE_TOKEN`(환경 변수 이름만). `@astrojs/vercel` ISR의 `bypassToken` 설정과 `x-prerender-revalidate` 헤더 동작은 프리뷰 배포에서 실측(ADR-005 확인 필요 1). 실패해도 300 s ISR 만료로 갱신된다.
5. **레거시 이미지 경로** — ready 12건의 image.path가 `/generated/**`(루트 `public/`)라 새 사이트에서는 404(plan §6). M5 자산 이관(3f notes §5.1 호스팅 저장소 결정과 함께).
6. **308 vs 301** — vercel `permanent: true`는 308. 새 테이블은 301/410만. GET에는 차이가 없고 SEO 신호도 동등하므로 301로 통일했다. 이의 있으면 DDL·스키마에 308 추가(마이그레이션).
7. **insight_essay 발행 매핑** — 3e와 함께(`publicationFromDraft`에 분기 추가, slug 규약 `column/…`; 레거시 `slugify`는 한글을 남기지만 새 정규식은 ASCII만 — 3e에서 결정).
