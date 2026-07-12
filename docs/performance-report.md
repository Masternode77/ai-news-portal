# Performance Report

Updated: 2026-07-12

## Build Measurement

Measured locally on macOS with Node 22+ using `/usr/bin/time -l npm run build`:

| Metric | Audit baseline | Upgrade branch |
| --- | ---: | ---: |
| Static pages | 1,532 | 61 |
| Astro build phase | not retained | 16.44 s |
| Full build including image preparation | not retained | 31.12 s |
| Peak resident memory | not retained | 997,277,696 bytes |
| Browser JavaScript | not retained | 11,432 bytes / 1 file |
| CSS | not retained | 100,126 bytes / 2 files |

The first measured build copied 4,154 historical generated assets and produced a 272 MB
`dist`. The final post-merge build retained 85 referenced generated assets and pruned 4,097;
the reachability step reduces
`dist` to 5.6 MB, about 97.9%. Publication builds do not acknowledge outbox events, so an
export, Astro, pruning, or deployment failure cannot consume them.

`npm run audit:performance` is now part of `content:gate`. It fails the release when the static
output exceeds any of these explicit ceilings: 10 MB total, 150 KB browser JavaScript, 150 KB CSS,
150 KB for the largest HTML document, or 500 KB for the largest image. The current measured output
is 5,095,581 bytes total, 11,432 bytes of JavaScript, 100,239 bytes of CSS, 100,020 bytes for the
largest HTML page, and 335,600 bytes for the largest image.

## Final Preview Lighthouse

Measured against deployment `dpl_9qoXHkYVspAM5FHBExEc6iqyzTuT`:

| Profile | Performance | Accessibility | Best Practices | SEO | FCP | LCP | TBT | CLS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Mobile | 97 | 100 | 92 | 69 | 0.9 s | 2.6 s | 0 ms | 0 |
| Desktop | 100 | 100 | 92 | 69 | 0.3 s | 0.5 s | 0 ms | 0 |

The two Best Practices failures come from Vercel Preview Toolbar attempting to inject
`https://vercel.live/_next-live/feedback/feedback.js` while the application's CSP correctly
allows scripts from `self` only. Browser QA filters only this known preview-tool request and
records zero application console errors or request failures.

The SEO score is not a production SEO result. Vercel adds `x-robots-tag: noindex` to preview
deployments, and Lighthouse correctly marks the preview as not crawlable. Canonical, sitemap,
RSS, robots, and public inventory contracts pass separately; production remains untouched.

Raw reports:

- `evidence/gpt56-upgrade/lighthouse-home-mobile.json`
- `evidence/gpt56-upgrade/lighthouse-home-desktop.json`

## Page Samples

- Homepage HTML: 75,505 bytes.
- Archive HTML: 75,792 bytes.
- Search HTML: 100,020 bytes.
- Published article HTML: 19,154 bytes.

## Remaining Risks

These are lab measurements, not field Core Web Vitals. INP and long-window user telemetry need
real production traffic after approval. Search and archive remain the largest HTML documents
because they intentionally provide a usable publication feed without client-side fetching.
