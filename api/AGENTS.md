# Admin API Instructions

## OVERVIEW

`api/` contains Vercel serverless endpoints for the private Compute Current admin/editor surface.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Auth/session behavior | `api/admin/_auth.js`, `api/admin/login.js` | Cookie signing depends on admin secrets. |
| GitHub persistence | `api/admin/_github.js` | Saves are repository commits through GitHub API. |
| Article reads/writes | `api/admin/article.js` | Updates latest, archived, and search-index data. |
| Dashboard data endpoint | `api/admin/dashboard.js` | Mirrors internal dashboard model needs. |
| Security regression tests | `tests/admin-*.test.mjs` | Run targeted admin tests after API changes. |

## CONVENTIONS

- Keep endpoints private, token/session protected, and unlinked from public navigation.
- Use explicit HTTP status codes and JSON error bodies.
- Preserve GitHub commit-based persistence unless the user explicitly asks for a storage change.
- Update `src/data/search-index.json` whenever article storage changes require it.
- Check `.env.example` and docs before adding or renaming required secrets.

## ANTI-PATTERNS

- Do not log secrets, tokens, passwords, or signed cookie values.
- Do not silently accept unauthenticated writes.
- Do not add database assumptions; this API currently persists through GitHub commits.
- Do not expose admin endpoints to sitemap or public page discovery.
