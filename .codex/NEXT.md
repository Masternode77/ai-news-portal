# NEXT

## Current branch
- `upgrade/gpt-5-6-sol`, based on production `origin/main` SHA `19089b66`.
- Rollback tag: `backup/pre-gpt56-upgrade-20260711T091118Z`.
- Branch carries the local upgrade checkpoints; production remains unchanged.

## Latest completed checklist item
- Consolidated the admin surface behind authenticated APIs and durable storage adapters.
- Added Argon2id auth, 64-byte session-secret enforcement, durable throttling/revocation,
  admin/editor authorization, private media ownership checks, and transactional outbox storage.
- Moved the CMS public read model to ignored `.cache/` storage and left outbox rows pending
  until a future post-deployment verifier can safely acknowledge them.

## Changed files
- Auth/admin APIs: `api/admin/`, `src/admin/`, `src/plugins/storage/`, `migrations/`.
- Public read model and surfaces: `src/lib/public-content-inventory.js`, public routes,
  RSS, sitemap, footer, and admin shells.
- Build/security: `package.json`, lockfile, `vercel.json`, export/pruner/migration scripts.
- Tests and reports: admin/auth/media/storage/read-model/pruner suites and `docs/` receipts.

## Validation results
- `npm test`: 418 tests, 417 passed, 0 failed, 1 intentional skip; all four quality scripts passed.
- Targeted auth/admin/media/read-model/pruner suite: 35/35 passed.
- `npm run check`: 0 errors, 0 warnings, 11 type hints.
- `npm audit --audit-level=low`: 0 vulnerabilities after clean `npm ci`.
- `npm run build`: 61 pages; 31.02 s; 4,071 unreachable images pruned, 83 retained.
- `npm run content:gate`: passed all rendered copy, homepage, feed, image, and admin audits.
- `npm run qa:qc`: deployable with operational follow-up; local and live checks passed.
- Independent code review: APPROVE, 0 actionable P0-P3 findings.
- Conflict-marker, secret-shaped addition, and whitespace scans: clean.

## Blockers
- Preview Postgres, Blob, and admin credentials are not configured; live persistence cannot be claimed.
- Independent 150-item relevance and 40-sample writing labels require human editorial review.
- Production remains unchanged until preview deployment and explicit approval.

## Exact next step
- Create the local checkpoint commit, deploy preview only, run rendered/visual/security checks,
  and record the exact preview URL and commit SHA. Do not deploy production.
