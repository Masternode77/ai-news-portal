# GPT-5.6 admin audit

## Read-only baseline capability

At the start of the upgrade, the existing code was a useful authenticated editor foundation
that needed consolidation rather than a parallel replacement. It provided
not replaced in parallel. It provides signed eight-hour HttpOnly/SameSite cookies,
scrypt password verification, CSRF tokens for article mutations, GitHub API persistence,
escaped editor previews, noindex metadata, and admin sitemap exclusions.

## Production route status

| Route | Status | Finding |
| --- | --- | --- |
| `/admin` | 200 | Static shell |
| `/admin/dashboard` | 200 | Static shell; data requires authenticated API |
| `/admin/login` | 404 | Required route missing |
| `/admin/articles` | 404 | Required route missing |
| `/admin/articles/new` | 404 | Required route missing |
| `/admin/sources` | 404 | Required route missing |
| `/admin/quarantine` | 404 | Required route missing |
| `/admin/pipeline` | 404 | Required route missing |
| `/admin/audit-log` | 404 | Required route missing |
| `/api/admin/login` | 500 | Fails closed; leaks required environment names |
| `/api/admin/dashboard` | 500 | Fails closed; leaks configuration details |
| `/api/admin/article` | 500 | Fails closed; leaks configuration details |

## Persistence and concurrency

`api/admin/_github.js` commits JSON files to the GitHub default branch. It has no durable
optimistic concurrency contract, transaction spanning article/revision/audit/media, or
database-enforced uniqueness. Any audit-file read error is treated as absence, so a
transient API error can overwrite history. Stored entries lack an immutable resulting
commit SHA.

The optional Supabase support is an archive sink, not the canonical writable model.
There is no image-upload endpoint, object storage adapter, quarantine scanner, or upload
revision transaction.

## Authorization and validation

- One configured user; no admin/editor role model.
- In-memory rate limiter is per serverless instance and trusts forwarded IP input.
- Request bodies are buffered without a declared size limit.
- Unknown article actions are accepted.
- A published record can remain public after invalid public fields are changed through
  non-publish actions.
- Logout/session revocation and elevated permanent-delete confirmation are incomplete.

## Required consolidation

1. Preserve the current route styling and authenticated API behavior where sound.
2. Introduce `AuthProvider` and `StorageAdapter` contracts before route expansion.
3. Make a migration-backed relational adapter canonical for users, sessions, articles,
   revisions, sources, media, pipeline runs, quarantine, and audit logs.
4. Retain JSON import/export as an explicit adapter, never the production write store.
5. Add server-enforced role and action policies, durable throttling, bounded bodies,
   optimistic revisions, soft delete, and immutable audit entries.
6. Add required routes using the same admin shell and APIs.
7. Redirect unauthenticated page access to `/admin/login` and return `no-store` for all
   auth/admin APIs.

The upgrade checkpoint implements the required consolidation with Argon2id and durable adapters.
Production CRUD remains externally blocked until database, object-storage, and auth
credentials are provided and migrations are run. The integration can be implemented
and tested locally and in preview with fail-closed production configuration.
