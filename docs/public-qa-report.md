# Public QA Report

Updated: 2026-07-19

Public QA covers rendered pages, public copy, article quality, homepage volume, feed output, image output, and admin exclusion. The current gate is intentionally build-backed so stale source-only assertions do not hide rendered failures.

## Commands Run

- `npm run content:gate`
- `node ./scripts/audit-rendered-public-output.mjs --out docs/rendered-public-output-report.md`
- `node ./scripts/audit-public-copy.mjs`
- `node ./scripts/audit-public-article-quality.mjs`
- `node ./scripts/audit-admin-exclusion.mjs --out docs/admin-exclusion-report.md`
- `npm run audit:homepage`
- `npm run audit:feed-volume`
- `npm run audit:images`
- `npm run audit:admin`

## Artifacts

- Rendered output report: `docs/rendered-public-output-report.md`
- Admin exclusion report: `docs/admin-exclusion-report.md`
- Homepage screenshots: `artifacts/preview-c9518bee/home-desktop.png`, `home-mobile.png`
- Archive/search/article/APAC screenshots: `artifacts/preview-c9518bee/`
- Browser QA JSON: `artifacts/preview-c9518bee/visual-qa.json`
- Adversarial image-byte QA JSON: `artifacts/preview-c9518bee/adversarial-e2e.json`

## Pass/Fail

- Passed: content gate completed with an Astro 0/0/0 check, 62-page build, public-output tests, image audit, rendered public audit, and admin audit.
- Passed: rendered audit checked 7 representative pages, 1 public article page, 30 rendered cards, and 0 broken images; the image audit covered 51 rendered public pages.
- Passed: admin exclusion audit reported no sitemap/RSS/admin noindex failures.

## Remaining Risks

- The exact preview is verified, but production remains intentionally different before approval.
- No cache-freshness claim is made because cache purge was excluded.

## Cleanup Receipts

- Browser contexts used for exact-preview screenshots and image hashing were closed after capture.
- No long-running local server is required by the recorded content gate evidence.
- Generated `public/dashboard-data.json` was restored after build-time timestamp changes.
