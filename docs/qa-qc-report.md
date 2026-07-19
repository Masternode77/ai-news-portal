# AI News Portal QA/QC Report

Updated at: 2026-07-19T11:59:25+09:00
Preview verdict: deployable with operational follow-up; upstream integration blocked

## Commands Run

- `npm run content:gate` -> passed (0)
- `npm test` -> 687 total, 687 passed, 0 failed, 0 skipped; dirty worktree preserved
- reconciliation/orchestrator/image focused suite -> 99/99 passed
- `npm run check` -> 0 errors, 0 warnings, 0 hints
- `npm audit --audit-level=low` -> 0 vulnerabilities
- current auth/admin/SSRF/XSS/storage/security suite -> 128/128 passed
- `vercel env ls` -> no variables configured for the linked project; no value or secret was read
- guarded reconciliation without provider credentials -> exited 1 before checkpoint, audit, or cycle
  access; tracked worktree bytes were unchanged
- isolated 27-candidate offline rehearsal -> exited 1 at `reconciliation_classification_empty`,
  persisted a retryable failed checkpoint, and wrote no generated image or public data projection
- strict reconciliation publish test -> preserved provider-only Image2 metadata, skipped ordinary
  fallback backfill, bound four distinct generated variants to the owning article before state access,
  rejected borrowed or shared paths, and included all four paths in the durable publication bundle
- editorial reconciliation ordering test -> generated Image2 only after the expert lens finalized the
  headline, so canonical paths remain valid when the editorial provider changes the source title
- `git diff --name-only --diff-filter=U` -> passed (current working tree has no unresolved paths)
- `npm run audit:integration -- --revision=origin/main --out=docs/upstream-integration-preflight.md --json=artifacts/preview-c9518bee/integration-preflight.json` -> exited 1 as expected with 8 generated/data conflicts; repository object database and merge working tree unchanged, requested receipts updated
- `JSON.parse(src/data/latest-news.json)` -> passed
- `JSON.parse(src/data/archived-news.json)` -> passed
- `JSON.parse(src/data/search-index.json)` -> passed
- `production surface verification` -> local dist and exact preview passed
- Vercel preview `dpl_9xCxsn8EboAyPjMdgN9takLAfskh` -> READY, target preview,
  implementation `5b1e1d55bb728f49589a9ca89cbec767220c6aaa`
- focused security loop -> 129/129 x 3 (387/387)
- exact-preview HTTP/route/image/browser checks -> 21/21 passed
- exact-preview design/admin route-policy checks -> 22/22 passed
- Vercel runtime log review -> no error-level events; only expected fail-closed admin API 503s

## Artifacts

- Exact-preview browser result: `artifacts/preview-5b1e1d55/preview-browser-verification.json`
- Exact-preview screenshots: `artifacts/preview-5b1e1d55/`
- Markdown report: `docs/qa-qc-report.md`
- Production verification report: `docs/production-verification-report.md`
- Production verification JSON: `artifacts/preview-5b1e1d55/production-verification.json`
- Tracked integration preflight: `docs/upstream-integration-preflight.md`
- Integration preflight JSON: `artifacts/preview-c9518bee/integration-preflight.json`

## Pass/Fail

- Preview verdict: deployable with operational follow-up
- Local gate: passed
- Working-tree/data integrity: passed
- Upstream integration readiness: blocked pending guarded reconciliation and regenerated projections
- Local distribution: passed
- Live verification: passed
- Cache purge: skipped

## Remaining Risks

- managed Postgres/Blob staging writes skipped because preview-only credentials are absent
- `origin/main` is 128 commits ahead and the isolated-object preflight reports 8 conflicts: the retired dashboard artifact, 4 generated image variants, and 3 generated JSON projections
- cache purge skipped by QA/QC non-goal
- This QA/QC workflow does not use production secrets and does not execute cache purge.

## Cleanup Receipts

- No production secret was read or required.
- Cache purge was explicitly skipped by the QA/QC workflow.
- Integration simulation wrote only to a cleaned temporary object database; the requested Markdown and ignored JSON receipts are the only persistent outputs.
- Reconciliation rehearsals used no provider or production secret and did not reach public-file writes.
- No dev server, tmux session, browser context, or bound port is left running by this script.
