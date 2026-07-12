# Compute Current design options comparison

## Decision

**Recommend Midnight Intelligence for the future public UI, subject to preview
approval.** It wins by a narrow margin because it preserves Compute Current's dark,
institutional identity while materially improving image prominence, route hierarchy,
article readability, and mobile behavior. Research Ledger remains a strong alternate
for readers who prefer a conventional research-publication surface. Signal Mosaic is
the most distinctive option, but its denser modules create the highest reading and
mobile complexity.

This checkpoint does not replace the production homepage. All three options remain
isolated under noindex `/design-lab/` routes until approval and final public-surface
quality gates.

## Weighted score

Scores use the requested 10-point scale and weights. Weighted totals are rounded to
two decimal places.

| Option | Readability 25% | Hierarchy 20% | Brand fit 20% | Mobile 15% | Accessibility 10% | Performance 10% | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Midnight Intelligence | 9.1 | 9.2 | 9.6 | 8.8 | 9.0 | 9.0 | **9.16** |
| Research Ledger | 9.6 | 9.0 | 8.3 | 9.2 | 9.4 | 9.0 | **9.08** |
| Signal Mosaic | 8.2 | 9.1 | 9.3 | 8.4 | 8.6 | 8.8 | **8.73** |

## Evaluation notes

### Midnight Intelligence

- Strongest continuity with the existing premium dark identity without retaining
  command-center or pipeline language.
- Oversized serif lead, restrained amber/cyan signals, and a conventional source
  stream provide clear editorial priority.
- Mobile puts the lead image before the long headline so the first viewport carries a
  real visual. The dense dark surface still requires careful contrast and spacing in
  the final production pass.

### Research Ledger

- Best long-form reading comfort, whitespace, and separation between lead analysis,
  supporting briefs, and evidence notes.
- Light surface offers the strongest contrast consistency and the least visual fatigue.
- The tradeoff is reduced differentiation from established financial and research
  publications.

### Signal Mosaic

- Strongest market-signal identity, with MW, grid, compute, and network callouts
  integrated into the editorial frame.
- Asymmetric modules work well on desktop and collapse without overflow on mobile.
- All-caps display typography and variable module density make long-session reading
  less comfortable than the other two options.

## Rendered evidence

- 27 captures: three options x homepage/article/states x desktop/tablet/mobile.
- Chromium QA result: 27 passed, 0 failed.
- No horizontal overflow, clipped HTML text, failed images, repeated visible image
  URLs, console errors, blank screenshots, exposed admin links, or internal pipeline
  terms. A manual image review also confirmed that card artwork contains no cropped
  baked-in headlines.
- Every homepage and article has a loaded image in the mobile first viewport.
- Every article headline also begins within the first viewport at all three tested
  widths.
- All routes emit `noindex,nofollow` and are absent from the sitemap.
- Homepage HTML is 13.4-13.6 KB per option; each uses seven unique local article
  images. The shared design-lab CSS bundle is 21,520 bytes.
- No production dependency was added and the prototypes ship no client JavaScript.

The machine-readable report is `artifacts/design-options/design-qa.json`. Required
screenshots are saved in the same directory, including:

- `midnight-desktop.png`, `midnight-tablet.png`, `midnight-mobile.png`
- `ledger-desktop.png`, `ledger-tablet.png`, `ledger-mobile.png`
- `mosaic-desktop.png`, `mosaic-tablet.png`, `mosaic-mobile.png`

Article and reader-state captures follow the same naming pattern with `-article-` and
`-states-` segments.

## Promotion gate

Before a selected option replaces the public UI, add the final production-only
features from the product brief: search and filters, reader-safe route badges for
original reporting / Editorial Brief / Analyst Note / Deep Dive, related signals, company and region
discovery, share/report controls, and real application state wiring. Then rerun the
full content gate, accessibility review, preview performance checks, and rollback
verification. The `Design option` label, theme switcher, and prototype view tabs are
comparison-only controls and must be removed before public promotion. Production
promotion remains blocked until explicit preview approval.
