# Admin API Instructions

## OVERVIEW

`api/` contains Vercel serverless endpoints for the private Compute Current admin/editor surface.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Auth/session behavior | `api/admin/_auth.js`, `api/admin/login.js` | Cookie signing depends on admin secrets. |
| CMS/storage boundary | `api/admin/_storage.js`, `src/admin/admin-cms-service.mjs`, `src/plugins/storage` | Postgres is the production adapter; local storage is for development/tests. |
| Article reads/writes | `api/admin/article.js`, `api/admin/articles.js`, `api/admin/revisions.js` | Mutations use the CMS service, optimistic versions, revisions, and audit records. |
| Media | `api/admin/media.js`, `src/plugins/storage/admin-media-storage.mjs` | Production objects remain private until read-model promotion. |
| Dashboard data endpoint | `api/admin/dashboard.js` | Mirrors internal dashboard model needs. |
| Security regression tests | `tests/admin-*.test.mjs` | Run targeted admin tests after API changes. |

## CONVENTIONS

- Keep endpoints private, token/session protected, and unlinked from public navigation.
- Use explicit HTTP status codes and JSON error bodies.
- Keep storage access behind the CMS service and adapter contracts.
- Keep every mutation transactional, authorized, revisioned, and audited.
- Treat the legacy GitHub helper as compatibility-only; do not route new CMS writes through it.
- Check `.env.example` and docs before adding or renaming required secrets.

## ANTI-PATTERNS

- Do not log secrets, tokens, passwords, or signed cookie values.
- Do not silently accept unauthenticated writes.
- Do not write canonical CMS state to source JSON or the Vercel deployment filesystem.
- Do not acknowledge publication outbox rows until a deployed read-model version is verified.
- Do not expose admin endpoints to sitemap or public page discovery.
