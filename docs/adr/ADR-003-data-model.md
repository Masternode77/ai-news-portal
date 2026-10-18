# ADR-003 — 데이터 모델과 계약

- 상태: Proposed
- 날짜: 2026-10-18
- 관련: ADR-005, ADR-004, ADR-007, 브리프 Appendix C, P2·R6·R7·R8

## Context

- 현재 저장소는 git 커밋 JSON 4종(`latest-news` 45, `archived-news` 1,020, `search-index` 1,065, `authored-columns` 22)과 런 원장 `scripts/state/pipeline-state.json`이다. 파일 간 트랜잭션이 없고(`scripts/lib/state-store.mjs:27-35`는 파일 단위 원자적 쓰기), 격리 목록이 버려지며(`scripts/lib/archive-store.mjs:178-184`), 런 원장은 완주 런만 담는다(`scripts/pipeline.mjs:445`).
- 레코드 식별자: news `id` = sha1(normalized url + canonical title)[0:16] (`scripts/lib/normalize.mjs:77-80`), 컬럼 `id` = `col_<hash>`, slug = `slugify(headline)[0:64]-YYYY-MM-DD`(`scripts/lib/authored-column-engine.mjs:1031,1037`). 아카이브 `slug` 필드는 검색용이며 중복 47개(`docs/diagnosis/03-error-taxonomy.md` D7).
- Supabase에는 쓰기 전용 `archived_articles` 테이블이 있었을 수 있다(`scripts/lib/archive-store.mjs:77-132`, 러너가 자격증명을 비워 실질 미사용). 내용·존재 여부는 미확인(STOP-THE-LINE: drop 금지).
- 브리프 Appendix C가 9개 테이블과 상태 전이 `raw → candidate → draft → qa → published | rejected | dead_letter`를 제시한다. P2는 zod 스키마와 idempotency key를 요구한다.

## Options

### A. Supabase Postgres, Appendix C 9테이블 + RLS, 사이트는 `publications`만 읽기 (결정)

- 장점: 트랜잭션·인덱스·RLS, 사이트와 파이프라인이 같은 진실을 읽음, Josh의 ADR-005 선택과 일치, 기존 프로젝트 재사용 가능.
- 단점: 마이그레이션 관리(SQL 파일 + `supabase db push` 또는 수동), 서비스 롤 키 관리.

### B. git JSON 유지 + 스키마만 zod로 고정

- 장점: 변경 최소.
- 단점: ADR-005에서 기각된 커밋 발행 구조 유지, 런 원장 선기록·동시성·부분 쓰기 문제 해결 불가.

### C. SQLite(Turso/LibSQL) 또는 Vercel Blob + JSON

- 장점: 가벼움.
- 단점: 새 서비스(P8), Astro SSR에서의 커넥션·RLS 부재, Supabase가 이미 구성돼 있음.

## Decision

**A.** 스키마 초안(Phase 2에서 `supabase/migrations/0001_init.sql`로 확정, 실행은 §5.6 사전 승인):

| 테이블 | 키 | 핵심 컬럼 | idempotency key |
|---|---|---|---|
| `sources` | `id text` (= `config/sources.yaml` id) | name, type(rss/html/api), url, tier(1/2/3), enabled, text_rights(enum: full/rewrite_only/link_only), terms_url, reviewed_at, last_ok_at, fail_streak, health jsonb | id |
| `raw_items` | `id uuid` | source_id, canonical_url, content_hash(sha256 of normalized body), title, published_at_source, fetched_at, payload jsonb, run_id | **unique(canonical_url)**; 본문 변경은 `content_hash` 갱신 |
| `candidates` | `id uuid` | raw_item_id, run_id, rubric_version, scores jsonb({relevance, timeliness, impact, reader_value, insight_potential}), total numeric, selected bool, reject_reason text, created_at | unique(raw_item_id, rubric_version) |
| `drafts` | `id uuid` | candidate_id, content_type(news_brief/insight_essay), prompt_version, model, body jsonb(Appendix A 필드), input_tokens, output_tokens, cost_usd, created_at, run_id | unique(candidate_id, content_type, prompt_version) |
| `qa_results` | `id uuid` | draft_id, rule, severity(hard/soft), pass bool, reason_code, evidence jsonb, checked_at | unique(draft_id, rule, checked_at) |
| `publications` | `id uuid` | draft_id(null 허용: 레거시 이관분), slug text **unique**, content_type, title, body jsonb, image jsonb({path, alt, provenance}), sources jsonb, published_at, updated_at, publisher, status(published/unpublished/quarantined), legacy_id text, noindex bool, tags text[], category, region, search tsvector | slug |
| `pipeline_runs` | `id uuid` | started_at, ended_at, status(started/partial/done/failed/budget_stop), trigger(schedule/dispatch), funnel jsonb(13컬럼), cost_total_usd, error text, git_sha | id |
| `stage_events` | `id bigserial` | run_id, stage, status, started_at, ended_at, counts jsonb, error text | (run_id, stage, started_at) |
| `dead_letters` | `id uuid` | run_id, stage, ref_table, ref_id, payload jsonb, error text, retry_count, created_at | (stage, ref_id) |
| `redirects` | `from_path text` PK | to_path, status(301/410) | from_path |

상태 전이는 테이블 간 존재로 표현한다: `raw_items`(raw) → `candidates.selected=true`(candidate) → `drafts`(draft) → `qa_results` 집계(qa) → `publications.status=published` | `candidates.reject_reason`/`qa_results` hard fail(rejected) | `dead_letters`(dead_letter). 별도 상태 컬럼을 두지 않아 전이 누락이 생기지 않는다.

레거시 매핑(R8):

- news 리더 페이지 5건 → `publications{slug:'news/'+id, legacy_id:id, content_type:'legacy_analysis', body: 현행 JSON 그대로}`.
- 컬럼 20건 → `publications{slug:'column/'+slug, legacy_id:col_id, content_type:'insight_essay'}`; 격리 2건은 `status:'quarantined'`.
- 아카이브 1,020건 중 리더 페이지가 없는 레코드는 `publications`에 넣지 않는다. 카드·검색 노출이 필요하면 `legacy_cards`(별도, noindex) 테이블로 이관 여부를 Phase 3h에서 결정. 사이트맵·RSS는 `publications`만 본다.
- 리다이렉트 5건 → `redirects`.

RLS:

- `publications`: anon `SELECT ... WHERE status='published'`. 나머지 테이블은 anon 접근 없음.
- 파이프라인·관리자 API는 service role(서버 측 환경변수, 사이트 번들에 절대 포함 금지).
- 인덱스: `publications(published_at desc)`, `publications(content_type, published_at desc)`, `raw_items(canonical_url)`, `candidates(run_id)`, `stage_events(run_id)`.

zod 계약(`packages/shared/src/schema/*.ts`): 테이블마다 Row/Insert 스키마 + Appendix A의 `NewsBrief`, `InsightEssay` 본문 스키마. 설정 스키마는 `contracts.md`. 모든 Stage의 입출력은 이 스키마로 `parse`된다(P2).

## Consequences

- (+) 발행이 단일 행 insert로 끝나고 사이트가 즉시(≤ ISR 만료) 반영. 런 원장이 abort에 내성(ADR-007).
- (+) R6: 모든 판정이 `qa_results`에 reason_code와 함께 남는다.
- (−) Supabase 마이그레이션 관리 절차가 필요(런북). 기존 `archived_articles`는 건드리지 않고 공존.
- (−) 1,020건 아카이브 카드의 처리(이관 vs 폐기)는 Phase 3h에서 Josh 결정.
- 비용: Supabase 무료/Pro 플랜 범위 내 예상(행 수천 건). 확인 필요.

## Rejected alternatives & why

- **B**: 커밋 발행 유지로 P1·관측 문제 미해결.
- **C**: 서비스 추가(P8), RLS 부재.

## 확인 필요

1. 기존 Supabase 프로젝트의 테이블 목록(`archived_articles` 존재 여부) — Josh가 대시보드에서 확인하거나 커넥터 제공.
2. 리전 선택(ap-northeast-2 vs Vercel 함수 리전).
3. 전문 검색을 Postgres `tsvector`로 할지, 현행 `search-index.json` 방식(클라이언트 검색)을 유지할지 — 3h에서 결정.
