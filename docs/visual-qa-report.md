# Visual QA Report

Updated: 2026-07-12

## Design Options

The design-lab harness captured 27 fresh route/viewport combinations for Midnight
Intelligence, Research Ledger, and Signal Mosaic: homepage, article, and state surfaces at
1440 px, 834 px, and 390 px. Its JSON verdict is `passed` with zero console errors, failed
images, clipped text, horizontal overflow, repeated first-viewport images, or exposed admin
links. All design routes are noindex.

Screenshots and the machine-readable receipt are under `artifacts/design-options/`. Midnight
Intelligence remains the documented winner, subject to preview approval.

## Public Surface Status

The prior commercial visual receipt predates removal of the public operational pages and is not
valid final evidence for this branch. Fresh homepage, archive, search, article, admin-login,
desktop, tablet, and mobile captures must be generated from the final Vercel preview. The
production domain must not be used as proof of the upgrade before merge.

## Acceptance Gate

Final visual approval requires no overlap, clipping, blank images, first-viewport image gaps,
console errors, or broken image requests on the preview, followed by a screenshot comparison
against the exact preview commit.
