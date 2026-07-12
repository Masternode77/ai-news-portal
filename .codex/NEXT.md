# NEXT

## Current branch
- `upgrade/gpt-5-6-sol`, merged with `origin/main` SHA `f8bc10a2`.
- Last previewed implementation SHA: `7cb5e449`.
- Canonical cutover preview: `dpl_DGw5wWEmjC69SV9cJEg9Jj9sCbmW`.
- Rollback tag: `backup/pre-gpt56-upgrade-20260711T091118Z`.
- No push or production promotion has been performed.

## Latest completed checklist item
- Retired every remaining independent runtime mutation entrypoint behind canonical wrappers.
- Isolated the old fixture cycle under `tests/helpers` and deleted the direct public-feed writer.
- Added fail-closed legacy argument handling so retired flags cannot trigger production cycles.
- Added bounded source retries, origin spacing, in-process circuits, redacted events, and metrics.
- Added enforced static performance budgets to `content:gate`.
- Added and ran the local browser CMS lifecycle harness: 17/17 scenarios passed.
- Isolated the legacy Blog v4 regression report under a temp path so tests no longer dirty docs.
- Independent full-diff re-review returned APPROVE with zero open findings.
- Deployed exact commit `7cb5e449` to preview `dpl_DGw5wWEmjC69SV9cJEg9Jj9sCbmW`.
- Verified routes, admin fail-closed headers, 7 visual captures, nonblank pixels, and Lighthouse.
- Confirmed production remains on the previous design and was not changed by this branch.

## Changed files
- Runtime retirement: legacy command scripts, `scripts/lib/legacy-content-command-wrapper.mjs`,
  deleted `scripts/lib/public-feed-regenerator.mjs`, and `tests/helpers/content-cycle-fixture.mjs`.
- Reliability/performance: `scripts/lib/source-request-coordinator.mjs`, source fetch integration,
  static budget audit, package gates, and focused tests.
- CMS QA: `scripts/qa-admin-browser-e2e.mjs`, API/public-discovery tests, and report updates.
- Hygiene: legacy Blog v4 report-path isolation, plans, acceptance matrix, architecture reports.

## Validation results
- Current `npm test`: 507 total, 506 passed, 0 failed, 1 intentional skip.
- Admin browser E2E: 17 passed, 0 failed; all temporary CMS state cleaned.
- Quality, relevance, taxonomy, and repetition scripts: passed.
- `npm run check`: 0 errors, 0 warnings, 11 existing type hints.
- `npm audit --audit-level=low`: 0 vulnerabilities; baseline was 18.
- `npm run build`: 61 pages; 85 generated assets retained, 4,097 pruned.
- `npm run content:gate`: passed public/content/image/admin/performance gates.
- Static budgets passed: 5.10 MB dist, 11.4 KB JS, 100.2 KB CSS, 100.0 KB largest HTML,
  335.6 KB largest image.
- Independent review found unsafe ignored legacy flags and machine-specific Playwright discovery;
  both are fixed and regression-covered. Final re-review returned APPROVE with no open findings.
- Canonical preview public routes: 4/4 returned 200; retired routes: 5/5 returned 404.
- Admin pretty routes: 3/3 returned 200 with private/no-store caching.
- Admin APIs without preview credentials: intended generic 503, no-store, noindex.
- Canonical preview visual QA: desktop/mobile homepage, archive, and article passed; 0 broken images,
  placeholders, app errors, or overflow.
- Deployed image bytes: homepage 39/39 and archive 40/40 unique.
- Lighthouse mobile: performance 97, accessibility 100, best practices 92.
- Lighthouse desktop: performance 100, accessibility 100, best practices 92.
- Exact preview metadata binds deployment to full SHA `7cb5e449ef4e0a3027982c8d2fcd38bf22434dbf`.
- Preview vs production is intentionally different pending human approval; route health passes on both.

## Blockers
- Preview Postgres, Blob, and admin credentials are absent; managed persistence is not proven.
- Independent 150-item relevance and 40-sample writing labels require human review.
- OAuth/2FA, firewall, backups, monitoring, and secret rotation are operational follow-up.
- Production promotion requires explicit preview approval.

## Exact next step
- Present the exact-commit preview for human approval and keep managed persistence blocked on preview credentials.
- Keep push, production promotion, production secrets, and cache purge excluded pending explicit approval.
