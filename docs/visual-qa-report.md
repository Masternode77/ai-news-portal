# Visual QA Report

Updated: 2026-07-12

## Final Preview

- Deployment: `dpl_9qoXHkYVspAM5FHBExEc6iqyzTuT`
- URL: `https://ai-news-portal-g93sbqwbc-masternode77s-projects.vercel.app`
- Product commit: `f674c1df`
- Production comparison deployment: `dpl_EtTdsEikynpmsq9sUQSaDch76PFF` (unchanged)

Chromium captured the exact preview after scrolling every page through its complete
lazy-loaded image inventory. Homepage desktop, homepage mobile, archive desktop, and the published article
all returned 200 with zero application console errors, failed requests, broken images,
`ChatGPT Image2 Visual` placeholder text, or horizontal overflow.

| Surface | Viewport | Loaded images | Unique bytes | Broken | Overflow |
| --- | ---: | ---: | ---: | ---: | --- |
| Homepage | 1440 x 1000 | 39/39 | 39/39 | 0 | no |
| Homepage | 390 x 844 | 39/39 | 39/39 | 0 | no |
| Archive | 1440 x 1000 | 40/40 | 40/40 | 0 | no |
| Published article | 1440 x 1000 | 1/1 | 1/1 | 0 | no |

The duplicate audit also covers all 30 latest, 709 archive, 739 search, and 73 taxonomy
records. It reports zero duplicate-byte groups on each public surface. Two legacy cards now
use verified source photographs, while 66 records that shared one deterministic raster were
migrated to the SHA-256-seeded v2 generator.

Screenshots:

- `evidence/gpt56-upgrade/preview-home-desktop.png`
- `evidence/gpt56-upgrade/preview-home-mobile.png`
- `evidence/gpt56-upgrade/preview-archive-desktop.png`
- `evidence/gpt56-upgrade/preview-article-desktop.png`
- Receipt: `evidence/gpt56-upgrade/preview-browser-qa.json`

## Accessibility Follow-up

The first preview audit found a 3.95:1 date contrast and an accessible-name mismatch on the
visible brand link. Commit `679f511b` scoped the publication date color to `--cc-muted` and
removed the redundant brand `aria-label`. Final Lighthouse accessibility is 100 on mobile
and desktop.

## Design Options

The design-lab harness captured 27 route and viewport combinations for Midnight
Intelligence, Research Ledger, and Signal Mosaic. Its JSON verdict passed with zero console
errors, failed images, clipped text, horizontal overflow, repeated first-viewport images,
or exposed admin links. All design routes remain noindex.

Midnight Intelligence remains the recommended direction at 9.16/10. Research Ledger scored
9.08 and Signal Mosaic scored 8.73. Evidence is stored under `artifacts/design-options/`.

## Verdict

Visual QA passes for preview approval. Production was not promoted or changed.
