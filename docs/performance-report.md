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
`dist`. The new post-build reachability pruner retained 83 referenced generated assets and
reduced `dist` to 5.6 MB, a reduction of about 97.9%. Publication builds do not acknowledge
outbox events, so an export, Astro, pruning, or deployment failure cannot consume them.

## Page Samples

- Homepage HTML: 73,627 bytes.
- Archive HTML: 73,914 bytes.
- Search HTML: 97,656 bytes.
- Published article HTML: 19,159 bytes.

## Remaining Risks

Local artifact size is verified; field LCP, CLS, INP, TTFB and Lighthouse scores are not yet
measured against the Vercel preview. The preview must reach the requested 90 scores where
realistic or record concrete blockers before merge. Search and archive HTML remain the largest
documents because they intentionally expose a usable publication feed without client fetching.
