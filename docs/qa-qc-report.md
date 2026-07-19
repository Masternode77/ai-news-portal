# AI News Portal QA/QC Report

Updated at: 2026-07-19T10:04:07+09:00
Preview verdict: deployable with operational follow-up; upstream integration blocked

## Commands Run

- `npm run content:gate` -> passed (0)
- `npm test` -> 676 total, 676 passed, 0 failed, 0 skipped; dirty worktree preserved
- `git diff --name-only --diff-filter=U` -> passed (current working tree has no unresolved paths)
- `npm run audit:integration -- --revision=origin/main --out=docs/upstream-integration-preflight.md --json=artifacts/preview-c9518bee/integration-preflight.json` -> exited 1 as expected with 8 generated/data conflicts; repository object database and merge working tree unchanged, requested receipts updated
- `JSON.parse(src/data/latest-news.json)` -> passed
- `JSON.parse(src/data/archived-news.json)` -> passed
- `JSON.parse(src/data/search-index.json)` -> passed
- `production surface verification` -> local dist and exact preview passed
- Vercel preview `dpl_HpRXGKfUMERRsu25iCcYpWVvsr1S` -> READY, target preview
- focused security loop -> 129/129 x 3 (387/387)
- exact-preview HTTP/route/image/browser checks -> passed

## Artifacts

- Exact-preview visual result: `artifacts/preview-c9518bee/visual-qa.json`
- Exact-preview adversarial result: `artifacts/preview-c9518bee/adversarial-e2e.json`
- Markdown report: `docs/qa-qc-report.md`
- Production verification report: `docs/production-verification-report.md`
- Production verification JSON: `artifacts/preview-c9518bee/production-verification.json`
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
- No dev server, tmux session, browser context, or bound port is left running by this script.
