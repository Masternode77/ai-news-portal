# NEXT

## Current branch
- `upgrade/gpt-5-6-sol`; latest verified implementation checkpoint
  `c9518bee64736aecf81a1c22ef9e40df4d963e18`.
- Latest local QA tooling checkpoint: `1fd774f4b362d6003d0ed1bc07d61e61d63a4e2d`.
- Exact implementation preview: `dpl_HpRXGKfUMERRsu25iCcYpWVvsr1S` at
  `https://ai-news-portal-piewufgxu-masternode77s-projects.vercel.app` (`READY`, preview target).
- Rollback tag: `backup/pre-gpt56-upgrade-20260711T091118Z`.
- No push, production promotion, production-secret operation, or cache purge has been performed.
- Latest separately observed production: `dpl_6vJ55zh7jsFTQziQgxe4rnrGpy1j`;
  current `origin/main` is `f345f6798f90ef82c37fc01fd537157e112eafc9`.

## Latest completed checklist item
- Reconciled source-image provenance, publication dedupe, immutable GitHub Actions, and generated-data cleanup.
- Added a source-only upstream reconciliation audit and guarded dual-flag execution command.
- Bound reconciliation checkpoints, leases, receipts, and publication effects to revision, digest,
  and execution identity; abandoned locks require explicit operator cleanup.
- Dropped upstream snippets and generated projections, constrained every redirect to registered domains,
  and replayed completed identical identities without provider execution.
- Corrected the production-surface verifier so `--help` is read-only, checked targets produce accurate
  risk text, and fresh screenshot paths can be bound into the receipt.
- Added a read-only `--review` view that labels title-only triage as advisory, reports core/adjacent/archive
  counts, and keeps canonical extraction and classification as the only publication authority.
- Typed the remaining Astro component and article-data boundaries and removed the verifier's hardcoded
  stale Astro-risk sentence; the type check now has no diagnostics or hints.
- Preserved canonical nullable empty-state contracts after independent review and pinned builds to
  Node 22 so Vercel cannot silently adopt an unreviewed future major.
- Deleted five unreferenced numbered image-provider snapshots whose divergent network/write paths
  bypassed canonical media guards, and added their regression contract to `content:gate`.
- Made Image2 the scheduled/default provider while preserving publisher artwork first unless AI
  regeneration is explicitly forced; every successful source/provider/local path now produces
  canonical hero, thumbnail, OpenGraph, and legacy WebPs with honest provenance.
- Rejected empty fresh provider results instead of inheriting stale artwork, retained bounded
  failover reasons, and made stock regeneration persist the complete structured image contract.
- Corrected the OMO current-state audit so it detects the modern CMS routes, Argon2id/CSRF/session
  controls, canonical content command, and Postgres production storage boundary.
- Rejected cross-origin 307/308 non-read-only request replay and stripped generic/provider API-key
  headers on permitted redirects; the Image2 stock path now tests the real provider factory.
- Reserved Image2 provenance for the canonical provider, labeled legacy ChatGPT/OpenAI/Gemini
  artwork honestly, and documented that production editorial candidates explicitly force Image2.
- Bound the OMO audit to the canonical homepage eligibility predicate; its current report now matches
  the public corpus at 32 eligible records, one heuristic low-relevance item, and zero missing images.
- Deployed implementation `c9518bee` to the exact preview and completed route, header, admin, log,
  desktop/mobile visual, image, placeholder, overflow, and production-comparison checks.
- Re-audited current `origin/main`: 128 newer commits comprise 107 dashboard snapshots and 21 content
  refreshes; 751 upstream rows resolve to 724 already-present sources, 27 source-only candidates,
  and 0 rejected rows.
- Advisory title-only review reports 2 core, 6 adjacent, and 19 archive candidates; this is not an
  execution filter and every candidate still requires canonical source extraction.
- Confirmed a raw merge remains unsafe because it would bypass upgraded relevance, fidelity,
  repetition, provenance, and image gates.

## Changed files
- Core upgrade: canonical content cycle, source fidelity/relevance gates, public publication, admin CMS,
  security controls, image provenance, publication dedupe, and immutable CI actions.
- Reconciliation: upstream audit/execution commands, source-only candidate construction, registry-bound
  extraction, identity/checkpoint/lease fencing, package commands, and regressions.
- Verification: `scripts/verify-production-surface.mjs`, `tests/qa-qc-workflow.test.mjs`, final reports,
  production verification receipt, visual QA report, security reports, and this handoff.
- Public UI typing: eight shared components, the article route, and their inherited public-signal contract.
- Image-provider cleanup: five numbered snapshots deleted; release-gated recurrence test added.
- Image pipeline: provider registry, canonical writers, production image persistence, stock
  regeneration, workflow/default configuration, public provenance, docs, and regressions.
- Audit hygiene: `scripts/audit-omo-ultra-current-state.mjs`, its contract test, QA reports, and
  this handoff.
- Local ignored evidence: `artifacts/preview-c9518bee/`.

## Validation results
- Hermetic `npm test`: 671 total, 671 passed, 0 failed, 0 skipped; build and follow-on editorial
  gates pass without changing the pre-existing tracked diff.
- QA/QC workflow/report-contract tests: 11/11 passed; reconciliation/orchestrator security set: 96/96 passed.
- Focused redirect/image security: 35/35; normal and offline image orchestration: 19/19 each;
  `npm audit --audit-level=low`: 0 vulnerabilities.
- Tracked secret scan: no real credentials/private keys; only an `example.invalid` fixture matched.
- Source provenance: 26/26 articles and 104/104 variants matched with no unsafe/missing/mismatch result.
- `npm run check`: 0 errors, 0 warnings, 0 hints.
- `npm run content:gate`: passed; 62 pages built and all public/image/admin/performance audits passed.
- Release-gate selected tests: 41/41; rendered audit: 7 pages, 30 cards, 0 broken images.
- `npm run qa:qc`: deployable with operational follow-up; live verification passed and cache purge
  skipped; the subsequent exact-preview harness passed local, staging, and live read-only checks.
- Public inventory: latest 30, archive 708, search 738, taxonomy 32, homepage 31, one longform route.
- Local admin browser: all 17 real-handler lifecycle scenarios passed.
- Independent code review found 0 critical/high/medium/low defects and returned `APPROVE`;
  the nullable-contract re-review found and closed two medium issues, then returned `APPROVE` with
  0 findings; the provider-cleanup review found and closed two medium issues, then returned
  `APPROVE` with 0 findings; architecture re-review returned `CLEAR / APPROVE`; the final image,
  redirect, provenance, and audit-parity review closed all findings and returned `APPROVE`.
- Exact preview: eight public and twelve design routes returned 200, five retired routes returned 404,
  and all ten required admin paths were private/no-store/noindex; the API failed closed with 503.
- Preview security headers include CSP, HSTS, nosniff, frame denial, referrer policy, and noindex; the deployment error-log query returned no application errors.
- Browser QA: desktop/mobile homepage, archive, and article passed with no console errors or overflow; the first-screen images and article hero decoded.
- Adversarial preview HTTP probes passed 10/10 in three bounded runs; the focused 129-test
  security/state/publish set passed three consecutive runs (387/387).
- QA cleanup re-review found 0 code defects; seven behavioral contracts prove build/test ordering,
  dirty-worktree preservation, tracked mutation rejection, and explicit audit report writes.
- First-screen image byte audit found 10 valid WebPs and 10 unique SHA-256 hashes with no default duplicate.
- Vercel bundles clear 250 MB: media 21,180 KiB, others 772-1,912 KiB locally; remote functions are 671-871 KiB.
- Fresh 1440x900 comparison differs on 75.1509% of pixels, confirming production still serves the
  old command-center design while the preview serves Midnight Intelligence.
- Human benchmark packets remain reviewer-empty; the scorer fails closed without `reviewer.id`.
- Managed persistence contract: 4/4 local tests pass; live preview credentials are absent.

## Blockers
- Preview Postgres, Blob, and admin credentials are absent; managed persistence is not proven.
- Independent 150-item relevance and 40-sample writing labels require human review.
- The 27 current canonical-source candidates require guarded canonical re-ingestion and a refreshed
  preview; direct generated-JSON merge is unsafe.
- Read-only `git merge-tree` preflight against `origin/main` reports 8 generated/data conflicts;
  integration is not ready until reconciliation and regenerated projections replace raw merging.
- OAuth/2FA, firewall, backups, monitoring, and secret rotation are operational follow-up.
- Push/PR and production promotion require explicit preview approval.

## Exact next step
- When preview-only provider access is available, run the guarded reconciliation in a safe preview
  content-refresh window, rerun all gates, regenerate projections, and deploy a fresh preview.
- Obtain explicit human approval only for that refreshed preview; then resolve integration from the
  regenerated outputs before push, PR, merge, or production promotion.
- Await managed preview persistence credentials and independent human labels.
- Keep push, production promotion, production secrets, and cache purge excluded.
