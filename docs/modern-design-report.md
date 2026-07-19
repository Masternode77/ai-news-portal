# Modern Design Report

Updated: 2026-07-19

The public surface now prioritizes a dense infrastructure intelligence workflow: a scanner-friendly homepage, image-backed cards, category navigation, resilient empty states, article hero imagery, and article pages that preserve source context without exposing internal pipeline language.

## Commands Run

- `node --test tests/homepage-layout.test.mjs tests/public-article-contract.test.mjs tests/article-page-template.test.mjs`
- `npm run build`
- `npm run check`
- Browser QA against built output for `/` and a `/news/<id>/` article.
- `node ./scripts/audit-rendered-public-output.mjs --out docs/rendered-public-output-report.md`

## Artifacts

- Homepage screenshots: `artifacts/preview-c9518bee/home-desktop.png`, `home-mobile.png`
- Article screenshot: `artifacts/preview-c9518bee/article-desktop.png`
- Browser QA JSON: `artifacts/preview-c9518bee/visual-qa.json`
- Adversarial image-byte QA JSON: `artifacts/preview-c9518bee/adversarial-e2e.json`
- Rendered output report: `docs/rendered-public-output-report.md`
- Components: `src/components/ArticleCard.astro`, `src/components/FeaturedArticle.astro`, `src/components/ArticleHeroImage.astro`, `src/components/CategoryNav.astro`

## Pass/Fail

- Passed: rendered audit checked 7 representative pages, 30 cards, and 0 broken images.
- Passed: exact-preview homepage QA decoded 31/31 images on desktop and mobile with no placeholders,
  errors, failed application requests, or overflow; byte hashing found 31/31 unique images.
- Passed: exact-preview article QA confirmed a decoded 1536x864 hero above the body.

## Remaining Risks

- The exact preview is verified; production remains intentionally different until approval.
- Future homepage copy changes should continue using public-output audits so internal queue labels do not reappear.
- Cache freshness is not claimed because cache purge was excluded.

## Cleanup Receipts

- Browser QA wrote screenshots and JSON evidence, then closed the browser context.
- No dev server from the design QA remains active after the task receipts.
- Generated static image assets are retained intentionally because they are part of the public build output.
