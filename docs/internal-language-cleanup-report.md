# Internal Language Cleanup Report

Generated at: 2026-05-23T13:08:34Z

## Cleanup Scope

Public-facing components, page templates, feed builders, RSS output, sitemap-visible article data, and metadata builders were updated so operational workflow terms stay off reader surfaces.

## Phrase Classes Removed From Public Surfaces

- Cycle and qualification status labels
- Qualifying-signal and verified-cluster copy
- Backfill and archive-only explanations
- Public noindex/status field names
- Extraction, relevance, urgency, routing, and generation metadata
- Internal search labels such as "Find published analysis" and the typo variant

## Key Files Changed

- `src/pages/index.astro`
- `src/pages/news/[id].astro`
- `src/pages/archive/index.astro`
- `src/pages/archive/[page].astro`
- `src/pages/category/[slug].astro`
- `src/pages/company/[slug].astro`
- `src/pages/region/[slug].astro`
- `src/components/ArticleListCard.astro`
- `src/components/LatestAnalysisFeed.astro`
- `src/components/FeedFilterBar.astro`
- `src/components/ArticleHeader.astro`
- `src/components/ArticleBody.astro`
- `src/components/SourceAttribution.astro`
- `src/components/AIDisclosureFooter.astro`
- `scripts/lib/internal-language-guard.mjs`
- `scripts/lib/public-copy-sanitizer.mjs`
- `config/editorial/internal-public-banned-phrases.json`

## Audit Results

- `npm run audit:public-copy`: passed, 0 public internal-language hits.
- `npm run audit:homepage`: passed, 37 deduplicated public cards.
- `npm run content:gate`: passed.

Admin/debug routes may still contain operational status language where appropriate.
