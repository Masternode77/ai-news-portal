# SEO Report

Updated: 2026-07-12

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

The full test run ran 418 tests: 417 passed, none failed, and one skip. The 61-page Astro build
completed successfully. Public output, sitemap/RSS, structured-data, thin-page, source
attribution, admin exclusion, and retired-route contracts are included in the test and content
gate surfaces.

## Remaining Risks

Search-engine fetch behavior, deployed canonical host headers, social-card cache freshness, and
real preview response headers require the Vercel preview. Lighthouse SEO is not claimed until
that URL is measured. Production remains unchanged during this review.
