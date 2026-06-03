# Production Verification Report

Generated at: 2026-05-31T07:26:52.140Z
Build ID: 0.0.1:dist-mtime-1780211413505

## Target URL Summary

- Local URL: /Users/josh/Documents/New project 2/dist
- Staging URL: skipped staging step: URL not provided
- Live URL: https://www.computecurrent.com

## Commands Run

- `node scripts/verify-production-surface.mjs --local-dist dist --live https://www.computecurrent.com --out docs/production-verification-report.md --json evidence/compute-current-omo-ultra-rebuild/task-16-production.json`

## Artifacts

- JSON result: `evidence/compute-current-omo-ultra-rebuild/task-16-production.json`
- Markdown report: `docs/production-verification-report.md`
- Screenshot: `evidence/compute-current-omo-ultra-rebuild/task-14-homepage.png` (present, 2934080 bytes)
- Screenshot: `evidence/compute-current-omo-ultra-rebuild/task-14-article.png` (present, 1116885 bytes)

## Pass/Fail

- Local dist status: passed
  - index.html: present (93893 bytes)
  - rss.xml: present (15927 bytes)
  - sitemap.xml: present (9759 bytes)
- local: skipped local step: URL not provided
- staging: skipped staging step: URL not provided
- live URL: https://www.computecurrent.com
  - https://www.computecurrent.com/: live status passed 200
  - https://www.computecurrent.com/rss.xml: live status passed 200
  - https://www.computecurrent.com/sitemap.xml: live status passed 200
- Cache purge status: skipped
- Cache purge blocker: credential blocker: missing COMPUTE_CURRENT_CACHE_PURGE_URL or VERCEL_DEPLOY_HOOK_URL

## Remaining Risks

- Live content freshness cannot be asserted unless the live URL checks and cache purge both succeed in the same credentialed run.
- Staging was not checked when no staging URL was supplied.
- Existing Astro check hints remain informational unless they become build errors.

## Cleanup Receipts

- No dev server, tmux session, browser context, temp directory, or cache-purge credential was created by this harness run.
- Screenshot artifacts reused from Task 14 local browser QA; no screenshot process remained open.
