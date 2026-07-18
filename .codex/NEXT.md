# NEXT

## Current branch
- `upgrade/gpt-5-6-sol`, current committed HEAD `649682b8083127f7604f2ad08cf01cd059762ed7`.
- Current source-image provenance, production dedupe, and CI pinning changes are not committed yet.
- Last exact preview: `dpl_4ynXQhbvBsQRTQRAHLMa3ip6oV7t` at
  `https://ai-news-portal-613ziqy6d-masternode77s-projects.vercel.app` (`READY`, implementation `649682b8`).
- Rollback tag: `backup/pre-gpt56-upgrade-20260711T091118Z`.
- No push, production promotion, production-secret operation, or cache purge has been performed.

## Latest completed checklist item
- Replaced 19 stale synthetic source-canonical image sets with current source-derived rasters.
- Audited hero, thumbnail, OpenGraph, and legacy variants with bounded no-follow reads.
- Made source-image repair preflighted, staged, missing-file aware, and batch-rollback capable.
- Removed one duplicate public source record and its five unreachable generated assets.
- Added semantic canonical-source dedupe to the actual production publish boundary.
- Preserved case-sensitive paths and semantic query parameters while removing tracking parameters.
- Pinned all third-party GitHub Actions to immutable commit SHAs.
- Re-ran broad UltraQA, security, release, admin-browser, and visual checks.

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

## Blockers
- Preview Postgres, Blob, and admin credentials are absent; managed persistence is not proven.
- Independent 150-item relevance and 40-sample writing labels require human review.
- OAuth/2FA, firewall, backups, monitoring, and secret rotation are operational follow-up.
- Production promotion requires explicit preview approval.

## Exact next step
- Create the local Lore implementation commit from the approved, verified diff.
- Deploy that exact commit to preview only and verify routes, headers, images, and admin fail-closed behavior.
- Keep push, production promotion, production secrets, and cache purge excluded.
