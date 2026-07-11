# GPT-5.6 security audit

## Release disposition

Request changes. No critical finding was confirmed. Four high, seven medium, and one
low finding require remediation or a documented external control before release.

## High severity

| Finding | Evidence | Required repair |
| --- | --- | --- |
| Stored XSS in article JSON-LD | `news/[id].astro` inserts `JSON.stringify` through `set:html`; editorial fields can terminate the script element | Script-safe serializer, regression payload, restrictive CSP |
| SSRF and unbounded response processing | Source and image fetchers follow redirects, accept private/reserved targets, and buffer full decompressed bodies | Central safe HTTP client, DNS/IP/redirect validation, streaming limits, MIME/magic checks |
| Public operational data exposure | `sync-dashboard-data.cjs` writes complete job objects and payloads to `public/dashboard-data.json` | Public aggregate DTO only; authenticated operational detail |
| Active URL schemes in public links | `normalizeUrl` accepts `javascript:` and presentation components render the result | HTTP(S)-only URL contract at ingestion, editing, contracts, and rendering |

## Medium severity

1. Published articles can bypass quality validation through non-publish or unknown actions.
2. Login throttling is process-local; body size and content type are not bounded.
3. Audit history can be overwritten after transient read errors and lacks stored commit IDs.
4. Public dashboard templates insert automated values with unsanitized `innerHTML`.
5. Local image paths can escape `public`; remote/generated image validation is incomplete.
6. Visual QA exposes `PERCY_TOKEN` job-wide and dynamically installs unpinned packages.
7. Repository-defined CSP, frame protection, MIME sniffing protection, referrer and
   permissions policy, and admin `no-store` headers are absent.

## Low severity

Admin configuration responses disclose exact environment variable names. Failed-login
logs contain attacker-controlled username/IP data and the in-memory audit array is not
bounded.

## Controls already present

- Admin credentials fail closed when missing.
- Passwords use scrypt rather than plaintext.
- Session cookies are signed, HttpOnly, Secure in production, and SameSite Strict.
- Article mutations validate CSRF tokens.
- Admin routes are excluded from sitemap and marked noindex.
- Normal Astro body rendering and admin preview text are escaped.
- GitHub API calls use a fixed host and bearer authorization.
- `.env` files are ignored; no confirmed tracked secret or private key was found.
- Upgrade branch `npm audit` reports zero vulnerabilities.

## Verification baseline

Targeted security/admin/source tests passed 39/39 during the read-only audit. The full
build was intentionally not run in the source worktree because the build mutates tracked
dashboard and image data. New tests are required for closing-script JSON-LD, URL schemes,
IPv4/IPv6/private/link-local redirects, oversized/compressed bodies, every admin action,
audit read failures, dashboard HTML payloads, path traversal/symlinks, MIME confusion,
and deployed security headers.
