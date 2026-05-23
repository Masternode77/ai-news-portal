# Autonomous Editorial Desk Current State Audit

Generated at: 2026-05-20T05:34:03.837Z

## Pipeline And Public Counts

- latest pipeline run time: 2026-05-20T00:09:42.797Z
- latest source scan time: not_found
- latest source article date: 2026-05-19T23:39:27.000Z
- latest published Compute Current analysis date: 2026-05-20T05:31:55.795Z
- articles crawled in last 8h / 24h / 7d: 8 / 27 / 30
- items passing extraction QA: 311
- items passing relevance QA: 401
- generated local articles: 3
- homepage-visible cards: 8
- source-only/direct-link cards: 5
- archived-only items: 437
- RSS-eligible items: 3
- sitemap-indexable items: 3
- category/tag pages: 0 real dynamic category/tag routes currently present
- company/region pages: 0 real company/region routes currently present
- current homepage local blog count: 3

## Why Items Are Not Local Blog Posts

- extraction quality below threshold or failed extraction: 134
- relevance below threshold or archive action: 44
- articlePagePublished false: 442
- homepagePublished false: 437
- archiveOnly true/public archive-only: 437
- noindex true/policy noindex: 442
- missing local slug/id: 0
- stale generation version not autonomous_editorial_desk_v1: 359

## Repeated AI Phrase Counts

- "Commercially,": 0
- "Operationally,": 0
- "worth a local Compute Current read": 0
- "puts power under": 0
- "lens for infrastructure readers": 0
- "reported item can translate into": 0
- "readers should test whether": 0
- "not just another AI headline": 0
- "not merely adding another generic AI headline": 0
- "source-backed change": 0

## Verification Gaps

- latest public/local articles with numeric claims but no claim ledger: 0
- repeated opening first 10 words in latest 30 public articles: 0
- repeated heading sequences in latest 30 public articles: 1

## Where Current Copy Comes From

- Card copy and public presentation: scripts/lib/public-presentation.mjs -> buildPublicPresentation; scripts/lib/editorial-excerpt-generator.mjs -> generateEditorialExcerpt; src/components/PublicSignalCard.astro renders the fields.
- Article body generation: scripts/lib/blog-engine-v4.mjs -> generateBlogArticle; scripts/lib/evidence-pack-builder.mjs -> buildEvidencePack; scripts/lib/analyst-draft-writer.mjs and scripts/lib/human-editor-rewrite.mjs shape body copy.
- Fallback body/deck language: scripts/lib/blog-engine-v4.mjs -> deckFor, whyFor, extensionParagraphs; scripts/lib/evidence-pack-builder.mjs -> commercialImplication and operatingImplication.
- Freshness display: src/pages/index.astro -> stats array, formatTimeAgo, live-brief section.
- RSS generation: src/pages/rss.xml.ts -> GET; scripts/lib/seo-quality-policy.mjs -> rssItemEligible.
- Archive counts/search: src/pages/index.astro -> archiveCount/searchPayload; scripts/lib/archive-store.mjs -> syncArchiveArtifacts.
- Homepage lane rendering: src/pages/index.astro -> topConstraint, localBlogSurfaceItems, intelligenceSections; src/components/PublicSignalCard.astro.
- Article page routing: src/pages/news/[id].astro -> getStaticPaths, articleDetailQualityEligible, shouldNoindexArticle.
- Sitemap filtering: astro.config.mjs -> @astrojs/sitemap filter; src/lib/seo-safeguards.js -> shouldNoindexArticle.

## Static Phrase Source Hits

- none found in scanned generator/rendering files

## Diagnosis

The public surface feels like AI-generated summary content because the previous recovery system optimized for filling a homepage with 20 local posts. `blog-engine-v4` extends body length using reusable operating/commercial paragraphs, while `evidence-pack-builder` supplies generic commercial and operating implication sentences. The public deck path then preserves those reusable phrases through `buildPublicPresentation`, `PublicSignalCard`, RSS descriptions, and detail metadata. The homepage freshness model is count-based rather than cycle-based, so old backfilled analyses can appear beside "Live Brief" and "8h Refresh" without proving a recent editorial cycle produced new qualifying signals.

## Required Runtime Change Direction

- Replace article-by-article backfill with persisted 8-hour editorial cycles.
- Select signal clusters, not individual feed items, and publish at most 2-3 verified analyses per cycle.
- Persist claim ledgers for numeric and operational assertions.
- Render freshness and no-qualifying-signal states truthfully.
- Make category, company, region, archive, RSS, and sitemap pages reflect public published analysis rather than internal raw archive volume.
