# Production Verification Report

Generated at: 2026-07-18T19:00:22.422Z
Build ID: 0.0.1:dist-mtime-1784400285043

## Target URL Summary

- Local URL: /Users/josh/Documents/New project 2/dist
- Staging URL: https://ai-news-portal-iyge1kj3t-masternode77s-projects.vercel.app
- Live URL: https://computecurrent.com

## Commands Run

- `node scripts/verify-production-surface.mjs --local-dist dist --staging https://ai-news-portal-iyge1kj3t-masternode77s-projects.vercel.app --live https://computecurrent.com --skip-cache-purge --screenshots artifacts/preview-29d55b6e/home-desktop.png,artifacts/preview-29d55b6e/home-mobile.png,artifacts/preview-29d55b6e/archive-desktop.png,artifacts/preview-29d55b6e/search-desktop.png,artifacts/preview-29d55b6e/article-desktop.png,artifacts/preview-29d55b6e/apac-desktop.png --out docs/production-verification-report.md --json artifacts/preview-29d55b6e/production-verification.json`

## Artifacts

- JSON result: `artifacts/preview-29d55b6e/production-verification.json`
- Markdown report: `docs/production-verification-report.md`
- Screenshot: `artifacts/preview-29d55b6e/home-desktop.png` (present, 3182430 bytes)
- Screenshot: `artifacts/preview-29d55b6e/home-mobile.png` (present, 3920768 bytes)
- Screenshot: `artifacts/preview-29d55b6e/archive-desktop.png` (present, 3427874 bytes)
- Screenshot: `artifacts/preview-29d55b6e/search-desktop.png` (present, 3420938 bytes)
- Screenshot: `artifacts/preview-29d55b6e/article-desktop.png` (present, 1891837 bytes)
- Screenshot: `artifacts/preview-29d55b6e/apac-desktop.png` (present, 1973231 bytes)

## Pass/Fail

- Local dist status: passed
  - index.html: present (70611 bytes)
  - rss.xml: present (29092 bytes)
  - sitemap.xml: present (4794 bytes)
  - sitemap-index.xml: present (193 bytes)
  - robots.txt: present (122 bytes)
  - archive/index.html: present (71530 bytes)
  - sample/index.html: present (5380 bytes)
  - subscribe/index.html: present (4206 bytes)
  - pricing/index.html: present (4459 bytes)
  - briefing/index.html: present (4280 bytes)
  - homepage public links missing: none
  - homepage legacy conversion links present: none
  - custom sitemap public paths missing: none
  - custom sitemap legacy conversion paths present: none
  - Astro sitemap child: sitemap-0.xml
  - Astro sitemap public paths missing: none
  - Astro sitemap legacy conversion paths present: none
  - RSS local news links: 2
  - RSS local missing files: none
- local: skipped local step: URL not provided
- staging URL: https://ai-news-portal-iyge1kj3t-masternode77s-projects.vercel.app
  - https://ai-news-portal-iyge1kj3t-masternode77s-projects.vercel.app/: live status passed 200
  - https://ai-news-portal-iyge1kj3t-masternode77s-projects.vercel.app/archive/: live status passed 200
  - https://ai-news-portal-iyge1kj3t-masternode77s-projects.vercel.app/sample/: live status passed 200
  - https://ai-news-portal-iyge1kj3t-masternode77s-projects.vercel.app/rss.xml: live status passed 200
  - https://ai-news-portal-iyge1kj3t-masternode77s-projects.vercel.app/sitemap.xml: live status passed 200
  - https://ai-news-portal-iyge1kj3t-masternode77s-projects.vercel.app/sitemap-index.xml: live status passed 200
  - https://ai-news-portal-iyge1kj3t-masternode77s-projects.vercel.app/robots.txt: live status passed 200
- live URL: https://computecurrent.com
  - https://computecurrent.com/: live status passed 200
  - https://computecurrent.com/archive/: live status passed 200
  - https://computecurrent.com/sample/: live status passed 200
  - https://computecurrent.com/rss.xml: live status passed 200
  - https://computecurrent.com/sitemap.xml: live status passed 200
  - https://computecurrent.com/sitemap-index.xml: live status passed 200
  - https://computecurrent.com/robots.txt: live status passed 200
- Cache purge status: skipped
- Cache purge blocker: cache purge skipped by QA/QC non-goal

## Remaining Risks

- Live route health passed, but no cache-freshness claim is made because cache purge was excluded.

## Cleanup Receipts

- No dev server, tmux session, browser context, temp directory, or cache-purge credential was created by this harness run.
- Screenshot artifacts listed above were verified by path; no screenshot process remained open.
