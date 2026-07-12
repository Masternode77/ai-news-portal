# Production Verification Report

Generated at: 2026-07-12T05:43:57.732Z
Build ID: 0.0.1:dist-mtime-1783834612408

## Target URL Summary

- Local URL: /Users/josh/Documents/New project 2/dist
- Staging URL: https://ai-news-portal-g93sbqwbc-masternode77s-projects.vercel.app
- Live URL: https://computecurrent.com

## Commands Run

- `node scripts/verify-production-surface.mjs --local-dist dist --staging https://ai-news-portal-g93sbqwbc-masternode77s-projects.vercel.app --live https://computecurrent.com --skip-cache-purge --out docs/production-verification-report.md --json evidence/gpt56-upgrade/production-verification.json`

## Artifacts

- JSON result: `evidence/gpt56-upgrade/production-verification.json`
- Markdown report: `docs/production-verification-report.md`
- Screenshot: `evidence/gpt56-upgrade/preview-home-desktop.png` (present, 4089498 bytes)
- Screenshot: `evidence/gpt56-upgrade/preview-home-mobile.png` (present, 3771940 bytes)
- Screenshot: `evidence/gpt56-upgrade/preview-archive-desktop.png` (present, 3559249 bytes)
- Screenshot: `evidence/gpt56-upgrade/preview-article-desktop.png` (present, 1221607 bytes)

## Pass/Fail

- Local dist status: passed
  - index.html: present (75505 bytes)
  - rss.xml: present (40043 bytes)
  - sitemap.xml: present (5069 bytes)
  - sitemap-index.xml: present (193 bytes)
  - robots.txt: present (122 bytes)
  - archive/index.html: present (75792 bytes)
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
- staging URL: https://ai-news-portal-g93sbqwbc-masternode77s-projects.vercel.app
  - https://ai-news-portal-g93sbqwbc-masternode77s-projects.vercel.app/: live status passed 200
  - https://ai-news-portal-g93sbqwbc-masternode77s-projects.vercel.app/archive/: live status passed 200
  - https://ai-news-portal-g93sbqwbc-masternode77s-projects.vercel.app/sample/: live status passed 200
  - https://ai-news-portal-g93sbqwbc-masternode77s-projects.vercel.app/rss.xml: live status passed 200
  - https://ai-news-portal-g93sbqwbc-masternode77s-projects.vercel.app/sitemap.xml: live status passed 200
  - https://ai-news-portal-g93sbqwbc-masternode77s-projects.vercel.app/sitemap-index.xml: live status passed 200
  - https://ai-news-portal-g93sbqwbc-masternode77s-projects.vercel.app/robots.txt: live status passed 200
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

- Preview and live route health passed, but cache freshness was not asserted because purge is explicitly excluded.
- Preview Postgres, Blob, and admin credentials are absent, so durable CMS persistence remains an operational follow-up.
- Existing Astro check hints remain informational unless they become build errors.

## Cleanup Receipts

- No dev server, tmux session, browser context, temp directory, or cache-purge credential was created by this harness run.
- Fresh screenshots were captured from the exact preview deployment; no browser process remained open.
