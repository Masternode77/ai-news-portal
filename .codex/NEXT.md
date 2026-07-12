# NEXT

## Current branch
- `upgrade/gpt-5-6-sol`, based on production `origin/main` SHA `19089b66`.
- Rollback tag: `backup/pre-gpt56-upgrade-20260711T091118Z`.
- Branch carries the local upgrade checkpoints; production remains unchanged.

## Latest completed checklist item
- Enforced one strict longform contract across homepage, RSS, sitemap, and article routes.
- Added fail-closed source, claim, and SEO fidelity checks at generation and publish boundaries; failed longforms become source-linked briefs.
- Repaired legacy longform inventory with a dry-run-first, checksummed, rollback-ready migration.
- Normalized all non-longform lifecycle states: 120 source signals, 52 downgraded records, and one retained gated local analysis.
- Rebuilt taxonomy from current data with deterministic timestamps and complete sitemap paths.
- Removed stale operational routes from verification and visual QA scripts.

## Changed surfaces
- `scripts/repair-public-longform-inventory.mjs` and focused migration tests.
- Public feed/RSS/sitemap/publish-cycle eligibility and regression tests.
- Current archived/search/taxonomy read models and Applied Digital raster variants.
- Deployment verification, source discovery, and commercial visual QA route contracts.

## Validation results
- Final full suite: 350 passed, 0 failed, 1 conditional skip (351 total).
- `npm run check`: 0 errors, 11 existing hints.
- `npm audit`: 0 vulnerabilities at every severity across 406 dependencies.
- `npm run content:gate`: passed; build produced 1,520 pages.
- Public, image, admin-exclusion, and local production-surface audits passed.
- Current policy audit: 44 homepage cards, 58 archive-feed items, one gated longform route, and 0 broken images.
- Claim probes cover attached power and financial units, punctuationless and factual title-case copy, all body sentences, controlled relation anchors, unsupported guarantees, and premise-bound inference.
- Post-build migration rerun: 0 changes; input digest `7568b0dd5ff3d7f509babc9bf9728653a1cb9d7e8a345926911815088a8d2ea6`.
- Consecutive taxonomy rebuilds were byte-identical: `ae56793607a7931214cc07366e6b5a6171222f12be4a2589bf420e856992397b`.
- LOC review: tracked non-data `+1,062/-274`, new migration/tests `1,379` lines, read models `+110,015/-134,116`, and three WebP variants (43,318 bytes).
- Runtime reports, logs, artifacts, and AGENTS files are clean and excluded from this checkpoint.

## Blockers
- Production DB, object storage, and admin credentials are unavailable; production CRUD cannot be claimed.
- Production remains unchanged until the three design prototypes and preview approval gate are complete.

## Exact next step
- Continue to the three prototype design round before preview deployment.
