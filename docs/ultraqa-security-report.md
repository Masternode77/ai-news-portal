# UltraQA and Security Report

Updated: 2026-07-19

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
| UQ-26 | Generated upstream projection crosses the trust boundary | Retain only source discovery fields and discard unproven generated snippets | Pass | Reconciliation source-only projection tests and current audit |
| UQ-27 | Unregistered or attacker-controlled source URL | Require HTTPS, registered domains, and reject credentials, ports, IP/local hosts, controls, and oversized URLs | Pass | Adversarial reconciliation URL tests |
| UQ-28 | Malformed upstream row or empty allowlist | Reject per row and fail closed without coercion or audit termination | Pass | Malformed-row and empty-registry regressions |
| UQ-29 | Tracking or query-order dedupe collision | Remove tracking keys case-insensitively, sort semantic keys, and preserve path/value case | Pass | Canonical-source normalization regressions |
| UQ-30 | Accidental reconciliation execution | Require both `--execute` and `--production`; expose no direct JSON writer | Pass | CLI subprocess and command-surface tests |
| UQ-31 | Oversized reconciliation poisons the global checkpoint | Reject more than 30 candidates before any cycle/checkpoint call | Pass | Zero-cycle preflight regression |
| UQ-32 | Failed checkpoint resumes unrelated content | Bind active/failed checkpoints and completion receipts to revision plus candidate digest | Pass | Ordinary-to-reconciliation, same-identity resume, revision/digest mismatch tests |
| UQ-33 | Partial publish changes the next audit result | Resume pending reconciliation from immutable initial input before reading mutable local projections | Pass | Partial-publish retry regression |
| UQ-34 | Generic caller bypasses reconciliation semantics | Require canonical text, RFC3339 timestamp, stable ID, normalized HTTPS URL, source-only schema, digest, revision, and identity before checkpoint access | Pass | Production composition and ingest boundary regressions |
| UQ-35 | Concurrent or long-running processes mutate one checkpoint | Hold an exclusive tokenized filesystem lease with heartbeat outside cached checkpoint state | Pass | Concurrent-owner, heartbeat, and clean-release regressions |
| UQ-36 | Audit and ingest disagree on canonical candidate bytes | Reconstruct every candidate through one shared constructor and byte-compare canonical fields | Pass | Entity-decoding, sanitizer-phrase, stable-ID, and composition regressions |
| UQ-37 | Stale owner resumes after lease-token replacement | Assert current ownership before verification, provider execution, and every save | Pass | Replacement-token fencing keeps provider calls at zero and preserves the new lease |
| UQ-38 | Public redirect escapes the registered source boundary | Validate the initial URL and every redirect hop against the source registry | Pass | Registered redirect succeeds; unregistered redirect and extraction fail closed |
| UQ-39 | Legacy feed or marker-free text is mistaken for source evidence | Discard all upstream snippets and require fresh canonical extraction | Pass | Feed, marker-free, generated-projection, and entity regressions |
| UQ-40 | Two retries publish the same reconciliation identity | Verify and replay a completed identity without invoking providers | Pass | Same-identity replay keeps the provider count unchanged |
| UQ-41 | Durable receipt belongs to a different execution owner | Bind completed receipts and output verification to execution identity | Pass | Receipt-identity mismatch is rejected before bundle verification |
| UQ-42 | Abandoned lock is auto-reclaimed while its owner may still write | Never auto-reclaim; require explicit operator cleanup and fence each publish side effect | Pass | Stale-token rejection and mid-provider ownership-loss regressions |
| UQ-43 | Title-only triage is mistaken for source-grounded publication authority | Label review output advisory, forbid publication/permanent rejection, and leave execution input unchanged | Pass | Read-only digest proof, advisory review regression, and current 2/6/17 candidate receipt |
| UQ-44 | Untyped Astro props conceal incompatible public data shapes | Type the shared signal contract and component/article boundaries; require a diagnostic-free check | Pass | Astro check 0 errors, 0 warnings, 0 hints; public regressions 46/46 |
| UQ-45 | Open-ended Node engines silently adopt an unreviewed future major | Pin builds to Node 22 and verify the resolved Vercel runtime | Pass | Final preview rebuilt on Node 22 without the automatic-major warning |
| UQ-46 | Stale provider snapshots retain divergent unguarded fetch/write paths | Delete numbered snapshots and release-gate their absence | Pass | Five snapshots removed; media/audit tests 21/21; cleanup re-review APPROVE |

## Verification Receipt

- Full tests: 622 total, 621 passed, 0 failed, 1 intentional skip.
- Astro check: 0 errors, 0 warnings, 0 hints.
- Focused security tests: 76 passed, 0 failed.
- Reconciliation and canonical-orchestrator security tests: 96 passed, 0 failed.
- Source provenance: 26/26 articles and 104/104 variants matched; no missing, mismatch,
  metadata-path error, unavailable source, or unsafe local file.
- Build: 59 pages; rendered public audit found 7 checked pages, 30 cards, and 0 broken images.
- Public projections: latest 30, archive 708, search 738, taxonomy 32, homepage 31.
- Admin exclusion: 11 admin pages and 4 index files passed.
- Performance: 7,260,589-byte dist, 11,432-byte browser JS, 100,239-byte CSS, 93,875-byte
  largest HTML, and 404,420-byte largest image, all within configured budgets.
- Dependency audit: 0 vulnerabilities.
- Independent review: code review found 0 critical/high/medium/low defects and returned `APPROVE`;
  the focused nullable-contract re-review closed two medium findings and then returned `APPROVE`
  with 0 findings; the provider-cleanup review also closed two medium findings and returned
  `APPROVE` with 0 findings; architecture review returned `CLEAR / APPROVE`.

## Remaining Operations

Managed preview persistence cannot be proven without preview-only Postgres, Blob, and admin
credentials. Human relevance and writing labels are also still outstanding. The 25 audited
production-source candidates have not been run through the guarded canonical command. These are explicit
release follow-ups and do not justify production promotion without preview approval.

## Exact Preview Receipt

- Implementation: `f735cc40590abf3158afef7cd0f996dd91a8d6a9`.
- Deployment: `dpl_J5jbRixDCBLoqEvRqN4gmZKKVvWs`, status `READY`.
- URL: `https://ai-news-portal-8f02vryvd-masternode77s-projects.vercel.app`.
- Eight public routes returned 200 and five retired operational routes returned 404.
- Homepage security headers include CSP, HSTS, nosniff, frame denial, referrer policy, and
  permissions policy. The unconfigured admin API returned generic 503 with `no-store` and
  `noindex, nofollow`.
- Browser QA decoded 31/31 homepage images on desktop and mobile, 32/32 archive images,
  32/32 search images, the representative article image, and 19/19 APAC images. It found no
  broken image, placeholder label, console/page error, or horizontal overflow.
- Production promotion and cache purge were not performed.
