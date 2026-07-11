# Public Operational Pages Removal Report

## Scope

Compute Current no longer publishes the following operational explanation routes:

- `/about/`
- `/editorial-policy/`
- `/methodology/`
- `/ai-disclosure/`
- `/contact/`

The Astro page files were deleted, so static builds do not emit these routes. No homepage or route-level redirects were added; hosts without a matching static artifact return their normal 404 response.

## Public Reference Cleanup

- The custom sitemap filters all five removed routes.
- The RSS endpoint rejects any item that points to a removed route.
- Article structured data no longer emits `correctionPolicy` or `publishingPrinciples` links to the retired editorial policy page.
- The article footer no longer describes the AI-assisted workflow or links to the retired disclosure page. It retains only the article's canonical permalink.
- Source attribution, original-source links, publication dates, categories, legal routes, and admin indexing controls are unchanged.

## Validation

Regression coverage verifies that:

- no deleted route is emitted by a static build;
- custom sitemap and RSS output omit every removed route;
- article schema omits the retired policy properties while retaining source attribution;
- admin remains excluded from robots and public indexes;
- all public Astro pages, components, layouts, and site configuration contain none of the retired links or labels.

Build validation should invoke Astro directly with a temporary output directory. The repository `npm run build` command is intentionally avoided because image preparation still mutates tracked source artifacts.

Validation completed on 2026-07-11:

- `npm run check`: passed with 0 errors and 11 pre-existing type hints.
- `npx astro build --outDir /tmp/compute-current-operational-pages.00WD5q`: passed without writing generated data or images into the repository.
- `PUBLIC_BUILD_DIR=/tmp/compute-current-operational-pages.00WD5q node --test tests/public-operational-pages-removal.test.mjs`: 6/6 passed.
- `node --test tests/admin-routes.test.mjs`: 4/4 passed.
- `node --test tests/article-page-template.test.mjs`: 1/1 passed.
- `node --test tests/sitemap-builder.test.mjs tests/rss-builder.test.mjs`: 8/8 passed.

## Integration Result

The homepage, pricing, subscribe, briefing, and sample surfaces now point readers to the archive, RSS, sample, and topic coverage instead of the retired pages. Site configuration no longer exports the retired routes or CTA labels. A discreet `Admin` link remains `nofollow` and all admin routes remain noindex and excluded from sitemaps.
