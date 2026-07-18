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
| UQ-05 | Cross-origin credential forwarding | Strip auth, provider API keys, and redirected POST body | Pass | 302 credential stripping plus 307/308 replay rejection tests |
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
| UQ-47 | Empty or legacy provider result is mislabeled as fresh Image2 artwork | Reject pathless fresh results, retain bounded failover reasons, and persist honest provider/model/status/error | Pass | Empty string/object, source-provider failover, production backfill, and candidate persistence regressions |
| UQ-48 | Provider creates one legacy image while metadata claims canonical variants | Route Image2, ChatGPT runtime, OpenAI API, Gemini, and local fallback through canonical variant writers | Pass | Executable stock regeneration checks real WebPs at 1536x864, 1200x900, and 1200x630 |
| UQ-49 | Generated audit report describes removed routes and insecure legacy auth as current | Detect modern CMS routes and report Argon2id, CSRF, durable auth, and Postgres fail-closed controls | Pass | OMO audit contract 4/4 and regenerated current-state report |
| UQ-50 | Provider 307/308 redirect exfiltrates a request body or API key | Allow cross-origin replay only for GET/HEAD and remove generic/provider credential headers | Pass | Explicit 307/308 POST rejection and Image2/Gemini-style API-key stripping regressions |
| UQ-51 | Legacy AI adapter is publicly mislabeled as Image2 | Reserve Image2 provenance for the canonical provider and label legacy adapters by provider family | Pass | ChatGPT, OpenAI API, and Gemini provenance regressions plus explicit production force-order documentation |
| UQ-52 | Generated OMO audit overstates the public homepage surface | Reuse the canonical homepage eligibility predicate and require corpus-level metric parity | Pass | Audit parity 5/5; eligible 32, heuristic low-relevance 1, missing images 0 |
| UQ-53 | Test or audit commands mutate tracked reports or skip the rendered build | Build first, preserve an existing dirty diff byte-for-byte, reject new tracked mutations, and require explicit report output | Pass | Seven behavior contracts plus a 649/649 hermetic full-suite run |

## Verification Receipt

- Full tests: 649 total, 649 passed, 0 failed, 0 skipped; the build-backed runner preserved the
  pre-existing tracked diff byte-for-byte.
- Astro check: 0 errors, 0 warnings, 0 hints.
- Focused redirect and image-provider tests: 35 passed, 0 failed; offline Image2 orchestration:
  19 passed, 0 failed.
- Reconciliation and canonical-orchestrator security tests: 96 passed, 0 failed.
- Source provenance: 26/26 articles and 104/104 variants matched; no missing, mismatch,
  metadata-path error, unavailable source, or unsafe local file.
- Build: 59 pages; release-gate selected tests 41/41; rendered public audit found 7 checked
  pages, 30 cards, and 0 broken images.
- Public projections: latest 30, archive 708, search 738, taxonomy 32, homepage 31.
- Admin exclusion: 11 admin pages and 4 index files passed.
- Performance: 7,260,645-byte dist, 11,432-byte browser JS, 100,239-byte CSS, 93,885-byte
  largest HTML, and 404,420-byte largest image, all within configured budgets.
- Dependency audit: 0 vulnerabilities.
- Independent review iteratively found and closed stale-variant inheritance, incomplete provenance,
  pathless provider success, legacy single-file output, failover receipt defects, cross-origin
  provider credential replay, legacy provider mislabeling, and audit eligibility drift. The final
  full-diff re-review returned `APPROVE` with zero remaining findings.
- QA/QC runner: `deployable with operational follow-up`; live verification passed and cache purge
  was skipped. A subsequent exact-preview pass supplied the deployment URL and passed staging checks.
- Harness note: an earlier accidental overlap of two release gates caused a transient Astro chunk
  race; both processes were cleaned up and every subsequent single-run gate passed with exit 0.

## Remaining Operations

Managed preview persistence cannot be proven without preview-only Postgres, Blob, and admin
credentials. Human relevance and writing labels are also still outstanding. The 25 audited
production-source candidates have not been run through the guarded canonical command. These are explicit
release follow-ups and do not justify production promotion without preview approval.

## Exact Preview Receipt

- Implementation: `e37bc9c9e0f01691d79ea073ecf6a3eaa7785bd9`.
- Deployment: `dpl_3P3ryw94P78z66ZJa1bopUAqSBu6`, status `READY`, target `preview`.
- URL: `https://ai-news-portal-ef65tm1iq-masternode77s-projects.vercel.app`.
- Eight public routes returned 200 and five retired operational routes returned 404.
- Homepage security headers include CSP, HSTS, nosniff, frame denial, referrer policy, and
  permissions policy. The unconfigured admin API returned generic 503 with `no-store` and
  `noindex, nofollow`.
- Browser QA decoded 31/31 homepage images on desktop and mobile, 32/32 archive images,
  32/32 search images, the representative article image, and 19/19 APAC images. It found no
  broken image, placeholder label, console/page error, failed application request, or horizontal
  overflow. The representative article displays its image above the body.
- Vercel's final one-hour error-log query returned no application errors. Read-only local, preview,
  and live route verification passed; the current 1440x900 preview and production viewports differ
  across 81.5236% of pixels, so production still does not serve this reviewed preview.
- Evidence: `artifacts/preview-e37bc9c9/` (ignored local runtime artifacts).
- Production promotion and cache purge were not performed.

## Adversarial E2E Completion

Goal: prove the exact preview fails closed under malformed and hostile requests, does not mistake
success-looking output for a pass, survives interruption/replay boundaries, and serves distinct real
image bytes. The run remained read-only against preview and production and excluded secrets, cache
purge, production writes, and promotion.

| ID | User/attacker model | Scenario | Command or harness | Expected signal | Actual result | Fixes applied | Evidence | Cleanup |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ADV-01 | Normal reader | Public routes, desktop/mobile imagery, and article hero | Playwright exact-preview suite | 200, decoded images, no browser errors | Pass: 6 surfaces; 146/146 aggregate image decodes | None | `visual-qa.json` | Captures intentionally retained under ignored artifacts |
| ADV-02 | Malformed client | Invalid content type, broken JSON, 70 KiB body, unsupported methods | Bounded preview HTTP harness | 4xx or fail-closed 503, `no-store`, no echo | Pass: all rejected without input/config leakage | None | `adversarial-e2e.json` ADV-HTTP-04..06 | No server mutation |
| ADV-03 | Traversal/XSS client | Encoded path traversal and Unicode script query | Bounded preview HTTP harness | 404 or escaped inert text | Pass: traversal 404; no executable reflection | None | `adversarial-e2e.json` ADV-HTTP-02..03 | No server mutation |
| ADV-04 | Prompt-injection attacker | Forged cookie/CSRF plus instruction and script payload | Bounded preview HTTP harness | Auth fails closed; no payload, CORS, stack, or secret echo | Pass: generic 503, `no-store`, no hostile Origin grant | None | `adversarial-e2e.json` ADV-HTTP-07..09 | No server mutation |
| ADV-05 | Interrupted publisher | Failed phase, replaced owner, stale receipt, and replay | Canonical orchestrator and production-phase tests | Resume only matching identity; fence stale owner | Pass across the focused 81-test set | None | Three regression runs | Temporary test state removed by test hooks |
| ADV-06 | Dirty-worktree operator | Runtime evidence and OMX state coexist with tracked source | Git snapshot before and after the hermetic suite | No unrelated tracked file changed or hidden | Pass: pre-existing tracked diff remained byte-for-byte identical; default audits added no diff | None | Seven test-runner behavior contracts and pre/post diff hash | Ignored artifacts retained intentionally |
| ADV-07 | Hung child process | Child waits 10 seconds | 250 ms bounded spawn harness | Child terminated; no late success accepted | Pass: `SIGTERM`, no leaked success | None | Inline harness receipt | Child exited; no process retained |
| ADV-08 | Flaky implementation | Repeat security/state/publish suite | Focused Node suite, three sequential runs | Identical zero-failure result | Pass: 81/81 three times, 243/243 aggregate | None | TAP exit 0 for all runs | Test fixtures self-cleaned |
| ADV-09 | Misleading command | Prints `ALL TESTS PASSED` then exits 7 | Exit-semantics harness and QA verdict tests | Nonzero exit remains failure | Pass: success text rejected; QA contract 8/8 | None | Inline harness and focused suite | Fixture process exited |
| ADV-10 | Default-image regression | Same image reused under different cards | Fetch all homepage images and hash bytes | 31 valid responses and 31 unique hashes | Pass: 31/31 unique; 12,866-404,420 bytes | None | `adversarial-e2e.json` image audit | No downloaded file retained |

### Commands and Failures

- Three bounded preview HTTP passes completed 10/10 scenarios each; every request used a 10- or
  15-second abort limit. The persisted prior receipt reports `ok: true`, and the fresh third run
  again rejected malformed, oversized, traversal, XSS, forged-session, hostile-Origin, and
  unsupported-method requests without secrets, stack traces, credentialed CORS, or cacheable API responses.
- The focused admin, auth, outbound-media, state, checkpoint, QA-verdict, and publication suite
  passed 81/81 on each of three clean reruns. `npm audit --audit-level=low` found 0 vulnerabilities.
- One initial output-truncation wrapper used zsh's read-only `status` variable. Product tests in that
  run passed 81/81, but the wrapper correctly remained failed. It was classified as harness setup
  failure, replaced with a direct no-pipe runner, and all three required reruns passed.
- No product defect was found in this adversarial cycle, so no product code was changed.

### Residual Risks and Cleanup

- Managed preview Postgres, Blob, and authenticated admin write behavior remain untested because
  preview-only credentials are absent. The safe substitute verified generic fail-closed responses
  and exercised authenticated lifecycle behavior against real local handlers.
- Workflow cancel wording is not a public product surface. The safe substitute exercised interrupted
  checkpoints, stale ownership, replay, and resume fencing without mutating production.
- All temporary child processes exited. Runtime evidence is intentionally retained under the ignored
  `artifacts/preview-e37bc9c9/` directory; no temporary source harness was created.
