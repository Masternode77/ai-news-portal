# Review Cleanup ULW Loop Plan

## TL;DR
> Summary:      Fix six review findings across migration preservation, admin publish gates, publish-cycle detail-page flags, RSS namespaces, rendered-output audits, and short SEO source-fidelity claims with RED->GREEN coverage for each.
> Deliverables:
> - Legacy migration preserves rows outside `auditLimit`.
> - Admin publish blocks failed extraction, low extraction quality, and source-gate failures.
> - Publish cycle respects `result.detailPage === false`.
> - RSS output binds the Media RSS namespace for `media:content`.
> - Rendered-output audit reads `ArticleCard` decks rendered as `.article-deck`.
> - Source-fidelity checks catch short unsupported SEO claims.
> Effort:       Medium
> Risk:         Medium - changes touch publish eligibility and public artifact generation, so regressions can leak into feeds, search, and admin publishing.

## Scope
### Must have
- Add RED->GREEN tests for all six findings before each implementation.
- Preserve all existing article rows when applying a legacy migration plan with `auditLimit < items.length`; only audited rows may be mutated.
- Block admin publish attempts for explicit extraction failures, low extraction quality, and source/public extraction gate failures while preserving the existing `422` blocked-publish response shape.
- Ensure `runPublishCycle()` materializes `articlePagePublished` from `result.detailPage`, so source-only or brief items do not get local detail pages by accident.
- Ensure generated RSS XML includes `xmlns:media="http://search.yahoo.com/mrss/"` whenever `media:content` appears.
- Ensure rendered public output audits extract decks from both `.signal-deck` and `.article-deck`.
- Ensure SEO metadata source-fidelity checks evaluate short unsupported claims under 61 characters.
- Capture task-level evidence files under `evidence/` for RED and GREEN test runs plus one edge/manual QA receipt per task.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not weaken extraction QA, repetition checks, source-fidelity checks, or product-fit boundaries; `scripts/lib/AGENTS.override.md:7` and `scripts/lib/AGENTS.override.md:23` make those publish-readiness criteria.
- Do not add new runtime or test dependencies; existing tooling is Node `node:test`, Astro, and package scripts from `package.json:31`.
- Do not rewrite public routing, homepage layout, admin auth, or RSS feed architecture beyond the six findings.
- Do not classify or mutate rows outside `auditLimit` as a side effect of preserving them.
- Do not remove `media:content`; bind the namespace instead.
- Do not make admin publish source gates depend on generated article body length alone; explicit extraction/source failure metadata must remain blocking.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD + Node built-in `node:test`; each task starts with a failing targeted test and captures RED evidence before implementation.
- QA policy: every task has agent-executed scenarios
- Evidence: `evidence/task-<N>-<slug>.<ext>`

## Execution strategy
### Parallel execution waves
> Target 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks to maximize parallelism.

Wave 1 (no dependencies):
- Task 1: Preserve legacy migration rows outside `auditLimit`
- Task 2: Block admin publish on extraction/source failures
- Task 3: Respect `result.detailPage === false` in publish-cycle artifacts
- Task 4: Bind Media RSS namespace for `media:content`
- Task 5: Teach rendered-output audit to read `.article-deck`
- Task 6: Check short unsupported SEO source-fidelity claims

Wave 2 (after Wave 1):
- Final verification wave F1-F4: depends [1, 2, 3, 4, 5, 6]

Critical path: Task 2 -> F1-F4

### Dependency matrix
| Task | Depends on | Blocks | Can parallelize with |
|------|------------|--------|----------------------|
| 1    | none       | F1-F4  | 2, 3, 4, 5, 6        |
| 2    | none       | F1-F4  | 1, 3, 4, 5, 6        |
| 3    | none       | F1-F4  | 1, 2, 4, 5, 6        |
| 4    | none       | F1-F4  | 1, 2, 3, 5, 6        |
| 5    | none       | F1-F4  | 1, 2, 3, 4, 6        |
| 6    | none       | F1-F4  | 1, 2, 3, 4, 5        |
| F1-F4 | 1, 2, 3, 4, 5, 6 | none | F1, F2, F3, F4 run in parallel |

## Todos
> Implementation + Test = ONE task. Never separate.
> Every task MUST have: References + Acceptance Criteria + QA Scenarios + Commit.

- [ ] 1. Preserve legacy migration rows outside `auditLimit`

  What to do: Add a failing test in `tests/legacy-migration.test.mjs` that builds more input rows than the `auditLimit`, applies the plan, and proves every original row is still present in `updatedArticles` and `rollback`. Then change `scripts/lib/legacy-migration.mjs` so `buildLegacyMigrationPlan()` retains an immutable source row list for application while `classifications`, `counts`, and `latest100Eligible` stay bounded by `auditLimit` and `regenerationLimit`. `applyLegacyMigrationPlan()` should apply classified actions by ID and pass through rows outside the audited set unchanged.
  Must NOT do: Do not expand `latest100Eligible` to all rows. Do not mutate rows outside `auditLimit`. Do not change the action names in `LEGACY_MIGRATION_ACTIONS`.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [F1-F4] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `scripts/lib/legacy-migration.mjs:112` - `buildLegacyMigrationPlan()` currently slices `items` to `auditLimit`.
  - Pattern:  `scripts/lib/legacy-migration.mjs:115` - only audited rows become `classifications`.
  - Pattern:  `scripts/lib/legacy-migration.mjs:131` - `latest100Eligible` is derived from `classifications` and must remain bounded.
  - Pattern:  `scripts/lib/legacy-migration.mjs:220` - `applyLegacyMigrationPlan()` currently maps only `plan.classifications`.
  - Pattern:  `scripts/migrate-legacy-content.mjs:79` - migration writes `applied.updatedArticles.slice(0, 50)` and would drop omitted rows.
  - Pattern:  `scripts/regenerate-latest100.mjs:37` - latest-100 report uses `plan.latest100Eligible` IDs.
  - Pattern:  `scripts/generate-missing-images.mjs:41` - missing-image report uses `plan.latest100Eligible` IDs.
  - API/Type: `scripts/lib/legacy-migration.mjs:46` - classification records carry `id`, `action`, `reasons`, and original `article`.
  - Test:     `tests/legacy-migration.test.mjs:72` - existing artifact update test covers the full-audit case only.
  - External: none - repo-local migration contract.

  Acceptance criteria (agent-executable only):
  - [ ] After adding the RED test but before implementation, `node --test tests/legacy-migration.test.mjs` exits non-zero and the failure shows rows outside `auditLimit` are missing.
  - [ ] After implementation, `node --test tests/legacy-migration.test.mjs` exits 0.
  - [ ] The new test asserts `plan.classifications.length === 1` when `auditLimit: 1`, `applied.updatedArticles.length === fixtures.length`, all original IDs are present, and rows outside the audit limit are deep-equal to their input rows.
  - [ ] `node --input-type=module - <<'NODE'` below exits 0:
  ```bash
  node --input-type=module - <<'NODE'
  import assert from 'node:assert/strict';
  import { buildLegacyMigrationPlan, applyLegacyMigrationPlan } from './scripts/lib/legacy-migration.mjs';
  const rows = [
    { id: 'audited', title: 'Cooling supplier expands CDU capacity', source: 'Thermal News', sourceUrl: 'https://example.com/a', extraction_quality_score: 0.9, infrastructure_relevance_score: 0.8, articleText: 'Cooling delivery for AI racks controls deployment timing. '.repeat(20) },
    { id: 'outside-1', title: 'Existing public row one', public_status: 'published', articlePagePublished: true, publishedAt: '2026-05-01T00:00:00Z', sourceUrl: 'https://example.com/b', articleText: 'Preserve this row unchanged. '.repeat(25) },
    { id: 'outside-2', title: 'Existing public row two', public_status: 'published', articlePagePublished: true, publishedAt: '2026-05-02T00:00:00Z', sourceUrl: 'https://example.com/c', articleText: 'Preserve this row unchanged too. '.repeat(25) },
  ];
  const plan = buildLegacyMigrationPlan(rows, { auditLimit: 1, regenerationLimit: 10 });
  const applied = applyLegacyMigrationPlan(plan);
  assert.equal(plan.classifications.length, 1);
  assert.equal(applied.updatedArticles.length, rows.length);
  assert.deepEqual(applied.updatedArticles.find((row) => row.id === 'outside-1'), rows[1]);
  assert.deepEqual(applied.updatedArticles.find((row) => row.id === 'outside-2'), rows[2]);
  NODE
  ```

  QA scenarios (MANDATORY - task incomplete without these):
  > Name the exact tool AND its exact invocation - not "verify it works". Browser use: use Chrome to drive the page; if Chrome is not available, download and use agent-browser (https://github.com/vercel-labs/agent-browser). Computer use: OS-level GUI automation for a non-browser desktop app.
  ```
  Scenario: RED regression proves dropped rows before the fix
    Tool:     bash
    Steps:    mkdir -p evidence && node --test tests/legacy-migration.test.mjs > evidence/task-1-legacy-migration-red.txt 2>&1
    Expected: Command exits non-zero before implementation; evidence contains an assertion failure for missing rows outside auditLimit.
    Evidence: evidence/task-1-legacy-migration-red.txt

  Scenario: GREEN preservation keeps unaudited rows unchanged
    Tool:     bash
    Steps:    mkdir -p evidence && node --test tests/legacy-migration.test.mjs > evidence/task-1-legacy-migration-green.txt 2>&1 && node --input-type=module -e "import assert from 'node:assert/strict'; import { buildLegacyMigrationPlan, applyLegacyMigrationPlan } from './scripts/lib/legacy-migration.mjs'; const rows = [{ id: 'audited', title: 'Cooling supplier expands CDU capacity', source: 'Thermal News', sourceUrl: 'https://example.com/a', extraction_quality_score: 0.9, infrastructure_relevance_score: 0.8, articleText: 'Cooling delivery for AI racks controls deployment timing. '.repeat(20) }, { id: 'outside-1', title: 'Existing public row one', public_status: 'published', articlePagePublished: true, publishedAt: '2026-05-01T00:00:00Z', sourceUrl: 'https://example.com/b', articleText: 'Preserve this row unchanged. '.repeat(25) }, { id: 'outside-2', title: 'Existing public row two', public_status: 'published', articlePagePublished: true, publishedAt: '2026-05-02T00:00:00Z', sourceUrl: 'https://example.com/c', articleText: 'Preserve this row unchanged too. '.repeat(25) }]; const plan = buildLegacyMigrationPlan(rows, { auditLimit: 1, regenerationLimit: 10 }); const applied = applyLegacyMigrationPlan(plan); assert.equal(plan.classifications.length, 1); assert.equal(applied.updatedArticles.length, rows.length); assert.deepEqual(applied.updatedArticles.find((row) => row.id === 'outside-1'), rows[1]); assert.deepEqual(applied.updatedArticles.find((row) => row.id === 'outside-2'), rows[2]); console.log(JSON.stringify({ classifications: plan.classifications.length, updatedArticles: applied.updatedArticles.length }));" > evidence/task-1-legacy-migration-edge.txt 2>&1
    Expected: Both commands exit 0; edge evidence reports `{"classifications":1,"updatedArticles":3}`.
    Evidence: evidence/task-1-legacy-migration-green.txt and evidence/task-1-legacy-migration-edge.txt
  ```

  Commit: YES | Message: `fix(legacy-migration): preserve rows outside audit limit` | Files: [`scripts/lib/legacy-migration.mjs`, `tests/legacy-migration.test.mjs`]

- [ ] 2. Block admin publish on extraction and source-gate failures

  What to do: Add failing tests in `tests/admin-article-store.test.mjs` for otherwise publishable articles with `extraction_failed: true`, low extraction score, `public_extraction_passed: false`, and explicit source-gate failure metadata. Then extend `validateAdminPublishQuality()` in `scripts/lib/admin-article-store.mjs` with deterministic source gate reason collection. Keep the existing blocked-publish result shape from `applyAdminArticleAction()` so `api/admin/article.js` continues returning `422`.
  Must NOT do: Do not block `save-draft`, `hide`, `noindex`, `preview`, or regeneration actions. Do not mutate the original article on a blocked publish. Do not replace existing copy-quality errors; append source/extraction reasons.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [F1-F4] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `scripts/lib/admin-article-store.mjs:70` - `validateAdminPublishQuality()` currently gates publish copy only.
  - Pattern:  `scripts/lib/admin-article-store.mjs:143` - publish path validates a simulated candidate before mutating `next`.
  - Pattern:  `scripts/lib/admin-article-store.mjs:148` - blocked publish returns `ok: false`, `statusCode: 422`, `article: before`, `attemptedArticle`, `qualityErrors`, and `reviewQueue`.
  - Pattern:  `api/admin/_github.js:89` - admin GitHub save calls `applyAdminArticleAction()`.
  - Pattern:  `api/admin/_github.js:90` - blocked actions are returned without persistence.
  - Pattern:  `api/admin/article.js:62` - API converts blocked results into a `422` JSON response.
  - Pattern:  `scripts/lib/admin-dashboard-model.mjs:78` - existing failed extraction heuristic checks `extraction_failed`, `extraction_qa.extraction_failure_reason`, and score below `0.5`.
  - Pattern:  `scripts/lib/source-extraction-fail-closed.mjs:5` - public extraction gate minimum clean source characters is `500`.
  - Pattern:  `scripts/lib/source-extraction-fail-closed.mjs:62` - `sourceExtractionPassesPublicGate()` returns `ok` and `block_reasons`.
  - Test:     `tests/admin-article-store.test.mjs:66` - existing publish block test checks banned-copy failure and successful publish.
  - Test:     `tests/admin-article-store.test.mjs:152` - existing validator bypass test confirms non-publish actions skip validation.
  - External: none - repo-local admin publish contract.

  Acceptance criteria (agent-executable only):
  - [ ] After adding RED tests but before implementation, `node --test tests/admin-article-store.test.mjs` exits non-zero and failure output shows extraction/source reasons are missing.
  - [ ] After implementation, `node --test tests/admin-article-store.test.mjs` exits 0.
  - [ ] The new tests assert all blocked publish attempts return `ok === false`, `statusCode === 422`, `article.public_status === 'draft'`, `reviewQueue.action === 'publish-blocked'`, and reason tokens for `extraction_failed`, `extraction_quality_below_0.5`, and `source_gate_failed`.
  - [ ] `node --test tests/admin-security.test.mjs` exits 0 to confirm API/auth behavior was not regressed.

  QA scenarios (MANDATORY - task incomplete without these):
  > Name the exact tool AND its exact invocation - not "verify it works". Browser use: use Chrome to drive the page; if Chrome is not available, download and use agent-browser (https://github.com/vercel-labs/agent-browser). Computer use: OS-level GUI automation for a non-browser desktop app.
  ```
  Scenario: RED admin publish allows failed extraction before the fix
    Tool:     bash
    Steps:    mkdir -p evidence && node --test tests/admin-article-store.test.mjs > evidence/task-2-admin-publish-gates-red.txt 2>&1
    Expected: Command exits non-zero before implementation; evidence shows expected extraction/source gate reasons are absent.
    Evidence: evidence/task-2-admin-publish-gates-red.txt

  Scenario: GREEN admin publish blocks extraction/source failures and keeps drafts unchanged
    Tool:     bash
    Steps:    mkdir -p evidence && node --test tests/admin-article-store.test.mjs > evidence/task-2-admin-publish-gates-green.txt 2>&1 && node --test tests/admin-security.test.mjs > evidence/task-2-admin-security-regression.txt 2>&1
    Expected: Both commands exit 0; evidence includes passing blocked-publish cases and unchanged admin security tests.
    Evidence: evidence/task-2-admin-publish-gates-green.txt and evidence/task-2-admin-security-regression.txt
  ```

  Commit: YES | Message: `fix(admin): block publish for failed extraction gates` | Files: [`scripts/lib/admin-article-store.mjs`, `tests/admin-article-store.test.mjs`, optionally `tests/admin-security.test.mjs` only if an API-level blocked-publish regression test is added]

- [ ] 3. Respect `result.detailPage === false` in publish-cycle artifacts

  What to do: Add a failing test in `tests/content-cycle.test.mjs` where `routeArticle()` returns `coreFeedEligible: true`, a publishable tier, and `detailPage: false`; assert the materialized article stays public but has `articlePagePublished === false`, does not create `/news/<id>/` sitemap entries, and uses source-link behavior through RSS. Then update `materializeArticle()` in `scripts/lib/publish-cycle.mjs` to derive `articlePagePublished` from `result.detailPage === true`, set `signalCardOnly` or equivalent existing flag only if needed by current feed builders, and keep `homepagePublished === true` for eligible brief/source-card items.
  Must NOT do: Do not stop publishing eligible source cards to homepage/latest artifacts. Do not make hidden or `source_only` items public. Do not change `runContentCycleForArticle()` tiering logic.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [F1-F4] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `scripts/lib/publish-cycle.mjs:47` - `materializeArticle()` maps router results into public article rows.
  - Pattern:  `scripts/lib/publish-cycle.mjs:71` - `articlePagePublished` is currently hard-coded `true`.
  - Pattern:  `scripts/lib/publish-cycle.mjs:124` - publish inclusion checks `coreFeedEligible`, tier, and source-only status but not `detailPage`.
  - Pattern:  `scripts/run-content-cycle.mjs:154` - router result computes `detailPage` only for longform analysis with passing longform extraction.
  - Pattern:  `scripts/lib/public-surface-eligibility.mjs:7` - detail pages are excluded when `articlePagePublished === false`.
  - Pattern:  `scripts/lib/homepage-feed-builder.mjs:76` - homepage detail link appears only when `articlePagePublished === true` and not signal-card-only.
  - Pattern:  `scripts/lib/rss-builder.mjs:7` - RSS links to source URL when `articlePagePublished === false`.
  - Test:     `tests/content-cycle.test.mjs:32` - existing publish-cycle test already passes `detailPage` but does not assert materialized behavior.
  - Test:     `tests/public-content-tier-router.test.mjs:46` - tier router already expects some public tiers to have `detailPage === false`.
  - External: none - repo-local publish-cycle contract.

  Acceptance criteria (agent-executable only):
  - [ ] After adding the RED test but before implementation, `node --test tests/content-cycle.test.mjs` exits non-zero because `articlePagePublished` is still `true`.
  - [ ] After implementation, `node --test tests/content-cycle.test.mjs` exits 0.
  - [ ] New assertions prove a `detailPage: false` result appears in `artifacts.latestNews`, has `homepagePublished === true`, has `articlePagePublished === false`, has no `/news/<id>/` sitemap entry, and has an RSS link equal to the source URL.
  - [ ] `node --test tests/public-content-tier-router.test.mjs` exits 0.

  QA scenarios (MANDATORY - task incomplete without these):
  > Name the exact tool AND its exact invocation - not "verify it works". Browser use: use Chrome to drive the page; if Chrome is not available, download and use agent-browser (https://github.com/vercel-labs/agent-browser). Computer use: OS-level GUI automation for a non-browser desktop app.
  ```
  Scenario: RED detailPage false still creates a detail page before the fix
    Tool:     bash
    Steps:    mkdir -p evidence && node --test tests/content-cycle.test.mjs > evidence/task-3-publish-cycle-detail-page-red.txt 2>&1
    Expected: Command exits non-zero before implementation; evidence shows the `detailPage: false` article was materialized with `articlePagePublished === true` or a `/news/` sitemap entry.
    Evidence: evidence/task-3-publish-cycle-detail-page-red.txt

  Scenario: GREEN detailPage false remains homepage/RSS public without local detail page
    Tool:     bash
    Steps:    mkdir -p evidence && node --test tests/content-cycle.test.mjs > evidence/task-3-publish-cycle-detail-page-green.txt 2>&1 && node --test tests/public-content-tier-router.test.mjs > evidence/task-3-tier-router-regression.txt 2>&1
    Expected: Both commands exit 0; evidence confirms source-link behavior and unchanged tier-router expectations.
    Evidence: evidence/task-3-publish-cycle-detail-page-green.txt and evidence/task-3-tier-router-regression.txt
  ```

  Commit: YES | Message: `fix(publish-cycle): honor detail page routing flag` | Files: [`scripts/lib/publish-cycle.mjs`, `tests/content-cycle.test.mjs`]

- [ ] 4. Bind Media RSS namespace for `media:content`

  What to do: Add a failing test in `tests/rss-builder.test.mjs` that generates an RSS string through `@astrojs/rss` using `rssMetadata()` and `buildRssItems()`, then asserts the root `<rss>` tag includes `xmlns:media="http://search.yahoo.com/mrss/"` when items contain `media:content`. Implement by exporting a single Media RSS namespace constant or metadata property from `scripts/lib/rss-builder.mjs` and spreading it through `rssMetadata()` so `src/pages/rss.xml.ts` passes the namespace into `rss()`.
  Must NOT do: Do not remove image `customData`. Do not hard-code duplicate namespace strings in multiple files. Do not add a custom XML serializer.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [F1-F4] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `scripts/lib/rss-builder.mjs:38` - `buildRssItems()` builds feed item data.
  - Pattern:  `scripts/lib/rss-builder.mjs:59` - item `customData` currently emits `media:content`.
  - Pattern:  `scripts/lib/rss-builder.mjs:72` - `rssMetadata()` currently returns title, description, and site only.
  - Pattern:  `src/pages/rss.xml.ts:9` - Astro RSS response spreads `rssMetadata()` into `rss()`.
  - Pattern:  `node_modules/@astrojs/rss/README.md:174` - local package docs define `xmlns` option.
  - Pattern:  `node_modules/@astrojs/rss/README.md:178` - `xmlns` maps suffixes to strings on the opening `<rss>` tag.
  - Pattern:  `node_modules/@astrojs/rss/dist/index.js:122` - local package code writes each `xmlns` entry onto the root RSS element.
  - Test:     `tests/rss-builder.test.mjs:5` - existing test checks `media:content` exists but not that the prefix is bound.
  - External: `https://www.rssboard.org/media-rss` - Media RSS spec defines namespace URI `http://search.yahoo.com/mrss/`.
  - External: `https://www.w3.org/TR/REC-xml-names/` - W3C Namespaces in XML requires non-reserved prefixes to be declared in scope.

  Acceptance criteria (agent-executable only):
  - [ ] After adding the RED test but before implementation, `node --test tests/rss-builder.test.mjs` exits non-zero because `xmlns:media` is absent.
  - [ ] After implementation, `node --test tests/rss-builder.test.mjs` exits 0.
  - [ ] `node --input-type=module - <<'NODE'` below exits 0:
  ```bash
  node --input-type=module - <<'NODE'
  import assert from 'node:assert/strict';
  import { getRssString } from '@astrojs/rss';
  import { buildRssItems, rssMetadata } from './scripts/lib/rss-builder.mjs';
  const articleText = 'Published AI infrastructure analysis connects source evidence to power, storage, and capacity milestones. '.repeat(16);
  const items = buildRssItems([{ id: 'rss-media', title: 'RSS media namespace', publishedAt: '2026-05-20T00:00:00Z', articlePagePublished: true, homepagePublished: true, archiveOnly: false, noindex: false, seo_noindex: false, public_status: 'published', public_routing: { visibility: 'core' }, extraction_quality_score: 0.95, infrastructure_relevance_score: 0.9, category: 'Power & Grid', articleText, expertLensFull: { finalArticleBody: articleText }, deck: 'Clean public deck.' }]);
  const xml = await getRssString({ ...rssMetadata(), items });
  assert.match(xml, /xmlns:media="http:\/\/search\.yahoo\.com\/mrss\/"/);
  assert.match(xml, /<media:content\b/);
  NODE
  ```
  - [ ] `npm run build` exits 0 and `dist/rss.xml` contains both `xmlns:media="http://search.yahoo.com/mrss/"` and `<media:content`.

  QA scenarios (MANDATORY - task incomplete without these):
  > Name the exact tool AND its exact invocation - not "verify it works". Browser use: use Chrome to drive the page; if Chrome is not available, download and use agent-browser (https://github.com/vercel-labs/agent-browser). Computer use: OS-level GUI automation for a non-browser desktop app.
  ```
  Scenario: RED RSS contains media prefix without namespace before the fix
    Tool:     bash
    Steps:    mkdir -p evidence && node --test tests/rss-builder.test.mjs > evidence/task-4-rss-namespace-red.txt 2>&1
    Expected: Command exits non-zero before implementation; evidence shows `xmlns:media` assertion failed.
    Evidence: evidence/task-4-rss-namespace-red.txt

  Scenario: GREEN generated RSS binds media namespace
    Tool:     bash
    Steps:    mkdir -p evidence && node --test tests/rss-builder.test.mjs > evidence/task-4-rss-namespace-green.txt 2>&1 && npm run build > evidence/task-4-rss-build.txt 2>&1 && node -e "const fs=require('node:fs'); const xml=fs.readFileSync('dist/rss.xml','utf8'); if(!xml.includes('xmlns:media=\"http://search.yahoo.com/mrss/\"') || !xml.includes('<media:content')) process.exit(1); console.log('rss namespace ok')" > evidence/task-4-rss-dist-check.txt 2>&1
    Expected: All commands exit 0; built `dist/rss.xml` has a bound Media RSS namespace and media content elements.
    Evidence: evidence/task-4-rss-namespace-green.txt, evidence/task-4-rss-build.txt, and evidence/task-4-rss-dist-check.txt
  ```

  Commit: YES | Message: `fix(rss): declare media namespace for feed images` | Files: [`scripts/lib/rss-builder.mjs`, `src/pages/rss.xml.ts` if metadata spreading needs adjustment, `tests/rss-builder.test.mjs`]

- [ ] 5. Teach rendered-output audit to read `.article-deck`

  What to do: Add a failing fixture in `tests/public-output.test.mjs` where homepage cards use `<p class="article-deck">` and repeated deck prefixes should fail. Then update `cardRecords()` in `scripts/lib/rendered-output-audit.mjs` to read `data-deck`, `.signal-deck`, or `.article-deck` in that order. Keep support for `PublicSignalCard.astro`, which still renders `.signal-deck`.
  Must NOT do: Do not drop `.signal-deck` support. Do not parse all paragraph text as deck text. Do not weaken duplicate deck detection.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [F1-F4] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `scripts/lib/rendered-output-audit.mjs:58` - `cardRecords()` extracts public card records from rendered HTML.
  - Pattern:  `scripts/lib/rendered-output-audit.mjs:62` - `data-deck` has first priority.
  - Pattern:  `scripts/lib/rendered-output-audit.mjs:63` - current fallback regex only reads `.signal-deck`.
  - Pattern:  `scripts/lib/rendered-output-audit.mjs:180` - duplicate deck prefix failures are computed from extracted card decks.
  - Pattern:  `src/components/ArticleCard.astro:41` - `ArticleCard` renders `<p class="article-deck">`.
  - Pattern:  `src/components/PublicSignalCard.astro:33` - `PublicSignalCard` renders `<p class="signal-deck">`.
  - Test:     `tests/public-output.test.mjs:20` - clean rendered output fixture currently uses `.signal-deck`.
  - Test:     `tests/public-output.test.mjs:37` - failure fixture currently proves duplicate deck detection only with `.signal-deck`.
  - External: none - repo-local rendered HTML contract.

  Acceptance criteria (agent-executable only):
  - [ ] After adding the RED test but before implementation, `node --test tests/public-output.test.mjs` exits non-zero because `.article-deck` duplicates are not detected.
  - [ ] After implementation, `node --test tests/public-output.test.mjs` exits 0.
  - [ ] New assertions prove `.article-deck` decks trigger `duplicate deck prefix` failures.
  - [ ] Existing `.signal-deck` clean and failure fixtures still pass.

  QA scenarios (MANDATORY - task incomplete without these):
  > Name the exact tool AND its exact invocation - not "verify it works". Browser use: use Chrome to drive the page; if Chrome is not available, download and use agent-browser (https://github.com/vercel-labs/agent-browser). Computer use: OS-level GUI automation for a non-browser desktop app.
  ```
  Scenario: RED article-card decks are ignored before the fix
    Tool:     bash
    Steps:    mkdir -p evidence && node --test tests/public-output.test.mjs > evidence/task-5-rendered-output-audit-red.txt 2>&1
    Expected: Command exits non-zero before implementation; evidence shows the expected duplicate `.article-deck` failure was missing.
    Evidence: evidence/task-5-rendered-output-audit-red.txt

  Scenario: GREEN rendered-output audit catches repeated article-card decks
    Tool:     bash
    Steps:    mkdir -p evidence && node --test tests/public-output.test.mjs > evidence/task-5-rendered-output-audit-green.txt 2>&1 && node scripts/audit-rendered-public-output.mjs > evidence/task-5-rendered-output-current-dist.txt 2>&1
    Expected: Unit command exits 0; current dist audit either exits 0 or, if current rendered content has unrelated pre-existing failures, evidence contains no failure caused by missing `.article-deck` extraction.
    Evidence: evidence/task-5-rendered-output-audit-green.txt and evidence/task-5-rendered-output-current-dist.txt
  ```

  Commit: YES | Message: `fix(audit): read article card deck markup` | Files: [`scripts/lib/rendered-output-audit.mjs`, `tests/public-output.test.mjs`]

- [ ] 6. Check short unsupported SEO source-fidelity claims

  What to do: Add a failing test in `tests/source-fidelity-claim-check.test.mjs` where a short unsupported SEO claim under 61 characters, such as `Guaranteed $40B revenue next quarter.`, appears in `deck` or `metaDescription` and must make `seoMetadataClaimsSupported()` return `ok === false`. Then adjust `scripts/lib/source-fidelity-claim-check.mjs` so general body checking can keep its existing long-sentence tolerance while SEO metadata calls evaluate short claim sentences that contain significant terms or numeric assertions.
  Must NOT do: Do not make every one-word title an unsupported claim. Do not weaken existing long-form claim checks. Do not remove unsupported claim text from results.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [F1-F4] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `scripts/lib/source-fidelity-claim-check.mjs:7` - body text is split into sentence-like claims.
  - Pattern:  `scripts/lib/source-fidelity-claim-check.mjs:9` - current `claim.length > 60` filter ignores claims of 60 characters or fewer.
  - Pattern:  `scripts/lib/source-fidelity-claim-check.mjs:12` - support check uses significant terms longer than six characters.
  - Pattern:  `scripts/lib/source-fidelity-claim-check.mjs:22` - `seoMetadataClaimsSupported()` builds SEO text from title, deck, summary, snippet, why-it-matters, public presentation, and meta description.
  - Pattern:  `scripts/lib/source-fidelity-claim-check.mjs:36` - SEO metadata requires zero unsupported claims.
  - Pattern:  `scripts/lib/blog-engine-v4.mjs:297` - blog engine uses `seoMetadataClaimsSupported()` as a publish readiness gate.
  - Test:     `tests/source-fidelity-claim-check.test.mjs:13` - existing SEO metadata test only covers longer unsupported revenue claims.
  - External: none - repo-local source-fidelity policy.

  Acceptance criteria (agent-executable only):
  - [ ] After adding the RED test but before implementation, `node --test tests/source-fidelity-claim-check.test.mjs` exits non-zero because the short unsupported claim is ignored.
  - [ ] After implementation, `node --test tests/source-fidelity-claim-check.test.mjs` exits 0.
  - [ ] Existing `checkClaimsAgainstEvidence()` body behavior remains covered by the existing first test.
  - [ ] New SEO test asserts `unsupportedClaims.some((claim) => /40B revenue|revenue next quarter/i.test(claim))`.
  - [ ] `npm run test:blog-engine-v4` exits 0.

  QA scenarios (MANDATORY - task incomplete without these):
  > Name the exact tool AND its exact invocation - not "verify it works". Browser use: use Chrome to drive the page; if Chrome is not available, download and use agent-browser (https://github.com/vercel-labs/agent-browser). Computer use: OS-level GUI automation for a non-browser desktop app.
  ```
  Scenario: RED short SEO claim is ignored before the fix
    Tool:     bash
    Steps:    mkdir -p evidence && node --test tests/source-fidelity-claim-check.test.mjs > evidence/task-6-source-fidelity-short-seo-red.txt 2>&1
    Expected: Command exits non-zero before implementation; evidence shows short unsupported SEO claim was not reported.
    Evidence: evidence/task-6-source-fidelity-short-seo-red.txt

  Scenario: GREEN short SEO claim is blocked and blog engine still passes
    Tool:     bash
    Steps:    mkdir -p evidence && node --test tests/source-fidelity-claim-check.test.mjs > evidence/task-6-source-fidelity-short-seo-green.txt 2>&1 && npm run test:blog-engine-v4 > evidence/task-6-blog-engine-v4-regression.txt 2>&1
    Expected: Both commands exit 0; evidence contains a passing short unsupported SEO claim test and unchanged blog-engine regression suite.
    Evidence: evidence/task-6-source-fidelity-short-seo-green.txt and evidence/task-6-blog-engine-v4-regression.txt
  ```

  Commit: YES | Message: `fix(fidelity): validate short seo claims` | Files: [`scripts/lib/source-fidelity-claim-check.mjs`, `tests/source-fidelity-claim-check.test.mjs`]

## Final verification wave (MANDATORY - after all implementation tasks)
> Runs in PARALLEL. ALL must APPROVE. Surface results to the caller and wait for an explicit "okay" before declaring complete.
- [ ] F1. Plan compliance audit - every task done, every acceptance criterion met. Command: `mkdir -p evidence && node --test tests/legacy-migration.test.mjs tests/admin-article-store.test.mjs tests/content-cycle.test.mjs tests/rss-builder.test.mjs tests/public-output.test.mjs tests/source-fidelity-claim-check.test.mjs > evidence/f1-targeted-tests.txt 2>&1`. APPROVE only if exit code is 0 and every `task-*-green` evidence file exists.
- [ ] F2. Code quality review - diagnostics clean, idioms match, no dead code. Command: `mkdir -p evidence && npm run check > evidence/f2-astro-check.txt 2>&1 && npm run test:quality-gates > evidence/f2-quality-gates.txt 2>&1 && npm run test:blog-engine-v4 > evidence/f2-blog-engine-v4.txt 2>&1`. APPROVE only if all commands exit 0.
- [ ] F3. Real manual QA - every QA scenario executed with evidence captured. Command: `mkdir -p evidence && npm run build > evidence/f3-build.txt 2>&1 && npm run audit:public > evidence/f3-audit-public.txt 2>&1 && npm run audit:admin > evidence/f3-audit-admin.txt 2>&1 && npm run audit:images > evidence/f3-audit-images.txt 2>&1`. APPROVE only if commands exit 0 or any pre-existing content failure is documented with exact failing lines and confirmed unrelated to Tasks 1-6.
- [ ] F4. Scope fidelity - nothing extra shipped beyond Must-Have, nothing Must-NOT-Have introduced. Command: `mkdir -p evidence && git diff -- scripts/lib/legacy-migration.mjs scripts/lib/admin-article-store.mjs scripts/lib/publish-cycle.mjs scripts/lib/rss-builder.mjs src/pages/rss.xml.ts scripts/lib/rendered-output-audit.mjs scripts/lib/source-fidelity-claim-check.mjs tests/legacy-migration.test.mjs tests/admin-article-store.test.mjs tests/content-cycle.test.mjs tests/rss-builder.test.mjs tests/public-output.test.mjs tests/source-fidelity-claim-check.test.mjs > evidence/f4-scoped-diff.patch && git status --short > evidence/f4-status.txt`. APPROVE only if diffs are limited to task files plus evidence files and plan file.

## Commit strategy
- One logical change per commit. Conventional Commits (`<type>(<scope>): <subject>` body + footer).
- Atomic: every commit builds and passes tests on its own.
- No "WIP" / "fix typo squash later" commits on the final branch - clean up before merge.
- Use the repository Lore Commit Protocol: include useful trailers such as `Constraint:`, `Rejected:`, `Confidence:`, `Scope-risk:`, `Directive:`, `Tested:`, and `Not-tested:` after a blank line.
- Reference the plan file path in the final commit footer: `Plan: plans/review-cleanup-ulw-loop.md`.

## Success criteria
- All Must-Have shipped; all QA scenarios pass with captured evidence; F1-F4 approved; commit history clean.
