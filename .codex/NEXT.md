# NEXT

## Current branch
- `upgrade/gpt-5-6-sol`, based on production `origin/main` SHA `19089b66`.
- Rollback tag: `backup/pre-gpt56-upgrade-20260711T091118Z`.
- Branch carries the local upgrade checkpoints; production remains unchanged.

## Latest completed checklist item
- Implemented the selected Midnight Intelligence public UI across the homepage,
  archive, taxonomy listings, search, and article routes.
- Repaired public eligibility and relevance so source-grounded infrastructure
  stories remain visible while consumer/software-only and generated boilerplate
  are excluded.
- Verified recent homepage diversity across capacity, power, capital,
  supply-chain, and risk, with real raster imagery on every visible story.

## Changed surfaces
- Public routes and shared reader components under `src/pages/`,
  `src/components/`, and `src/styles/public-intelligence.css`.
- Search, route-label, article-reading, relevance, feed ordering, and visual-lead
  helpers under `src/lib/` and `scripts/lib/`.
- Focused regression tests for copy quality, public filtering, images, search,
  article rendering, homepage hierarchy, and RSS compatibility.

## Validation results
- Final full suite: 369 passed, 0 failed, 1 intentional skip (370 total).
- `npm run check`: 0 errors, 0 warnings, 9 existing hints.
- `npm audit`: 0 vulnerabilities at every severity across 406 dependencies.
- `npm run build`: passed; build produced 1,529 pages.
- Chromium desktop/mobile QA passed for homepage, archive, search, and article:
  HTTP 200, zero horizontal overflow, broken images, public admin links, or
  generic-copy matches.
- Final screenshot evidence is local under `artifacts/public-final-review/` and
  intentionally ignored as runtime evidence.
- `npm run content:gate`: passed; 1,529 routes built, 19 release-gate tests
  passed, and public copy, homepage, feed-volume, image, and admin-exclusion
  audits passed.
- Independent code review findings were repaired. Final independent visual
  review found zero P0-P2 issues in desktop v4 and mobile v5 captures.

## Blockers
- Production DB, object storage, and admin credentials are unavailable; production CRUD cannot be claimed.
- Production remains unchanged until preview deployment and explicit approval.

## Exact next step
- Create the local public-surface checkpoint commit, then begin secure CMS
  containment by removing data-bearing static admin routes and introducing a
  durable storage boundary. Do not push or deploy production.
