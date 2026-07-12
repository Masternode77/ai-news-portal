# GPT-5.6 legacy engine map

## Classification rules

- **Canonical current** means the module is on the verified production call graph or
  directly serves the current public/admin surface. It is not automatically the target
  design.
- **Migrate** means preserve behavior or policy behind the new contract and state
  machine.
- **Compatibility wrapper** means retain the command temporarily, but route it through
  the canonical orchestrator with no independent writes.
- **Deprecate** means remove from production invocation immediately, then delete after
  migration and preview parity.
- **Delete after verification** means duplicate, unsafe fallback, or unused snapshot
  with no intended target role.

Governance files `scripts/lib/AGENTS.md` and `scripts/lib/AGENTS.override.md` are not
runtime modules and remain canonical repository guidance.

## Verified canonical current path

These modules are active in production or directly support its public read model. They
will be migrated behind contracts; current status does not authorize bypassing their
existing fidelity or fail-closed checks.

| Area | Modules | Target |
| --- | --- | --- |
| Pipeline entry and content | `content.mjs`, `curate.mjs`, `expert-lens.mjs`, `quality-gate.mjs`, `rank.mjs`, `publish-cycle.mjs`, `pipeline-heartbeat.mjs` | Orchestrator phases and state transitions |
| Source ingestion | `constants.mjs`, `fetch-feeds.mjs`, `source-fetch.mjs`, `source-registry.mjs`, `source-feed-discovery.mjs`, `source-adapter-router.mjs`, `source-priority-policy.mjs`, `source-health-check.mjs`, `source-health-monitor.mjs`, `source-deduplication.mjs`, `normalize.mjs` | `SourceConnector`, `SourceExtractor`, safe HTTP adapter |
| Extraction and fidelity | `source-extraction-fail-closed.mjs`, `source-text-completeness.mjs`, `source-summary-ratio.mjs`, `source-fidelity-check.mjs`, `source-fidelity-claim-check.mjs`, `truncation-detector.mjs`, `claim-extractor.mjs`, `numeric-claim-verifier.mjs`, `unsupported-claim-guard.mjs` | Evidence and `SourceFidelityProvider` passes |
| Relevance and taxonomy | `relevance-classifier.mjs`, `strict-infrastructure-relevance-router.mjs`, `taxonomy.mjs`, `public-lane-router.mjs`, `public-content-tier-router.mjs` | `RelevanceProvider`, `TaxonomyProvider`, route policy |
| Storage | `archive-store.mjs`, `image-store.mjs`, `state-store.mjs` | Versioned `StorageAdapter` plus public read model |
| Images | `image-generator.mjs`, `image2-provider.mjs`, `article-image-prompt.mjs`, `article-image-surface.mjs`, `article-origin-image-canonicalizer.mjs`, `static-image-prep-helpers.mjs`, `stock-card-image-detector.mjs`, `image-providers/index.mjs`, `image-providers/chatgpt-oauth-runtime.mjs`, `image-providers/gemini.mjs`, `image-providers/openai-image-api.mjs`, `image-providers/shared.mjs` | Explicit `ImageProvider` results and safe media store |
| Public presentation | `public-presentation.mjs`, `public-article-contract.mjs`, `public-surface-eligibility.mjs`, `homepage-feed-builder.mjs`, `homepage-quality-filter.mjs`, `homepage-visible-count.mjs`, `homepage-visual-lead.mjs`, `archive-feed-builder.mjs`, `related-articles.mjs`, `freshness-public-model.mjs` | One public query/read-model layer |
| Public SEO/discovery | `rss-builder.mjs`, `sitemap-builder.mjs`, `sitemap-quality-filter.mjs`, `seo-quality-policy.mjs`, `taxonomy-page-builder.mjs`, `company-entity-index.mjs`, `region-index.mjs` | One discovery inventory and thin-page policy |
| Current admin | `admin-article-store.mjs`, `admin-audit-log.mjs`, `admin-dashboard-logs.mjs`, `admin-dashboard-model.mjs`, `admin-editorial-cycle-model.mjs`, `admin-quality-model.mjs`, `admin-review-queue.mjs` | DB-backed admin service and immutable audit contract |
| Shared project utility | `project-root.mjs` | Canonical path boundary utility |

## Migrate into the canonical engine

These modules contain useful behavior from later generations. They are not allowed to
become a second production engine. Each moves behind a contract or becomes a bounded
pass in `content:cycle`.

| Capability | Modules | Canonical destination |
| --- | --- | --- |
| Evidence and corroboration | `evidence-pack-builder.mjs`, `evidence-pack-builder-v2.mjs`, `evidence-triangulation.mjs`, `secondary-source-verifier.mjs`, `multi-source-corroboration.mjs`, `research-brief-builder.mjs`, `claim-ledger.mjs` | Evidence Card and claim ledger |
| Clustering and dedupe | `signal-clusterer.mjs`, `signal-cluster-store.mjs`, `signal-cluster-summary.mjs`, `signal-deduper.mjs` | Cluster phase and storage records |
| Selection and scoring | `signal-scoring-engine.mjs`, `signal-rank-explainer.mjs`, `editorial-selection-engine.mjs`, `graded-publishing-router.mjs`, `blog-eligibility-policy.mjs` | Route policy with reason codes; scores remain private |
| Angle and structure | `editorial-angle-selector.mjs`, `editorial-archetype-router-v2.mjs`, `editorial-thesis-generator.mjs`, `story-archetype-router.mjs`, `blog-archetype-selector.mjs`, `blog-tone-selector.mjs`, `blog-outline-router.mjs`, `blog-structure-router-v2.mjs`, `section-architecture.mjs`, `insight-density-planner.mjs` | Editorial Angle and Outline passes |
| Drafting | `analyst-draft-writer.mjs`, `autonomous-blog-writer-v1.mjs`, `narrative-lede-writer.mjs`, `narrative-lede-generator-v2.mjs`, `editorial-excerpt-generator.mjs` | Route-aware `EditorialWriter` |
| Review and rewrite | `analyst-style-editor.mjs`, `senior-editor-rewrite.mjs`, `blog-final-copy-chief.mjs`, `anti-template-rewrite.mjs`, `human-editor-rewrite.mjs` | Critic and Senior Rewrite passes |
| Diversity and quality | `anti-template-diversity-guard.mjs`, `anti-template-guard-v2.mjs`, `bottleneck-axis-diversity.mjs`, `hook-diversity.mjs`, `voice-variation-engine.mjs`, `near-duplicate-phrase-detector.mjs`, `repeated-language-detector.mjs`, `repetition-detector.mjs`, `boilerplate-detector.mjs`, `human-style-score.mjs`, `human-blog-quality-score.mjs`, `blog-style-quality-score.mjs`, `insight-density-score.mjs` | Diversity gate over the latest 30 published items |
| Public copy safety | `banned-phrases.mjs`, `copy-quality-guard.mjs`, `copyright-safe-copy-guard.mjs`, `internal-language-guard.mjs`, `public-copy-sanitizer.mjs`, `public-template-phrase-guard.mjs`, `homepage-card-copy-guard.mjs`, `card-copy-quality-gate.mjs`, `card-copy-product-fit.mjs`, `article-body-cleaner.mjs`, `proper-noun-normalizer.mjs`, `visible-body-length.mjs` | Review policies and final public contract |
| Route length and quality | `article-detail-quality-gate.mjs`, `blog-length-policy.mjs`, `homepage-blog-surface-policy.mjs` | Route contract validator |
| Lifecycle and observability | `editorial-cycle.mjs`, `editorial-cycle-store.mjs`, `editorial-cycle-status.mjs`, `autonomous-desk-utils.mjs`, `global-source-scan.mjs`, `freshness-monitor.mjs`, `content-quarantine.mjs`, `emergency-quality-mode.mjs`, `final-report-contract.mjs` | State machine, job store, health and quarantine services |
| External editorial service | `openrouter.mjs` | Configured `EditorialWriter`/`EditorialReviewer` adapter with no long-form fallback |
| Public model candidates | `homepage-editorial-model.mjs`, `homepage-backfill.mjs`, `public-empty-state-copy.mjs` | Public query policy; no quota elevation |
| Output auditing | `rendered-output-audit.mjs` | `audit:public` library |

## Deprecate

These modules represent complete or overlapping engine generations. Their production
entry points must be disabled first; useful primitives are migrated from the preceding
table.

| Module | Runtime status | Replacement or retained boundary |
| --- | --- | --- |
| `blog-engine-v4.mjs` | Disabled from runtime entrypoints; retained by legacy regression fixtures only | Canonical editorial passes |
| `longform-engine.mjs` | Disabled as a runtime generator; retained for diagnostics and test-fixture quality assertions | Route-aware writer; Source Signal fallback only |
| `editorial-story-engine-v2.mjs` | Disabled from runtime entrypoints; retained by a direct legacy regression test only | Canonical orchestrator |
| `public-feed-regenerator.mjs` | Deleted after command and output-contract parity | Canonical public read-model builder |
| `legacy-migration.mjs` | Apply path disabled; retained for read-only migration diagnostics and tests | Versioned canonical importer |

`editorial-humanizer.mjs`, `narrative-dna.mjs`, `expert-insight-engine.mjs`, and
`article-blueprints.mjs` are not classified as retired runtime engines after the final call-graph
audit. The canonical production composition still reaches bounded policy/provider functions in
those modules through `content.mjs`, `expert-lens.mjs`, and the review gates. Their eventual
decomposition is a migration concern; deleting them now would remove active fidelity, insight,
or diversity behavior.

Compatibility wrappers accept no legacy mutation flags. `--help` returns the canonical migration
target without execution; retired arguments such as `--fixture` and `--dry-run` fail before the
canonical command can run.

## Delete after verification

| Module | Reason |
| --- | --- |
| `image-providers/chatgpt-oauth-runtime 2.mjs` | Unreferenced duplicate snapshot |
| `image-providers/gemini 2.mjs` | Unreferenced duplicate snapshot |
| `image-providers/index 2.mjs` | Unreferenced duplicate snapshot |
| `image-providers/openai-image-api 2.mjs` | Unreferenced duplicate snapshot |
| `image-providers/shared 2.mjs` | Unreferenced duplicate snapshot |
| `card-copy-fallbacks.mjs` | Contains generic banned fallback prose |

No deletion occurs until import parity, command-call search, tests, generated-data
migration, and Vercel preview verification pass.

## Command migration table

| Old module/command | Active use | Canonical replacement | Migration | Deletion date |
| --- | --- | --- | --- | --- |
| `npm run pipeline` | Production | `npm run content:cycle` | Complete: thin compatibility wrapper | After preview approval |
| `run:editorial-cycle` | Manual/alternate | `content:cycle` | Complete: thin compatibility wrapper | After two release cycles |
| `content:cycle` (fixture-only implementation) | Test/manual | Canonical orchestrator | Complete: production command no longer invokes fixture engine | N/A |
| `humanize:existing` | Manual | `content:review` | Complete: thin compatibility wrapper | After data migration |
| `regenerate:clean-content` | Manual | `content:review` | Complete: thin compatibility wrapper | After data migration |
| `regenerate:blog-surface-v4` | Manual | `content:generate` | Complete: independent writes disabled | After preview approval |
| `backfill:homepage-blogs` | Manual | `content:publish` | Complete: independent quota/write path disabled | After preview approval |
| `regenerate:narrative-dna` | Manual | `content:generate` | Complete: independent writes disabled | After preview approval |
| `regenerate:public-content-v2` | Manual | `content:review` | Complete: independent writes disabled | After preview approval |
| `migrate:legacy` | Manual | Versioned `content:import` | Read-only diagnostic; apply disabled | After migration sign-off |
| `regen:latest100` | Manual | `content:review` | Complete: thin compatibility wrapper | After migration sign-off |
| `regenerate:autonomous-analyses-v1` | Manual | `content:generate` | Complete: independent writes disabled | After preview approval |
| `regenerate-public-feed.mjs` | Historical direct script | `content:cycle` | Complete: thin compatibility wrapper | After preview approval |
| `regenerate-longform-analysis.mjs` | Historical direct script | `content:generate` | Complete: thin compatibility wrapper | After preview approval |
| `regenerate-brief-cards.mjs` | Historical direct script | `content:generate` | Complete: thin compatibility wrapper | After preview approval |
| `run-content-cycle.mjs` | Historical fixture CLI | `content:cycle` | Complete: runtime wrapper; fixture implementation isolated under `tests/helpers/` | After fixture retirement |
| `schedule-content-cycle.mjs` | Historical fixture scheduler | `content:cycle` | Complete: thin compatibility wrapper | After preview approval |
| `cleanup:public-content` | Historical direct repair writer | `content:review` | Complete: thin compatibility wrapper | After preview approval |
| `generate:missing-images` | Historical direct migration writer | `content:cycle` | Complete: canonical image phase only | After preview approval |
| `migrate:autonomous-desk-v1` | Manual | Versioned `content:import` | Read-only diagnostic; apply disabled | After migration sign-off |
| `audit:content-quality` | Manual | `content:eval` | Consolidate assertions | After parity |
| `audit:public-surface` | Manual | `audit:public` | Compatibility wrapper | After parity |
| `audit:blog-surface-v4` | Manual | `audit:public` | Remove generation-specific policy | After parity |
| `audit:autonomous-public` | Manual | `audit:public` | Compatibility wrapper | After parity |
| `audit:autonomous-current` | Manual | `audit:production` | Compatibility wrapper | After parity |
| `qa:qc` and visual commands | Manual/CI | `audit:public`, `audit:production`, visual QA | Keep bounded visual helpers | N/A |

## Target command surface

The only supported production lifecycle commands will be `content:ingest`,
`content:extract`, `content:classify`, `content:cluster`, `content:generate`,
`content:review`, `content:publish`, `content:cycle`, `content:eval`, `audit:public`,
`audit:production`, `test`, and `build`. Legacy names may call these commands during the
migration, but may not import old engines or write public state independently.
