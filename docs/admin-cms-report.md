# Admin CMS Report

Updated: 2026-07-19

## Status

The consolidated admin CMS is implemented on the upgrade branch. Static admin pages are
thin, noindex shells; article, revision, audit, media, and session data are returned only
from authenticated APIs. Production persistence is fail-closed until Postgres and Vercel
Blob credentials are configured.

The branch includes a preview-only managed persistence probe. It requires `VERCEL_ENV=preview`,
`--target=preview`, and `ADMIN_PERSISTENCE_SCOPE=preview`, never prints credentials,
and can split write and verification across separate processes or preview deployments.

## Architecture

- Auth: signed HttpOnly, SameSite=Strict, Secure cookies in Vercel/production; CSRF on
  mutations; Argon2id password hash; admin/editor authorization; durable session revocation
  and login throttling in Postgres.
- Data: Postgres production adapter plus atomic file-backed local/test adapter.
- History: optimistic versions, immutable revisions and audit records, soft deletion,
  elevated permanent-delete confirmation.
- Media: PNG/JPEG/WebP signature checks, 3 MB and 24 MP limits, rotation/resize, metadata
  stripping by WebP re-encoding, Vercel Blob in production.
- Publication: every article mutation writes an outbox event in the same transaction.
  `admin:export-public` regenerates the complete static public read model; production builds
  run it automatically when `DATABASE_URL` is configured.
- Editorial regeneration: article and brief requests re-enter the canonical extraction-only
  evidence, generation, source-fidelity, claim, SEO, and repetition gates. Stale versions are
  rejected before provider access, failed generations create no revision or audit record, and
  serverless regeneration does not write generated image files.

## Routes

Implemented shells: `/admin/login/`, `/admin/dashboard/`, `/admin/articles/`,
`/admin/articles/new/`, `/admin/articles/editor/?id=...`, `/admin/sources/`,
`/admin/quarantine/`, `/admin/pipeline/`, and `/admin/audit-log/`. Vercel rewrites expose
the requested pretty article edit routes without embedding article data in static HTML.

The exact final preview verified all ten required login, dashboard, article list/new/view/edit,
sources, quarantine, pipeline, and audit-log paths as HTTP 200 shells with
`Cache-Control: no-store, private` and `noindex`. The dynamic article view and edit paths exercise
the Vercel rewrites rather than a duplicate admin UI. The credential-free API returned the
intended generic HTTP 503 with `Cache-Control: no-store`. This receipt comes from preview
`dpl_HpRXGKfUMERRsu25iCcYpWVvsr1S` built from implementation SHA `c9518bee`.

The local browser harness now drives the built admin UI against the real API handlers and an
isolated file/media store. All 17 required scenarios pass: redirect, login, create, title/body/
category/source edits, preview, image upload, save, publish, unpublish, soft delete, restore,
revision display, exact permanent-delete confirmation, and logout/session rejection. Public
discovery propagation is covered separately by the sitemap/RSS integration test.

## Commands Run

- `node --test tests/admin-public-read-model.test.mjs tests/admin-cms-api.test.mjs tests/admin-media.test.mjs tests/admin-cms-service.test.mjs tests/admin-storage-local.test.mjs tests/admin-storage-postgres.test.mjs tests/admin-route-contract.test.mjs`: passed, 0 failed.
- `npm audit --audit-level=low`: passed with 0 known dependency vulnerabilities.
- `node --test tests/managed-admin-persistence.test.mjs tests/admin-storage-local.test.mjs tests/admin-storage-postgres.test.mjs`: passed; covers probe boundaries, reconnect, Blob round trip, lifecycle, audit, outbox, and multi-error cleanup reporting without managed credentials.
- `npm run qa:admin:browser`: passed 17/17 scenarios against the fresh local build; evidence is written under the ignored `artifacts/admin-browser-e2e/` directory and all temporary state is removed.
- Exact-preview route probe: passed 10/10 required admin paths, including the dynamic article view
  and edit rewrites; every response was private, no-store, noindex, and free of configuration values.
- `npm run admin:verify-managed -- --phase=cycle --target=preview`: rejected before any write because preview scope and credentials were absent.

## Artifacts

- `.cache/admin-public-read-model.json`: ignored build-time publication read model with CMS ownership tombstones.
- `scripts/export-admin-public-read-model.mjs`: prebuild export that leaves outbox events pending.
- `migrations/001_admin_storage.sql`: durable CMS schema and indexes.
- `scripts/verify-managed-admin-persistence.mjs`: preview-only write/verify/cycle runner.
- `scripts/lib/managed-admin-persistence.mjs`: credential-redacted probe and bounded cleanup.
- `tests/admin-cms-api.test.mjs`, `tests/admin-media.test.mjs`, and
  `tests/admin-public-read-model.test.mjs`: API, media privacy, and publication regression coverage.
- `scripts/qa-admin-browser-e2e.mjs`: local-only browser lifecycle harness. It uses project
  Playwright when available, accepts `PLAYWRIGHT_NODE_MODULES`, and otherwise reports a clear
  unavailable-runtime failure without adding a production dependency.

## Pass/Fail

- PASS: hermetic full suite, 671 passed, 0 failed, and 0 skipped; focused route/persistence set,
  11 passed and 0 failed.
- PASS: browser admin lifecycle, 17 passed and 0 failed; publish/unpublish sitemap/RSS discovery is integration-tested.
- PASS: adversarial regeneration coverage rejects stale versions, hostile editorial direction,
  insufficient source evidence, and failed quality gates without partial persistence.
- PASS: deleted records are hidden from editors and public fallback content.
- PASS: production uploads remain private until a successful public read-model export promotes them.
- BLOCKED: live managed Postgres migration, Blob upload, and deployment-restart persistence require preview credentials.

Additional verification evidence:

- Media API integration covers login, CSRF rejection, upload, normalization, local serving,
  audit provenance, and malformed base64 rejection.
- Local persistence is tested across adapter instances and a fresh Node process; Postgres SQL is
  covered with injected transaction clients. A live managed Postgres migration has not run
  because no preview database credential is available in this checkout.

## Production Requirements

`DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`,
`ADMIN_ROLE` (or `ADMIN_USER_ROLES`), `BLOB_READ_WRITE_TOKEN`, and
`ADMIN_MEDIA_PROVIDER=vercel-blob`. Run `npm run admin:migrate` before enabling login.

## Managed Preview Receipt Procedure

Use preview credentials only. The first command creates one namespaced draft plus one private
Blob and writes an ignored, non-secret state file:

```bash
VERCEL_ENV=preview ADMIN_PERSISTENCE_SCOPE=preview npm run admin:verify-managed -- \
  --phase=write --target=preview --deployment=dpl_before_restart
```

After starting a fresh process or creating a new preview deployment against the same managed
stores, verify and clean up the probe:

```bash
VERCEL_ENV=preview ADMIN_PERSISTENCE_SCOPE=preview npm run admin:verify-managed -- \
  --phase=verify --target=preview --deployment=dpl_after_restart
```

The receipt records whether the process and deployment identifiers changed, plus article,
revision, audit, outbox, private Blob, delete/restore, and cleanup checks. `--phase=cycle` proves a
fresh adapter/connection only; it is not a substitute for the two-process/deployment receipt.
The environment flags attest the execution scope; the operator must still verify that the supplied
database and Blob token belong to isolated preview resources.

## Remaining Risks

Production CMS CRUD is not claimed complete until a preview has a managed Postgres database,
Blob token, migration receipt, restart-persistence test, and a verified rebuild trigger after
runtime publish/unpublish actions. Outbox acknowledgement is deliberately disabled until a
post-deployment consumer can verify the deployed read-model version before acknowledging rows.

## Cleanup Receipts

- Removed data-bearing static admin output in favor of noindex shells and authenticated APIs.
- Kept runtime state under ignored `.cache/`, `.omx/`, `.omo/`, `dist/`, `artifacts/`, and
  `evidence/` paths; none of those paths is a CMS source of truth.
- Preserved the legacy GitHub helpers only as compatibility surfaces; the new CMS storage path
  does not write source JSON or the Vercel deployment filesystem in production.
