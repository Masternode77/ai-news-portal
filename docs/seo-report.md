# SEO Report

Updated: 2026-07-19

## Verified Controls

- Canonical URL, OpenGraph, article schema, source citation, publication date, category, and
  image metadata are generated through the shared layout and SEO safeguards.
- Homepage, archive, search, article, category, company, and region surfaces consume one public
  inventory, including CMS ownership tombstones.
- RSS and sitemap consume that same inventory and exclude admin and retired operational routes.
- Admin and design-lab routes are noindex; `robots.txt` disallows `/admin/` and `/api/admin/`.
- `/about/`, `/editorial-policy/`, `/methodology/`, `/ai-disclosure/`, and `/contact/` are absent
  from source routes, feeds, sitemap, structured data, and public navigation.
- Unsafe structured-data serialization and unsafe URL schemes are covered by regression tests.

## Local Evidence

The build-backed hermetic suite ran 671 tests: all 671 passed with no failures or skips, and the
62-page Astro build completed successfully. Public output, sitemap/RSS, structured-data, thin-page, source
attribution, admin exclusion, and retired-route contracts are included in the test and content
gate surfaces.

## Remaining Risks

The exact Vercel preview was measured. Its Lighthouse SEO score is 69 because Vercel adds
`x-robots-tag: noindex` to previews; this is expected and prevents accidental indexing. Field
search-engine behavior and social-card cache freshness still require post-approval production
observation. Lighthouse 13.4.0 reproduced the score on both mobile and desktop against
`dpl_HpRXGKfUMERRsu25iCcYpWVvsr1S`; raw reports are retained under
`artifacts/preview-c9518bee/`. Production remains unchanged during this review.
