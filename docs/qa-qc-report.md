# AI News Portal QA/QC Report

Updated at: 2026-07-19T09:45:34+09:00
Preview verdict: deployable with operational follow-up; upstream integration blocked

## Commands Run

- `npm run content:gate` -> passed (0)
- `git diff --name-only --diff-filter=U` -> passed (current working tree has no unresolved paths)
- `git merge-tree --write-tree HEAD origin/main` -> integration preflight failed as expected with 8 generated/data conflicts
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
- `origin/main` is 128 commits ahead and the read-only preflight reports 8 conflicts: the retired dashboard artifact, 4 generated image variants, and 3 generated JSON projections
- cache purge skipped by QA/QC non-goal
- This QA/QC workflow does not use production secrets and does not execute cache purge.

## Cleanup Receipts

- No production secret was read or required.
- Cache purge was explicitly skipped by the QA/QC workflow.
- No dev server, tmux session, browser context, or bound port is left running by this script.
