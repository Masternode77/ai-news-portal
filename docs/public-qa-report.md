# Public QA Report

Generated at: 2026-05-31T08:00:00.000Z

Public QA covers rendered pages, public copy, article quality, homepage volume, feed output, image output, and admin exclusion. The current gate is intentionally build-backed so stale source-only assertions do not hide rendered failures.

## Commands Run

- `npm run content:gate`
- `node ./scripts/audit-rendered-public-output.mjs`
- `node ./scripts/audit-public-copy.mjs`
- `node ./scripts/audit-public-article-quality.mjs`
- `npm run audit:homepage`
- `npm run audit:feed-volume`
- `npm run audit:images`
- `npm run audit:admin`

## Artifacts

- Rendered output report: `docs/rendered-public-output-report.md`
- Admin exclusion report: `docs/admin-exclusion-report.md`
- Content gate log: `evidence/compute-current-omo-ultra-rebuild/task-14-content-gate.log`
- Homepage screenshot: `evidence/compute-current-omo-ultra-rebuild/task-14-homepage.png`
- Article screenshot: `evidence/compute-current-omo-ultra-rebuild/task-14-article.png`
- Browser QA JSON: `evidence/compute-current-omo-ultra-rebuild/task-14-browser-qa.json`

## Pass/Fail

- Passed: content gate completed with an Astro 0/0/0 check, 59-page build, public-output tests, image audit, rendered public audit, and admin audit.
- Passed: rendered audit checked 7 representative pages, 1 public article page, 30 rendered cards, and 0 broken images; the image audit covered 48 rendered public pages.
- Passed: admin exclusion audit reported no sitemap/RSS/admin noindex failures.

## Remaining Risks

- Public QA is a local build result until deployment verification confirms the live URL and cache purge state.
- Additional mobile viewport coverage would further reduce layout regression risk.

## Cleanup Receipts

- Browser contexts used for Task 14 screenshots were closed after capture.
- No long-running local server is required by the recorded content gate evidence.
- Generated `public/dashboard-data.json` was restored after build-time timestamp changes.
