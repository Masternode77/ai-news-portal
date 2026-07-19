# Performance Report

Updated: 2026-07-19

## Build Measurement

Measured locally on macOS with Node 22+ using `/usr/bin/time -l npm run build`:

| Metric | Audit baseline | Upgrade branch |
| --- | ---: | ---: |
| Static pages | 1,532 | 62 |
| Astro-reported build | not retained | 61 s |
| Full build including image preparation | not retained | 76.05 s real |
| Peak resident memory | not retained | 950,534,144 bytes |
| Browser JavaScript | not retained | 13,110 bytes / 1 file |
| CSS | not retained | 105,431 bytes / 2 files |

The first measured build copied 4,154 historical generated assets and produced a 272 MB
`dist`. The exact implementation build retained 68 referenced generated assets and pruned 4,109;
the reachability step reduces `dist` to 7.26 MB, about 97% from that initial measurement.
Publication builds do not acknowledge outbox events, so an
export, Astro, pruning, or deployment failure cannot consume them.

`npm run audit:performance` is now part of `content:gate`. It fails the release when the static
output exceeds any of these explicit ceilings: 10 MB total, 150 KB browser JavaScript, 150 KB CSS,
150 KB for the largest HTML document, or 500 KB for the largest image. The current measured output
is 7,292,794 bytes total, 13,110 bytes of JavaScript, 105,431 bytes of CSS, 93,885 bytes for the
largest HTML page, and 404,420 bytes for the largest image.

## Final Preview Lighthouse

Measured with Lighthouse 13.4.0 against exact implementation deployment
`dpl_HpRXGKfUMERRsu25iCcYpWVvsr1S`:

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

- `artifacts/preview-c9518bee/lighthouse-mobile.json`
- `artifacts/preview-c9518bee/lighthouse-desktop.json`

The deploy bundle boundary was also measured before and after the serverless import split. Local
Vercel output is 21,180 KiB for the media function and 772-1,912 KiB for every other admin
function, all well below the 250 MB limit. The remote Linux deployment reports 671-871 KiB
function artifacts and completed without a size warning.

## Page Samples

- Homepage HTML: 70,621 bytes.
- Archive HTML: 71,540 bytes.
- Search HTML: 93,885 bytes.
- Published article HTML: 19,260 bytes.

## Remaining Risks

These are lab measurements, not field Core Web Vitals. INP and long-window user telemetry need
real production traffic after approval. Search and archive remain the largest HTML documents
because they intentionally provide a usable publication feed without client-side fetching.
The current Lighthouse image-delivery insight estimates roughly 600 KiB of avoidable mobile image
transfer and 1.15 MiB on desktop, primarily because 1200-pixel editorial thumbnails serve cards
rendered at 240-390 pixels. Performance still clears the requested score and enforced budgets;
a smaller canonical card variant is the next image-pipeline optimization and requires a fresh
preview/provenance cycle rather than an unreviewed late asset rewrite.
