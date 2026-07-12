# NEXT

## Current branch
- `upgrade/gpt-5-6-sol`, merged with `origin/main` SHA `f8bc10a2`.
- Last previewed implementation SHA: `3f88df4c`; the current cutover is not yet previewed.
- Rollback tag: `backup/pre-gpt56-upgrade-20260711T091118Z`.
- No push or production promotion has been performed.

## Latest completed checklist item
- Deployed exact-commit preview `dpl_9xCSF6wHsFtNwCwV37S8xXYR1tet` from the Linux remote builder.
- Merged the current content stream without unresolved conflicts or dropped remote records.
- Repaired two verified source photos and 66 byte-duplicate legacy image records.
- Re-ran route, fail-closed API, visual, image, Lighthouse, and production-identity checks.
- Verified public/admin routes and lazy-loaded images on the final preview.
- Added a tested Vercel ignored-build rule for dashboard/pipeline state-only commits.
- Observed external `main` automation advance production; this branch did not promote it.
- Migrated all seven production content phases to one registry-driven resumable orchestrator.
- Reduced `scripts/pipeline.mjs` to a compatibility alias and removed deterministic outage longform.
- Added extraction-only evidence freezing, strict model-output schemas, lifecycle replay validation,
  fail-closed stale-longform removal, and cross-runner publication output bundles.

## Changed files
- Architecture/editorial: `src/core/`, `src/adapters/`, `src/plugins/content/`, `scripts/lib/`, CLI entry points.
- Admin/storage: `api/admin/`, `src/admin/`, `src/plugins/storage/`, `migrations/`.
- Public product: public routes/components/styles, RSS, sitemap, search, taxonomy.
- Release/security: `package.json`, lockfile, `vercel.json`, runbooks and audits.
- Image durability: generator seed, duplicate audit/repair, tests, data, and generated rasters.
- Final receipts: `docs/final-gpt56-upgrade-report.md`, visual/performance reports.

## Validation results
- Current `npm test`: 480 total, 479 passed, 0 failed, 1 intentional skip.
- Latest receipt, evidence, migration, and fidelity regression suite: 54 passed, 0 failed.
- Quality, relevance, taxonomy, and repetition scripts: passed.
- `npm run check`: 0 errors, 0 warnings, 11 existing type hints.
- `npm audit --audit-level=low`: 0 vulnerabilities; baseline was 18.
- `npm run build`: 61 pages; 85 generated assets retained, 4,097 pruned.
- `npm run content:gate`: passed all public/content/image/admin gates.
- Initial code review approved the image/receipt changes. Architecture review then found three
  trust-boundary defects; all are fixed and regression-covered. Two fresh independent reruns could
  not start because the agent quota was exhausted, so final closure used full-suite and negative probes.
- Preview public routes: 4/4 returned 200; retired routes: 5/5 returned 404.
- Admin pretty routes: 3/3 returned 200 with private/no-store caching.
- Admin APIs without preview credentials: intended generic 503, no-store, noindex.
- Exact-commit visual QA: desktop/mobile homepage and desktop article passed; 0 broken images,
  placeholders, app errors, or overflow.
- Deployed image bytes: homepage 39/39 and archive 40/40 unique.
- Lighthouse mobile: performance 97, accessibility 100, best practices 92.
- Lighthouse desktop: performance 100, accessibility 100, best practices 92.

## Blockers
- Preview Postgres, Blob, and admin credentials are absent; managed persistence is not proven.
- Independent 150-item relevance and 40-sample writing labels require human review.
- OAuth/2FA, firewall, backups, monitoring, and secret rotation are operational follow-up.
- Production promotion requires explicit preview approval.

## Exact next step
- Create the Lore commit, then deploy and verify a new exact-commit preview for the canonical cutover.
- Keep push, production promotion, production secrets, and cache purge excluded pending explicit approval.
