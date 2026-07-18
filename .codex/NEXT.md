# NEXT

## Current branch
- `upgrade/gpt-5-6-sol`; latest committed checkpoint `f5608e3a`. The upstream-reconciliation
  implementation and fresh verification are included in the current local checkpoint.
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
- Re-audited `origin/main` at `f110e8c2`: 747 rows, 724 canonical sources already present,
  23 source-only re-ingestion candidates, and 0 rejected.
- Added read-only audit and dual-flag execution commands that feed only source discovery into the
  canonical production lifecycle; no generated upstream copy or image crosses the boundary.
- Bound active/failed reconciliation checkpoints and completion receipts to the audited revision
  plus candidate digest; mismatches and batches over 30 fail before provider/checkpoint work.
- Preserved immutable initial input for partial-publish resume and added an exclusive process lease
  outside cached checkpoint state.
- Unified candidate construction across audit, composition, and ingest so entity decoding,
  sanitizer rejection, stable IDs, and fingerprints cannot drift between boundaries.
- Fenced completed-output verification, provider calls, and checkpoint saves against lease-token
  replacement; a displaced owner cannot continue or delete the replacement lease.
- Dropped every upstream snippet, constrained redirect hops to registered domains, and bound durable
  publication receipts to the active reconciliation execution identity.
- Removed automatic stale-lock takeover and replay completed identical identities without provider
  execution; abandoned leases now require explicit operator cleanup.

## Changed files
- Provenance: `scripts/repair-public-source-images.mjs`, image canonicalizer, package scripts,
  source-image tests, and repaired assets under `public/generated/`.
- Publication: shared canonical-source utility, fixture publish helper, production publish phase,
  archive store, production/fixture regressions, archive/search data, and duplicate asset deletion.
- Supply chain: both GitHub workflows plus immutable-action regression tests.
- Reports: security fix report, threat model, UltraQA security report, and this handoff.
- Reconciliation: `scripts/audit-upstream-content-reconciliation.mjs`,
  `scripts/reconcile-upstream-content.mjs`, source-only reconciliation library, canonical ingest,
  cycle identity/checkpoint plumbing, source registry/domain updates, package scripts, and tests.
- Current reports: final upgrade report, acceptance matrix, security reports, threat model, and this handoff.

## Validation results
- Full `npm test`: 618 total, 617 passed, 0 failed, 1 intentional skip; follow-on quality commands pass.
- Reconciliation/orchestrator security set: 96/96 passed, including redirect-domain escape,
  snippet provenance, same-identity replay, receipt identity, stale-lock, and mid-publish fencing.
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
- Independent final code review found 0 critical/high/medium/low defects and returned `APPROVE`;
  the architecture re-review returned `CLEAR / APPROVE`.
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
- The 23 canonical-source `origin/main` candidates require guarded canonical re-ingestion and a
  fresh preview; direct generated-JSON merge is unsafe.
- OAuth/2FA, firewall, backups, monitoring, and secret rotation are operational follow-up.
- Production promotion requires explicit preview approval.

## Exact next step
- In a safe preview content-refresh window, run
  `npm run content:reconcile-upstream -- --execute --production --revision=origin/main`; then rerun
  content, provenance, browser, and visual gates and deploy a refreshed preview.
- Await managed preview persistence credentials, independent human labels, and preview approval.
- Keep push, production promotion, production secrets, and cache purge excluded.
