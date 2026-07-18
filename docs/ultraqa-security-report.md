# UltraQA and Security Report

Updated: 2026-07-18

## Disposition

The local implementation is release-gate clean with operational follow-up. No critical, high,
medium, or low code vulnerability remains open in the reviewed scope. Production promotion,
production secrets, and cache purge were excluded. Managed preview Postgres/Blob persistence,
OAuth/2FA, edge firewall policy, backup policy, monitoring, and secret rotation remain deployment
operations rather than hidden code-completion claims.

## Adversarial Matrix

| ID | Scenario | Expected control | Result | Evidence |
| --- | --- | --- | --- | --- |
| UQ-01 | Malformed/oversized admin JSON | Reject before handler mutation without internals | Pass | Focused security suite, admin API 400/413/415 coverage |
| UQ-02 | Stolen or stale session | Credential/role/disable/logout changes revoke access | Pass | Durable auth and Postgres auth tests |
| UQ-03 | CSRF and unauthorized mutation | Every mutation requires token and role/action grant | Pass | Admin auth/API tests |
| UQ-04 | Private-network SSRF or downgrade redirect | Reject reserved IPs, DNS violations, credentialed URLs, HTTPS downgrade | Pass | Outbound media security tests |
| UQ-05 | Cross-origin credential forwarding | Strip auth and redirected POST body | Pass | Redirect and Image2 runtime-origin tests |
| UQ-06 | Compressed body or image bomb | Bound compressed/decompressed bytes and pixels | Pass | Response reader and raster validation tests |
| UQ-07 | MIME confusion or corrupt raster | Decode and re-encode only validated bytes | Pass | Upload and Image2 byte tests |
| UQ-08 | Traversal or symlink escape | Lexical/real-path containment plus no-follow read/write | Pass | Image output, provenance, and static containment tests |
| UQ-09 | JSON-LD/script termination | Serialize structured data without closing the script context | Pass | Public render security test |
| UQ-10 | Prompt-injection-themed irrelevant source | Keep weak/non-infrastructure item out of public lanes | Pass | Strict relevance router regression |
| UQ-11 | Mutable CI action compromise | Every third-party action uses an immutable SHA | Pass | Repository-wide workflow pinning test |
| UQ-12 | Semantic URL collision | Remove tracking only; preserve query identity and path case | Pass | Fixture and actual production publish regressions |
| UQ-13 | Stale non-hero source image | Compare hero, thumbnail, OpenGraph, and legacy hashes | Pass | Four-variant provenance regression |
| UQ-14 | Missing local source image | Recreate from staged source output | Pass | Missing-variant apply regression |
| UQ-15 | One source unavailable | Abort before any public-file mutation | Pass | Preflight no-mutation regression |
| UQ-16 | Mid-promotion write failure | Restore every earlier file | Pass | Promotion rollback regression |
| UQ-17 | Post-promotion verification failure | Restore the complete batch | Pass | Convergence rollback regression |
| UQ-18 | Current corpus substitution/drift | Match every public source-canonical variant | Pass | 26 articles, 104/104 variant hashes |
| UQ-19 | Dependency vulnerability | Zero low-or-higher npm findings | Pass | `npm audit --audit-level=low` |
| UQ-20 | Secret committed to Git | No real token, private key, or credential URL | Pass | Tracked-file scan; only `example.invalid` fixture matched |
| UQ-21 | Misleading local success | Build, public audits, image audit, admin exclusion, budgets all must pass | Pass | `npm run content:gate`, exit 0 |
| UQ-22 | Parent directory or file replacement during audit | Reject identity changes and symlink swaps before accepting bytes | Pass | Parent-swap and descriptor identity regressions |
| UQ-23 | Stale public archive reintroduces duplicate source | Canonical dedupe again at the final persisted projection | Pass | Real archive synchronizer integration regression |
| UQ-24 | Invalid or missing source-canonical URL | Keep the record in scope and fail the provenance CLI | Pass | Invalid-URL subprocess regression; exit 1 |
| UQ-25 | Image promotion filesystem failure | Roll back prior writes and propagate the original failure | Pass | Canonicalizer transaction rejection regression |

## Verification Receipt

- Full tests: 580 total, 579 passed, 0 failed, 1 intentional skip.
- Focused security tests: 76 passed, 0 failed.
- Source provenance: 26/26 articles and 104/104 variants matched; no missing, mismatch,
  metadata-path error, unavailable source, or unsafe local file.
- Build: 59 pages; rendered public audit found 7 checked pages, 30 cards, and 0 broken images.
- Public projections: latest 30, archive 708, search 738, taxonomy 32, homepage 31.
- Admin exclusion: 11 admin pages and 4 index files passed.
- Performance: 7,260,589-byte dist, 11,432-byte browser JS, 100,239-byte CSS, 93,875-byte
  largest HTML, and 404,420-byte largest image, all within configured budgets.
- Dependency audit: 0 vulnerabilities.

## Remaining Operations

Managed preview persistence cannot be proven without preview-only Postgres, Blob, and admin
credentials. Human relevance and writing labels are also still outstanding. These are explicit
release follow-ups and do not justify production promotion without preview approval.

## Exact Preview Receipt

- Implementation: `58ff8bf31635aafb9456207d5c063144b0f0d3ae`.
- Deployment: `dpl_931jMss3886U8GtBRyWvM1Eozuba`, status `READY`.
- URL: `https://ai-news-portal-l1gqlehby-masternode77s-projects.vercel.app`.
- Eight public routes returned 200 and five retired operational routes returned 404.
- Homepage security headers include CSP, HSTS, nosniff, frame denial, referrer policy, and
  permissions policy. The unconfigured admin API returned generic 503 with `no-store` and
  `noindex, nofollow`.
- Browser QA decoded 31/31 homepage images on desktop and mobile, 32/32 archive images,
  32/32 search images, the representative article image, and 19/19 APAC images. It found no
  broken image, placeholder label, console/page error, or horizontal overflow.
- Production promotion and cache purge were not performed.
