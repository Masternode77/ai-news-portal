# Admin CMS Report

Updated: 2026-07-12

## Status

The consolidated admin CMS is implemented on the upgrade branch. Static admin pages are
thin, noindex shells; article, revision, audit, media, and session data are returned only
from authenticated APIs. Production persistence is fail-closed until Postgres and Vercel
Blob credentials are configured.

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

## Routes

Implemented shells: `/admin/login/`, `/admin/dashboard/`, `/admin/articles/`,
`/admin/articles/new/`, `/admin/articles/editor/?id=...`, `/admin/sources/`,
`/admin/quarantine/`, `/admin/pipeline/`, and `/admin/audit-log/`. Vercel rewrites expose
the requested pretty article edit routes without embedding article data in static HTML.

The final preview verified `/admin/articles/new`, `/admin/articles/test-article`, and
`/admin/articles/test-article/edit` as HTTP 200 shells with `Cache-Control: no-store, private`.
The credential-free `/api/admin/articles` request returned the intended generic HTTP 503 with
`Cache-Control: no-store`.

## Commands Run

- `node --test tests/admin-public-read-model.test.mjs tests/admin-cms-api.test.mjs tests/admin-media.test.mjs tests/admin-cms-service.test.mjs tests/admin-storage-local.test.mjs tests/admin-storage-postgres.test.mjs tests/admin-route-contract.test.mjs`: passed, 0 failed.
- `npm audit --audit-level=low`: passed with 0 known dependency vulnerabilities.

## Artifacts

- `.cache/admin-public-read-model.json`: ignored build-time publication read model with CMS ownership tombstones.
- `scripts/export-admin-public-read-model.mjs`: prebuild export that leaves outbox events pending.
- `src/plugins/storage/migrations/001_admin_cms.sql`: durable CMS schema and indexes.
- `tests/admin-cms-api.test.mjs`, `tests/admin-media.test.mjs`, and
  `tests/admin-public-read-model.test.mjs`: API, media privacy, and publication regression coverage.

## Pass/Fail

- PASS: targeted admin security and storage suite, 27 passed and 0 failed.
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
