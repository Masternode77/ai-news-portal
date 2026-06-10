# Public Feed Regeneration Report

Generated at: 2026-05-23T13:08:34Z

## Candidate Review

- Candidate source items reviewed: 200
- Total records after regeneration: 445
- Longform article pages generated: 15
- Editorial briefs generated: 1
- Signal cards generated: 34
- Hidden items: 395
- Removed/noindexed/hidden from public feed: 395

## Public Surface Counts

- Homepage-visible cards: 37
- Archive-visible items: 37
- Public article routes: 15
- RSS items: 16
- Sitemap entries: 51
- Sitemap news entries: 15

## Quality Results

- Public copy audit: 0 internal-language hits
- Minimum longform body length: 4,734 visible characters
- Maximum longform body length: 5,113 visible characters
- Article quality audit: passed
- Template repetition audit: passed through `npm run audit:article-quality`
- Public feed was deduplicated by canonical source URL before homepage/archive display.

## Cache Purge

`npm run purge:public-cache` ran locally and skipped the remote purge because no purge hook environment variable was configured.

Result: `skipped: missing COMPUTE_CURRENT_CACHE_PURGE_URL`.

The purge script and report are wired; production cache purge requires the deployment environment credentials.
