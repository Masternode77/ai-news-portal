# AI News Portal QA/QC Report

Generated at: 2026-07-19T09:15:00+09:00
Verdict: deployable with operational follow-up

## Commands Run

- `npm run content:gate` -> passed (0)
- `git diff --name-only --diff-filter=U` -> passed
- `JSON.parse(src/data/latest-news.json)` -> passed
- `JSON.parse(src/data/archived-news.json)` -> passed
- `JSON.parse(src/data/search-index.json)` -> passed
- `production surface verification` -> local dist and exact preview passed
- Vercel preview `dpl_HpRXGKfUMERRsu25iCcYpWVvsr1S` -> READY, target preview
- focused security loop -> 129/129 x 3 (387/387)
- exact-preview HTTP/route/image/browser checks -> passed

## Artifacts

- JSON result: `evidence/qa-qc/qa-qc-report.json`
- Markdown report: `docs/qa-qc-report.md`
- Production verification report: `evidence/qa-qc/production-verification-report.md`
- Production verification JSON: `evidence/qa-qc/production-verification-report.json`

## Pass/Fail

- Verdict: deployable with operational follow-up
- Local gate: passed
- Merge/data integrity: passed
- Local distribution: passed
- Live verification: passed
- Cache purge: skipped

## Remaining Risks

- managed Postgres/Blob staging writes skipped because preview-only credentials are absent
- cache purge skipped by QA/QC non-goal
- This QA/QC workflow does not use production secrets and does not execute cache purge.

## Cleanup Receipts

- No production secret was read or required.
- Cache purge was explicitly skipped by the QA/QC workflow.
- No dev server, tmux session, browser context, or bound port is left running by this script.
