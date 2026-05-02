# NEXT

## Completed
- Applied the article-detail editorial treatment across the portal.
- Homepage/search titles now prefer hook-style `expertLensFull.finalHeadline`.
- Existing article copy is lightly cleaned at render time to remove stiff template phrasing.
- Article pages now show a three-line Executive Summary before the main copy.
- Future expert-lens generation now requests hook headlines and exactly three executive-summary lines.
- Expanded article detail width and aligned summary/body blocks to the page edge.
- Tuned global headline/body font stacks, detail headline scale, homepage lead headline scale, and article body readability.
- Removed the remaining title width cap so article and homepage lead headlines use the full content width.
- Reduced oversized headline scales and loosened line-height to remove the empty-right-column effect.
- Homepage media now prefers source images over generated text posters to avoid baked-in headline clipping.
- Local generated posters now wrap long title and summary text inside SVG overlays.
- Added five crawler feeds: Data Center Frontier, Data Center POST, Cloudflare Blog, Engineering at Meta, and Hugging Face Blog.
- Verified all five added feeds parse successfully with `rss-parser`.
- Verified `fetchNewsPool()` candidate inclusion: default 30-item pool includes Cloudflare Blog; 200-item pool includes all five added feeds.
- Added source-balanced pool selection: each active source gets one candidate before the remaining pool is filled by recency.
- Verified the default 30-item pool now includes all five added feeds.
- Replaced four broken feeds: Reuters Technology -> SiliconANGLE AI, NVIDIA URL fixed, Google Cloud URL fixed, AnandTech -> StorageReview.
- Verified all four replacement feeds parse and appear in the default 30-item candidate pool.
- Ran the full pipeline after feed repair; it refreshed `news-pool`, normalized live/archive/search data, and confirmed all added/replacement feeds are present in the saved 30-item pool.

## Current state
- `npm run check` passed with 0 errors and existing hints.
- `npm run build` passed and generated 279 static pages.
- Previously broken feeds have been replaced or repaired.
- The latest pipeline run published 0 new articles because the current KST slot was already marked published.

## Next safe task
- Review and optionally commit refreshed data files from the full pipeline run.

## Validation
- Confirm this file remains under 120 lines.
