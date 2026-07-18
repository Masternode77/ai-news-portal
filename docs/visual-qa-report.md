# Visual QA Report

Updated: 2026-07-19

## Final Preview

- Deployment: `dpl_3P3ryw94P78z66ZJa1bopUAqSBu6`
- URL: `https://ai-news-portal-ef65tm1iq-masternode77s-projects.vercel.app`
- Product commit: `e37bc9c9e0f01691d79ea073ecf6a3eaa7785bd9`
- Separately observed production deployment: `dpl_8gDg7q7eyfUubUEeeXW8zq4Pd9pz`
- Separately observed `origin/main`: `c312b4d0ae6a4c9a9f1897ce1e0585b0247c2bf0`

Chromium captured the exact preview after decoding and scrolling the complete lazy-loaded image
inventory. Every checked route returned 200 with zero application console errors, page errors,
failed requests, broken images, `ChatGPT Image2 Visual` placeholder text, or horizontal overflow.

| Surface | Viewport | Loaded images | Broken | Placeholder | Overflow |
| --- | ---: | ---: | ---: | ---: | --- |
| Homepage | 1440 x 900 | 31/31 | 0 | 0 | no |
| Homepage | 390 x 844 | 31/31 | 0 | 0 | no |
| Archive | 1440 x 900 | 32/32 | 0 | 0 | no |
| Search | 1440 x 900 | 32/32 | 0 | 0 | no |
| Published article | 1440 x 900 | 1/1 | 0 | 0 | no |
| APAC taxonomy | 1440 x 900 | 19/19 | 0 | 0 | no |

The release audits cover all 30 latest, 708 archive, 738 search, and 32 taxonomy records. The
image audit reports zero broken public images or placeholder labels. Source provenance matches
26/26 articles and all 104 hero, thumbnail, OpenGraph, and legacy variants.

Screenshots:

- `artifacts/preview-e37bc9c9/home-desktop.png`
- `artifacts/preview-e37bc9c9/home-mobile.png`
- `artifacts/preview-e37bc9c9/archive-desktop.png`
- `artifacts/preview-e37bc9c9/search-desktop.png`
- `artifacts/preview-e37bc9c9/article-desktop.png`
- `artifacts/preview-e37bc9c9/apac-desktop.png`
- Visual browser receipt: `artifacts/preview-e37bc9c9/visual-qa.json`
- Production verifier receipt: `artifacts/preview-e37bc9c9/production-verification.json`
- Adversarial HTTP and image receipt: `artifacts/preview-e37bc9c9/adversarial-e2e.json`

Sharp pixel statistics mark every retained capture nonblank. A fresh 1440 x 900 comparison found
1,056,546 of 1,296,000 pixels different (81.5236%). `computecurrent.com` still serves the previous
command-center design while the preview serves Midnight Intelligence. That mismatch is the expected
pre-approval state, not a failed or partial preview render.

## Accessibility Follow-up

The first preview audit found a 3.95:1 date contrast and an accessible-name mismatch on the visible
brand link. Commit `679f511b` corrected both. Final Lighthouse accessibility is 100 on mobile and
desktop.

## Design Options

The design-lab harness captured 27 route and viewport combinations for Midnight Intelligence,
Research Ledger, and Signal Mosaic. Its JSON verdict passed with zero console errors, failed
images, clipped text, horizontal overflow, repeated first-viewport images, or exposed admin links.
All design routes remain noindex.

Midnight Intelligence remains the recommended direction at 9.16/10. Research Ledger scored 9.08
and Signal Mosaic scored 8.73. Evidence is stored under `artifacts/design-options/`.

## Verdict

Visual QA passes for preview approval. Production was not promoted or changed by this branch.
