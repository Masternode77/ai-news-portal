# NEXT

## Current branch
- `upgrade/gpt-5-6-sol`, HEAD receipt commit `1db8bfedfb79dfed23cc10dcf8779405516f10b2`;
  verified implementation `58ff8bf31635aafb9456207d5c063144b0f0d3ae`.
- Exact preview: `dpl_931jMss3886U8GtBRyWvM1Eozuba` at
  `https://ai-news-portal-l1gqlehby-masternode77s-projects.vercel.app` (`READY`, implementation `58ff8bf3`).
- Rollback tag: `backup/pre-gpt56-upgrade-20260711T091118Z`.
- No push, production promotion, production-secret operation, or cache purge has been performed.
- External `origin/main`/production advanced independently to `f110e8c2` / `dpl_Hw1vrgH1qmc4Y2pRsW3g5nXxKY1D`.

## Latest completed checklist item
- Replaced 19 stale synthetic source-canonical image sets with current source-derived rasters.
- Audited hero, thumbnail, OpenGraph, and legacy variants with bounded no-follow reads.
- Made source-image repair preflighted, staged, missing-file aware, and batch-rollback capable.
- Removed one duplicate public source record and its five unreachable generated assets.
- Added semantic canonical-source dedupe to the actual production publish boundary.
- Preserved case-sensitive paths and semantic query parameters while removing tracking parameters.
- Pinned all third-party GitHub Actions to immutable commit SHAs.
- Re-ran broad UltraQA, security, release, admin-browser, and visual checks.
- Audited all 117 newer `origin/main` commits: 98 dashboard snapshots and 19 content refreshes.
- Confirmed the incoming delta has no product code, but adds 39 archive/search candidates and
  conflicts in three generated article stores plus the retired dashboard artifact.
- Confirmed a raw merge would bypass upgraded relevance/fidelity/provenance gates; it is rejected.

## Changed files
- Provenance: `scripts/repair-public-source-images.mjs`, image canonicalizer, package scripts,
  source-image tests, and repaired assets under `public/generated/`.
- Publication: shared canonical-source utility, fixture publish helper, production publish phase,
  archive store, production/fixture regressions, archive/search data, and duplicate asset deletion.
- Supply chain: both GitHub workflows plus immutable-action regression tests.
- Reports: security fix report, threat model, UltraQA security report, and this handoff.

## Validation results
- Full `npm test`: 580 total, 579 passed, 0 failed, 1 intentional skip; follow-on quality commands pass.
- Focused security: 76/76 passed; `npm audit --audit-level=low`: 0 vulnerabilities.
- Tracked secret scan: no real credentials/private keys; only an `example.invalid` fixture matched.
- Source provenance: 26/26 articles and 104/104 variants matched; 0 missing/mismatch/path/unsafe failures.
- Transaction tests: missing repair, unavailable-source no-mutation, write rollback, convergence rollback pass.
- Production dedupe regression preserves `?id=1/2`, path case, and hidden history while removing public duplicates.
- `npm run check`: 0 errors, 0 warnings, 11 existing type hints.
- `npm run content:gate`: passed; 59 pages built and all public/image/admin/performance audits passed.
- Public inventory: latest 30, archive 708, search 738, taxonomy 32, homepage 31, one longform route.
- Performance: 7,260,589 B dist, 11,432 B JS, 100,239 B CSS, 93,875 B largest HTML,
  404,420 B largest image.
- Commercial visual QA: 8/8 captures; actual Applied Digital source image appears on home and article.
- Local admin browser: all 17 real-handler lifecycle scenarios passed.
- Independent code re-review and architecture reconfirmation both approved.
- Exact preview: eight public routes returned 200, five retired routes returned 404, and the
  unconfigured admin API returned generic 503 with `no-store` and `noindex, nofollow`.
- Exact-preview browser: home 31/31 desktop/mobile, archive 32/32, search 32/32, article 1/1,
  and APAC 19/19 images decoded; 0 broken images, placeholder labels, errors, or overflow.
- Human benchmark packets regenerated: relevance 150 and writing 40; both remain reviewer-empty,
  and the scorer fails closed with `reviewer.id is required`.
- Managed persistence contract: 4/4 local tests pass; the verifier rejects missing preview scope
  and credentials before any managed operation.

## Blockers
- Preview Postgres, Blob, and admin credentials are absent; managed persistence is not proven.
- Independent 150-item relevance and 40-sample writing labels require human review.
- The 39 `origin/main`-only content candidates require canonical re-ingestion and a fresh preview;
  direct generated-JSON merge is unsafe.
- OAuth/2FA, firewall, backups, monitoring, and secret rotation are operational follow-up.
- Production promotion requires explicit preview approval.

## Exact next step
- Re-ingest the 39 current-production candidates through the canonical pipeline when a safe
  preview content-refresh window is opened; rerun content, provenance, browser, and visual gates.
- Await managed preview persistence credentials, independent human labels, and preview approval.
- Keep push, production promotion, production secrets, and cache purge excluded.
