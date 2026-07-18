# Security Threat Model

Updated: 2026-07-19

## Assets and Trust Boundaries

Protected assets are admin credentials, session and CSRF tokens, unpublished content,
revision/audit history, source records, media objects, database credentials, and deployment
tokens. Public Astro pages are untrusted input consumers; admin browser code, Vercel
functions, Postgres, Vercel Blob, source fetchers, upstream Git snapshots, GitHub Actions, and
Vercel are separate trust boundaries.

## Principal Threats and Controls

| Threat | Primary controls | Residual risk |
| --- | --- | --- |
| Credential stuffing | Argon2id hashes, 64+ byte HMAC signing secrets, durable per-IP throttling, failed-login records | Managed edge rate limits are still recommended |
| Session theft/replay | HttpOnly, Secure, SameSite=Strict, expiry, server-side revocation, live account-version and role validation | No second factor is implemented |
| CSRF/unauthorized mutation | CSRF token plus role/action authorization on every mutation | OAuth/2FA remains a future hardening option |
| Stored/reflected XSS | Astro escaping, script-safe structured data, DOM `textContent`, no `innerHTML` in CMS controller | Continue payload regression tests when renderers change |
| SSRF/unsafe URLs | Centralized source fetch protections; private-address rejection; no HTTPS downgrade; registered-domain enforcement on initial and redirect URLs; OAuth image runtime restricted to credential-free HTTPS and exact-origin bearer forwarding | New connectors require threat review |
| Upstream generated-content substitution | Read-only Git audit; registered HTTPS source domains; source-only projection with every upstream snippet discarded; one shared candidate constructor; fresh canonical extraction/relevance/fidelity/repetition/image gates; dual execution flags; revision/digest/execution-identity binding; immutable retry input; fenced process lease | Credentialed reconciliation must run in an isolated preview content-refresh window before approval |
| Upload attacks | MIME and magic-byte match, bounded bytes/pixels, safe decode, WebP re-encode, private local path | Vercel request-size limits constrain large media |
| Source-image substitution | Four-variant source regeneration and SHA-256 comparison, bounded no-follow reads, staged promotion, rollback | Provenance is equivalence to the source URL's current bytes, not an immutable upstream snapshot |
| Path traversal | normalized object keys and media paths, real-path containment, symlink rejection, no-follow reads | Object-store policy remains an external control |
| Lost/partial writes | transactions, optimistic versions, atomic local rename, immutable history, transactional outbox, malformed canonical state rejection | Outbox consumer is not yet deployed |
| Secret/log leakage | generic 5xx messages, IP HMACs, bounded fields, ignored runtime artifacts | Vercel/GitHub log retention must be configured externally |
| CI or dependency compromise | exact lockfile versions, immutable GitHub Actions SHAs, Node engine pin, `npx --no-install`, trusted-main secret scope, `npm audit` release gate | Audit does not replace provenance review |

## Fail-Closed Policy

Vercel/production admin auth requires durable security hooks, Postgres storage, and Blob
credentials. Missing configuration returns a generic unavailable response and must not fall
back to process memory, deployment files, or public JSON.

Upstream generated JSON is also untrusted. It must never be merged into the public read model.
Only audited source-discovery records may enter the guarded reconciliation command, and any active
checkpoint with a different revision or candidate digest blocks execution before provider work.
Pending runs resume before mutable local projections are re-audited, and concurrent command owners
are rejected by a tokenized lease stored outside the cached checkpoint directory. Stale leases are
never reclaimed automatically; explicit operator cleanup is required. Ownership is rechecked before
completed-output verification, each provider call, and before and after every durable or public
publish side effect. Completion receipts carry the same execution identity, and a completed identical
run is verified and replayed without executing providers again.
