# GPT-5.6 design audit

## Current strengths

- The dark publication system is coherent and already closer to an institutional
  intelligence product than a generic blog.
- Desktop audit at 1440 x 1000 showed no console errors, missing alt text, duplicated
  visible image URLs, or document overflow.
- Mobile audit at 390 x 844 showed no document-level horizontal overflow.
- Article hero imagery loads at 1536 x 864 and remains visible on mobile.
- Public JavaScript is minimal.

## Current weaknesses

- The first mobile viewport contains no imagery and spends most of its height on copy
  and commands.
- Category navigation relies on an off-screen horizontal scroller.
- Hero copy and controls still read partly like an operating console.
- Forty-eight homepage cards form a long undifferentiated feed; route types are not
  visually clear.
- Cards link mostly to original sources because only one local article qualifies.
- The article page is approximately 235 words and repeats a universal heading skeleton.
- There is no functional search despite public search language.
- Images have no intrinsic dimensions or responsive source sets, increasing layout and
  bandwidth risk.
- Taxonomy navigation exposes empty categories, companies, and regions.
- Public operational links compete with reader tasks.

## Prototype requirements

All three design-lab options must use one representative, source-grounded dataset and
actual Compute Current imagery. They must implement homepage, article, navigation, and
empty/loading/error states at desktop, tablet, and mobile widths.

| Option | Intended strength | Principal risk |
| --- | --- | --- |
| Midnight Intelligence | Strongest continuity with current premium dark identity | Can become visually dense or console-like |
| Research Ledger | Highest long-form readability and route differentiation | May lose distinctive Compute Current character |
| Signal Mosaic | Strongest data-module and market-signal identity | Highest mobile and accessibility complexity |

Scoring weights are readability 25%, hierarchy 20%, brand fit 20%, mobile 15%,
accessibility 10%, and performance 10%. No winner is selected before rendered artifacts
and measured QA exist. The current working recommendation is Midnight Intelligence,
provided it removes internal dashboard language and improves mobile imagery/hierarchy.

## Measurement baseline

- Homepage HTML: 113 KB.
- Referenced images: approximately 2.25 MB.
- CSS: approximately 71 KB.
- 44 of 46 homepage images are lazy; two are eager.
- No image has `fetchpriority=high`, intrinsic width/height, `srcset`, or `sizes`.
- Runtime LCP, CLS, INP, and Lighthouse were not captured in the read-only audit and
  must be measured against the Vercel preview.
