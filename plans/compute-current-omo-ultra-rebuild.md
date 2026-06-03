# Compute Current OMO Ultra Rebuild

## TL;DR
> **Summary**: Rebuild Compute Current inside the existing Astro + Vercel + file-backed JSON architecture so the public product reads like a premium AI infrastructure publication, the generation pipeline fails closed on weak sources, per-article images are reliable, and the private admin CMS is secure enough for owner editing and publishing.
> **Deliverables**:
> - Fresh repo/runtime audit in `docs/omo-ultra-audit.md`.
> - Modern public homepage, article detail pages, archive/category adjacent surfaces, and visual QA artifacts.
> - Repaired humanized content pipeline with extraction QA, relevance tiering, source-fidelity, repetition, and rendered-output gates.
> - Canonical `image2` provider surface backed by OpenAI Image API when configured, with fallbacks and image metadata.
> - Secure private admin CMS at `/admin.html` and `/admin`, protected APIs, edit/publish/hide/noindex/regenerate/image controls, and audit logs.
> - Legacy migration/backfill for latest 100 eligible public items plus cache purge and production verification plan.
> - CI/public audits for rendered HTML, images, admin security, sitemap/RSS, and content quality.
> **Effort**: XL
> **Parallel**: YES - 4 waves
> **Critical Path**: Task 1 -> Task 2 -> Tasks 3/4/5/7/9 -> Tasks 6/8/10/11/12/13/14 -> Final Verification Wave

## Context

### Original Request
The pasted brief asks for an OMO Ultra Plan large-scale product rebuild for computecurrent.com across public design, automatic humanized blog generation, per-article AI images using image2/image generation provider, secure private admin CMS, legacy content migration/cache purge, and public quality audit. It states the work is not complete until the production public surface is visibly changed and passes the audit.

### Interview Summary
No follow-up user question is required. The brief provides enough acceptance criteria and the repo exploration resolved discoverable facts. Defaults applied:
- Preserve Astro + Vercel + file-backed JSON architecture for this rebuild.
- Extend current routes and scripts instead of introducing a new database in the first pass.
- Treat current admin as a seed only; harden it with password hashes, session secret, CSRF/rate limiting, protected APIs, noindex, sitemap exclusion, and audit logs.
- Treat `image2` as the canonical product/provider interface. If an `image2` wrapper does not exist, implement it as an alias/provider abstraction over the configured OpenAI Image API provider.
- Require local verification every time; live production cache purge/deployment verification runs only with credentials present and must record if skipped for missing credentials.

### Metis Review (gaps addressed)
- Docs conflict: repo constants default `OPENAI_IMAGE_MODEL` to `gpt-image-2`, while docs may mention older defaults. Plan requires code/docs/tests to converge on one default.
- Admin scope ambiguity resolved: CMS includes dashboard, article list/search/filter, article editor, review queues, regenerate text/image, replacement image, publish/hide/noindex, and audit log.
- Provider ambiguity resolved: canonical import path must not use duplicate `* 2.mjs` provider files; execution must either remove or quarantine duplicates after tests prove canonical imports.
- Final verification ambiguity resolved: local build/audits are mandatory; live production deploy/cache purge is credential-gated and cannot be faked.
- File-backed write risk addressed: plan requires backups, conflict handling, rollback, and post-save public artifact regeneration.

## Work Objectives

### Core Objective
Ship a verified Compute Current product rebuild that turns the current pipeline output into a reliable public AI infrastructure intelligence publication with secure owner editing and reproducible quality gates.

### Deliverables
- `docs/omo-ultra-audit.md`
- Public homepage and article UI components/routes.
- Humanized automatic blog generation engine and prompts.
- `image2` provider, image prompt/store/metadata scripts, fallback images, and public image components.
- Admin login/dashboard/article manager/editor/review queues/API/auth/session/audit log.
- Scheduler/content cycle scripts and admin review queue.
- Legacy migration/backfill/regeneration/cache purge scripts.
- Rendered public QA/image QA/admin security audits and npm scripts.
- `.env.example` plus admin/image/content/deployment docs.
- Final implementation reports named in the brief.

### Definition of Done (verifiable conditions with commands)
- `npm run check` exits 0.
- `npm test` exits 0.
- `npm run build` exits 0.
- `npm run migrate:legacy` exits 0 and writes `docs/legacy-migration-report.md`.
- `npm run regen:latest100` exits 0 and writes migration/regeneration evidence.
- `npm run generate:missing-images` exits 0 and every latest 100 eligible public item has image or fallback metadata.
- `npm run purge:cache` exits 0 or records a credential-missing skip in `docs/public-cache-purge-report.md`.
- `npm run audit:public`, `npm run audit:images`, `npm run audit:admin`, and `npm run content:gate` exit 0.
- Browser QA artifacts show `/`, one longform `/news/<id>/`, `/archive/`, one `/category/<slug>/`, `/admin.html`, and `/admin/edit/<id>/` satisfy the brief.
- HTTP QA artifacts show unauthenticated admin APIs return 401 and authenticated admin save/update persists to public artifacts.
- Live production verification is run when deploy/cache credentials exist; otherwise final report names the exact missing env vars and stops before claiming production purge.

### Must Have
- TDD RED->GREEN for every production change.
- Manual QA artifact for every user-facing criterion.
- No new dependency unless a task explicitly justifies it and records a rejected no-dependency alternative.
- No plaintext admin password commits.
- No public internal pipeline/debug/status-machine language.
- No longform generated from failed extraction QA.
- No weak consumer/software AI item forced into infrastructure framing.
- No broken public images.
- No admin routes in sitemap; admin pages are noindexed and protected.

### Must NOT Have
- No source-code edits before failing tests for the task are captured.
- No `as any`, `@ts-ignore`, skipped tests, deleted failing tests, or lint suppressions.
- No hidden production side effects during local QA; production purge/deploy requires credentials and recorded response.
- No DB migration in this plan unless an executor obtains explicit user approval.
- No public UI text describing implementation details or pipeline internals.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed, except credential-gated live production operations which must be reported as blocked/skipped if credentials are absent.

- Test decision: TDD RED-GREEN-REFACTOR using Node `node:test`, Astro check/build, and existing npm script conventions.
- QA policy: Every task has at least one happy-path and one failure/edge manual QA scenario with evidence.
- Evidence root: `evidence/compute-current-omo-ultra-rebuild/`.
- Manual-QA channels:
  - Browser use: Playwright/Chromium against `npm run dev` or `npm run preview`.
  - HTTP call: `curl -i` against local Vercel/Astro/preview API where applicable.
  - tmux: long-running CLI scripts and content cycles.
- Cleanup: every QA task must kill spawned dev/preview/tmux processes and record cleanup receipts in the task evidence file.

## Execution Strategy

### Parallel Execution Waves
> Target: 5-8 tasks per wave. Some waves are smaller where security or migration dependencies force serialization.

Wave 1: Tasks 1, 2, 5, 7, 9
Wave 2: Tasks 3, 4, 6, 8, 10, 12
Wave 3: Tasks 11, 13, 14, 15
Wave 4: Task 16 plus Final Verification Wave

### Dependency Matrix (full, all tasks)
- Task 1 blocks all tasks by producing the authoritative audit.
- Task 2 blocks Tasks 3, 4, 6, 7, 8, 10, 11, 12, 13, 14.
- Task 3 depends on Tasks 1, 2, 5.
- Task 4 depends on Tasks 1, 2, 5, 7.
- Task 5 depends on Task 1.
- Task 6 depends on Tasks 2, 5.
- Task 7 depends on Tasks 1, 2.
- Task 8 depends on Tasks 3, 4, 7.
- Task 9 depends on Task 1.
- Task 10 depends on Tasks 2, 9.
- Task 11 depends on Tasks 7, 9, 10.
- Task 12 depends on Tasks 5, 6, 7.
- Task 13 depends on Tasks 2, 5, 6, 7, 8, 12.
- Task 14 depends on Tasks 3, 4, 8, 9, 13.
- Task 15 depends on Tasks 7, 9, 12, 13, 14.
- Task 16 depends on all implementation tasks.
- Final Verification Wave depends on Tasks 1-16.

## TODOs
> Implementation + Test = ONE task. Every task below requires RED->GREEN evidence before production edits and manual QA evidence before completion.

- [x] 1. Fresh Runtime And Public Failure Audit

  **What to do**: Inspect current repo/runtime paths and create `docs/omo-ultra-audit.md`. Document framework/routing, homepage renderer, article renderer, data stores, feeds, generation pipeline, images, cron/build, cache purge, admin/auth, env patterns, deployment assumptions, stale pages, and exact causes for old Editor's Brief templates, banned phrases, low-relevance items, missing images, stale generated article pages, and safe admin location. If missing, add a non-mutating audit script that renders/checks the current public artifacts and writes a report.
  **Must NOT do**: Do not fix production code in this task except audit/report helpers and tests for the audit helper.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: all tasks | Blocked By: none

  **References**:
  - Pattern: `docs/content-pipeline-map.md` - existing narrative map to verify against current code, not trust blindly.
  - Pattern: `scripts/audit-current-public-surface.mjs` - current audit style for public surface inspection.
  - Pattern: `scripts/audit-public-content-quality.mjs` - existing public quality audit approach.
  - API/Route: `src/pages/index.astro` - homepage renderer.
  - API/Route: `src/pages/news/[id].astro` - article detail renderer.
  - API/Route: `api/admin/_auth.js` - current admin auth risks.

  **Acceptance Criteria**:
  - [ ] `node --test tests/omo-ultra-audit.test.mjs` fails RED before helper/report implementation, then passes GREEN.
  - [ ] `docs/omo-ultra-audit.md` answers every audit question from the brief with file evidence.
  - [ ] Audit identifies actual stale/legacy/live public examples, not generic guesses.
  - [ ] Audit records current dirty worktree state and warns not to revert unrelated changes.

  **QA Scenarios**:
  ```text
  Scenario: Audit command produces complete report
    Tool: tmux
    Steps: tmux new-session -d -s ulw-qa-audit 'node scripts/audit-omo-ultra-current-state.mjs > evidence/compute-current-omo-ultra-rebuild/task-1-audit.log 2>&1'; tmux wait-for -S audit-done inside script or poll process exit; tmux capture-pane -pt ulw-qa-audit -S -200
    Expected: exit 0, report path printed, and `docs/omo-ultra-audit.md` contains all 15 audit headings.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-1-audit.log

  Scenario: Audit fails closed on missing required section
    Tool: bash
    Steps: node --test tests/omo-ultra-audit.test.mjs --test-name-pattern "fails when required audit sections are missing"
    Expected: test passes only after helper rejects incomplete report data.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-1-audit-negative.log
  ```

  **Commit**: YES | Message: `docs(audit): map current Compute Current rebuild surface` | Files: `docs/omo-ultra-audit.md`, `scripts/audit-omo-ultra-current-state.mjs`, `tests/omo-ultra-audit.test.mjs`

- [x] 2. Public Content Contract And Migration Backbone

  **What to do**: Define one canonical public article contract and migration helpers for JSON records. Normalize fields for title, dek, body markdown, category, tags, source attribution, status, publish date, canonical/source URL, article tier, relevance status, hero/thumb/OG image metadata, image status/error, audit log references, and noindex/public visibility. Keep compatibility with existing `latest-news.json`, `archived-news.json`, `search-index.json`, and `taxonomy-pages.json`.
  **Must NOT do**: Do not require a new database. Do not drop unknown fields from legacy records.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 3,4,6,7,8,10,11,12,13,14 | Blocked By: 1

  **References**:
  - Pattern: `scripts/lib/article-image-surface.mjs` - existing image field compatibility.
  - Pattern: `scripts/lib/archive-store.mjs` - latest/archive/search persistence.
  - Pattern: `scripts/lib/public-surface-eligibility.mjs` - current public inclusion decisions.
  - API/Type: `src/data/latest-news.json` - current canonical latest records.
  - API/Type: `src/data/archived-news.json` - current archive records.

  **Acceptance Criteria**:
  - [ ] `node --test tests/public-article-contract.test.mjs` goes RED then GREEN.
  - [ ] Legacy records round-trip without losing unknown fields.
  - [ ] Contract distinguishes `draft`, `published`, `hidden`, `noindex`, `longform_analysis`, `editorial_brief`, and `source_only`.
  - [ ] Contract exposes deterministic helpers for public URL, sitemap eligibility, RSS eligibility, and admin editability.

  **QA Scenarios**:
  ```text
  Scenario: Contract migrates a legacy latest item without data loss
    Tool: tmux
    Steps: tmux new-session -d -s ulw-qa-contract 'node scripts/inspect-public-contract.mjs --id <known-latest-id> --json > evidence/compute-current-omo-ultra-rebuild/task-2-contract.json'; tmux capture-pane -pt ulw-qa-contract -S -200
    Expected: JSON includes migrated status, image fields, source attribution, and `unknownFieldsPreserved:true`.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-2-contract.json

  Scenario: Malformed record is rejected with actionable errors
    Tool: bash
    Steps: node scripts/inspect-public-contract.mjs --fixture tests/fixtures/malformed-article.json
    Expected: non-zero exit and message naming missing `id`, invalid status, or invalid URL.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-2-contract-malformed.log
  ```

  **Commit**: YES | Message: `feat(content): define public article contract` | Files: `scripts/lib/public-article-contract.mjs`, `tests/public-article-contract.test.mjs`, compatible callers

- [x] 3. Modern Public Homepage And Feed Surface

  **What to do**: Redesign the homepage as a premium B2B AI infrastructure publication. Add/update `ArticleCard`, `FeaturedArticle`, `CategoryNav`, public feed builder, and responsive CSS. The first viewport must show Compute Current clearly, a strong hero, featured story, category nav, and the start of latest analysis. Show 30-50 eligible public cards when available. Remove public internal language named in the brief.
  **Must NOT do**: Do not show pipeline statuses, scores, routing decisions, quarantines, generation versions, or extraction QA details publicly.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 8,14 | Blocked By: 1,2,5

  **References**:
  - Pattern: `src/pages/index.astro` - current homepage structure.
  - Pattern: `src/components/LatestAnalysisFeed.astro` - current feed component.
  - Pattern: `src/components/ArticleListCard.astro` - existing card renderer to replace or adapt.
  - Pattern: `scripts/lib/homepage-feed-builder.mjs` - feed eligibility and copy generation.
  - Pattern: `src/styles/global.css` - existing global design system.

  **Acceptance Criteria**:
  - [ ] `node --test tests/homepage-layout.test.mjs tests/public-homepage-regression.test.mjs tests/homepage-quality-filter.test.mjs` goes RED then GREEN for new requirements.
  - [ ] Homepage renders at least 30 cards when 30 eligible fixtures exist.
  - [ ] Every card shows title, human deck, category, date/source, CTA, and image or fallback.
  - [ ] Public copy contains none of the banned internal phrases listed in the brief.
  - [ ] Responsive screenshots at 390x844 and 1440x1000 show no overlapping text.

  **QA Scenarios**:
  ```text
  Scenario: Desktop homepage looks like the publication surface
    Tool: Browser use / Playwright
    Steps: npm run dev -- --host 127.0.0.1 --port 4321; page.goto('http://127.0.0.1:4321/'); screenshot to evidence/compute-current-omo-ultra-rebuild/task-3-home-desktop.png; assert h1 text, nav labels, featured story, and >=30 article cards.
    Expected: screenshot exists, assertions pass, no internal-language selectors/text found.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-3-home-desktop.png

  Scenario: Empty/low-eligible feed uses public editorial empty state
    Tool: tmux
    Steps: tmux new-session -d -s ulw-qa-home-empty 'HOMEPAGE_FIXTURE=empty npm run build > evidence/compute-current-omo-ultra-rebuild/task-3-home-empty.log 2>&1'
    Expected: build exits 0 and rendered homepage contains no cycle/status-machine language.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-3-home-empty.log
  ```

  **Commit**: YES | Message: `feat(public): redesign homepage feed` | Files: `src/pages/index.astro`, `src/components/ArticleCard.astro`, `src/components/FeaturedArticle.astro`, `src/components/CategoryNav.astro`, `scripts/lib/homepage-feed-builder.mjs`, `src/styles/global.css`, tests

- [x] 4. Publication-Grade Article Detail Template

  **What to do**: Rework article detail pages so the first screen feels like a real publication article. Add/update `LongformArticleBody`, `ArticleHeroImage`, `RelatedArticles`, `SourceAttribution`, and article page layout. Use breadcrumb, category/date/source, hero image, title, dek, byline, source attribution, longform body, natural "what to watch/bottom line" if present, source link, subtle AI disclosure, and related articles.
  **Must NOT do**: Do not expose relevance scores, extraction QA, article blueprint, routing decision, noindex policy, raw NarrativeDNA, model/prompt labels, or other internal metadata.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 8,14 | Blocked By: 1,2,5,7

  **References**:
  - Pattern: `src/pages/news/[id].astro` - current detail route.
  - Pattern: `src/components/ArticleHeader.astro` - existing article header.
  - Pattern: `src/components/ArticleBody.astro` - current body renderer.
  - Pattern: `src/components/SourceAttribution.astro` - existing source attribution.
  - Pattern: `scripts/lib/article-detail-quality-gate.mjs` - detail quality checks.

  **Acceptance Criteria**:
  - [ ] `node --test tests/article-page-template.test.mjs tests/article-page-autonomous.test.mjs tests/article-detail-quality-gate.test.mjs` goes RED then GREEN.
  - [ ] Longform article body is the main product and meets visible length/section requirements.
  - [ ] Hero image appears above or near headline and has useful alt text.
  - [ ] Related articles render from same/adjacent category without duplicates.
  - [ ] AI disclosure is present but visually secondary.

  **QA Scenarios**:
  ```text
  Scenario: Longform article renders publication template
    Tool: Browser use / Playwright
    Steps: npm run dev -- --host 127.0.0.1 --port 4321; choose first public longform id from `src/data/latest-news.json`; page.goto(`http://127.0.0.1:4321/news/${id}/`); screenshot to evidence/compute-current-omo-ultra-rebuild/task-4-article.png; assert breadcrumb, byline, source attribution, hero image, body, disclosure, related articles.
    Expected: all assertions pass and screenshot has no internal metadata text.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-4-article.png

  Scenario: Article with missing optional fields fails gracefully
    Tool: bash
    Steps: ARTICLE_FIXTURE=missing-optional npm run build
    Expected: build exits 0, page uses fallback deck/source/image and no broken image.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-4-missing-fields.log
  ```

  **Commit**: YES | Message: `feat(public): render articles as publication pages` | Files: `src/pages/news/[id].astro`, article components, `scripts/lib/article-detail-quality-gate.mjs`, tests

- [x] 5. Extraction QA, Relevance Routing, And Tier Policy

  **What to do**: Repair or create the explicit pipeline sequence: source fetch -> source extraction QA -> relevance router -> content tier router -> evidence pack builder. Ensure failed extraction cannot generate longform, weak consumer/gaming/wearable/3D printer items are hidden/source-only unless manually approved, and briefs remain available when longform does not qualify.
  **Must NOT do**: Do not weaken existing extraction QA, source fidelity, repetition, or product-fit guards.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 3,4,6,12,13,14 | Blocked By: 1

  **References**:
  - Rule: `scripts/lib/AGENTS.override.md` - extraction QA and product-fit acceptance criteria.
  - Pattern: `scripts/lib/source-fetch.mjs` - current source extraction.
  - Pattern: `scripts/lib/source-extraction-fail-closed.mjs` - fail-closed checks.
  - Pattern: `scripts/lib/relevance-classifier.mjs` - existing relevance classification.
  - Pattern: `scripts/lib/public-content-tier-router.mjs` - tier routing.
  - Pattern: `config/editorial/content-tier-policy.json` and `config/relevance-routing-rules.yml` - policy thresholds.

  **Acceptance Criteria**:
  - [ ] `node --test tests/source-extraction-fail-closed.test.mjs tests/strict-infrastructure-relevance-router.test.mjs tests/public-content-tier-router.test.mjs tests/blog-eligibility-policy.test.mjs` goes RED then GREEN.
  - [ ] Dirty extraction gets `source_only` or admin review, never longform.
  - [ ] Low-relevance AI app/consumer items are excluded from core feed unless manually approved.
  - [ ] Thin-but-relevant items become 150-300 word briefs, not padded longform.

  **QA Scenarios**:
  ```text
  Scenario: Clean infrastructure source becomes eligible longform candidate
    Tool: tmux
    Steps: tmux new-session -d -s ulw-qa-routing-clean 'PIPELINE_OFFLINE=1 node scripts/run-content-cycle.mjs --fixture tests/fixtures/clean-infra-source.json --dry-run-json > evidence/compute-current-omo-ultra-rebuild/task-5-clean.json'
    Expected: JSON shows extraction_passed=true, tier=longform_analysis, public_status=draft_or_published.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-5-clean.json

  Scenario: Low-relevance consumer AI source is hidden/source-only
    Tool: tmux
    Steps: tmux new-session -d -s ulw-qa-routing-low 'PIPELINE_OFFLINE=1 node scripts/run-content-cycle.mjs --fixture tests/fixtures/consumer-ai-source.json --dry-run-json > evidence/compute-current-omo-ultra-rebuild/task-5-low.json'
    Expected: JSON shows tier=source_only or hidden, coreFeedEligible=false, reason mentions relevance/product fit.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-5-low.json
  ```

  **Commit**: YES | Message: `feat(pipeline): fail closed on source quality` | Files: `scripts/lib/source-fetch.mjs`, `scripts/lib/extraction-qa.mjs`, `scripts/lib/relevance-router.mjs`, `scripts/lib/content-tier-router.mjs`, policy config, tests

- [x] 6. Humanized Blog Generation Engine

  **What to do**: Restore/improve automatic generation flow: evidence pack -> Narrative DNA -> archetype selection -> longform or brief draft -> senior editor rewrite -> anti-template rewrite -> SEO metadata -> public render QA -> publish/draft/admin review. Enforce longform 4,500-7,000 visible characters where facts support it, at least 5 source-backed facts, at least 4 meaningful sections, one counterargument, second-order implication, and operator/investor/buyer decision point.
  **Must NOT do**: Do not generate fake longform padding when evidence is thin. Do not duplicate banned phrases inside prompts/fallbacks.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 12,13,14 | Blocked By: 2,5

  **References**:
  - Pattern: `scripts/lib/evidence-pack-builder-v2.mjs` - current evidence pack model.
  - Pattern: `scripts/lib/narrative-dna.mjs` - existing narrative metadata.
  - Pattern: `scripts/lib/story-archetype-router.mjs` and `config/editorial/story-archetypes.json`.
  - Pattern: `scripts/lib/senior-editor-rewrite.mjs` and `scripts/lib/anti-template-rewrite.mjs`.
  - Pattern: `scripts/lib/blog-engine-v4.mjs` and `prompts/blog-engine-v4/*`.
  - Config: `config/bannedPhrases.yml`, `config/editorial/hook-families.json`.

  **Acceptance Criteria**:
  - [ ] `node --test tests/blog-engine-v4.test.mjs tests/longform-quality.test.mjs tests/human-blog-quality-score.test.mjs tests/anti-template-guard-v2.test.mjs tests/source-fidelity-claim-check.test.mjs tests/voice-variation-engine.test.mjs` goes RED then GREEN.
  - [ ] Recent 30 article openings are stored and compared.
  - [ ] No two latest cards share first 8 words; no two latest longform articles share first 12 words.
  - [ ] Clipped fragments like `fuelin.`, `clo.`, `Hundreds o.` are blocked.
  - [ ] SEO metadata is generated only from source-supported claims.

  **QA Scenarios**:
  ```text
  Scenario: Fact-rich source produces humanized longform
    Tool: tmux
    Steps: tmux new-session -d -s ulw-qa-human-longform 'PIPELINE_OFFLINE=1 node scripts/run-content-cycle.mjs --fixture tests/fixtures/fact-rich-infra-source.json --dry-run-json > evidence/compute-current-omo-ultra-rebuild/task-6-longform.json'
    Expected: bodyVisibleCharacters between 4500 and 7000, facts>=5, sections>=4, bannedPhraseMatches=[].
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-6-longform.json

  Scenario: Thin source becomes concise editorial brief
    Tool: tmux
    Steps: tmux new-session -d -s ulw-qa-human-brief 'PIPELINE_OFFLINE=1 node scripts/run-content-cycle.mjs --fixture tests/fixtures/thin-relevant-source.json --dry-run-json > evidence/compute-current-omo-ultra-rebuild/task-6-brief.json'
    Expected: tier=editorial_brief, wordCount between 150 and 300, no fake longform sections.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-6-brief.json
  ```

  **Commit**: YES | Message: `feat(editorial): generate humanized infrastructure analysis` | Files: `scripts/lib/*writer*.mjs`, `scripts/lib/evidence-pack*.mjs`, `scripts/lib/narrative-dna.mjs`, prompts, configs, tests

- [x] 7. Canonical image2 Provider, Image Store, And Metadata

  **What to do**: Inspect existing image provider files and implement canonical `image2` provider behavior. If no wrapper exists, add `scripts/lib/image2-provider.mjs` that delegates to the configured Image API provider. Generate prompts from title, category, infrastructure layer, named entities, archetype, region, and tone. Store hero/thumb/OG assets under `/public/generated/articles/{slug}/` while preserving current `/generated/{id}` compatibility during migration. Save prompt, alt, model, generatedAt, status, error, heroImage, thumbnailImage, and ogImage. Use official OpenAI Image API docs for model/API options.
  **Must NOT do**: Do not hardcode API keys. Do not leave duplicate provider files active. Do not publish broken image boxes.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 4,8,11,12,13,15 | Blocked By: 1,2

  **References**:
  - Pattern: `scripts/lib/image-generator.mjs` - current fallback chain.
  - Pattern: `scripts/lib/image-providers/index.mjs` - provider registry.
  - Pattern: `scripts/lib/image-providers/openai-image-api.mjs` - current OpenAI Image API provider.
  - Pattern: `scripts/lib/article-image-surface.mjs` - display field compatibility.
  - Official: `https://platform.openai.com/docs/guides/image-generation/` - Image API and Responses API guidance.
  - Official: `https://platform.openai.com/docs/api-reference/images/generate` - image generation request parameters.
  - Official: `https://developers.openai.com/api/docs/models/gpt-image-2` - model reference found by research pass.

  **Acceptance Criteria**:
  - [ ] `node --test tests/image-generation.test.mjs tests/public-image-display.test.mjs tests/stock-card-image-detector.test.mjs` goes RED then GREEN.
  - [ ] `IMAGE_PROVIDER=image2` selects canonical provider.
  - [ ] Missing `OPENAI_API_KEY` degrades to category fallback with admin-visible error metadata.
  - [ ] Latest 100 eligible public items can be generated or assigned fallback images.
  - [ ] Output supports 16:9 hero, 4:3 thumbnail, and 1.91:1 OG image variants.

  **QA Scenarios**:
  ```text
  Scenario: Offline image2 dry run writes metadata and fallbacks
    Tool: tmux
    Steps: tmux new-session -d -s ulw-qa-image2 'IMAGE_PROVIDER=image2 PIPELINE_OFFLINE=1 node scripts/generate-article-image.mjs --id <known-id> --dry-run > evidence/compute-current-omo-ultra-rebuild/task-7-image2-dry.log'
    Expected: exit 0, metadata includes imageStatus=fallback, hero/thumb/og paths, no broken file paths.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-7-image2-dry.log

  Scenario: Missing API key does not publish broken image
    Tool: bash
    Steps: IMAGE_PROVIDER=image2 OPENAI_API_KEY= node scripts/generate-article-image.mjs --id <known-id> --dry-run
    Expected: exit 0 or controlled warning, imageError recorded, fallback image path exists.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-7-missing-key.log
  ```

  **Commit**: YES | Message: `feat(images): add canonical image2 article pipeline` | Files: `scripts/lib/image2-provider.mjs`, `scripts/lib/article-image-prompt.mjs`, `scripts/lib/generate-article-image.mjs`, `scripts/lib/image-store.mjs`, `scripts/lib/image-metadata.mjs`, provider registry, tests

- [x] 8. Public Image Rendering And OpenGraph Assets

  **What to do**: Wire public homepage/article/category/archive/RSS/sitemap/OG surfaces to use hero, thumbnail, and OG images or category fallbacks. Add `ArticleHeroImage`, `ArticleCardImage`, and `OpenGraphImage` components. Ensure `prepare-static-images` and build never leave broken images. Add category-level fallback images under `public/generated/fallbacks/`.
  **Must NOT do**: Do not show blank image boxes, remote URLs without validation, or fallback images as success without metadata.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 13,14 | Blocked By: 3,4,7

  **References**:
  - Pattern: `scripts/prepare-static-images.mjs` - build-time image refresh.
  - Pattern: `src/components/ArticleListCard.astro` - current card image slot.
  - Pattern: `src/components/ArticleHeader.astro` - current article image use.
  - Pattern: `src/layouts/Layout.astro` - OpenGraph image metadata.
  - Pattern: `scripts/audit-public-images.mjs` - image audit baseline.

  **Acceptance Criteria**:
  - [x] `node --test tests/image-output.test.mjs tests/public-image-display.test.mjs tests/sitemap-builder.test.mjs tests/rss-builder.test.mjs` goes RED then GREEN.
  - [x] Every homepage card has a visible image or fallback.
  - [x] Every longform article has hero and OG images.
  - [x] RSS and sitemap do not expose admin or broken image URLs.
  - [x] `npm run audit:images` exits 0.

  **QA Scenarios**:
  ```text
  Scenario: Homepage card images render
    Tool: Browser use / Playwright
    Steps: npm run dev -- --host 127.0.0.1 --port 4321; page.goto('http://127.0.0.1:4321/'); assert every visible article card image has naturalWidth>0; screenshot to evidence/compute-current-omo-ultra-rebuild/task-8-images-home.png.
    Expected: no broken images and screenshot shows image-led cards.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-8-images-home.png

  Scenario: Rendered article OG image path is reachable
    Tool: HTTP call
    Steps: curl -i http://127.0.0.1:4321/generated/articles/<slug>/og.webp
    Expected: HTTP/1.1 200, Content-Type image/webp, non-zero body length.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-8-og-curl.txt
  ```

  **Commit**: YES | Message: `feat(public): render article images everywhere` | Files: public image components, `Layout.astro`, `prepare-static-images.mjs`, image audits, tests

- [x] 9. Admin Authentication And API Security

  **What to do**: Replace plaintext admin password matching with `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, and `ADMIN_SESSION_SECRET`. Use bcrypt/argon2 or a framework-supported secure hash library; if adding a dependency, justify it. Harden HTTPOnly secure SameSite cookie session, expiration, CSRF protection for mutating requests, login throttling/logging, robots noindex, sitemap exclusion, and API auth middleware. Ensure `/admin.html` and `/admin` require login.
  **Must NOT do**: Do not commit plaintext passwords, default secrets, token values, or public JS-readable admin state.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 10,11,14,15 | Blocked By: 1

  **References**:
  - Pattern: `api/admin/_auth.js` - current session helper to replace/harden.
  - Pattern: `api/admin/login.js` - login/logout endpoint.
  - Pattern: `astro.config.mjs` - sitemap admin filtering.
  - Pattern: `src/pages/robots.txt.ts` - robots admin exclusion.
  - Pattern: `src/pages/admin/edit/[id].astro` - current private UI route.

  **Acceptance Criteria**:
  - [x] `node --test tests/admin-auth.test.mjs tests/admin-security.test.mjs tests/admin-routes.test.mjs` goes RED then GREEN.
  - [x] Wrong password cannot access admin.
  - [x] Missing/invalid session cannot access any admin API.
  - [x] Mutating admin requests require valid CSRF token.
  - [x] Admin pages are noindex and absent from sitemap.
  - [x] Login throttling/logging exists and is tested.

  **QA Scenarios**:
  ```text
  Scenario: Public user cannot access admin API
    Tool: HTTP call
    Steps: temporary local HTTP harness; GET /api/admin/article?id=known without a session.
    Expected: HTTP 401 and JSON error `Admin login required.`
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-9-http-qa.json

  Scenario: Wrong password is rejected and logged
    Tool: HTTP call
    Steps: temporary local HTTP harness; POST /api/admin/login with wrong password.
    Expected: HTTP 401, no Set-Cookie admin session, failed login recorded.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-9-http-qa.json
  ```

  **Commit**: YES | Message: `feat(admin): harden authentication and sessions` | Files: `api/admin/_auth.js`, `api/admin/login.js`, admin route guards, sitemap/robots/tests

- [x] 10. Admin Dashboard, Article Manager, And Review Queues

  **What to do**: Build admin dashboard/list routes and APIs for counts, published/drafts/hidden/failed extraction/missing image/latest generated/latest edited, search/filter by status/category/source/date, quality status, review queues, generation logs, publish logs, image logs, and audit summaries. Support `/admin.html` redirect/render and `/admin` route if supported by Astro/Vercel.
  **Must NOT do**: Do not expose admin payloads to unauthenticated public bundles or sitemap.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 11,14 | Blocked By: 2,9

  **References**:
  - Pattern: `src/pages/admin/content-quality.astro`, `src/pages/admin/source-health.astro`, existing admin pages.
  - Pattern: `scripts/lib/admin-quality-model.mjs` and `scripts/lib/admin-editorial-cycle-model.mjs`.
  - Pattern: `src/data/editorial-cycles.json`, `src/data/source-health.json`, `src/data/claim-ledger.json`.
  - Pattern: `api/admin/article.js` - API style.

  **Acceptance Criteria**:
  - [x] `node --test tests/admin-dashboard.test.mjs tests/admin-routes.test.mjs` goes RED then GREEN.
  - [x] Dashboard counts match fixture data.
  - [x] Article list search/filter is deterministic and URL-addressable.
  - [x] Review queues include failed extraction, low relevance, missing image, regeneration needed.
  - [x] Logs are visible only to authenticated admin.

  **QA Scenarios**:
  ```text
  Scenario: Admin dashboard loads after login
    Tool: Browser use / Playwright
    Steps: npm run dev -- --host 127.0.0.1 --port 4321 with test admin env; page.goto('http://127.0.0.1:4321/admin.html'); login; assert dashboard count tiles and review queue links; screenshot to evidence/compute-current-omo-ultra-rebuild/task-10-admin-dashboard.png.
    Expected: authenticated dashboard visible and unauthenticated login panel hidden.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-10-admin-dashboard.png

  Scenario: Unauthenticated dashboard route stays private
    Tool: HTTP call
    Steps: curl -i http://127.0.0.1:4321/admin
    Expected: 302 to login or 200 login shell with no private JSON/count data.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-10-admin-public.txt
  ```

  **Commit**: YES | Message: `feat(admin): add private editorial dashboard` | Files: admin routes/components/APIs, admin models, tests

- [x] 11. Admin Article Editor Actions And Persistence

  **What to do**: Expand article editor/API to edit title, dek, markdown body, category, tags, source attribution, status, publish date, canonical/source URL, hero image, thumbnail image, image alt, and image prompt. Add save draft, publish, unpublish, hide, noindex, regenerate article, regenerate brief, regenerate image, edit prompt, upload replacement image, and preview. Persist to JSON/GitHub store, update search index/taxonomy/RSS dependencies as needed, and write audit logs.
  **Must NOT do**: Do not let admin save bypass public quality gates unless status is draft/hidden/noindex. Do not lose unknown fields.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 13,14,15 | Blocked By: 7,9,10

  **References**:
  - Pattern: `src/pages/admin/edit/[id].astro` - current editor UI.
  - Pattern: `api/admin/article.js` and `api/admin/_github.js` - current persistence.
  - Pattern: `scripts/lib/archive-store.mjs` - update related public artifacts.
  - Pattern: `scripts/lib/public-article-contract.mjs` from Task 2.
  - Pattern: `scripts/lib/image-metadata.mjs` from Task 7.

  **Acceptance Criteria**:
  - [x] `node --test tests/admin-editor.test.mjs tests/admin-article-store.test.mjs tests/admin-audit-log.test.mjs` goes RED then GREEN.
  - [x] Owner can edit, publish, hide, noindex, regenerate text, regenerate image, upload/choose replacement image, and preview.
  - [x] Save updates article store and search index without data loss.
  - [x] Publish runs public quality checks; failures enter review queue.
  - [x] Audit log records actor, action, before/after summary, timestamp, and commit SHA if GitHub-backed.

  **QA Scenarios**:
  ```text
  Scenario: Admin edits and publishes an article
    Tool: Browser use / Playwright
    Steps: login at /admin.html; open `/admin/edit/<known-id>/`; change dek to `QA edited dek`; click Save draft; click Publish; visit `/news/<known-id>/`; screenshot public page.
    Expected: public page shows edited dek, status published, audit log has save and publish entries.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-11-edit-publish.png

  Scenario: Invalid public article is blocked from publish
    Tool: HTTP call
    Steps: curl -i -X POST http://127.0.0.1:4321/api/admin/articles/<known-id>/publish with authenticated cookies and body containing banned phrase fixture.
    Expected: HTTP 422 with quality errors; article remains draft/hidden.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-11-publish-blocked.txt
  ```

  **Commit**: YES | Message: `feat(admin): persist article publishing actions` | Files: editor route/components/APIs/store/audit log/tests

- [x] 12. Auto-Publish Scheduler And Content Cycle Restoration

  **What to do**: Restore `scripts/run-content-cycle.mjs`, `scripts/schedule-content-cycle.mjs`, `scripts/lib/publish-cycle.mjs`, and `scripts/lib/admin-review-queue.mjs`. Ensure one command fetches new items, applies extraction/relevance/tiering, generates text and images, updates article/card/sitemap/RSS/cache artifacts together, and sends failures to admin review. Keep site alive with clean briefs when no longform qualifies.
  **Must NOT do**: Do not publish dirty/low-relevance failures publicly. Do not expose cycle status language on public pages.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 13,14,15 | Blocked By: 5,6,7

  **References**:
  - Pattern: `scripts/pipeline.mjs` - current pipeline.
  - Pattern: `scripts/run-editorial-cycle.mjs` and `scripts/lib/editorial-cycle.mjs` - autonomous desk cycle.
  - Pattern: `.github/workflows/update-news.yml` - scheduled publish pipeline.
  - Pattern: `scripts/lib/pipeline-heartbeat.mjs` - status/health signal.
  - Pattern: `docs/content-pipeline-map.md` - current runbook.

  **Acceptance Criteria**:
  - [x] `node --test tests/content-cycle.test.mjs tests/editorial-cycle.test.mjs tests/freshness-monitor.test.mjs` goes RED then GREEN.
  - [x] `npm run content:cycle` exists and runs full offline fixture cycle.
  - [x] Generated article, image, card, sitemap, RSS, and cache report update together.
  - [x] Failure paths enter admin review queue.
  - [x] Public homepage never shows internal cycle status.

  **QA Scenarios**:
  ```text
  Scenario: Offline content cycle publishes eligible brief/longform artifacts
    Tool: tmux
    Steps: tmux new-session -d -s ulw-qa-cycle 'PIPELINE_OFFLINE=1 node scripts/run-content-cycle.mjs --fixture tests/fixtures/content-cycle-mixed.json > evidence/compute-current-omo-ultra-rebuild/task-12-cycle.log 2>&1'
    Expected: exit 0, log reports published/draft/review counts, updated JSON artifact paths, no public internal-language output.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-12-cycle.log

  Scenario: Generation failure enters review queue
    Tool: tmux
    Steps: tmux new-session -d -s ulw-qa-cycle-fail 'PIPELINE_OFFLINE=1 FORCE_GENERATION_FAILURE=1 node scripts/run-content-cycle.mjs --fixture tests/fixtures/content-cycle-one.json --dry-run-json > evidence/compute-current-omo-ultra-rebuild/task-12-cycle-fail.json'
    Expected: JSON shows item in adminReviewQueue with failure reason and no public publish.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-12-cycle-fail.json
  ```

  **Commit**: YES | Message: `feat(pipeline): restore scheduled content cycle` | Files: content cycle scripts, package scripts, workflow docs/tests

- [x] 13. Legacy Migration, Regeneration, And Cache Purge

  **What to do**: Implement migration/backfill scripts for latest 200 audit and latest 100 eligible regeneration. Classify each item as regenerate_longform, regenerate_brief, assign_fallback_image, hidden_noindex, or delete_or_410. Regenerate public feed, sitemap, RSS, search index, taxonomy images, and cache report. Specifically verify the NetApp, App Store AI, and Land and Expand examples from the brief.
  **Must NOT do**: Do not permanently delete public records without backup and explicit classification. Prefer hidden/noindex or 410 mapping with rollback.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 14,15,16 | Blocked By: 2,5,6,7,8,12

  **References**:
  - Pattern: `scripts/regenerate-public-content-v2.mjs`, `scripts/regenerate-clean-content.mjs`, `scripts/regenerate-latest100.mjs` if created.
  - Pattern: `scripts/lib/public-feed-regenerator.mjs`.
  - Pattern: `scripts/purge-public-cache.mjs` and `scripts/purge-deployment-cache.mjs`.
  - Pattern: `src/data/latest-news.json`, `src/data/archived-news.json`, `src/data/search-index.json`.
  - Pattern: `docs/legacy-migration-report.md`.

  **Acceptance Criteria**:
  - [x] `node --test tests/legacy-migration.test.mjs tests/public-content-quality-regression.test.mjs tests/truncation-detector.test.mjs` goes RED then GREEN.
  - [x] `npm run migrate:legacy`, `npm run regen:latest100`, `npm run generate:missing-images`, and `npm run purge:cache` exist.
  - [x] Latest 100 eligible public cards have images or fallbacks.
  - [x] No public article contains clipped extraction fragments.
  - [x] Low-quality consumer/gaming/wearable/3D printer items are not core feed unless manually approved.

  **QA Scenarios**:
  ```text
  Scenario: Legacy migration classifies latest 200
    Tool: tmux
    Steps: tmux new-session -d -s ulw-qa-migrate 'PIPELINE_OFFLINE=1 npm run migrate:legacy -- --dry-run > evidence/compute-current-omo-ultra-rebuild/task-13-migrate.log 2>&1'
    Expected: exit 0, report includes counts for all five classifications and named brief examples.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-13-migrate.log

  Scenario: Cache purge is credential-aware
    Tool: tmux
    Steps: tmux new-session -d -s ulw-qa-purge 'COMPUTE_CURRENT_CACHE_PURGE_URL= npm run purge:cache > evidence/compute-current-omo-ultra-rebuild/task-13-purge-skip.log 2>&1'
    Expected: exit 0 or documented skip, `docs/public-cache-purge-report.md` says skipped due missing credentials.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-13-purge-skip.log
  ```

  **Commit**: YES | Message: `feat(migration): regenerate legacy public content` | Files: migration/regeneration/cache scripts, reports, tests

- [x] 14. Rendered Public QA, Admin Audit, And CI Gate

  **What to do**: Implement rendered HTML audits for homepage, latest 50 article pages, archive, sitemap, RSS, admin exclusion, image presence, longform length, low relevance, stale legacy pages, repeated decks/openings, clipped text, source boilerplate, and broken generated images. Add npm scripts named in the brief: `audit:public`, `audit:images`, `audit:admin`, `migrate:legacy`, `regen:latest100`, `generate:missing-images`, `purge:cache`, `content:cycle`, and final `content:gate`.
  **Must NOT do**: Do not audit only data objects; rendered HTML must be inspected after build.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 15,16 | Blocked By: 3,4,8,9,13

  **References**:
  - Pattern: `scripts/audit-public-surface.mjs`, `scripts/audit-public-images.mjs`, `scripts/audit-public-copy.mjs`.
  - Pattern: `scripts/qa-visual-capture.mjs`, `scripts/qa-visual-smoke.mjs`, `scripts/qa-visual-status.mjs`.
  - Pattern: `tests/public-output.test.mjs`, `tests/image-output.test.mjs`, `tests/admin-security.test.mjs` to create.
  - Pattern: `package.json` scripts.

  **Acceptance Criteria**:
  - [x] `node --test tests/public-output.test.mjs tests/image-output.test.mjs tests/admin-security.test.mjs tests/content-cycle.test.mjs` goes RED then GREEN.
  - [x] `npm run content:gate` runs public audit, image audit, admin audit, tests, check, and build.
  - [x] CI fails on banned phrases, Editor's Brief, repeated decks/openings, broken images, admin public access, admin sitemap inclusion, too-short longform, stale pages.
  - [x] Browser QA captures homepage and article screenshots in evidence.

  **QA Scenarios**:
  ```text
  Scenario: Rendered public gate passes
    Tool: tmux
    Steps: tmux new-session -d -s ulw-qa-content-gate 'npm run content:gate > evidence/compute-current-omo-ultra-rebuild/task-14-content-gate.log 2>&1'
    Expected: exit 0 and log names public/image/admin audit pass counts.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-14-content-gate.log

  Scenario: Admin exclusion audit catches sitemap leak
    Tool: bash
    Steps: node --test tests/admin-security.test.mjs --test-name-pattern "fails when admin appears in sitemap"
    Expected: test passes by proving the guard fails on a fixture sitemap containing `/admin`.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-14-admin-sitemap-negative.log
  ```

  **Commit**: YES | Message: `test(public): gate rendered publication quality` | Files: audit scripts, tests, package scripts, CI workflow

- [x] 15. Environment, Security, And Operator Documentation

  **What to do**: Create/update `.env.example`, `docs/admin-setup.md`, `docs/image-generation-setup.md`, `docs/content-cycle-runbook.md`, `docs/automation-runbook.md`, and `docs/deployment-checklist.md`. Include password hash generation, env var setup, login/reset/secret rotation, image provider behavior/cost/fallback/regeneration/storage, content-cycle commands, cache purge, and live production verification steps.
  **Must NOT do**: Do not include real secrets or claim live production verification without captured evidence.

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 16 | Blocked By: 7,9,12,13,14

  **References**:
  - Pattern: `README.md` - existing setup/runbook language.
  - Pattern: `docs/content-pipeline-map.md` - pipeline overview.
  - Pattern: `scripts/lib/constants.mjs` - env var defaults.
  - Pattern: `api/admin/_auth.js` from Task 9 - final admin env names.
  - Official: OpenAI image docs links from Task 7.

  **Acceptance Criteria**:
  - [x] `node --test tests/docs-env-contract.test.mjs` goes RED then GREEN.
  - [x] `.env.example` includes all required brief variables and actual repo variables.
  - [x] Admin docs explain hash generation and secret rotation.
  - [x] Image docs explain provider selection, fallback behavior, regenerate controls, storage paths, and cost controls.
  - [x] Deployment checklist separates local, staging, and production credentialed steps.

  **QA Scenarios**:
  ```text
  Scenario: Env example matches code requirements
    Tool: bash
    Steps: node scripts/audit-env-docs.mjs --env .env.example --docs docs/admin-setup.md docs/image-generation-setup.md
    Expected: exit 0, no undocumented required env vars, no real-looking secrets.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-15-env-docs.log

  Scenario: Password hash command is executable in dry run
    Tool: tmux
    Steps: tmux new-session -d -s ulw-qa-admin-docs 'node scripts/admin-password-hash.mjs --password test-password --dry-run > evidence/compute-current-omo-ultra-rebuild/task-15-password-hash.log'
    Expected: exit 0, output contains hash metadata but not plaintext password.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-15-password-hash.log
  ```

  **Commit**: YES | Message: `docs(ops): document admin image and deployment setup` | Files: docs, `.env.example`, docs/env audit helper/tests

- [x] 16. Final Product Reports And Production Verification Harness

  **What to do**: Produce final reports required by the brief: `docs/omo-ultra-implementation-report.md`, `docs/modern-design-report.md`, `docs/humanized-blog-engine-report.md`, `docs/image-generation-report.md`, `docs/admin-cms-report.md`, `docs/legacy-migration-report.md`, `docs/public-qa-report.md`, and `docs/deployment-checklist.md`. Add a production verification harness that records local/staging/live URLs, build IDs, cache purge result, and screenshots. If credentials are absent, the harness must record blocked/skipped live steps and final response must not claim production visibility.
  **Must NOT do**: Do not use TODO-only reports. Do not say production reflects changes unless live URL checks and cache purge response were captured.

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: Final Verification Wave | Blocked By: 1-15

  **References**:
  - Pattern: `docs/public-qa-report.md` - existing QA report style.
  - Pattern: `docs/cache-purge-report.md`, `docs/public-cache-purge-report.md` - cache report style.
  - Pattern: `scripts/purge-public-cache.mjs` - cache purge behavior.
  - Pattern: `package.json` final commands.

  **Acceptance Criteria**:
  - [x] `node --test tests/final-report-contract.test.mjs` goes RED then GREEN.
  - [x] Every final report includes commands run, artifacts, pass/fail, and remaining risks.
  - [x] Production harness records exact live URL results or credential blockers.
  - [x] Final reports include cleanup receipts for QA resources.

  **QA Scenarios**:
  ```text
  Scenario: Production verification harness records local and live state
    Tool: tmux
    Steps: tmux new-session -d -s ulw-qa-prod 'node scripts/verify-production-surface.mjs --local http://127.0.0.1:4321 --live https://www.computecurrent.com > evidence/compute-current-omo-ultra-rebuild/task-16-production.log 2>&1'
    Expected: local checks pass; live checks either pass with status/screenshot/cache evidence or record exact missing credentials/blockers.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-16-production.log

  Scenario: Reports reject TODO-only completion
    Tool: bash
    Steps: node --test tests/final-report-contract.test.mjs --test-name-pattern "rejects TODO-only report"
    Expected: test passes by proving TODO-only report fixture fails validation.
    Evidence: evidence/compute-current-omo-ultra-rebuild/task-16-report-negative.log
  ```

  **Commit**: YES | Message: `docs(release): record Compute Current rebuild verification` | Files: final docs, production verification script/tests

## Final Verification Wave (MANDATORY - after ALL implementation tasks)
> ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing if the execution workflow requires human release approval.

- [x] F1. Plan Compliance Audit
  - Re-read this plan and confirm every top-level checkbox is completed.
  - Command: `node scripts/audit-plan-compliance.mjs plans/compute-current-omo-ultra-rebuild.md`
  - Evidence: `evidence/compute-current-omo-ultra-rebuild/f1-plan-compliance.json`

- [x] F2. Code Quality Review
  - Run LSP/diagnostics for changed files, `npm run check`, `npm test`, and `npm run build`.
  - Evidence: `evidence/compute-current-omo-ultra-rebuild/f2-code-quality.log`

- [x] F3. Real Manual QA
  - Browser: `/`, `/news/<id>/`, `/archive/`, `/category/<slug>/`, `/admin.html`, `/admin/edit/<id>/`.
  - HTTP: unauthenticated admin API 401, wrong password 401, authenticated session success, public generated image 200.
  - tmux: content cycle, migration, image generation, cache purge.
  - Evidence: `evidence/compute-current-omo-ultra-rebuild/f3-manual-qa/`

- [x] F4. Scope Fidelity Check
  - Verify final acceptance criteria 1-16 from the pasted brief one by one.
  - Confirm no unrelated user work was reverted.
  - Confirm all QA resources are cleaned up: tmux sessions killed, dev/preview ports free, temp dirs removed, browser contexts closed.
  - Evidence: `evidence/compute-current-omo-ultra-rebuild/f4-scope-fidelity.json`

- [x] F5. Ultrawork Reviewer Approval
  - Spawn `codex-ultrawork-reviewer` with goal, success criteria, diff, evidence, and notepad path.
  - Fix every finding and resubmit until unconditional approval.
  - Evidence: `evidence/compute-current-omo-ultra-rebuild/f5-reviewer-approval.md`

## Commit Strategy
- Do not auto-commit unless the user explicitly requests it.
- If committing is requested, use atomic Conventional Commit subjects plus Lore trailers in the body.
- Each commit must build and test green for its scope.
- Example body trailers:
  - `Constraint: Preserve Astro/Vercel/file-backed JSON architecture`
  - `Rejected: Introduce database in first rebuild | larger migration than requested and not required by repo facts`
  - `Confidence: high`
  - `Scope-risk: broad`
  - `Tested: <commands and manual QA artifacts>`
  - `Not-tested: <credential-gated live steps, if any>`
- Final commit footer: `Plan: plans/compute-current-omo-ultra-rebuild.md`

## Success Criteria
- Public homepage has modern design and at least 30 public cards when eligible content exists.
- Public homepage cards have images or fallback images.
- Every longform article has a hero image.
- Article pages read like human-edited blog posts, not AI summaries.
- Automatic content generation works.
- New generated content goes through humanization and anti-template rewrite.
- Low-relevance consumer/gaming/wearable articles do not appear in core AI infrastructure feed.
- Old Editor's Brief template is removed from public pages.
- Banned phrases and clipped fragments are absent from public output.
- Admin interface exists at `/admin.html` or `/admin`, requires login, and is private.
- Owner can edit, publish, hide, noindex, regenerate text, and regenerate images.
- Admin is excluded from sitemap and noindexed.
- Latest 100 eligible public items are migrated/regenerated and have images or fallback images.
- Cache purge is executed or credential-gated skip is recorded honestly.
- Public QA, image QA, and admin security audits all pass.
- Final verification includes automated tests, build/check, rendered public QA, browser screenshots, HTTP artifacts, tmux transcripts, cleanup receipts, and reviewer approval.
