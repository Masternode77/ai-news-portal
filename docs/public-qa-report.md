# Public QA Report

Generated at: 2026-05-23T13:08:34Z

## Feed QA

- Homepage card count: 37
- Longform article count: 15
- Editorial brief count: 1
- Homepage-visible short signal count: 24
- Generated signal card count: 34
- Archive public count: 37
- RSS item count: 16
- Sitemap news entries: 15

## Copy QA

- Forbidden internal phrase hits: 0
- Public metadata internal-language hits: 0
- Homepage internal section labels: 0
- Card qualification-logic explanations: 0

## Article QA

- Public article routes: 15
- Minimum visible article body length: 4,734 characters
- Maximum visible article body length: 5,113 characters
- Clipped source text failures: 0
- Repeated template phrase failures: 0
- Duplicate source URLs removed from homepage/archive display.

## Commands Run

- `npm run build`
- `npm run content:gate`
- `node --test tests/public-internal-language-guard.test.mjs tests/public-content-tier-router.test.mjs tests/card-copy-quality-gate.test.mjs tests/homepage-layout.test.mjs tests/public-empty-state-copy.test.mjs tests/archive-public-copy.test.mjs tests/longform-quality.test.mjs tests/public-homepage-regression.test.mjs tests/public-copy-regression.test.mjs tests/article-page-template.test.mjs tests/article-page-autonomous.test.mjs tests/rss-builder.test.mjs tests/sitemap-builder.test.mjs tests/taxonomy-page-builder.test.mjs`
- `npm run check`
- `npm run purge:public-cache`

## Notes

`npm run check` completed with no errors. Astro reported pre-existing implicit-any hints in several legacy/admin components.
